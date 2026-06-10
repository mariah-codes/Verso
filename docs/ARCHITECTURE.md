# Architecture

*Tech stack, data model, and key algorithms for Verso V1.*

**Last updated:** 2026-06-10

---

## Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend framework | Next.js 15 (App Router) | Industry standard, excellent AI tooling support, fast to ship, deploys cleanly to Vercel |
| Language | TypeScript | Catches errors early, signals quality, improves AI code generation accuracy |
| Styling | Tailwind CSS v4 | Fast and consistent, pairs with shadcn/ui |
| Component library | shadcn/ui | Free, customizable, code lives in your repo |
| Backend | Supabase | Postgres + Auth + Storage, free tier covers V1 |
| Database | Postgres (via Supabase) | The right choice for relational data |
| Hosting | Vercel | Direct GitHub integration, free tier sufficient |
| Book metadata | Open Library API (primary), Google Books API (fallback) | Free, no API key needed for Open Library |
| Distribution | Progressive Web App (PWA) | Installable from URL to home screen, no App Store required |

### Portability rules

Built with future portability to React Native in mind:

1. **Business logic out of components.** All data fetching, ranking math, and taste-match calculation lives in `/lib` as pure TypeScript. Components import; they don't compute.
2. **Supabase JS SDK from the client.** No heavy reliance on Next.js Server Components for user-data queries.
3. **Mobile-first design.** Phone-shaped layouts that translate directly to native.
4. **Prefer cross-platform libraries** (e.g., NativeWind for Tailwind portability).

---

## Folder structure

```
/app                       Next.js App Router routes
  /(auth)
    /sign-in/page.tsx
    /sign-up/page.tsx
  /onboarding
    /profile/page.tsx
    /covers/page.tsx
    /rank/page.tsx
    /friends/page.tsx
  /home/page.tsx           Tab 1
  /friends/page.tsx        Tab 2
  /search/page.tsx         Tab 3
  /me/page.tsx             Tab 4
  /book/[id]/page.tsx
  /user/[id]/page.tsx
  /settings/page.tsx

/components                Reusable UI pieces
  /book
    BookCover.tsx
    BookCard.tsx
    BookDetail.tsx
    BookActionMenu.tsx
    PrivacyToggle.tsx
  /ranking
    RankingFlow.tsx
    TierPrompt.tsx
    PairwiseCompare.tsx
    RankingResult.tsx
  /feed
    FeedItem.tsx
    Reactions.tsx
    CommentThread.tsx
  /friends
    FriendRow.tsx
    TasteMatchScore.tsx
  /profile
    ProfileHeader.tsx
    Top5.tsx
    RankedShelf.tsx
    CurrentlyReading.tsx
    WantToReadList.tsx
    MilestoneStrip.tsx
    DnfList.tsx
  /shared
    Avatar.tsx
    SearchBar.tsx
    EmptyState.tsx

/lib                       Pure business logic, no React
  supabase.ts              Supabase client
  ranking.ts               Binary search ranking
  taste-match.ts           Taste match scoring
  weekly-picks.ts          Weekly pick generation
  milestones.ts            Milestone detection
  open-library.ts          API wrapper
  goodreads-import.ts      CSV parser

/public                    Static assets
  /data
    onboarding-books.json  50 curated titles for cover grid
  icons, manifest, etc.

/supabase                  Database migrations
  /migrations
```

---

## Data model

Eight core tables.

### `users`
```
id              uuid PK (from Supabase auth)
created_at      timestamp
display_name    text
photo_url       text (nullable)
bio             text (nullable, V2)
```

### `books`
Reference table — one row per unique book.
```
id              uuid PK
open_library_id text (unique, nullable)
google_books_id text (unique, nullable)
title           text
author          text
cover_url       text
published_year  int (nullable)
created_at      timestamp
```

### `user_books`
The user-book relationship. One row per (user, book) pair.
```
id              uuid PK
user_id         uuid FK → users.id
book_id         uuid FK → books.id
status          enum: 'want_to_read' | 'reading' | 'finished' | 'dnf'
tier            enum: 'loved' | 'liked' | 'fine' (only if status=finished)
rank_position   int (nullable, only if status=finished)
visibility      enum: 'visible' | 'private' (default 'visible')
was_started     boolean (default false)
genre		text (nullable, per-user genre tag)
private_note    text (nullable, personal reflection — visible to owner only; renamed from `note` 		via migration)
public_note     text (nullable, optional short review — visible to friends on book detail)
added_at        timestamp
finished_at     timestamp (nullable)
score           numeric (nullable; frozen at ranking time; null below 10-book threshold)
```

Key behaviors:
- Weekly picks excludes any book with ANY `user_books` row regardless of status (prevents DNF re-recommendation)
- V1 taste-match uses mutually visible finished books only (both users must have visibility='visible'). Private-informs-math is planned for V2 via server-side compute — see DECISION_LOG.
- private_note is owner-only; never returned to other users' queries (RLS or explicit filter)
- public_note is readable by any authenticated user (same visibility rules as visibility='visible' rows)
- Both fields are offered for all finished books, not just top-10; the top-10 path surfaces private_note more prominently

### `follows`
One-way friend graph.
```
id              uuid PK
follower_id     uuid FK → users.id
followed_id     uuid FK → users.id
created_at      timestamp
```

### `comparisons`
History of pairwise ranking choices.
```
id              uuid PK
user_id         uuid FK → users.id
book_a_id       uuid FK → books.id
book_b_id       uuid FK → books.id
winner_id       uuid FK → books.id
tier            enum: 'loved' | 'liked' | 'fine'
created_at      timestamp
```

