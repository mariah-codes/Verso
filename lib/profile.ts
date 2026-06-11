// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from "./supabase"
import { compareFinishedOrder } from "./ranking"

// Database types will be fully typed after running:
//   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
  createdAt: string
}

export interface ShelfBook {
  userBookId: string
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  status: string
  tier: string | null
  rankPosition: number | null
  /** Frozen 0–10 score; null until the user crosses the display threshold. */
  score: number | null
  addedAt: string
  finishedAt: string | null
  /** Whether this row carries a public review — drives the shelf review glyph.
   *  public_note is public, so this is safe to surface on a friend's shelf too. */
  hasPublicNote: boolean
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToShelfBook(row: any): ShelfBook {
  return {
    userBookId: row.id,
    bookId: row.books.id,
    title: row.books.title,
    author: row.books.author,
    coverUrl: row.books.cover_url || null,
    status: row.status,
    tier: row.tier ?? null,
    rankPosition: row.rank_position ?? null,
    score: row.score ?? null,
    addedAt: row.added_at,
    finishedAt: row.finished_at ?? null,
    hasPublicNote: !!row.public_note,
  }
}

// The joined select shape used by every shelf query. public_note is fetched as a
// boolean-ish presence flag only (never private_note — that stays owner-private
// and is irrelevant to any shelf card).
const SHELF_SELECT = `
  id,
  status,
  tier,
  rank_position,
  score,
  added_at,
  finished_at,
  public_note,
  books (
    id,
    title,
    author,
    cover_url
  )
` as const

// ── Queries ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToProfile(data: any): UserProfile {
  return {
    id: data.id,
    displayName: data.display_name,
    username: data.username,
    photoUrl: data.photo_url ?? null,
    createdAt: data.created_at,
  }
}

const PROFILE_SELECT = "id, display_name, username, photo_url, created_at" as const

export async function fetchProfile(
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await db
    .from("users")
    .select(PROFILE_SELECT)
    .eq("id", userId)
    .single()

  if (error || !data) return null
  return rowToProfile(data)
}

/**
 * Resolve a profile by username (case-insensitive, via the lower(username)
 * index). Returns null when no user holds that handle — the /[username] route
 * uses this to drive its "user not found" state.
 */
export async function fetchProfileByUsername(
  username: string
): Promise<UserProfile | null> {
  const { data, error } = await db
    .from("users")
    .select(PROFILE_SELECT)
    .ilike("username", username.toLowerCase()) // no wildcards in valid handles
    .maybeSingle()

  if (error || !data) return null
  return rowToProfile(data)
}

/**
 * Fetches user_books rows joined with books for a given status.
 * Finished books: primary sort score desc (highest score first), secondary
 * sort tier asc then rank_position asc so pre-threshold books (null score)
 * still appear in a sensible order at the bottom.
 * Other shelves: added_at desc (newest first).
 */
export async function fetchShelf(
  userId: string,
  status: "reading" | "want_to_read" | "finished" | "dnf",
  limit?: number
): Promise<ShelfBook[]> {
  const isFinished = status === "finished"

  let q = db
    .from("user_books")
    .select(SHELF_SELECT)
    .eq("user_id", userId)
    .eq("status", status)

  if (isFinished) {
    // score desc (nulls last) → tier → rank_position within tier
    q = q
      .order("score",         { ascending: false, nullsFirst: false })
      .order("tier",          { ascending: true  })
      .order("rank_position", { ascending: true,  nullsFirst: false })
  } else {
    q = q.order("added_at", { ascending: false })
  }

  if (limit !== undefined) q = q.limit(limit)

  const { data, error } = await q

  if (error) {
    console.error(`[profile] fetchShelf(${status}):`, error.message)
    return []
  }

  return (data ?? []).map(rowToShelfBook)
}

/**
 * The user's full finished list in canonical overall order
 * (loved → liked → fine, then rank_position asc). Use this anywhere "overall
 * rank order" matters — the Shelf grid and the profile Top 3 preview.
 *
 * NOTE: deliberately NOT fetchShelf("finished"), which sorts by score desc and
 * silently reverses tier order below the 10-book threshold (all scores null).
 * compareFinishedOrder is correct in both the scored and pre-threshold cases.
 */
export async function fetchFinishedOrdered(userId: string): Promise<ShelfBook[]> {
  const { data, error } = await db
    .from("user_books")
    .select(SHELF_SELECT)
    .eq("user_id", userId)
    .eq("status", "finished")

  if (error) {
    console.error("[profile] fetchFinishedOrdered:", error.message)
    return []
  }

  return (data ?? []).map(rowToShelfBook).sort(compareFinishedOrder)
}

/**
 * Fetches every shelf in parallel. Use this on the profile pages (own + friend)
 * so we make one round-trip worth of concurrent queries rather than sequential
 * ones. `finished` comes back in canonical overall order; `wantToRead` newest-
 * first (full list so callers can show both a preview and a total count).
 */
export async function fetchAllShelves(userId: string): Promise<{
  profile: UserProfile | null
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  finished: ShelfBook[]
  dnf: ShelfBook[]
}> {
  const [profile, reading, wantToRead, finished, dnf] = await Promise.all([
    fetchProfile(userId),
    fetchShelf(userId, "reading", 3),
    fetchShelf(userId, "want_to_read"),
    fetchFinishedOrdered(userId),
    fetchShelf(userId, "dnf"),
  ])

  return { profile, reading, wantToRead, finished, dnf }
}

/**
 * Friend-facing shelves — identical to fetchAllShelves but DELIBERATELY omits
 * DNF. DNF is owner-only (private, per the privacy model): a friend must never
 * trigger a `status='dnf'` query, since RLS would otherwise return those rows
 * (they're visibility='visible'). Use this for any profile that isn't the
 * signed-in user's own; use fetchAllShelves only for /me.
 */
export async function fetchFriendShelves(userId: string): Promise<{
  profile: UserProfile | null
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  finished: ShelfBook[]
}> {
  const [profile, reading, wantToRead, finished] = await Promise.all([
    fetchProfile(userId),
    fetchShelf(userId, "reading", 3),
    fetchShelf(userId, "want_to_read"),
    fetchFinishedOrdered(userId),
  ])

  return { profile, reading, wantToRead, finished }
}
