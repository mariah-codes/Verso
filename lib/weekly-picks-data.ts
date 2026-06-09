// ── Weekly picks — data layer ─────────────────────────────────────────────────
// Get-or-compute for the current week. Gathers inputs, calls the pure
// computeWeeklyPicks, caches the result in weekly_picks, and returns picks
// enriched with book metadata for the UI. Pairs with the pure lib/weekly-picks.ts.

import { supabase } from "./supabase"
import { getTasteMatches } from "./taste-match-data"
import {
  computeWeeklyPicks,
  type FriendShelf,
  type PickTier,
  type WeeklyPick,
} from "./weekly-picks"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

/** A pick enriched with book metadata + provenance, ready for the card UI. */
export interface EnrichedPick {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  tier: PickTier
  friendName: string
  friendCount: number
}

/** The reasons jsonb shape stored on weekly_picks (keyed by book_id). */
interface ReasonEntry {
  tier: PickTier
  friend_name: string
  friend_count: number
}
type ReasonsMap = Record<string, ReasonEntry>

// ── Week helpers ──────────────────────────────────────────────────────────────

/** The most recent Monday (local time), formatted YYYY-MM-DD to match the
 *  weekly_picks.week_of `date` column. */
function currentWeekOf(now: Date = new Date()): string {
  const daysSinceMonday = (now.getDay() + 6) % 7 // getDay: 0=Sun … 6=Sat
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysSinceMonday)
  const y = monday.getFullYear()
  const m = String(monday.getMonth() + 1).padStart(2, "0")
  const d = String(monday.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Drop the user's cached picks for the CURRENT week so the next Home load
 * recomputes from scratch. Call after a follow-graph change (follow / unfollow):
 * the cached row was computed against the old set of followed users, so an
 * unfollowed person's books would otherwise linger — and a newly-followed
 * person's couldn't appear — until the next Monday.
 *
 * Touches only the acting user's own row (RLS enforces owner-only delete via the
 * "weekly_picks: owner delete" policy). Reuses currentWeekOf so the week boundary
 * matches getWeeklyPicks exactly. A no-op if there's no cached row yet.
 */
export async function invalidateWeeklyPicks(userId: string): Promise<void> {
  const { error } = await db
    .from("weekly_picks")
    .delete()
    .eq("user_id", userId)
    .eq("week_of", currentWeekOf())
  if (error) console.error("[weekly-picks-data] invalidate:", error.message)
}

/**
 * Get this week's picks for a user, computing + caching them on first read of
 * the week. Returns 0–5 enriched picks (empty = cold-start → ghost UI).
 *
 * Cold-start note: when the compute returns NO picks we deliberately do NOT write
 * a row. An empty cached row would freeze the user on the cold-start state for the
 * whole week even after they follow people / add books. Leaving it uncached lets
 * each Home load re-attempt until there's something to show; once there is, we
 * cache it (idempotent via UNIQUE(user_id, week_of)).
 */
export async function getWeeklyPicks(userId: string): Promise<EnrichedPick[]> {
  const weekOf = currentWeekOf()

  // 1. Cache hit?
  const { data: cached } = await db
    .from("weekly_picks")
    .select("book_ids, reasons")
    .eq("user_id", userId)
    .eq("week_of", weekOf)
    .maybeSingle()

  if (cached?.book_ids?.length) {
    return enrichFromCache(cached.book_ids as string[], (cached.reasons ?? {}) as ReasonsMap)
  }

  // 2. Gather compute inputs.
  const followedIds = await fetchFollowedIds(userId)
  if (followedIds.length === 0) return [] // nobody followed → nothing to pick from

  const [tasteMatchMap, friends, ownedBookIds] = await Promise.all([
    getTasteMatches(followedIds),
    fetchFriendShelves(followedIds),
    fetchOwnedBookIds(userId),
  ])

  // getTasteMatches → Map<id, { score, sharedCount }>; the pure fn wants the score.
  const tasteMatch = new Map<string, number | null>()
  for (const id of followedIds) tasteMatch.set(id, tasteMatchMap.get(id)?.score ?? null)

  // 3. Compute.
  const picks = computeWeeklyPicks({ ownedBookIds, friends, tasteMatch })
  if (picks.length === 0) return [] // cold start — do not cache (see note above)

  // 4. Persist (idempotent) then return enriched.
  const { bookIds, reasons } = toRow(picks)
  await db
    .from("weekly_picks")
    .upsert(
      { user_id: userId, week_of: weekOf, book_ids: bookIds, reasons },
      { onConflict: "user_id,week_of", ignoreDuplicates: true },
    )

  const meta = await fetchBookMeta(bookIds)
  return picks
    .map((p) => buildEnriched(p.bookId, { tier: p.tier, friend_name: p.friendName, friend_count: p.friendCount }, meta))
    .filter((p): p is EnrichedPick => p !== null)
}