### `reactions`
Feed-event reactions.
```
id                     uuid PK
user_id                uuid FK → users.id (who reacted)
event_type             enum: 'ranked' | 'want_to_read'
event_subject_user_id  uuid FK → users.id (whose event)
event_subject_book_id  uuid FK → books.id
reaction_type          enum: 'heart'
created_at             timestamp
```

### `comments`
Comments on feed events.
```
id                     uuid PK
user_id                uuid FK → users.id
event_type             enum: 'ranked' | 'want_to_read'
event_subject_user_id  uuid FK
event_subject_book_id  uuid FK
text                   text
created_at             timestamp
```

### `weekly_picks`
Computed weekly per user.
```
id              uuid PK
user_id         uuid FK → users.id
week_of         date (Monday)
book_ids        uuid[] (ordered)
reasons         jsonb (per-book provenance)
created_at      timestamp
```

---

## Row Level Security policies

Supabase requires RLS on every table. Summary:

- **users:** anyone authenticated reads; user updates own row only
- **books:** anyone authenticated reads + inserts; no updates/deletes
- **user_books:** anyone authenticated reads where `visibility='visible'`; user reads own regardless; only owner inserts/updates/deletes
- **follows:** anyone authenticated reads; only follower inserts/deletes
- **comparisons:** owner only
- **reactions, comments:** anyone authenticated reads; only author inserts/deletes
- **weekly_picks:** user reads own; service role inserts/updates

---

## Algorithms

### Pairwise ranking (binary search)

When user finishes a book and selects tier:
1. Get all user's other books in same tier, ordered by `rank_position` ascending
2. If empty, new book → `rank_position` 1. Done.
3. Otherwise binary search: pick middle book, ask which they loved more. Narrow upper/lower half based on answer. Repeat until interval is empty (3-5 questions for ~30 books)
4. Insert at resulting position. Increment `rank_position` for affected books
5. Save each comparison to `comparisons`
6. **Scoring:** if user has ≥ 10 finished books, assign a frozen numeric score — midpoint of the two neighboring scores within the tier band (loved 8–10, liked 5–7.9, fine 1–4.9). New top of tier = midpoint of current top and band ceiling; new bottom = midpoint of current bottom and band floor; empty tier = band midpoint. Score never changes unless the user explicitly re-ranks.
7. **"Too tough to call":** ends comparisons immediately. New book takes the same score as the pivot and is placed directly below it in `rank_position`. No `comparisons` row written.

### Taste-match score

For each pair (user_a, user_b):
1. Find finished books where both users have `visibility='visible'`: `shared_books`
2. If `count(shared_books) < 4`: "Not enough overlap yet"
3. For each user, re-rank only the shared books 1…n by their overall shelf ordering (loved → liked → fine, then `rank_position` ascending). Normalize each to [0,1] via `(rank − 1) / (n − 1)`. Compute absolute difference per shared book.
4. Average differences. Similarity: `100 - (avg_diff * 100)`. Round.
5. Computed on demand for V1. Data fetch is the documented swap point for V2 private-informs-math upgrade — see DECISION_LOG.

### Weekly picks

Computed lazily, once per week per user (on first Home load of the week; no scheduled job in V1).
Three-layer separation so the trigger can change without rewriting the logic:

Pure compute (/lib/weekly-picks.ts): takes the user's data + followed users' shelves + taste-match scores, returns a ranked pick list with provenance. No Supabase, no timing.
Cache/get-or-compute (data layer): check weekly_picks for current week_of; return if present, else compute + insert + return. Idempotent via UNIQUE(user_id, week_of).
Trigger: Home page calls layer 2 on load. (A future cron can call layer 2 for all users to pre-warm the cache; the read path is unchanged.)

Candidate selection:

Candidates = books in followed users' loved/liked tiers where the current user has NO user_books row at all. (Not restricted to top 10.)
Score each candidate by taste-match-with-that-friend × tier weight (loved > liked). Aggregate across friends if multiple recommend it.
If fewer than 5 loved/liked candidates, fill remaining slots from followed users' want-to-read books (fallback, scored lower).
Take top 5. Store provenance in reasons (see below).

reasons jsonb shape (per book): { book_id: { tier: 'loved'|'liked'|'want_to_read', friend_name: string, friend_count: int } } — drives the caption ("Loved by Sarah", "Loved by Sarah & 2 others", "Liked by James", "Maya wants to read this").
RLS note: weekly_picks gains an owner INSERT/UPDATE policy (was service-role-only) to support client-side compute-on-read.

### Milestone detection

Run on profile load and after rank actions. Compare user data to milestone definitions. New milestones cached in `user_milestones` table.

### Genre self-tagging

Single-select, stored per-user in `user_books.genre` (text; validated against `/lib/genres.ts`; writes governed by the existing owner-only user_books policy). Each reader tags their own copy — the same book can be tagged differently by different users, because genre feeds personal milestones and stats. No shared book-level genre; a consensus display label is deferred to V2.
Offered on the ranking result screen if the user hasn't set a genre for this book; editable on book detail. Picker shows a common-first set of 7 with a "more" expand to the full grouped
list (18 total). Adaptive per-user ordering is V2.

Common-first (shown first):
General fiction · Classics · Historical fiction · Narrative non-fiction · Memoir & biography · Science & ideas · Psychology & self-improvement

Full list (grouped, behind "more"):
Fiction — General fiction · Classics · Historical fiction · Sci-fi & fantasy ·  Mystery & thriller · Romance · Short stories & essays · Poetry & drama

Non-fiction — Memoir & biography · Narrative non-fiction · History & politics · Society & culture · Science & ideas · Psychology & self-improvement · Business & strategy · Art, fashion & design · Travel & place · Other

---

## Environment variables

Required in `.env.local` (never committed):

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # for server-side scheduled jobs only
```
