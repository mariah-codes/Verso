import { supabase } from "./supabase"
import type { BookSearchResult } from "./open-library"

export type BookStatus = "want_to_read" | "reading" | "finished" | "dnf"

// Database types are auto-generated from the live schema. Until the initial
// migration has been applied and `npx supabase gen types` re-run, the
// Database type has no table entries, so we cast to `any` here to avoid
// TypeScript errors. All column names match the migration exactly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Upserts a book from Open Library into the `books` table (keyed on
 * `open_library_id`), then creates or updates the `user_books` row for the
 * current user with the given status.
 *
 * Returns `{ error: string }` on failure or `{ error: null }` on success.
 */
export async function addBookToShelf(
  book: BookSearchResult,
  status: BookStatus,
  userId: string
): Promise<{ error: string | null }> {
  // ── 1. Ensure the book exists in the reference table ─────────────────────
  // `upsert` with ignoreDuplicates:true sends `Prefer: resolution=ignore-duplicates`
  // to PostgREST, which silently skips the row when open_library_id already
  // exists — no error, no UPDATE. We use a separate SELECT to get the id in
  // either case. Note: `insert(..., { ignoreDuplicates: true })` does NOT work
  // — that option only exists on `upsert`.
  const { error: upsertError } = await db.from("books").upsert(
    {
      open_library_id: book.openLibraryId,
      title: book.title,
      author: book.author,
      cover_url: book.coverUrl ?? "",
      published_year: book.year,
    },
    { onConflict: "open_library_id", ignoreDuplicates: true }
  )

  if (upsertError) {
    console.error("[books] upsert error:", upsertError)
    return { error: upsertError.message }
  }

  // Fetch the canonical row (works whether we just inserted or it pre-existed).
  const { data: bookRow, error: fetchError } = await db
    .from("books")
    .select("id")
    .eq("open_library_id", book.openLibraryId)
    .single()

  if (fetchError || !bookRow) {
    console.error("[books] fetch error:", fetchError)
    return { error: fetchError?.message ?? "Could not retrieve book" }
  }

  // ── 2. Upsert the user↔book relationship ─────────────────────────────────
  // On conflict (same user_id + book_id) we update the status — e.g. moving
  // a book from "want_to_read" to "finished".
  const { error: ubError } = await db.from("user_books").upsert(
    {
      user_id: userId,
      book_id: bookRow.id,
      status,
      visibility: "visible",
      was_started: status === "reading" || status === "finished",
      finished_at: status === "finished" ? new Date().toISOString() : null,
    },
    { onConflict: "user_id,book_id" }
  )

  if (ubError) {
    console.error("[books] user_books upsert error:", ubError)
    return { error: ubError.message }
  }

  return { error: null }
}
