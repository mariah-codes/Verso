# Product Spec

*Verso V1 — what we're building and why.*

**Last updated:** 2026-06-10

---

## Problem

Young professionals who used to read have stopped, for two reasons:
1. They don't know what to read next, and the recommendation sources they have don't help: algorithmic suggestions and social video don't match their taste, and star ratings need decoding (you have to already know that 4.0 means something different for non-fiction than for fiction, and that the scale is compressed into a narrow band).
2. The tools for tracking books don't fit them. Goodreads has a different demographic and a different aesthetic — it serves committed long-time users well, but doesn't fit the taste-conscious reader who left it behind. The alternative for most of this demo is iPhone Notes — or nothing.

The result: no memory of what they've read, no recommendations they trust, no social discovery layer.

## Who it's for

The lapsed-bookworm version of a thoughtful young professional. 25-35 year olds in NYC, LA, SF, and London who read 5-15 books a year, used to read more, have strong but underused taste, and want their reading to feel social with their actual friends.

## Thesis

The most useful book recommendations come from a small circle of friends with great taste. Verso makes that mechanism explicit:
- Rank what you've read so the app learns your taste
- See your friends sorted by taste-match
- Browse their shelves and steal what to read next
- A small weekly surface of picks does the algorithmic work for you

## Core loop

Open the app → see this week's picks (3-5 books surfaced from friends' shelves matching your taste) → tap to add to want-to-read → finish a book → pairwise rank it → your top 10 evolves → friends see your taste shift → repeat.

## Differentiation

| | Goodreads | StoryGraph | Verso |
|---|---|---|---|
| Rating | 5 stars | 5 stars + mood tags | Pairwise + tiers |
| Orientation | Tracking + reviews | Analytics-forward | Social-forward |
| Discovery | Algorithm + strangers | Stats + recommendations | Friend taste-match |
| DNF | Shelf-based, public | Tracked | Private, recs filter |
| Privacy | Public | Configurable | Per-book toggle |
| Aesthetic | Dated, cluttered | Functional, data-heavy | Editorial, restrained |
| Home screen | Activity feed | Stats dashboard | Weekly picks + feed |

Goodreads serves committed long-time trackers. StoryGraph wins on analytics and mood-based recommendations for people who love reading data. Verso is the social-discovery layer for a small trusted circle — the answer to "what should I read next?" comes from friends whose taste you actually trust, wrapped in a design that fits the demo.

---

## V1 scope

Five tabs.

### Tab 1 — Home

**"This week's picks"** — horizontal scroll of 3-5 book covers, refreshed weekly, surfaced from friends' shelves based on taste-match weighting. Tap → book detail → add to want-to-read.

**"From your circle"** — vertical feed. Derived from followed users' shelves (no events table). Two event types:
- Friend ranked a finished book (shows their score, or tier if below the score threshold)
- Friend added to want-to-read

Cards are avatar-led (avatar → text → cover) for friend identity. Each card carries heart + comment (left) and a save bookmark (right) that adds the book to your want-to-read.

Reactions inline (see below).

Excluded from feed: "started reading," generic likes, app-meta events, milestone achievements.

### Tab 2 — Friends

List of friends sorted by taste-match score descending. Each row: avatar, name, match %, single small line showing currently-reading title. No cover strip in the row — too cluttered on mobile. Tap → friend profile.

### Tab 3 — Search / Add

Search bar querying Open Library API. Results as cards. Tap → action menu (Read / Reading / Want to read). If Read → pairwise ranking. Goodreads CSV import button at bottom.

### Tab 4 — You (Profile)

The identity dashboard — highlights and entry points, not the full archive (that lives in the Shelf tab). Top to bottom:
1. Avatar, name, edit button
2. Taste signature one-liner (factual stats only)
3. **Finished — Top 3** — three cards, with "see all" → Shelf (Finished)
4. Currently reading (1-3 cards)
5. Want to read — preview strip, "see all" → Shelf (Want-to-read)
6. **Milestones — small horizontal scroll of earned badges**
7. **DNF list** (own profile only, small tappable section at bottom)

The full ranked shelf and full want-to-read list no longer live inline here — they moved to the Shelf tab to keep the profile short and milestones/DNF reachable. The "see all" links are the only path into a friend's full lists, so they appear on friend profiles too (minus DNF). Exact preview composition — e.g. whether Finished shows a separate recent-strip alongside Top 5 — to be settled in the mockup.

