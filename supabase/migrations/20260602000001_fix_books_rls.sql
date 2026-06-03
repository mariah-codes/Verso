-- =============================================================================
-- Fix: ensure `books` INSERT policy exists for authenticated users.
--
-- Root cause: the initial migration's upsert used onConflict without
-- ignoreDuplicates, which caused PostgREST to issue an UPDATE on conflict.
-- The books table intentionally has no UPDATE policy (book metadata is
-- immutable through the app), so that UPDATE was rejected by RLS.
--
-- Two-part fix:
--   1. This migration idempotently ensures the INSERT policy is present.
--   2. lib/books.ts now uses INSERT + ignoreDuplicates instead of upsert,
--      so a conflict is silently skipped rather than turned into an UPDATE.
-- =============================================================================

-- Drop and recreate so this migration is safe to run even if the initial
-- migration was already applied (avoids "policy already exists" errors).
DROP POLICY IF EXISTS "books: authenticated insert" ON public.books;

CREATE POLICY "books: authenticated insert"
  ON public.books FOR INSERT
  TO authenticated
  WITH CHECK (true);
