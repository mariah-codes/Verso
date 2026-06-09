-- ---------------------------------------------------------------------------
-- weekly_picks: owner write policies
-- ---------------------------------------------------------------------------
-- V1 computes weekly picks lazily on the client (compute-on-read on Home load)
-- rather than via a service-role cron. The original schema only had a
-- "user read own" SELECT policy and assumed the service role (which bypasses
-- RLS) would do all writes. Add owner INSERT/UPDATE so a signed-in user can
-- write their OWN picks row. A future cron writer still works unchanged (service
-- role bypasses RLS). See DECISION_LOG 2026-06-08.

CREATE POLICY "weekly_picks: owner insert"
  ON public.weekly_picks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "weekly_picks: owner update"
  ON public.weekly_picks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
