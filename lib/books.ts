import { supabase } from "./supabase"
import type { BookSearchResult } from "./open-library"

export type BookStatus = "want_to_read" | "reading" | "finished" | "dnf"

// Database types are auto-generated from the live schema. Until the initial
// migration has been applied and `npx supabase gen types` re-run, the
// Database type has no table entries, so we cast to `any` here to avoid
// TypeScript errors. All column names match the migration exactly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

export interface AddBookResult {
  error: string | null
  /** books.id — null on error */
  bookId: string | null
  /** user_books.id — null on error. Needed to open the ranking flow. */
  userBookId: string | null
}

/**
 * Upserts a book from Open Library into the `books` table (keyed on
 * `open_library_id`), then creates or updates the `user_books` row for the
 * current user with the given status.
 *
 * Returns the Supabase IDs so the caller can open the ranking flow
 * without a second round-trip.
 */
export async function addBookToShelf(
  book: BookSearchResult,
  status: BookStatus,
  userId: string,
): Promise<AddBookResult> {
  const fail = (msg: string): AddBookResult => ({ error: msg, bookId: null, userBookId: null })

  // ── 1. Ensure the book exists in the reference table ─────────────────────
  // Upsert with UPDATE-on-conflict (no ignoreDuplicates): on an existing
  // open_library_id this refreshes title/cover_url/author/year. That's what
  // self-heals books added before the English-edition heuristic in
  // lib/open-library.ts — a stale foreign-canonical row (e.g. Kundera's Czech
  // title + French cover) is corrected the next time anyone adds it via Search.
  // Requires the books UPDATE RLS policy (migration 20260612000001). We SELECT
  // afterwards to get the id regardless of insert-vs-update.
  const { error: upsertError } = await db.from("books").upsert(
    {
      open_library_id: book.openLibraryId,
      title: book.title,
      author: book.author,
      cover_url: book.coverUrl ?? "",
      published_year: book.year,
    },
    { onConflict: "open_library_id" },
  )

  if (upsertError) {
    console.error("[books] upsert error:", upsertError)
    return fail(upsertError.message)
  }

  const { data: bookRow, error: fetchError } = await db
    .from("books")
    .select("id")
    .eq("open_library_id", book.openLibraryId)
    .single()

  if (fetchError || !bookRow) {
    console.error("[books] fetch error:", fetchError)
    return fail(fetchError?.message ?? "Could not retrieve book")
  }

  // ── 2. Check for an existing row that was finished ───────────────────────
  // The upsert below only updates the fields we set explicitly. If a book was
  // previously finished (with tier/rank_position/score populated) and is now
  // being moved to a non-finished status via search, we must clear ranking data
  // and close the rank gap — otherwise the stale data persists silently.
  const { data: existingRow } = await db
    .from("user_books")
    .select("id, status, tier, rank_position")
    .eq("user_id", userId)
    .eq("book_id", bookRow.id)
    .maybeSingle()

  const leavingFinished =
    existingRow?.status === "finished" && status !== "finished"

  if (leavingFinished && existingRow?.tier && existingRow?.rank_position != null) {
    await closeRankGap(userId, existingRow.tier, existingRow.rank_position)
  }

  // ── 3. Upsert the user↔book relationship ─────────────────────────────────
  const { data: ubData, error: ubError } = await db
    .from("user_books")
    .upsert(
      {
        user_id: userId,
        book_id: bookRow.id,
        status,
        // DNF is private at the data level; every other status is visible. (Upsert,
        // so re-adding a DNF'd book at another status also flips it back to visible.)
        visibility: status === "dnf" ? "private" : "visible",
        // DNF presupposes the book was started.
        was_started: status === "reading" || status === "finished" || status === "dnf",
        finished_at: status === "finished" ? new Date().toISOString() : null,
        // Clear ranking fields when moving away from finished so stale data
        // never leaks onto non-finished shelf rows.
        ...(leavingFinished && {
          tier: null,
          rank_position: null,
          score: null,
        }),
      },
      { onConflict: "user_id,book_id" },
    )
    .select("id")
    .single()

  if (ubError) {
    console.error("[books] user_books upsert error:", ubError)
    return fail(ubError.message)
  }

  return { error: null, bookId: bookRow.id, userBookId: ubData.id }
}

