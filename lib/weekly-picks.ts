// ── Weekly picks — pure logic ─────────────────────────────────────────────────
// No React. No Supabase. Takes the current user's owned books + followed users'
// shelves + taste-match scores in, returns an ordered pick list with provenance.
// All fetching / persistence lives in lib/weekly-picks-data.ts.
//
// Spec: docs/ARCHITECTURE.md → "Weekly picks", and DECISION_LOG 2026-06-08:
//   - Candidates = books in followed users' loved/liked tiers that the current
//     user has NO user_books row for (ANY status). Not limited to top 10.
//   - Score each candidate by taste-match-with-that-friend × tier weight
//     (loved > liked), combined across friends (hybrid — see below).
//   - want_to_read is a FALLBACK source only: used to fill remaining slots, always
//     ranked below every loved/liked candidate, with honestly-soft provenance.
//   - Provenance surfaces tier + top contributing friend + friend_count. Never rank.

// ── Tunable constants ─────────────────────────────────────────────────────────

/** Tier weights — loved outranks liked. Multiply taste-match (0–100) by these. */
const TIER_WEIGHT = { loved: 1.0, liked: 0.6 } as const

/**
 * Hybrid aggregation: a candidate's score is anchored by its single strongest
 * friend-signal, then nudged up a little for each ADDITIONAL corroborating friend.
 *   score = maxContribution × (1 + min(extraFriends × PER, CAP))
 * where maxContribution = max over friends of (tasteMatch × tierWeight),
 *       extraFriends     = (distinct contributing friends) − 1.
 * PER=0.10, CAP=0.50 → corroboration tops out at +50%, so it never overtakes the
 * base signal: one high-match friend's loved book still beats a crowd of medium
 * matches, while genuine consensus gets a meaningful (bounded) lift.
 */
const CORROBORATION_BONUS_PER_FRIEND = 0.1
const CORROBORATION_BONUS_CAP = 0.5

/** Max picks returned (loved/liked first, then want_to_read fallback). */
export const MAX_PICKS = 5

/**
 * Soft cap on how many of the picks a single friend may be the NAMED top
 * contributor for. Relaxed only when necessary to reach MAX_PICKS (e.g. one
 * friend is the only source of candidates). Caps the *named* slot, not candidacy:
 * a capped-out friend still corroborates other picks (counts toward their bonus
 * and friend_count).
 */
const FRIEND_DIVERSITY_CAP = 2

// ── Types ─────────────────────────────────────────────────────────────────────

export type PickTier = "loved" | "liked" | "want_to_read"

/** One followed user's relevant shelf slices (book_ids only — metadata is joined
 *  later by the data layer). `loved`/`liked` are finished books in those tiers;
 *  `wantToRead` is their want-to-read list (fallback source). */
export interface FriendShelf {
  userId: string
  displayName: string
  loved: string[]
  liked: string[]
  wantToRead: string[]
}

export interface WeeklyPicksInput {
  /** The current user's user_books book_ids across ALL statuses — the exclusion
   *  set. A candidate the user has any row for (want/reading/finished/dnf) is out,
   *  so we never re-recommend something they've already engaged with. */
  ownedBookIds: string[]
  friends: FriendShelf[]
  /** friendUserId → taste-match score (0–100), or null when there isn't enough
   *  shared history to score (< MIN_SHARED_BOOKS). */
  tasteMatch: Map<string, number | null>
}

/** One resulting pick. `score`/`topFriendId` are internal — never shown. */
export interface WeeklyPick {
  bookId: string
  tier: PickTier
  /** Display name of the single top-contributing friend. */
  friendName: string
  /** Distinct friends who contributed to this pick (drives "& N others"). */
  friendCount: number
  /** User id of the top contributor — used to enforce the diversity cap. */
  topFriendId: string
  score: number
}

// ── Core ──────────────────────────────────────────────────────────────────────

/**
 * Compute up to MAX_PICKS weekly picks with provenance.
 *
 * Scoring model:
 *  - A friend with a NULL taste-match (too little shared history) contributes
 *    NOTHING. Deliberate: at launch most pairs are below the overlap threshold, so
 *    picks stay empty (→ cold-start UI) rather than surfacing books from friends
 *    whose taste we can't vouch for — keeping "from friends who share your taste"
 *    honest.
 *  - Per-friend contribution to a loved/liked candidate = tasteMatch × tierWeight.
 *  - Combined across friends via the HYBRID rule (max + bounded corroboration
 *    bonus; see CORROBORATION_BONUS_* above). Candidates whose max is ≤ 0 drop.
 *  - Provenance tier/friend = the single TOP contributor (highest tasteMatch ×
 *    tierWeight); friend_count = distinct contributing friends.
 *  - A friend is named the top contributor on at most FRIEND_DIVERSITY_CAP picks,
 *    relaxed only to reach MAX_PICKS.
 *  - want_to_read fills only remaining slots after loved/liked, ordered among
 *    themselves by summed taste-match — a fallback can never outrank a real pick.
 */
