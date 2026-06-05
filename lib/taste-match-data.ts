// ── Taste-match data layer — all Supabase calls for taste-match scoring ───────
// Pairs with the pure logic in lib/taste-match.ts. This file is the SWAP POINT:
// in V2 the fetch below becomes a server RPC so private books inform the match.
// computeTasteMatch stays unchanged either way.

import { supabase } from "./supabase"
import {
  computeTasteMatch,
  type FinishedBook,
  type TasteMatchResult,
} from "./taste-match"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// The columns computeTasteMatch needs. rank_position is the taste signal;
// the frozen `score` column is display-only and deliberately NOT fetched here.
const FINISHED_SELECT = "user_id, book_id, tier, rank_position" as const

/**
 * Fetch one or more users' VISIBLE finished books in a single query.
 *
 * SWAP POINT (V2): replace this client query with a server RPC/edge function
 * that returns full shelves so private books inform the match.
 * computeTasteMatch stays unchanged. See DECISION_LOG.
 *
 * V1 filters visibility='visible' explicitly. RLS already hides OTHER users'
 * private rows, but a user can read their OWN private rows — so filtering here
 * keeps both sides symmetric: the score is identical no matter who views it.
 */
async function fetchVisibleFinished(
  userIds: string[],
): Promise<Map<string, FinishedBook[]>> {
  const byUser = new Map<string, FinishedBook[]>()
  // Seed every requested id so callers always get an entry (empty = no shelf).
  for (const id of userIds) byUser.set(id, [])

  if (userIds.length === 0) return byUser

  const { data, error } = await db
    .from("user_books")
    .select(FINISHED_SELECT)
    .in("user_id", userIds)
    .eq("status", "finished")
    .eq("visibility", "visible")

  if (error) {
    console.error("[taste-match-data] fetchVisibleFinished:", error.message)
    return byUser
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    byUser.get(row.user_id)?.push({
      book_id: row.book_id,
      tier: row.tier ?? null,
      rank_position: row.rank_position ?? null,
    })
  }

  return byUser
}

/** Resolve the signed-in user's id, or null if unauthenticated. */
async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Taste-match between the signed-in user and one other user.
 * Computed on demand — no caching table in V1.
 */
export async function getTasteMatch(
  otherUserId: string,
): Promise<TasteMatchResult> {
  const myId = await currentUserId()
  if (!myId) return { score: null, sharedCount: 0 }

  const shelves = await fetchVisibleFinished([myId, otherUserId])
  return computeTasteMatch(
    shelves.get(myId) ?? [],
    shelves.get(otherUserId) ?? [],
  )
}

/**
 * Batched taste-match for the Friends list. Fetches my finished books once and
 * ALL targets' finished books in a SINGLE query, then computes each in memory.
 * Never issues one query per friend.
 *
 * Returns a Map of otherUserId → TasteMatchResult. Unknown / unauthenticated
 * cases yield { score: null, sharedCount: 0 } for every requested id.
 */
export async function getTasteMatches(
  otherUserIds: string[],
): Promise<Map<string, TasteMatchResult>> {
  const results = new Map<string, TasteMatchResult>()

  const myId = await currentUserId()
  if (!myId || otherUserIds.length === 0) {
    for (const id of otherUserIds) results.set(id, { score: null, sharedCount: 0 })
    return results
  }

  // One query covers me + every target. Dedupe and make sure I'm included.
  const ids = Array.from(new Set([myId, ...otherUserIds]))
  const shelves = await fetchVisibleFinished(ids)
  const myBooks = shelves.get(myId) ?? []

  for (const otherId of otherUserIds) {
    results.set(
      otherId,
      computeTasteMatch(myBooks, shelves.get(otherId) ?? []),
    )
  }

  return results
}
