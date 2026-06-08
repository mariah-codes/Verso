-- =============================================================================
-- Per-user genre tagging
-- =============================================================================
-- Genre is a per-USER attribute, not a property of the book: two readers can
-- tag the same title differently, because genre feeds *personal* milestones and
-- stats. It therefore lives on user_books (the user↔book relationship), not on
-- the shared books reference table.

-- ── 1. Add nullable genre to user_books ──────────────────────────────────────
-- Nullable: tagging is optional and skippable. Free text at the DB layer; the
-- app constrains values to lib/genres.ts (see isValidGenre).
ALTER TABLE public.user_books
  ADD COLUMN IF NOT EXISTS genre text;

-- ── 2. Drop the unused shared genre column from books ────────────────────────
-- books.genre was defined in the initial schema but never written or read by
-- the app. Removing it avoids confusion with the new per-user field above.
ALTER TABLE public.books
  DROP COLUMN IF EXISTS genre;

-- No RLS changes needed:
--   • user_books already has an owner-only UPDATE policy that covers the new
--     column, so a user can only ever set genre on their OWN row.
--   • books policies are unaffected by dropping a column.