export function computeWeeklyPicks(input: WeeklyPicksInput): WeeklyPick[] {
  const { friends, tasteMatch } = input
  const owned = new Set(input.ownedBookIds)

  // book_id → contributions from each friend (loved/liked tiers only)
  interface Contribution { friendId: string; name: string; tier: "loved" | "liked"; weight: number }
  const candidates = new Map<string, Contribution[]>()

  const addContribution = (bookId: string, c: Contribution) => {
    if (owned.has(bookId)) return
    const list = candidates.get(bookId)
    if (list) list.push(c)
    else candidates.set(bookId, [c])
  }

  for (const friend of friends) {
    const match = tasteMatch.get(friend.userId)
    if (match == null || match <= 0) continue // null/0 match → no contribution

    for (const bookId of friend.loved) {
      addContribution(bookId, { friendId: friend.userId, name: friend.displayName, tier: "loved", weight: match * TIER_WEIGHT.loved })
    }
    for (const bookId of friend.liked) {
      addContribution(bookId, { friendId: friend.userId, name: friend.displayName, tier: "liked", weight: match * TIER_WEIGHT.liked })
    }
  }

  // Resolve loved/liked candidates → WeeklyPick via the hybrid rule.
  const primary: WeeklyPick[] = []
  for (const [bookId, contributions] of candidates) {
    const top = contributions.reduce((a, b) => (b.weight > a.weight ? b : a))
    if (top.weight <= 0) continue
    const friendCount = new Set(contributions.map((c) => c.friendId)).size
    const bonus = Math.min((friendCount - 1) * CORROBORATION_BONUS_PER_FRIEND, CORROBORATION_BONUS_CAP)
    const score = top.weight * (1 + bonus)
    primary.push({ bookId, tier: top.tier, friendName: top.name, friendCount, topFriendId: top.friendId, score })
  }
  primary.sort((a, b) => b.score - a.score)

  // Select primary picks respecting the diversity cap (relaxing to fill).
  const namedCount = new Map<string, number>()
  let result = selectWithDiversityCap(primary, MAX_PICKS, namedCount)
  if (result.length >= MAX_PICKS) return result

  // ── Fallback: want_to_read fills remaining slots, always after loved/liked ───
  interface WtrContribution { friendId: string; name: string; match: number }
  const wtr = new Map<string, WtrContribution[]>()
  for (const friend of friends) {
    const match = tasteMatch.get(friend.userId)
    if (match == null || match <= 0) continue
    for (const bookId of friend.wantToRead) {
      // Skip owned and anything already a loved/liked candidate (stronger signal).
      if (owned.has(bookId) || candidates.has(bookId)) continue
      const list = wtr.get(bookId)
      const c = { friendId: friend.userId, name: friend.displayName, match }
      if (list) list.push(c)
      else wtr.set(bookId, [c])
    }
  }

  const fallback: WeeklyPick[] = []
  for (const [bookId, contributions] of wtr) {
    const score = contributions.reduce((sum, c) => sum + c.match, 0) // unchanged: sum
    if (score <= 0) continue
    const top = contributions.reduce((a, b) => (b.match > a.match ? b : a))
    const friendCount = new Set(contributions.map((c) => c.friendId)).size
    fallback.push({ bookId, tier: "want_to_read", friendName: top.name, friendCount, topFriendId: top.friendId, score })
  }
  fallback.sort((a, b) => b.score - a.score)

  const fallbackSelected = selectWithDiversityCap(fallback, MAX_PICKS - result.length, namedCount)
  result = result.concat(fallbackSelected)
  return result
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Pick up to `limit` from a score-sorted pool such that no top-contributor friend
 * is named more than FRIEND_DIVERSITY_CAP times (counting across calls via the
 * shared `namedCount`). If the cap blocks too many to reach `limit`, relax it —
 * never return fewer just to keep diversity. Returned list is score-ordered.
 */
function selectWithDiversityCap(
  poolSorted: WeeklyPick[],
  limit: number,
  namedCount: Map<string, number>,
): WeeklyPick[] {
  if (limit <= 0) return []
  const selected: WeeklyPick[] = []
  const deferred: WeeklyPick[] = []

  const take = (p: WeeklyPick) => {
    selected.push(p)
    namedCount.set(p.topFriendId, (namedCount.get(p.topFriendId) ?? 0) + 1)
  }

  // Pass 1: respect the cap.
  for (const p of poolSorted) {
    if (selected.length >= limit) break
    if ((namedCount.get(p.topFriendId) ?? 0) < FRIEND_DIVERSITY_CAP) take(p)
    else deferred.push(p)
  }
  // Pass 2: relax the cap only as needed to reach `limit`.
  for (const p of deferred) {
    if (selected.length >= limit) break
    take(p)
  }

  selected.sort((a, b) => b.score - a.score)
  return selected
}