### Tab 5 — Shelf

The full browsable archive. One view, rendered for any user: your own via this tab, a friend's via "see all" on their profile. Two sub-views (tabs within the page):
- **Finished** — the full ranked list, infinite scroll, in rank order (loved → liked → fine, then rank_position)
- **Want to read** — full list, infinite scroll

DNF is not shown here (own-profile-only, per the privacy model). Layout pending mockup.

---

## Key flows

### Onboarding (target: 90 seconds—2 minutes)

1. Sign up with Apple/Google
2. Name + photo
3. **Cover grid:** tap covers from a curated 50-book grid. Aim for 8-12 taps.
4. Optional Goodreads CSV import
5. Pairwise rank tapped books (binary search, ~15 comparisons for 10 books)
6. Find friends — phone contacts or invite code
7. Land on home with picks populated

### Pairwise ranking

1. Mark book as finished
2. Tier prompt: "How was it? Loved it / Liked it / Wasn't for me"
3. Pairwise comparisons within tier (3-5 matchups, binary search)
4. Position revealed
5. Genre prompt (if genre not yet set on this book): single-select, common-first pills with a "more" expand to the full grouped list. Skippable.
6. Note prompts (both optional, both skippable):
   - "Public review" — short note visible to friends on your book detail
   - "Private thoughts" — personal reflection, just for you
   If book cracks top 10, the private thoughts prompt is surfaced more prominently.

### Stop reading flow

1. On currently-reading → "Stop reading"
2. Prompt: "Save for later or DNF?"
3. **Save for later** → back to want-to-read with `was_started` flag
4. **DNF** → moves to DNF list (private, excluded from recs, can be resurrected)

### Multiple currently-reading

- Cap at 3 books
- 4th attempt prompts to set aside one
- Ordered by most recent interaction

---

## Reactions and comments

Each feed card carries two social reactions on the left and a personal save action on the right:
- **Heart outline** — "I love this / I agree"
- **Comment bubble outline** — tap to open the thread
- **Save bookmark** (right) — adds the book to your want-to-read. Three states: outline (saveable), terracotta-filled (on your want-to-read, tap to remove), muted (already finished/reading/dnf — inactive). Counts are hidden when zero.

Comments attach to a friend's **review** (their public note on a finished book), not to the bare ranking event — the authored take is the real unit of conversation (Letterboxd/Beli model). This is where the fun lives — friend banter on reviews, hot takes, sassy reactions. (See DECISION_LOG 2026-06-10.)

Tapping the comment bubble expands the conversation inline (or modal). Comments are contextual to the specific event (e.g., "Sarah ranked Demon Copperhead at #2") — not generic book reviews. Comments are first-class in V1. This is where the fun lives — friend banter on rankings, hot takes, sassy reactions.

---

## Milestones

Small, tasteful, *private* achievements visible on profile only. Never feed events. No daily-streak guilt.

Examples:
- "10 books finished"
- "First 5-tier book ranked"
- "3 genres in 2026"
- "Top 10% reader among your friends"
- "First DNF" (tongue-in-cheek)
- "Translated fiction enjoyer" (3+)
- "Just finished your 5th romance"

Visual: monochrome on cream, terracotta accent for earned, small (~50px), text-driven. Reference Spotify Wrapped, not Duolingo.

Placement: dedicated horizontal scrollable strip mid-profile (below want-to-read, above DNF).

---

## Privacy model

Lives at the book level, not the profile level:

- Profiles visible to anyone signed in (default social behavior)
- One-way follow — anyone follows anyone, no approval needed (scales to following readers whose taste you trust, beyond personal friends)
- **Per-book "private to me" toggle** — hides book from profile and feed events but still counts toward taste-match math

This separates what the algorithm sees from what friends see. Users log honestly, recommendations stay accurate, embarrassing reads stay private.

If users later request full profile privacy, that's V2.

- private_note is never shared — invisible to friends regardless of the per-book visibility toggle
- public_note follows the book's visibility setting: if the book is marked private, the public note is also hidden

---

## What's intentionally NOT in V1

See `ROADMAP.md` for the V2+ parking lot.

Key cuts:
- No highlights/capture (different product)
- No progress tracking on currently-reading
- No AI taste tags
- No public/global feed
- No "send a recommendation" (pull, not push)
- No streaks
- No native iOS (PWA only for V1)
- No currently-reading on home screen
- No hosted video content (the follow graph + future frictionless capture handle social-content discovery)