/**
 * Save a book that ALREADY exists in the `books` table (e.g. from the feed) to the
 * user's want-to-read shelf. Used by the feed's save action — one tap, no nav.
 *
 * Never overwrites an existing shelf row: if the user already has the book in ANY
 * status (want/reading/finished/dnf), it's a graceful no-op (`alreadyOnShelf`),
 * so saving can't silently change a finished/dnf book back to want-to-read. The
 * UNIQUE(user_id, book_id) constraint makes the check race-safe.
 */
export async function saveToWantToRead(
  bookId: string,
  userId: string,
): Promise<{ error: string | null; alreadyOnShelf: boolean }> {
  const { data: existing } = await db
    .from("user_books")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle()

  if (existing) return { error: null, alreadyOnShelf: true }

  const { error } = await db.from("user_books").insert({
    user_id: userId,
    book_id: bookId,
    status: "want_to_read",
    visibility: "visible",
    was_started: false,
  })

  // 23505 = unique_violation: a concurrent save beat us → treat as already saved.
  if (error) {
    if (error.code === "23505") return { error: null, alreadyOnShelf: true }
    return { error: error.message, alreadyOnShelf: false }
  }
  return { error: null, alreadyOnShelf: false }
}

/**
 * Un-save: remove a book from the user's want-to-read shelf (the feed save
 * toggle's off path).
 *
 * DATA SAFETY: the delete is scoped to status='want_to_read', so it can NEVER
 * delete a finished / reading / dnf row even if called with the wrong book. This
 * is the second guard behind the icon state (which only offers unsave when the
 * viewer's status is want_to_read).
 */
export async function removeFromWantToRead(
  bookId: string,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("user_books")
    .delete()
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .eq("status", "want_to_read")
  return { error: error?.message ?? null }
}

/**
 * Moves a book to "finished" so the ranking flow can open. The ranking flow then
 * sets tier, rank_position, and score.
 *
 * Also resets visibility='visible': this is the dnf→finished resurrection path
 * (a DNF row is visibility='private'), and a finished book is always shareable, so
 * forcing visible here un-hides a resurrected book. (For the common reading→finished
 * case the row is already visible, so this is a no-op.)
 */
export async function markAsFinished(
  userBookId: string,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("user_books")
    .update({
      status: "finished",
      was_started: true,
      finished_at: new Date().toISOString(),
      visibility: "visible",
    })
    .eq("id", userBookId)
  return { error: error?.message ?? null }
}

/**
 * Decrements rank_position for every finished book in `tier` whose position
 * is strictly greater than `fromPosition`. Call this after removing or
 * re-ranking a book to close the gap it leaves behind.
 */
async function closeRankGap(
  userId: string,
  tier: string,
  fromPosition: number,
): Promise<void> {
  const { data } = await db
    .from("user_books")
    .select("id, rank_position")
    .eq("user_id", userId)
    .eq("status", "finished")
    .eq("tier", tier)
    .gt("rank_position", fromPosition)

  for (const row of (data ?? [])) {
    await db
      .from("user_books")
      .update({ rank_position: row.rank_position - 1 })
      .eq("id", row.id)
  }
}

/**
 * Changes a book's shelf status.
 *
 * Moving AWAY from finished clears tier, rank_position, score, finished_at and
 * closes the gap so sibling books' positions stay contiguous.
 * Moving TO finished sets finished_at — the ranking flow handles the rest.
 */
