-- ---------------------------------------------------------------------------
-- weekly_picks: owner DELETE policy
-- ---------------------------------------------------------------------------
-- Following/unfollowing changes a user's pick inputs mid-week, so the client
-- invalidates its OWN cached picks row (delete → next Home load recomputes
-- against the current follow graph). The earlier owner-write migration added
-- INSERT/UPDATE but not DELETE; without this, RLS silently denies the delete
-- (0 rows affected) and stale picks persist until the next Monday. Owner-scoped,
-- like the other weekly_picks write policies. See DECISION_LOG 2026-06-08.

CREATE POLICY "weekly_picks: owner delete"
  ON public.weekly_picks FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
