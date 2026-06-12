-- =============================================================================
-- Onboarding: completion flag + an avatars storage bucket for the profile step.
-- =============================================================================

-- ── Completion flag ──────────────────────────────────────────────────────────
-- NULL = the user has not finished onboarding. Set once at completion (or when
-- they skip out of a step). The /onboarding/* routes are gated on this being
-- NULL; a user with it set who hits /onboarding/* is bounced to /home.
ALTER TABLE public.users ADD COLUMN onboarded_at timestamptz;

-- Existing users predate onboarding — mark them done so they're never routed
-- into the flow. Only NEW signups (trigger inserts with the NULL default) enter it.
UPDATE public.users SET onboarded_at = now() WHERE onboarded_at IS NULL;

-- ── Avatars storage bucket (profile photo upload, optional) ──────────────────
-- Public-read so <Image> can render avatars without signed URLs. Writes are
-- owner-scoped: an authenticated user may only create/modify objects under a
-- top-level folder named after their own uid (e.g. "<uid>/avatar.jpg").
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "avatars: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "avatars: owner insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars: owner update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "avatars: owner delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid()::text);
