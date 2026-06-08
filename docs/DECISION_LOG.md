# Decision Log

*Record of significant product, design, and technical decisions for Verso.*

Most recent first. Each entry: date, decision, reasoning.

---

## 2026-06-07

**Genre self-tagging in V1 — per-user.** Single-select genre stored per-user on user_books, not as a shared books-level value: genre feeds personal milestones and stats, so what matters is what the book is to that reader (no single source of truth needed). Offered on the result screen if unset, editable on book detail. Grouped Fiction / Non-fiction, 19 options incl. Other (see ARCHITECTURE); the picker shows a common-first ~7 with a "more" expand, keeping the frequent case fast without forcing the tail into "Other". Rejected: a first-tagger shared value (pollutes each reader's stats with someone else's judgment) and StoryGraph-style mood/taste tags (cut against the pairwise + social differentiation, only pay off at scale). Adaptive per-user ordering deferred to V2.

**Public + private notes replace the single note field in V1.** Splitting later would force users to re-classify notes they'd already written, so do it now: note → private_note (rename, no data loss) + new public_note, both nullable on user_books. Two optional text areas on the result screen for all finished books (not just top-10), editable on book detail. Private note = personal reflection, owner-only; public note = a short review visible to friends on your book detail. Commenting on public notes is a new surface, distinct from feed-event comments — deferred to V2. Folds in the roadmap's "notes on any finished book."


**Reading goals and 3+ currently-reading deferred past soft launch.** Custom reading goals (by count, genre, or author) stay V2; the existing "2026 reading challenge" entry covers the simpler count-based version. Reading more than 3 books simultaneously was a single power-user data point — kept as validate-first in V2, revisit after user research confirms it's a real need across the core demo.

---

## 2026-06-06

**Ranking tiers relabeled to include a genuine negative option.** Old tiers (Loved it / Liked it / It was fine) were all non-negative — no honest way to log a book you disliked. New labels: Loved it (8–10) / Liked it (5–7.9) / Wasn't for me (1–4.9). Bands and the stored enum are unchanged; only display copy changes. "Liked it" absorbs the old neutral "fine" range, and the bottom band — already 1–4.9 — finally has a label matching its purpose. Aligns with Beli's positive/neutral/negative split.


**Ranked shelf + want-to-read move to a dedicated "Shelf" tab — overturning the 2026-04-28 "collapse into Profile" decision.** Split into an identity dashboard (You) and a full browsable archive, profile and shelf aren't redundant. The full shelf is one view parameterized by user (Finished, ranked + infinite scroll; Want-to-read). Every profile — own and friend — keeps compact preview strips (currently reading / want-to-read / finished) with "see all" → that user's shelf view; this is the only path to a friend's full lists, so the previews are required, not optional. The Shelf tab is a shortcut to your own shelf view. Five tabs now: Home, Friends, Search, Shelf, You — in line with Beli (Lists) and Spotify (Your Library). Detailed layout pending mockup.

---

## 2026-06-05

**Taste-match uses rank position, not the frozen score.** Scores are midpoint-interpolated per shelf and aren't comparable across users — two people can rank identically and still have different scores. Rank position is the cross-user-comparable signal of agreement. (Would revisit only if scores ever became globally calibrated.) V1 also uses mutually-visible books only — private-informs-math deferred to V2 (needs server-side compute).

**Taste-match normalizes over the shared set, not the full shelf.** Each user's rank is taken only among the books both have finished (re-ranked 1…n within that overlap), then normalized via (rank−1)/(n−1). Normalizing by full-shelf length would penalize pairs with very different shelf sizes even when they ordered shared books identically. Built as a pure function in /lib/taste-match.ts with the data fetch as a documented swap point — the V2 "private informs math" upgrade replaces only the fetch, not the algorithm.

**Taste-match overlap threshold set to 4 shared books, not 3.** At n=3 the score can only be 33/67/100 — a three-state dial that can't distinguish "pretty aligned" from "somewhat aligned." At n=4 it spans 33/50/67/83/100 (five gradations), which is meaningfully less noisy for the cost of one more shared book. Chose 4 over 5 to keep the feature accessible at soft-launch scale, where shared finished books will be sparse early — gating the headline social feature too hard reads as broken, not honest. MIN_SHARED_BOOKS is a named constant; plan is to tune against real overlap distribution from user-research calls.

