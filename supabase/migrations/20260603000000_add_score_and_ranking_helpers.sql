-- =============================================================================
-- Add score column and ranking helper function
-- =============================================================================

-- ── 1. score column on user_books ────────────────────────────────────────────
-- Nullable because books below SCORE_DISPLAY_THRESHOLD (10 finished) have no
-- score yet. Stored as a full float; rounded to 1 decimal for display only.
ALTER TABLE public.user_books
  ADD COLUMN IF NOT EXISTS score numeric;

-- ── 2. shift_rank_positions RPC ──────────────────────────────────────────────
-- PostgREST cannot express SET rank_position = rank_position + 1, so we use a
-- SECURITY DEFINER function that runs as the table owner while still enforcing
-- our own user_id check.
--
-- Call it after deciding where to insert a new book to make room at that slot:
--   SELECT shift_rank_positions('<user_uuid>', 'loved', 3);
-- This increments rank_position for every loved book the user has that is
-- currently at position ≥ 3, shifting them down by one.
CREATE OR REPLACE FUNCTION public.shift_rank_positions(
  p_user_id    uuid,
  p_tier       text,
  p_from_position integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Callers must be acting on their own data
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller does not own this data';
  END IF;

  UPDATE public.user_books
  SET rank_position = rank_position + 1
  WHERE user_id        = p_user_id
    AND status         = 'finished'
    AND tier           = p_tier::book_tier
    AND rank_position >= p_from_position;
END;
$$;
