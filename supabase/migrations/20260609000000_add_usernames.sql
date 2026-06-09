-- =============================================================================
-- Usernames: column + case-insensitive uniqueness + auto-generation at signup,
-- and a fix for OAuth display_name extraction (was falling back to the email
-- local-part). See lib/username.ts for the canonical TS rules this SQL mirrors.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Column (nullable for now so existing rows can be backfilled below)
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ADD COLUMN username text;

-- ---------------------------------------------------------------------------
-- 2. Generation helpers (mirror the lib/username.ts ladder)
-- ---------------------------------------------------------------------------

-- Case-insensitive "is this handle taken?"
CREATE OR REPLACE FUNCTION public.username_taken(p_username text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE lower(username) = lower(p_username)
  );
$$;

-- Produce an available username from a first/last name via the fallback ladder:
--   first  →  first+last  →  first+last+N (2,3,…)
-- Mononyms (no last name) collapse to: first → first+N.
-- Cleaning: lowercase, strip disallowed chars, strip leading non-letters.
-- Short/empty names fall back to the 'reader' seed. Result always satisfies the
-- rules (3–20 chars, starts with a letter). Existence-checked here; the UNIQUE
-- index (created below) is the hard guarantee at write time.
--
-- ⚠️ DUPLICATED LOGIC — KEEP IN SYNC with lib/username.ts. This SQL ladder runs at
-- signup (via the handle_new_user trigger); the TS copy powers the future
-- edit/availability UI. They can't share code across the SQL/JS boundary, so any
-- rule change (length, allowed chars, the ladder, the 'reader' seed) MUST be made
-- in BOTH places or signup and the edit UI will silently disagree.
CREATE OR REPLACE FUNCTION public.generate_username(p_first text, p_last text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_first text;
  v_last  text;
  v_base  text;   -- numbering base (first+last, or first for mononyms)
  v_cand  text;
  n       int := 2;
BEGIN
  v_first := regexp_replace(regexp_replace(lower(coalesce(p_first, '')), '[^a-z0-9]', '', 'g'), '^[^a-z]+', '');
  v_last  := regexp_replace(regexp_replace(lower(coalesce(p_last,  '')), '[^a-z0-9]', '', 'g'), '^[^a-z]+', '');

  v_base := v_first || v_last;                 -- first+last (or just first if no last)
  IF length(v_base) < 2 THEN
    v_base := 'reader';                        -- nothing usable → seed
  END IF;
  v_base := left(v_base, 20);

  -- 1) first alone (preferred), if 3–20
  IF length(v_first) BETWEEN 3 AND 20 AND NOT public.username_taken(v_first) THEN
    RETURN v_first;
  END IF;

  -- 2) first+last, if a last name exists and it differs from rung 1
  IF v_last <> '' AND length(v_base) BETWEEN 3 AND 20 AND v_base <> v_first
     AND NOT public.username_taken(v_base) THEN
    RETURN v_base;
  END IF;

  -- 3) numbered: base + n, trimming base so total length stays ≤ 20
  LOOP
    v_cand := left(v_base, 20 - length(n::text)) || n::text;
    IF NOT public.username_taken(v_cand) THEN
      RETURN v_cand;
    END IF;
    n := n + 1;
    IF n > 100000 THEN  -- unreachable safety valve
      RETURN left('reader' || replace(gen_random_uuid()::text, '-', ''), 20);
    END IF;
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Backfill existing rows (my test accounts) so the NOT NULL below succeeds.
--    Done one row at a time so generate_username sees prior backfills and never
--    collides. First/last derived by splitting the existing display_name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r       record;
  v_first text;
  v_last  text;
BEGIN
  FOR r IN SELECT id, display_name FROM public.users WHERE username IS NULL LOOP
    v_first := split_part(coalesce(r.display_name, ''), ' ', 1);
    v_last  := NULLIF(split_part(coalesce(r.display_name, ''), ' ', 2), '');
    UPDATE public.users
       SET username = public.generate_username(v_first, v_last)
     WHERE id = r.id;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Case-insensitive uniqueness + fast lookup.
--    A UNIQUE index on lower(username) gives BOTH: it enforces case-insensitive
--    uniqueness AND serves case-insensitive lookups (WHERE lower(username) =
--    lower($1)) used by profile routing / search later — one index, no CITEXT
--    extension needed.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX users_username_lower_idx ON public.users (lower(username));

-- ---------------------------------------------------------------------------
-- 5. Now that every row has a unique username, enforce NOT NULL.
-- ---------------------------------------------------------------------------
ALTER TABLE public.users ALTER COLUMN username SET NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. Signup trigger: fix display_name extraction + auto-assign a username.
--    Race-safe: generate + INSERT in a retry loop so the UNIQUE index is the
--    real guarantee (a concurrent signup that grabbed the same handle makes our
--    INSERT fail; we regenerate against the now-committed row and retry).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta     jsonb := NEW.raw_user_meta_data;
  v_display  text;
  v_first    text;
  v_last     text;
  v_username text;
  v_attempts int := 0;
BEGIN
  -- Display name: an explicitly provided name (email signup) → OAuth name fields
  -- → only as a last resort the email local-part. Google puts the real name in
  -- name / full_name / given_name+family_name, NOT display_name — this is the bug.
  v_display := COALESCE(
    NULLIF(v_meta->>'display_name', ''),
    NULLIF(v_meta->>'name', ''),
    NULLIF(v_meta->>'full_name', ''),
    NULLIF(trim(concat_ws(' ', v_meta->>'given_name', v_meta->>'family_name')), ''),
    split_part(NEW.email, '@', 1)
  );

  -- First / last for the username ladder: prefer OAuth given/family, else split
  -- the resolved display name. A missing 2nd token → NULL → mononym path.
  v_first := COALESCE(NULLIF(v_meta->>'given_name', ''), split_part(v_display, ' ', 1));
  v_last  := COALESCE(NULLIF(v_meta->>'family_name', ''), NULLIF(split_part(v_display, ' ', 2), ''));

  LOOP
    v_attempts := v_attempts + 1;
    v_username := public.generate_username(v_first, v_last);
    BEGIN
      INSERT INTO public.users (id, display_name, username)
      VALUES (NEW.id, v_display, v_username);
      EXIT;  -- inserted successfully
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 5 THEN
        -- Extremely unlikely; guarantee a row with a unique handle.
        INSERT INTO public.users (id, display_name, username)
        VALUES (NEW.id, v_display,
                left('reader' || replace(gen_random_uuid()::text, '-', ''), 20));
        EXIT;
      END IF;
      -- else retry: generate_username now sees the committed collision and advances
    END;
  END LOOP;

  RETURN NEW;
END;
$$;
