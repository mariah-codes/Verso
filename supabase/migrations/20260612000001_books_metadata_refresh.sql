-- =============================================================================
-- Allow book metadata to refresh on re-add.
--
-- Background: books were originally insert-only ("metadata immutable"), and a
-- prior fix (20260602000001) switched lib/books.ts to INSERT + ignoreDuplicates
-- so a conflict was silently skipped. That left a real bug: books added before
-- the English-edition heuristic in lib/open-library.ts keep their stale
-- work-level foreign title/cover (e.g. Kundera's "Nesnesitelná lehkost bytí"
-- with a French Folio cover) forever, because re-adding via Search never
-- updates the existing row.
--
-- Fix: add an UPDATE policy so the Search upsert can refresh title/cover_url
-- (and author/year) on conflict. lib/books.ts now upserts with
-- DO UPDATE (ignoreDuplicates removed), so re-adding a book self-corrects its
-- metadata with the now-correct English-edition data.
--
-- Metadata stays globally shared (one row per open_library_id); any signed-in
-- user re-adding a book heals it for everyone, which is the intended behaviour.
-- =============================================================================

-- Idempotent: safe to re-run.
DROP POLICY IF EXISTS "books: authenticated update" ON public.books;

CREATE POLICY "books: authenticated update"
  ON public.books FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
