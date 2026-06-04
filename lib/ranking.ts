// ── Ranking — pure logic ──────────────────────────────────────────────────────
// No React. No Supabase. Takes data in, returns results.
// All persistence is handled by lib/ranking-data.ts.

// ── Constants (tune here without touching components) ─────────────────────────

export const SCORE_DISPLAY_THRESHOLD = 10

export const TIER_BANDS = {
  loved: { floor: 8.0, ceiling: 10.0 },
  liked: { floor: 5.0, ceiling: 7.9 },
  fine:  { floor: 1.0, ceiling: 4.9 },
} as const

// ── Types ─────────────────────────────────────────────────────────────────────

export type Tier = "loved" | "liked" | "fine"

/** A finished book already ranked in a tier. */
export interface RankedBook {
  bookId: string
  title: string
  coverUrl: string | null
  /** 1-based; 1 = best in this tier. */
  rankPosition: number
  /** null until the user crosses SCORE_DISPLAY_THRESHOLD. */
  score: number | null
}

/** A decisive pairwise comparison (tie comparisons are NOT stored). */
export interface ComparisonRecord {
  /** books.id of the existing (pivot) book. */
  bookAId: string
  /** books.id of the newly ranked book. */
  bookBId: string
  /** books.id of whichever won. */
  winnerId: string
  tier: Tier
}

export type ComparisonStep =
  | { done: true; insertAt: number }                              // 0-based insertion index
  | { done: false; pivotIndex: number; pivot: RankedBook }        // next pivot to show

// ── Binary search ─────────────────────────────────────────────────────────────

/**
 * One step of the binary-search insertion sort.
 *
 * @param tierBooks  Existing books in the tier, sorted by rankPosition asc.
 * @param lo         Current lower bound (0-based, inclusive).
 * @param hi         Current upper bound (0-based, exclusive). Start = tierBooks.length.
 *
 * After the user's answer:
 *   - "new book wins"  → call again with hi = pivotIndex
 *   - "existing wins"  → call again with lo = pivotIndex + 1
 *   - "too tough"      → end immediately; insertAt = pivotIndex + 1 (tie)
 */
export function getNextComparison(
  tierBooks: RankedBook[],
  lo: number,
  hi: number,
): ComparisonStep {
  if (lo >= hi) return { done: true, insertAt: lo }
  const pivotIndex = Math.floor((lo + hi) / 2)
  return { done: false, pivotIndex, pivot: tierBooks[pivotIndex] }
}

// ── Insertion ─────────────────────────────────────────────────────────────────

/**
 * Inserts newBook at insertAt (0-based) and renumbers every rankPosition.
 * Does NOT mutate the original array.
 */
export function insertAtPosition(
  tierBooks: RankedBook[],
  newBook: Omit<RankedBook, "rankPosition">,
  insertAt: number,
): RankedBook[] {
  const result: RankedBook[] = tierBooks.map((b, i) => ({
    ...b,
    rankPosition: i < insertAt ? b.rankPosition : b.rankPosition + 1,
  }))
  result.splice(insertAt, 0, { ...newBook, rankPosition: insertAt + 1 })
  return result
}

// ── Scoring ───────────────────────────────────────────────────────────────────

export interface ScoreInput {
  /**
   * Score of the book ranked immediately above (better than) the new book.
   * null → new book is the new top of its tier.
   */
  neighborAboveScore: number | null
  /**
   * Score of the book ranked immediately below (worse than) the new book.
   * null → new book is the new bottom of its tier.
   */
  neighborBelowScore: number | null
  tier: Tier
}

/**
 * Frozen score for a newly placed book.
 *
 * Rule: always the midpoint of its two score neighbors.
 * The band ceiling/floor act as virtual neighbors at the edges.
 * An empty tier → band midpoint.
 *
 * Given insertAt (0-based) into the ORIGINAL (pre-insertion) tierBooks:
 *   neighborAboveScore = tierBooks[insertAt - 1]?.score ?? null
 *   neighborBelowScore = tierBooks[insertAt]?.score ?? null
 */
export function scoreForNewBook({
  neighborAboveScore,
  neighborBelowScore,
  tier,
}: ScoreInput): number {
  const { floor, ceiling } = TIER_BANDS[tier]

  if (neighborAboveScore === null && neighborBelowScore === null) {
    // Empty tier
    return (ceiling + floor) / 2
  }
  if (neighborAboveScore === null) {
    // New top of tier — only neighbor is below (the current top)
    return (neighborBelowScore! + ceiling) / 2
  }
  if (neighborBelowScore === null) {
    // New bottom of tier
    return (neighborAboveScore + floor) / 2
  }
  // Middle insertion
  return (neighborAboveScore + neighborBelowScore) / 2
}

/**
 * One-time score assignment run exactly when the user crosses
 * SCORE_DISPLAY_THRESHOLD.
 *
 * Spreads each tier's books linearly across that tier's band:
 *   rank 1 (best) → ceiling, rank n (worst) → floor, linear in between.
 *   Single book in a tier → band midpoint.
 *
 * @param booksByTier  Each list must be sorted by rankPosition asc (1 = best),
 *                     and must INCLUDE the newly inserted book.
 * @returns Map of bookId → score for every book across all tiers.
 */
export function seedScores(booksByTier: {
  loved: RankedBook[]
  liked: RankedBook[]
  fine: RankedBook[]
}): Map<string, number> {
  const scores = new Map<string, number>()

  for (const tier of ["loved", "liked", "fine"] as Tier[]) {
    const books = booksByTier[tier]
    const { floor, ceiling } = TIER_BANDS[tier]
    const n = books.length

    if (n === 0) continue

    if (n === 1) {
      scores.set(books[0].bookId, (ceiling + floor) / 2)
      continue
    }

    for (let i = 0; i < n; i++) {
      // i=0 (rank 1, best) → ceiling; i=n-1 (rank n, worst) → floor
      const score = ceiling - (ceiling - floor) * (i / (n - 1))
      scores.set(books[i].bookId, score)
    }
  }

  return scores
}

// ── Display helpers ───────────────────────────────────────────────────────────

/** Round a stored float to 1 decimal for display. */
export function formatScore(score: number): string {
  return score.toFixed(1)
}

/** Estimated max comparisons for a tier of n books (ceil(log2(n+1))). */
export function estimatedComparisons(tierSize: number): number {
  return tierSize === 0 ? 0 : Math.ceil(Math.log2(tierSize + 1))
}
