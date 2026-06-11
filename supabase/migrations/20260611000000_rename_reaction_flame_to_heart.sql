-- =============================================================================
-- Reactions go live (review feature step C1): rename the heart reaction value.
--
-- The reactions table has never been written to, so renaming the enum value is
-- a pure relabel — no data to migrate. 'flame' becomes 'heart' (the single
-- reaction V1 ships). 'smile' stays as a dormant, unused value for later.
--
-- A heart keys on the finished-book event, NOT the review note:
--   (user_id, event_type='ranked', event_subject_user_id, event_subject_book_id)
-- so a review hearted in the feed and on book detail is the SAME row, and
-- adding/clearing the public_note never orphans hearts. RLS already allows
-- self-reactions (reactor = row author).
-- =============================================================================

ALTER TYPE reaction_type RENAME VALUE 'flame' TO 'heart';
