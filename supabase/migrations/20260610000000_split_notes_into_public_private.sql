-- =============================================================================
-- Split the single user_books.note into private_note + public_note, and add
-- reviewed_at to timestamp public reviews.
--
-- Decided 2026-06-10 (DECISION_LOG): a "review" = a FINISHED user_books row with
-- a non-empty public_note. private_note stays an owner-only personal annotation;
-- public_note is the social object friends see on book detail. reviewed_at marks
-- when the public_note was last written (NULL whenever there is no public review).
--
-- No new table and no RLS changes:
--   • Row-level visibility already governs who can read a row.
--   • public_note rides the same visibility rules — readable on any visible row.
--   • private_note secrecy is enforced by APP-LEVEL select discipline: queries for
--     another user's rows never SELECT private_note. RLS is row-level and cannot
--     hide a single column on a row a friend is otherwise allowed to read.
--
-- reviewed_at is maintained by the app (lib/reviews.ts), mirroring how the app
-- already sets finished_at — set to now() on a public_note write, nulled on clear.
-- =============================================================================

-- Preserve existing data: the old single `note` was always a private reflection.
ALTER TABLE public.user_books RENAME COLUMN note TO private_note;

-- New optional public review + its timestamp.
ALTER TABLE public.user_books ADD COLUMN public_note text;
ALTER TABLE public.user_books ADD COLUMN reviewed_at timestamptz;
