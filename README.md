# Verso

*Reading is better with friends.*

Verso is a social book-tracking app for people who want their reading life to feel curated, social, and personal. Instead of anonymous reviews or algorithmic discovery, Verso helps users find their next book through friends whose taste they trust.

🔗 **Live app:** [joinverso.io](https://joinverso.io)
📺 **Demo:** *(90-second walkthrough — coming soon)*

---

## What it does

- **Rank your books head-to-head.** Pairwise comparisons replace 5-star ratings. Your shelf orders itself into a real top 10.
- **See your friends sorted by taste-match.** A score based on how similarly you rank the books you've both read.
- **Steal what to read next.** Browse friends' top shelves. Add to your queue with one tap.
- **This week's picks.** A small weekly surface of 3-5 books from your trusted circle that match your taste.
- **DNF without shame.** Stopping a book is part of reading. The app tracks it privately and keeps those titles out of future recommendations.
- **Privacy where it matters.** Mark sensitive reads as private — they still inform your taste-match math but stay off your public shelf.

---

## Who it's for

Young professionals who used to be bookworms and want their reading life back. People who track books in iPhone Notes because Goodreads doesn't reflect them. People whose best recommendations have always come from 5-6 friends — and who'd rather see what those friends actually loved than wade through anonymous star ratings.

---

## Why I built it

I was a bookworm as a kid. Demanding work pulled me out of it. I joined a book club to force myself back into reading and solve the biggest hurdle: figuring out what to read next that would fit my taste.
Goodreads didn't help with that. It's cluttered, looks outdated, and its ratings are hard to read — a 4.0 means one thing for fiction and another for non-fiction, and everything popular clusters in the same narrow band. The reviews from strangers weren't useful to me either. So I tracked books in my Notes app and read less than I wanted to.
The friends I talked to had the same problem. The recommendations they trusted came from a handful of specific people, not from strangers or an algorithm. The Beli model (pairwise ranking, taste-match, trusted friend graph) solves this elegantly for restaurants. Verso does this for books.

---

## How it's different

| | Goodreads | StoryGraph | Verso |
|---|---|---|---|
| Rating mechanic | 5 stars | 5 stars + mood tags | Pairwise + tiers |
| Orientation | Tracking + reviews | Analytics-forward | Social-forward |
| Discovery | Algorithm + strangers | Stats + recommendations | Friend taste-match |
| DNF handling | Shelf-based | Tracked | Private list, recs filter |
| Privacy | Public profile | Configurable | Per-book toggle |
| Aesthetic | Dated | Functional, data-heavy | Editorial, restrained |

The biggest difference: Verso's home screen is built around *what to read next* (weekly picks from your friends), not around an activity feed or a stats dashboard. Books are slow content — feeds get sparse fast. Discovery from people you trust is the better center of gravity.

---

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript | Industry-standard, excellent AI tooling support, fast to ship |
| Styling | Tailwind CSS, shadcn/ui | Fast and consistent, customizable components |
| Backend | Supabase (Postgres + Auth + Storage) | Hosted backend, generous free tier, avoids writing custom server code |
| Hosting | Vercel | Direct GitHub integration, one-click deploys |
| Book metadata | Open Library API | Free, comprehensive, no API key required |
| Distribution | PWA | Installable to phone home screen, no App Store required |

The stack was chosen to maximize solo build velocity. Migration paths to React Native (for native iOS/Android) and to Cloudflare Workers (for scale) remain open.

See `/docs/ARCHITECTURE.md` for the full data model and key algorithms.

---

## Key product decisions

A few decisions that shaped V1:

1. **Pairwise ranking, not stars.** Star averages need decoding — a 4.0 means different things across genres, and everything clusters in a narrow band. Ranking a book against your own shelf needs no calibration.

2. **No public feed of "started reading."** It creates social pressure. The feed only shows finishes, rankings, and want-to-reads.

3. **DNF as a private status, not a shelf item.** Friends don't see it. The recommendation algorithm excludes it. You can resurrect a book from DNF later.

4. **Per-book privacy instead of profile privacy.** Log honestly with one tap to "private." It still counts toward your taste-match calculation but stays off your public shelf.

5. **Taste-match as the central sorting mechanism.** Friends are sorted by how similarly you rank the books you've both read.

6. **Discovery, not consumption, as the home screen.** Books are slower than restaurants — a Beli-style activity feed feels sparse. The weekly picks surface is the daily reason to open the app.

7. **Quietly considered, not characterful.** Restrained design that gets out of the way of book covers. EB Garamond serif, terracotta accent, minimal icons.

Full reasoning in [`docs/DECISION_LOG.md`](docs/DECISION_LOG.md).

---

## Documentation

- [`PRODUCT_SPEC.md`](docs/PRODUCT_SPEC.md) — what's in V1 and why
- [`ARCHITECTURE.md`](docs/ARCHITECTURE.md) — stack, data model, algorithms
- [`ROADMAP.md`](docs/ROADMAP.md) — V1, V2, future thinking
- [`DECISION_LOG.md`](docs/DECISION_LOG.md) — record of significant decisions

---

## Status

🚧 Under active development. Soft launch to a small group of friends planned for June 2026.

- [x] V1 spec
- [x] Tech stack decisions
- [x] Foundations (auth, search, profile, ranking) — Week 1
- [x] Social (follows, friends, taste-match, DNF) — Week 2
- [x] Discovery (weekly picks, feed, reactions) — Week 3
- [x] Onboarding flow, landing screen, settings page
- [ ] Soft launch + user research

---

## Setup

```bash
git clone https://github.com/mariah-codes/verso.git
cd verso
npm install
```

Create a `.env.local` with your Supabase credentials:
```
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

Run locally:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## License

MIT

---

## About

Built by Maria Hamwi. Find me on [LinkedIn](https://linkedin.com/in/mariahamwi).