---

## 2026-06-03

**Per-book numeric score: frozen on assignment, not recomputed when other books are added.** Score is derived from where the book lands in its tier band (loved 8–10, liked 5–7.9, fine 1–4.9) — midpoint of its two neighbors at insertion time, then fixed. Only an explicit re-rank changes it. Gated: no score shown until 10 books are finished. Adds a nullable `score` column to user_books.

**"Too tough to call" in pairwise comparisons resolves as a tie.** New book takes the same score as the comparison book and sits directly below it in the ranking.

---

## 2026-05-30

**BookTok / social-video integration considered and deferred.** The friction of capturing books from a social video (watching a "5 books that..." reel, then switching apps to add them) is real. But hosting video content in Verso would mean competing with TikTok and Instagram on their own turf, would contradict the trusted-friend-taste thesis, and would require creator content that won't exist at 50-100 users. The right form of the idea is frictionless *capture* (share-sheet + paste-a-list parsing) and *creator shelves* via the existing follow graph — both parked for V2. No video hosting.

---

## 2026-05-12

**Accent color: deep terracotta `#9C4A2F`.** Evokes leather-bound book bindings. Earlier candidates (olive green, lighter terracotta) felt less right — the lighter terracotta read as peachy.

**Friends list rows: no mini-cover strip.** Just avatar + name + match % + currently-reading line. Cover strips proved too cluttered on mobile. Covers appear when tapping into profile.

**Comments confirmed first-class in V1.** Accessible via the comment bubble outline icon, expanded threads, contextual to each feed event. Where the fun of the app lives — friend banter on rankings.

**Reactions: outline icons (flame, smile, comment bubble) that fit the editorial register.

**Milestones IN V1.** Originally cut all gamification; friend feedback clarified the distinction between milestones (good — celebrate progress) and streaks (bad — punish absence). Spotify Wrapped tone. Profile-only, never feed events. Horizontal scrollable strip mid-profile.

**Privacy lives at the book level, not the profile level.** Per-book "private to me" toggle hides book from profile and feed but still informs taste-match math. One-way follow (anyone can follow anyone, no approval) to support following readers whose taste you trust beyond personal friends. Considered mutual-follow but breaks discovery for users who want to follow non-friends with great taste.

**DNF terminology** (instead of "set aside"). Matches reader vocabulary (Goodreads, StoryGraph all use DNF).

**DNF as visible-to-user status, hidden from friends, excluded from recommendations.** Users see their own DNF list; can resurrect books. Friend feedback: DNF is part of the reading record, not something to hide from yourself.

---

## 2026-04-28

**Name: Verso.** Bookish term (left page of an open book). Passes the "I'll add it to X" test. Name-like quality, clean wordmark potential. Considered Stacks, Booked. Verso held up best across rounds.

**Brand thesis: "quietly considered but not pretentious"** The aesthetic gets out of the way of book covers. Reference register: Resy, Beli, Instagram.

**Considered Cloudflare Workers per SWE friend recommendation. Stayed with Vercel/Supabase for V1.** Cloudflare technically superior at scale, but Vercel/Supabase has more mature AI tooling, integrated auth, and faster solo build velocity. Migration path remains if traction warrants.

**Tab 4 absorbs the "your shelf" concept.** Originally specced as 5 tabs with a separate Shelf and Profile; collapsed into Profile (they were redundant).

**Home structure: weekly picks horizontal strip + vertical feed.** No friends-list-by-taste-match as the home view (felt static); no pure activity feed as home (felt sparse because reading is slower than restaurants). Spotify-style hybrid handles both fresh and familiar.

**Reactions in, comments behind tap.** Reactions are social texture; comment counts visible but content hidden keeps feed clean.

**Cut "started reading" from feed.** Low signal, creates social pressure ("why haven't you started yet").

**Cut "send a recommendation" feature.** Pull (browse friends' shelves) is more natural than push (friend nominates a book for you). Consistent with the demo's relationship to taste.

**Chose Next.js + Supabase + PWA over React Native + Expo.** Faster to ship in a 3-4 week window with no engineering co-founder. Transferable codebase. Migration path to native open if traction warrants.

---

## How to update this log

Add new entries at the top with the current date. Keep each entry brief — one bolded sentence for the decision, then 1-3 sentences of reasoning.

Commit format: `docs: log decision on [topic]`
