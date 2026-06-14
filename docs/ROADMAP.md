# Roadmap

*What's in V1, what's deferred, and what comes next.*

**Last updated:** 2026-06-12

---

## Open questions — pending user research


---

## V1 — Current build (3 weeks)

The minimum honest version of Verso. See `PRODUCT_SPEC.md` for details.

### Functionality
- Auth (Google, email) — no Apple in V1
- Landing / welcome screen (cream, brand line mark, "Reading is better with friends.")
- Onboarding flow: profile → 51-book cover grid → ranking game → find friends by name (no Goodreads import — deferred to Settings)
- Settings page (display name, username, email, password, sign out, partial account deletion)
- Pairwise ranking with tiers (loved / liked / fine)
- Profile with Top 3, currently reading, want-to-read preview, milestones, DNF list; full ranked shelf + want-to-read on the Shelf tab
- Friends list sorted by taste-match
- Friend profiles
- Search and add books via Open Library
- Weekly picks (3-5 books surfaced from friends' shelves)
- Feed of friend rankings and want-to-reads (avatar-led cards; heart + comment + save)
- Public notes (reviews) on book pages, surfaced in the feed, with comments — see DECISION_LOG 2026-06-10
- Reactions and comments on feed events
- Stop reading flow → Save for later or DNF
- Per-book private toggle
- PWA install support
- Genre self-tagging on ranking result + book detail (single-select, stored per-user on user_books)
- Public + private notes on all finished books (two optional text areas: public review visible to friends, private thoughts visible to owner only)

### Distribution
- Web app at joinverso.io
- PWA installable to phone home screen
- Soft launch to 50-100 friends

---

## V2 — Parking lot

Things that are good ideas but deliberately not in V1. Date added in parentheses.

### Probably yes for V2
- **Adaptive genre picker ordering** (2026-06-07) — surface each user's most-tagged genres first in the picker. Deferred from V1: needs usage history to beat the static common-first default, and new users start cold. Revisit once there's per-user genre data.
- ~~**Commenting on public book reviews**~~ — **moved to V1** (see DECISION_LOG 2026-06-10). Comments now attach to the review (public note) as the commentable object, built in three steps: note authoring + display on book pages → notes on feed cards → comments on reviews.
- **Reading stats section** (2026-06-07) — books read this year, most frequent genre, etc.; toggleable in settings to avoid public-shaming concern. Extends milestones toward raw analytics. Depends on genre data (now in V1).
- **Friends' average score on book detail** (2026-06-04) — alongside your own score on the book detail page, show the average score your friends have given that book (e.g. "You: 10.0 · Friends: 8.4"). If no friends have rated it, show "—". Beli-style: no minimum threshold, just show what exists. Requires fetching all followed users' user_books rows for a given book and averaging their scores. Build after taste-match (Day 8) since it shares the same friends-who-rated-this query pattern.
- **Frictionless multi-book capture** (2026-05-30) — share-sheet target + paste-a-list parsing, so users can add every book from a social video / newsletter / tweet without leaving the source or typing titles one by one. Important: this is *capture*, not *content hosting* — the video stays on its platform; Verso removes the friction of getting those books onto your shelf.
- **Creator / public-figure shelves** (2026-05-30) — let notable readers have discoverable Verso profiles so the follow graph extends beyond personal friends. A reader whose taste you trust (including a social-media book creator, if they join) becomes a follow, and their ranked shelf is the discovery surface — no video needed. Ties to approve-only privacy mode.
- **Approve-only profile privacy mode** (2026-05-12) — per-book privacy covers V1; full profile privacy if users want it at scale
- **Currently-reading on home screen** (2026-05-12) — declined for V1 to keep home focused on discovery; reconsider after testing
- **Phone contacts integration for finding friends** (2026-04-28) — invite-code only in V1
- **2026 reading challenge** (2026-04-28) — Beli-style yearly target; light gamification if retention needs it
- **Achievements as feed events** (2026-05-12) — feed-surface milestones (off V1 to avoid Duolingo tilt; revisit after testing)
- **Native iOS / React Native port** (2026-04-28) — V1 ships as PWA; port if traction warrants

### Maybe
- **Taste / verdict tags** (2026-06-07) — structured tags on finished books. Considered for V1 and declined: descriptive mood tags (dark / funny / cozy) are StoryGraph's signature mechanism and blur Verso's pairwise + social differentiation, and tag-based filtering only pays off at scale. If revisited, the on-brand slice is opinionated verdicts (Overhyped / Underrated) rather than mood descriptors — social, spicy, and distinct from StoryGraph. The free-text public note covers the expressive need at V1 scale.
- **Book clubs / private groups within the app** — friend graph covers most of this at small scale; deferred
- **Highlights / capture / quotes** — Maria's original idea; better as integration with Highlighted/Readwise later
- **Progress tracking on currently-reading** — page input, progress bars; friction high, value uncertain

### Probably no
- **Hosted video content / in-app reels** — would make Verso compete with TikTok/Instagram on their turf, contradict the trusted-friend-taste thesis, and require creator content that won't exist at small scale. The right form of the underlying idea is frictionless capture (above), not content hosting.
- **Streaks / daily reminders** — wrong product for this demo
- **Public/global feed beyond your circle** — V1 is friend-graph only; staying that way
- **AI taste tags** — needs scale data, would be a mediocre LLM wrapper at V1 scale

---

## V3+ — Long horizon

Not committed. Notes for future thinking.

- **Bookstore partnerships / monetization**
- **AI-driven recommendations** (only with significantly more data)
- **Power-user features** — sub-collections, custom tags
- **Reader analytics / yearly Wrapped**
- **Book club coordination tools** (if community demand emerges)
- **Collaborative-filtering recommendations ("Readers like you loved this").** V1 computes rank-based taste similarity between you and people you follow; V3 computes it between you and the whole user base to surface recs from taste-neighbors you don't follow. Same underlying signal (rank-based similarity) at scale — V1's rankings and taste-match data are exactly what trains it. Needs significant user/ranking volume to be meaningful.

---

## How decisions move in and out

Items in this roadmap move based on:
- **User research** — what testers actually need vs. what we assumed
- **Engineering constraints** — what's feasible solo
- **Strategic clarity** — what's core to the thesis vs. what's noise

Every decision change is logged in `DECISION_LOG.md`.