export async function changeBookStatus(
  userBookId: string,
  newStatus: BookStatus,
  prevStatus: BookStatus,
  userId: string,
  prevTier: string | null,
  prevRankPosition: number | null,
): Promise<{ error: string | null }> {
  const leavingFinished = prevStatus === "finished" && newStatus !== "finished"
  const enteringFinished = newStatus === "finished"
  const enteringDnf = newStatus === "dnf"
  const leavingDnf = prevStatus === "dnf" && newStatus !== "dnf"

  // Close the rank gap before clearing position data
  if (leavingFinished && prevTier && prevRankPosition !== null) {
    await closeRankGap(userId, prevTier, prevRankPosition)
  }

  const updates: Record<string, unknown> = {
    status: newStatus,
    // A book in any "engaged" state has been started — and DNF presupposes it.
    was_started: newStatus === "reading" || newStatus === "finished" || newStatus === "dnf"
      || prevStatus === "reading" || prevStatus === "finished",
    ...(leavingFinished && {
      tier: null,
      rank_position: null,
      score: null,
      finished_at: null,
    }),
    ...(enteringFinished && {
      finished_at: new Date().toISOString(),
    }),
    // DNF is private at the data level (RLS hides it from other users); leaving
    // DNF (resurrection) restores visibility so the book shows on friends' views.
    ...(enteringDnf && { visibility: "private" }),
    ...(leavingDnf && { visibility: "visible" }),
  }

  const { error } = await db
    .from("user_books")
    .update(updates)
    .eq("id", userBookId)

  return { error: error?.message ?? null }
}

/**
 * Prepares a finished book for re-ranking: clears tier/rank_position/score,
 * closes the gap in its tier, and leaves status=finished so the ranking flow
 * can re-insert it at a new position.
 *
 * rankPosition may be null if the book was left in a broken half-state from
 * an abandoned ranking — in that case we skip the gap-close (there's nothing
 * to close) and just clear the fields.
 */
export async function clearRankingForRerank(
  userBookId: string,
  userId: string,
  tier: string,
  rankPosition: number | null,
): Promise<{ error: string | null }> {
  // Only close the gap when there's an actual ranked position to vacate
  if (rankPosition !== null) {
    await closeRankGap(userId, tier, rankPosition)
  }

  const { error } = await db
    .from("user_books")
    .update({ tier: null, rank_position: null, score: null })
    .eq("id", userBookId)

  return { error: error?.message ?? null }
}

/**
 * Restores a book's ranking after a cancelled re-rank.
 *
 * `clearRankingForRerank` closed the gap (decremented positions > oldRankPosition).
 * This function reopens it (increments positions >= oldRankPosition, excluding our
 * book), then writes the original tier/rank_position/score back.
 */
export async function restoreRanking(
  userBookId: string,
  userId: string,
  tier: string,
  rankPosition: number,
  score: number | null,
): Promise<{ error: string | null }> {
  // Reopen the gap: increment positions >= rankPosition for sibling books only
  const { data } = await db
    .from("user_books")
    .select("id, rank_position")
    .eq("user_id", userId)
    .eq("status", "finished")
    .eq("tier", tier)
    .gte("rank_position", rankPosition)

  for (const row of (data ?? [])) {
    await db
      .from("user_books")
      .update({ rank_position: row.rank_position + 1 })
      .eq("id", row.id)
  }

  // Restore the original ranking data on our book
  const { error } = await db
    .from("user_books")
    .update({ tier, rank_position: rankPosition, score })
    .eq("id", userBookId)

  return { error: error?.message ?? null }
}

/**
 * Reads the current user's genre tag for one user_books row (null if untagged).
 * Used by the ranking result screen to decide whether to offer the picker.
 */
export async function fetchUserBookGenre(
  userBookId: string,
): Promise<string | null> {
  const { data } = await db
    .from("user_books")
    .select("genre")
    .eq("id", userBookId)
    .maybeSingle()
  return data?.genre ?? null
}

/**
 * Saves a genre tag on a single user_books row. Genre is PER-USER: we update by
 * the row's own id, so this only ever touches the caller's tag — RLS's
 * owner-only UPDATE policy enforces that at the DB layer too. Never writes a
 * shared field, never touches another user's row.
 */
export async function saveBookGenre(
  userBookId: string,
  genre: string,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("user_books")
    .update({ genre })
    .eq("id", userBookId)
  return { error: error?.message ?? null }
}

/**
 * Permanently removes a book from the user's shelf.
 * If the book was ranked, closes the position gap before deleting.
 */
export async function removeFromShelf(
  userBookId: string,
  userId: string,
  tier: string | null,
  rankPosition: number | null,
): Promise<{ error: string | null }> {
  if (tier && rankPosition !== null) {
    await closeRankGap(userId, tier, rankPosition)
  }

  const { error } = await db
    .from("user_books")
    .delete()
    .eq("id", userBookId)

  return { error: error?.message ?? null }
}