// ── Internal: shape conversion ────────────────────────────────────────────────

function toRow(picks: WeeklyPick[]): { bookIds: string[]; reasons: ReasonsMap } {
  const reasons: ReasonsMap = {}
  for (const p of picks) {
    reasons[p.bookId] = { tier: p.tier, friend_name: p.friendName, friend_count: p.friendCount }
  }
  return { bookIds: picks.map((p) => p.bookId), reasons }
}

async function enrichFromCache(bookIds: string[], reasons: ReasonsMap): Promise<EnrichedPick[]> {
  const meta = await fetchBookMeta(bookIds)
  // Preserve the stored order; drop any book whose metadata or reason is missing.
  return bookIds
    .map((id) => buildEnriched(id, reasons[id], meta))
    .filter((p): p is EnrichedPick => p !== null)
}

interface BookMeta { title: string; author: string; coverUrl: string | null }

function buildEnriched(
  bookId: string,
  reason: ReasonEntry | undefined,
  meta: Map<string, BookMeta>,
): EnrichedPick | null {
  const m = meta.get(bookId)
  if (!m || !reason) return null
  return {
    bookId,
    title: m.title,
    author: m.author,
    coverUrl: m.coverUrl,
    tier: reason.tier,
    friendName: reason.friend_name,
    friendCount: reason.friend_count,
  }
}

// ── Internal: queries ─────────────────────────────────────────────────────────

async function fetchFollowedIds(userId: string): Promise<string[]> {
  const { data } = await db
    .from("follows")
    .select("followed_id")
    .eq("follower_id", userId)
  return ((data ?? []) as { followed_id: string }[]).map((r) => r.followed_id)
}

/**
 * Followed users' shelves relevant to picks: finished loved/liked books and
 * want-to-reads, VISIBLE only. RLS already hides others' private rows; the
 * explicit filter keeps the rule obvious. DNF and 'fine' are never candidates.
 */
async function fetchFriendShelves(followedIds: string[]): Promise<FriendShelf[]> {
  const [{ data: rows }, { data: users }] = await Promise.all([
    db
      .from("user_books")
      .select("user_id, book_id, status, tier")
      .in("user_id", followedIds)
      .in("status", ["finished", "want_to_read"])
      .eq("visibility", "visible"),
    db.from("users").select("id, display_name").in("id", followedIds),
  ])

  const nameById = new Map<string, string>()
  for (const u of (users ?? []) as { id: string; display_name: string }[]) {
    nameById.set(u.id, u.display_name)
  }

  const shelfById = new Map<string, FriendShelf>()
  const shelfFor = (userId: string): FriendShelf => {
    let s = shelfById.get(userId)
    if (!s) {
      s = { userId, displayName: nameById.get(userId) ?? "A friend", loved: [], liked: [], wantToRead: [] }
      shelfById.set(userId, s)
    }
    return s
  }

  for (const r of (rows ?? []) as { user_id: string; book_id: string; status: string; tier: string | null }[]) {
    const shelf = shelfFor(r.user_id)
    if (r.status === "want_to_read") shelf.wantToRead.push(r.book_id)
    else if (r.status === "finished" && r.tier === "loved") shelf.loved.push(r.book_id)
    else if (r.status === "finished" && r.tier === "liked") shelf.liked.push(r.book_id)
    // finished 'fine' / null tier → not a candidate
  }

  return Array.from(shelfById.values())
}

/** The user's user_books book_ids across ALL statuses — the exclusion set. */
async function fetchOwnedBookIds(userId: string): Promise<string[]> {
  const { data } = await db.from("user_books").select("book_id").eq("user_id", userId)
  return ((data ?? []) as { book_id: string }[]).map((r) => r.book_id)
}

async function fetchBookMeta(bookIds: string[]): Promise<Map<string, BookMeta>> {
  const meta = new Map<string, BookMeta>()
  if (bookIds.length === 0) return meta
  const { data } = await db
    .from("books")
    .select("id, title, author, cover_url")
    .in("id", bookIds)
  for (const b of (data ?? []) as { id: string; title: string; author: string; cover_url: string | null }[]) {
    meta.set(b.id, { title: b.title, author: b.author, coverUrl: b.cover_url || null })
  }
  return meta
}
