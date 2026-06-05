// ── Taste-match — pure logic ──────────────────────────────────────────────────
// No React. No Supabase. Takes two users' finished books in, returns a score out.
// All persistence / fetching is handled by lib/taste-match-data.ts.
//
// Spec: docs/ARCHITECTURE.md → "Taste-match score", with two deliberate V1
// overrides to what's written there:
//   (a) Normalize over the SHARED set, not the full shelf.
//   (b) Visible books only (private-informs-math is a planned V2 swap — see the
//       SWAP POINT comment in lib/taste-match-data.ts and the DECISION_LOG).
//
// Signal is rank_position, NEVER the frozen `score` column — score is display-
// only (DECISION_LOG 2026-06-03). Rank position is the stable taste signal.

// ── Constants (tune here without touching the data layer or components) ───────

/** Minimum shared finished books before a score is meaningful. */
export const MIN_SHARED_BOOKS = 4

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tier = "loved" | "liked" | "fine"

/** The minimal shape computeTasteMatch needs from each finished book. */
export interface FinishedBook {
  book_id: string
  tier: Tier | null
  /** 1-based within tier; null while a book is finished-but-not-yet-ranked. */
  rank_position: number | null
}

export interface TasteMatchResult {
  /** 0–100 similarity, or null when there isn't enough overlap to score. */
  score: number | null
  /** How many finished books the two users share (drives the null case). */
  sharedCount: number
}

// Combined-shelf tier precedence: loved books outrank liked outrank fine.
const TIER_ORDER: Record<Tier, number> = { loved: 0, liked: 1, fine: 2 }

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Taste-match similarity between two users from their finished books.
 *
 * Each argument is an array of finished books shaped { book_id, tier,
 * rank_position }. Pure — same inputs always yield the same result, so the data
 * source underneath can be swapped (V2: server-side full shelves) without
 * touching this math.
 *
 * Steps:
 *  1. Build each user's overall ordering: sort by tier (loved→liked→fine), then
 *     rank_position asc. Books with a null rank_position are excluded.
 *  2. Intersect the two book_id sets → the shared books.
 *  3. If fewer than MIN_SHARED_BOOKS shared → { score: null, sharedCount }.
 *  4. Re-rank ONLY the shared books within the shared set (1…n by each user's
 *     overall ordering), then normalize each to [0,1] via (rank − 1) / (n − 1).
 *  5. Average the absolute per-book differences between the two normalized ranks.
 *  6. score = round(100 − avgDiff × 100).
 */
export function computeTasteMatch(
  myBooks: FinishedBook[],
  theirBooks: FinishedBook[],
): TasteMatchResult {
  // 1. Overall ordering per user → ordered list of book_ids.
  const myOrder = orderFinished(myBooks)
  const theirOrder = orderFinished(theirBooks)

  // 2. Shared book_ids (present, ranked, in both).
  const theirSet = new Set(theirOrder)
  const sharedIds = myOrder.filter((id) => theirSet.has(id))
  const sharedCount = sharedIds.length

  // 3. Gate on overlap.
  if (sharedCount < MIN_SHARED_BOOKS) {
    return { score: null, sharedCount }
  }

  // 4. Normalized rank of each shared book, within the shared set, per user.
  const myNorm = normalizedSharedRanks(myOrder, sharedIds)
  const theirNorm = normalizedSharedRanks(theirOrder, sharedIds)

  // 5. Average absolute difference across the shared books.
  let totalDiff = 0
  for (const id of sharedIds) {
    totalDiff += Math.abs(myNorm.get(id)! - theirNorm.get(id)!)
  }
  const avgDiff = totalDiff / sharedCount

  // 6. Similarity.
  const score = Math.round(100 - avgDiff * 100)
  return { score, sharedCount }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * One user's finished books → array of book_ids in overall taste order
 * (loved→liked→fine, then rank_position asc). Books missing a tier or
 * rank_position are dropped (finished-but-unranked can't be placed).
 */
function orderFinished(books: FinishedBook[]): string[] {
  return books
    .filter((b) => b.tier !== null && b.rank_position !== null)
    .slice()
    .sort((a, b) => {
      const ta = TIER_ORDER[a.tier as Tier]
      const tb = TIER_ORDER[b.tier as Tier]
      if (ta !== tb) return ta - tb
      return (a.rank_position as number) - (b.rank_position as number)
    })
    .map((b) => b.book_id)
}

/**
 * Given a user's full overall ordering and the shared book_ids, re-rank the
 * shared books among themselves (preserving the user's relative order) and
 * normalize to [0,1] via (rank − 1) / (n − 1).
 *
 * Edge case: n === 1 would divide by zero. That can't reach here in practice —
 * MIN_SHARED_BOOKS is 4 — but guard anyway so the function is safe standalone:
 * a lone shared book maps to 0 (perfect agreement).
 */
function normalizedSharedRanks(
  overallOrder: string[],
  sharedIds: string[],
): Map<string, number> {
  const shareSet = new Set(sharedIds)
  // Shared books in this user's relative order.
  const ordered = overallOrder.filter((id) => shareSet.has(id))
  const n = ordered.length

  const norm = new Map<string, number>()
  ordered.forEach((id, i) => {
    norm.set(id, n === 1 ? 0 : i / (n - 1)) // i = rank − 1
  })
  return norm
}
