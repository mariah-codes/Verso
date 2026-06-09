-- =============================================================================
-- Reserved usernames: stop auto-generation (and any future SQL path) from
-- emitting a handle that shadows a top-level route or a system/brand word.
-- Pairs with the /[username] routing added in the app.
--
-- ⚠️ DUPLICATED LOGIC — KEEP IN SYNC with RESERVED_USERNAMES in lib/username.ts.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.username_reserved(p_username text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(p_username) IN (
    -- current + planned routes
    'home','friends','search','shelf','me','book','user','settings',
    'onboarding','auth','signin','signup','login','logout','register',
    -- system / generic
    'admin','api','app','www','root','about','help','support','contact',
    'terms','privacy','legal','status','blog','explore','feed','discover',
    'notifications','messages','profile','account','new','edit','static',
    'public','assets','favicon','robots','sitemap','null','undefined',
    -- brand
    'verso','official','team','staff'
  );
$$;

-- Re-create generate_username so every "is this handle usable?" check also
-- rejects reserved words (treated like a taken handle, so the ladder advances:
-- a user named "Home" → "home" is reserved → falls to "homesmith" / "home2").
-- Body identical to the original except the added username_reserved() checks.
--
-- ⚠️ DUPLICATED LOGIC — KEEP IN SYNC with lib/username.ts (rules + ladder + the
-- reserved list). SQL runs at signup via the handle_new_user trigger; TS powers
-- the future edit/availability UI.
CREATE OR REPLACE FUNCTION public.generate_username(p_first text, p_last text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_first text;
  v_last  text;
  v_base  text;
  v_cand  text;
  n       int := 2;
BEGIN
  v_first := regexp_replace(regexp_replace(lower(coalesce(p_first, '')), '[^a-z0-9]', '', 'g'), '^[^a-z]+', '');
  v_last  := regexp_replace(regexp_replace(lower(coalesce(p_last,  '')), '[^a-z0-9]', '', 'g'), '^[^a-z]+', '');

  v_base := v_first || v_last;
  IF length(v_base) < 2 THEN
    v_base := 'reader';
  END IF;
  v_base := left(v_base, 20);

  -- 1) first alone (preferred), if 3–20 and not taken/reserved
  IF length(v_first) BETWEEN 3 AND 20
     AND NOT public.username_taken(v_first)
     AND NOT public.username_reserved(v_first) THEN
    RETURN v_first;
  END IF;

  -- 2) first+last, if a last name exists and it differs from rung 1
  IF v_last <> '' AND length(v_base) BETWEEN 3 AND 20 AND v_base <> v_first
     AND NOT public.username_taken(v_base)
     AND NOT public.username_reserved(v_base) THEN
    RETURN v_base;
  END IF;

  -- 3) numbered: base + n (numbered handles can't be reserved, but check anyway)
  LOOP
    v_cand := left(v_base, 20 - length(n::text)) || n::text;
    IF NOT public.username_taken(v_cand) AND NOT public.username_reserved(v_cand) THEN
      RETURN v_cand;
    END IF;
    n := n + 1;
    IF n > 100000 THEN
      RETURN left('reader' || replace(gen_random_uuid()::text, '-', ''), 20);
    END IF;
  END LOOP;
END;
$$;
