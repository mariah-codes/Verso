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
  // `upsert` with ignoreDuplicates:true silently skips when open_library_id
  // already exists — no error, no UPDATE. We SELECT afterwards to get the id
  // regardless of whether we just inserted or it pre-existed.
  const { error: upsertError } = await db.from("books").upsert(
    {
      open_library_id: book.openLibraryId,
      title: book.title,
      author: book.author,
      cover_url: book.coverUrl ?? "",
      published_year: book.year,
    },
    { onConflict: "open_library_id", ignoreDuplicates: true },
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

  // ── 2. Upsert the user↔book relationship ─────────────────────────────────
  const { data: ubData, error: ubError } = await db
    .from("user_books")
    .upsert(
      {
        user_id: userId,
        book_id: bookRow.id,
        status,
        visibility: "visible",
        was_started: status === "reading" || status === "finished",
        finished_at: status === "finished" ? new Date().toISOString() : null,
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
 * Moves a "reading" book to "finished" so the ranking flow can open.
 * The ranking flow then sets tier, rank_position, and score.
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
    })
    .eq("id", userBookId)
  return { error: error?.message ?? null }
}
