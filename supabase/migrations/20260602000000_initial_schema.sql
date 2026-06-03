-- =============================================================================
-- Verso — Initial Schema
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Custom ENUM types
-- ---------------------------------------------------------------------------

CREATE TYPE book_status     AS ENUM ('want_to_read', 'reading', 'finished', 'dnf');
CREATE TYPE book_tier       AS ENUM ('loved', 'liked', 'fine');
CREATE TYPE book_visibility AS ENUM ('visible', 'private');
CREATE TYPE feed_event_type AS ENUM ('ranked', 'want_to_read', 'top_10_change');
CREATE TYPE reaction_type   AS ENUM ('flame', 'smile');


-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id            uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  display_name  text        NOT NULL,
  photo_url     text,
  bio           text
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can see any profile
CREATE POLICY "users: authenticated read"
  ON public.users FOR SELECT
  TO authenticated
  USING (true);

-- Users may only update their own row
CREATE POLICY "users: own update"
  ON public.users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Auto-insert a public profile when a new auth user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      split_part(NEW.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ---------------------------------------------------------------------------
-- books  (reference table — one row per unique book)
-- ---------------------------------------------------------------------------

CREATE TABLE public.books (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  open_library_id text        UNIQUE,
  google_books_id text        UNIQUE,
  title           text        NOT NULL,
  author          text        NOT NULL,
  cover_url       text        NOT NULL,
  published_year  int,
  genre           text
);

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

-- Any signed-in user can read book metadata
CREATE POLICY "books: authenticated read"
  ON public.books FOR SELECT
  TO authenticated
  USING (true);

-- Any signed-in user can add a new book (e.g. from Open Library search)
CREATE POLICY "books: authenticated insert"
  ON public.books FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- No UPDATE or DELETE — book metadata is immutable through the app


-- ---------------------------------------------------------------------------
-- user_books  (the user ↔ book relationship)
-- ---------------------------------------------------------------------------

CREATE TABLE public.user_books (
  id            uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_id       uuid            NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  status        book_status     NOT NULL,
  tier          book_tier,                         -- only set when status = 'finished'
  rank_position int,                               -- only set when status = 'finished'
  visibility    book_visibility NOT NULL DEFAULT 'visible',
  was_started   boolean         NOT NULL DEFAULT false,
  note          text,
  added_at      timestamptz     NOT NULL DEFAULT now(),
  finished_at   timestamptz,
  UNIQUE (user_id, book_id)
);

ALTER TABLE public.user_books ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read rows marked visible
CREATE POLICY "user_books: read visible"
  ON public.user_books FOR SELECT
  TO authenticated
  USING (visibility = 'visible');

-- Owners can always read their own rows — including private ones
CREATE POLICY "user_books: owner read all"
  ON public.user_books FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Only the owner can add a row for themselves
CREATE POLICY "user_books: owner insert"
  ON public.user_books FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Only the owner can update their own rows (e.g. change status, visibility, tier)
CREATE POLICY "user_books: owner update"
  ON public.user_books FOR UPDATE
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Only the owner can delete their own rows
CREATE POLICY "user_books: owner delete"
  ON public.user_books FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- follows  (one-way social graph)
-- ---------------------------------------------------------------------------

CREATE TABLE public.follows (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  followed_id uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (follower_id, followed_id),
  CHECK (follower_id <> followed_id)
);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can see the follow graph (needed for feed & friend lists)
CREATE POLICY "follows: authenticated read"
  ON public.follows FOR SELECT
  TO authenticated
  USING (true);

-- Only the follower can create the relationship
CREATE POLICY "follows: follower insert"
  ON public.follows FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = follower_id);

-- Only the follower can unfollow
CREATE POLICY "follows: follower delete"
  ON public.follows FOR DELETE
  TO authenticated
  USING (auth.uid() = follower_id);


-- ---------------------------------------------------------------------------
-- comparisons  (pairwise ranking history)
-- ---------------------------------------------------------------------------

CREATE TABLE public.comparisons (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  book_a_id  uuid        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  book_b_id  uuid        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  winner_id  uuid        NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  tier       book_tier   NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.comparisons ENABLE ROW LEVEL SECURITY;

-- Owner-only for all operations (ranking data is private by nature)
CREATE POLICY "comparisons: owner only"
  ON public.comparisons FOR ALL
  TO authenticated
  USING    (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- reactions  (flame / smile on feed events)
-- ---------------------------------------------------------------------------

CREATE TABLE public.reactions (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type            feed_event_type NOT NULL,
  event_subject_user_id uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_subject_book_id uuid            NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  reaction_type         reaction_type   NOT NULL,
  created_at            timestamptz     NOT NULL DEFAULT now(),
  -- one reaction per user per event
  UNIQUE (user_id, event_type, event_subject_user_id, event_subject_book_id)
);

ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reactions: authenticated read"
  ON public.reactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "reactions: author insert"
  ON public.reactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "reactions: author delete"
  ON public.reactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- comments
-- ---------------------------------------------------------------------------

CREATE TABLE public.comments (
  id                    uuid            PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type            feed_event_type NOT NULL,
  event_subject_user_id uuid            NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_subject_book_id uuid            NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  text                  text            NOT NULL,
  created_at            timestamptz     NOT NULL DEFAULT now()
);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "comments: authenticated read"
  ON public.comments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "comments: author insert"
  ON public.comments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "comments: author delete"
  ON public.comments FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ---------------------------------------------------------------------------
-- weekly_picks  (precomputed per user per week)
-- ---------------------------------------------------------------------------

CREATE TABLE public.weekly_picks (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  week_of    date        NOT NULL,   -- always a Monday
  book_ids   uuid[]      NOT NULL,
  reasons    jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_of)
);

ALTER TABLE public.weekly_picks ENABLE ROW LEVEL SECURITY;

-- Users can read their own picks only
CREATE POLICY "weekly_picks: user read own"
  ON public.weekly_picks FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT / UPDATE policy for the authenticated role.
-- The service role (used by server-side jobs) bypasses RLS entirely,
-- so weekly pick generation works without exposing a write path to clients.


-- ---------------------------------------------------------------------------
-- Indexes for common query patterns
-- ---------------------------------------------------------------------------

-- Feed: books finished by people I follow, ordered by time
CREATE INDEX idx_user_books_user_status    ON public.user_books (user_id, status);
CREATE INDEX idx_user_books_book_id        ON public.user_books (book_id);
CREATE INDEX idx_user_books_visibility     ON public.user_books (visibility);
CREATE INDEX idx_follows_follower          ON public.follows (follower_id);
CREATE INDEX idx_follows_followed          ON public.follows (followed_id);
CREATE INDEX idx_comparisons_user_tier     ON public.comparisons (user_id, tier);
CREATE INDEX idx_reactions_event           ON public.reactions (event_subject_user_id, event_subject_book_id);
CREATE INDEX idx_comments_event            ON public.comments (event_subject_user_id, event_subject_book_id);
CREATE INDEX idx_weekly_picks_user_week    ON public.weekly_picks (user_id, week_of DESC);
