// ── Ranking data layer — all Supabase calls for the ranking flow ──────────────

import { supabase } from "./supabase"
import {
  seedScores,
  insertAtPosition,
  compareFinishedOrder,
  SCORE_DISPLAY_THRESHOLD,
  type Tier,
  type RankedBook,
  type ComparisonRecord,
} from "./ranking"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

/** RankedBook plus the user_books.id needed to update it. */
export interface FetchedRankedBook extends RankedBook {
  userBookId: string
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * All finished + ranked books the user has in a given tier, sorted best-first.
 * Excludes rows where rank_position IS NULL (i.e. the book being ranked now).
 */
export async function fetchTierBooks(
  userId: string,
  tier: Tier,
): Promise<FetchedRankedBook[]> {
  const { data, error } = await db
    .from("user_books")
    .select(`
      id,
      rank_position,
      score,
      books ( id, title, cover_url )
    `)
    .eq("user_id", userId)
    .eq("status", "finished")
    .eq("tier", tier)
    .not("rank_position", "is", null)
    .order("rank_position", { ascending: true })

  if (error) {
    console.error("[ranking-data] fetchTierBooks:", error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((row: any) => ({
    userBookId: row.id,
    bookId: row.books.id,
    title: row.books.title,
    coverUrl: row.books.cover_url || null,
    rankPosition: row.rank_position,
    score: row.score ?? null,
  }))
}

/** Total number of finished books for this user (including the one being ranked). */
export async function fetchFinishedCount(userId: string): Promise<number> {
  const { count, error } = await db
    .from("user_books")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "finished")

  if (error) return 0
  return count ?? 0
}

/** Fetch all three tiers' books for seed scoring. Excludes unranked rows. */
export async function fetchAllFinishedForSeed(userId: string): Promise<{
  loved: FetchedRankedBook[]
  liked: FetchedRankedBook[]
  fine: FetchedRankedBook[]
}> {
  const [loved, liked, fine] = await Promise.all([
    fetchTierBooks(userId, "loved"),
    fetchTierBooks(userId, "liked"),
    fetchTierBooks(userId, "fine"),
  ])
  return { loved, liked, fine }
}

/**
 * After ranking, return the new book's 1-based position in the user's combined
 * ranking (loved → liked → fine, then rankPosition within tier).
 */
export async function fetchOverallRank(
  userId: string,
  bookId: string,
): Promise<number | null> {
  const { data, error } = await db
    .from("user_books")
    .select(`id, tier, rank_position, books ( id )`)
    .eq("user_id", userId)
    .eq("status", "finished")
    .not("rank_position", "is", null)
    .not("tier", "is", null)

  if (error || !data) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sorted = (data as any[]).sort((a, b) =>
    compareFinishedOrder(
      { tier: a.tier, rankPosition: a.rank_position },
      { tier: b.tier, rankPosition: b.rank_position },
    ),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const idx = sorted.findIndex((row: any) => row.books?.id === bookId)
  return idx === -1 ? null : idx + 1
}

// ── Persistence ───────────────────────────────────────────────────────────────

interface PersistParams {
  userId: string
  newBookId: string           // books.id
  newUserBookId: string       // user_books.id
  tier: Tier
  newRankPosition: number     // 1-based
  tierWasEmpty: boolean
  sessionComparisons: ComparisonRecord[]
  newBookScore: number | null
  isSeedCrossing: boolean
  seedScoreMap: Map<string, number>
  /** Full post-insertion tier lists (with new book spliced in); only used when isSeedCrossing. */
  allFinishedForSeed: {
    loved: FetchedRankedBook[]
    liked: FetchedRankedBook[]
    fine: FetchedRankedBook[]
  } | null
}

/**
 * Persists the completed ranking in one logical operation:
 *   1. Shift existing rank_positions to make room (via RPC)
 *   2. Set the new book's tier, rank_position, and score
 *   3. If threshold crossing: write seed scores to all finished books
 *   4. Insert decisive comparison rows
 */
export async function persistRankingResult({
  userId,
  newBookId,
  newUserBookId,
  tier,
  newRankPosition,
  tierWasEmpty,
  sessionComparisons,
  newBookScore,
  isSeedCrossing,
  seedScoreMap,
  allFinishedForSeed,
}: PersistParams): Promise<{ error: string | null }> {
  try {
    // ── 1. Shift existing rank_positions ──────────────────────────────────
    // Only needed when other books already exist in the tier.
    if (!tierWasEmpty) {
      const { error: rpcErr } = await db.rpc("shift_rank_positions", {
        p_user_id: userId,
        p_tier: tier,
        p_from_position: newRankPosition,
      })
      if (rpcErr) throw new Error(`shift_rank_positions: ${rpcErr.message}`)
    }

    // ── 2. Update the new book's row ──────────────────────────────────────
    const { error: ubErr } = await db
      .from("user_books")
      .update({ tier, rank_position: newRankPosition, score: newBookScore })
      .eq("id", newUserBookId)

    if (ubErr) throw new Error(`update new book: ${ubErr.message}`)

    // ── 3. Seed scores on threshold crossing ──────────────────────────────
    if (isSeedCrossing && allFinishedForSeed && seedScoreMap.size > 0) {
      const allBooks = [
        ...allFinishedForSeed.loved,
        ...allFinishedForSeed.liked,
        ...allFinishedForSeed.fine,
      ]
      for (const book of allBooks) {
        const score = seedScoreMap.get(book.bookId)
        if (score === undefined) continue
        // Skip the new book — already updated in step 2
        if (book.userBookId === newUserBookId) continue
        // Freeze invariant: never overwrite a book that already has a score.
        // (Genuine crossing → all existing scores are null, so all get seeded.
        //  Self-heal mid-ranking → only the unscored ones are written.)
        if (book.score !== null) continue
        await db
          .from("user_books")
          .update({ score })
          .eq("id", book.userBookId)
      }
    }

    // ── 4. Insert decisive comparison rows ────────────────────────────────
    if (sessionComparisons.length > 0) {
      const rows = sessionComparisons.map((c) => ({
        user_id: userId,
        book_a_id: c.bookAId,
        book_b_id: c.bookBId,
        winner_id: c.winnerId,
        tier: c.tier,
      }))
      const { error: cmpErr } = await db.from("comparisons").insert(rows)
      // Non-fatal — history is nice-to-have; don't fail the whole ranking
      if (cmpErr) console.error("[ranking-data] comparisons insert:", cmpErr.message)
    }

    return { error: null }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown ranking error"
    console.error("[ranking-data] persistRankingResult:", msg)
    return { error: msg }
  }
}

/**
 * Self-healing seed. Safe to call on every profile load.
 *
 * If the user has crossed SCORE_DISPLAY_THRESHOLD finished books but some of
 * those books still have a null score (e.g. the threshold-crossing persist was
 * interrupted, or the column was backfilled), this computes seed scores for the
 * whole shelf and writes ONLY the missing ones. Books that already have a score
 * are never touched.
 *
 * @returns how many books were seeded (0 = nothing needed).
 */
export async function runSeedIfNeeded(
  userId: string,
): Promise<{ seeded: number; error: string | null }> {
  // ── 1. Fetch all finished + ranked books with tier, rank_position, score ──
  const { data, error } = await db
    .from("user_books")
    .select(`
      id,
      tier,
      rank_position,
      score,
      books ( id, title, cover_url )
    `)
    .eq("user_id", userId)
    .eq("status", "finished")
    .not("rank_position", "is", null)
    .not("tier", "is", null)
    .order("rank_position", { ascending: true })

  if (error) {
    console.error("[ranking-data] runSeedIfNeeded fetch:", error.message)
    return { seeded: 0, error: error.message }
  }

  const rows = data ?? []

  // ── 2. Gate: need >= threshold finished books AND at least one null score ──
  const hasNullScore = rows.some((r: { score: number | null }) => r.score === null)
  if (rows.length < SCORE_DISPLAY_THRESHOLD || !hasNullScore) {
    return { seeded: 0, error: null }
  }

  // ── 3. Group by tier (already sorted by rank_position asc) and seed ───────
  const empty = (): FetchedRankedBook[] => []
  const byTier: Record<Tier, FetchedRankedBook[]> = {
    loved: empty(),
    liked: empty(),
    fine: empty(),
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of rows as any[]) {
    const book: FetchedRankedBook = {
      userBookId: row.id,
      bookId: row.books.id,
      title: row.books.title,
      coverUrl: row.books.cover_url || null,
      rankPosition: row.rank_position,
      score: row.score ?? null,
    }
    if (book.rankPosition !== null && (byTier as Record<string, FetchedRankedBook[]>)[row.tier]) {
      byTier[row.tier as Tier].push(book)
    }
  }

  const scoreMap = seedScores({
    loved: byTier.loved,
    liked: byTier.liked,
    fine: byTier.fine,
  })

  // ── 4. Persist ONLY books whose score is currently null ───────────────────
  const allBooks = [...byTier.loved, ...byTier.liked, ...byTier.fine]
  const toUpdate = allBooks.filter((b) => b.score === null)

  let seeded = 0
  for (const book of toUpdate) {
    const score = scoreMap.get(book.bookId)
    if (score === undefined) continue
    const { error: updErr } = await db
      .from("user_books")
      .update({ score })
      .eq("id", book.userBookId)
    if (updErr) {
      console.error("[ranking-data] runSeedIfNeeded update:", updErr.message)
      return { seeded, error: updErr.message }
    }
    seeded++
  }

  if (seeded > 0) {
    console.log(`[ranking-data] runSeedIfNeeded: seeded ${seeded} book(s) for user ${userId}`)
  }

  return { seeded, error: null }
}
