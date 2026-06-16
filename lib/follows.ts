// ── Follow system — pure Supabase interactions, no React ──────────────────────

import { supabase } from "./supabase"
import { invalidateWeeklyPicks } from "./weekly-picks-data"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
}

/** A user the current user follows, enriched with shelf context for the list view. */
export interface FollowingUser extends UserSummary {
  /** Title of the first visible currently-reading book, or null if nothing active. */
  currentlyReading: string | null
}

/** A user returned from search, with live follow state. */
export interface SearchResult extends UserSummary {
  isFollowing: boolean
}

// ── Mutations ─────────────────────────────────────────────────────────────────

/**
 * Result of a follow/unfollow mutation. `isFollowing` is read back from the
 * follows table *after* the write, so callers can set their button from the
 * real DB state rather than trusting an optimistic flip — the optimistic value
 * can drift out of sync (e.g. Follow → Unfollow → Follow), so DB truth wins.
 */
export interface FollowResult {
  isFollowing: boolean
  error: string | null
}

export async function followUser(
  followerId: string,
  followedId: string,
): Promise<FollowResult> {
  // Idempotent: ON CONFLICT DO NOTHING so a re-follow over a leftover row never
  // trips the UNIQUE(follower_id, followed_id) constraint and errors out.
  const { error } = await db
    .from("follows")
    .upsert(
      { follower_id: followerId, followed_id: followedId },
      { onConflict: "follower_id,followed_id", ignoreDuplicates: true },
    )
  // Follow graph changed → drop the acting user's cached picks so the next Home
  // load recomputes with the new friend included. Only on success.
  if (!error) await invalidateWeeklyPicks(followerId)
  // Confirm against the table so the button reflects reality after every tap.
  const confirmed = await isFollowing(followerId, followedId)
  return { isFollowing: confirmed, error: error?.message ?? null }
}

export async function unfollowUser(
  followerId: string,
  followedId: string,
): Promise<FollowResult> {
  const { error } = await db
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followed_id", followedId)
  // Follow graph changed → drop the acting user's cached picks so the unfollowed
  // person's books stop appearing on the next Home load. Only on success.
  if (!error) await invalidateWeeklyPicks(followerId)
  // Confirm against the table so the button reflects reality after every tap.
  const confirmed = await isFollowing(followerId, followedId)
  return { isFollowing: confirmed, error: error?.message ?? null }
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function isFollowing(
  followerId: string,
  followedId: string,
): Promise<boolean> {
  const { data } = await db
    .from("follows")
    .select("id")
    .eq("follower_id", followerId)
    .eq("followed_id", followedId)
    .maybeSingle()
  return !!data
}

/**
 * Returns the profiles of everyone the user follows, newest-follow-first,
 * each enriched with their currently-reading title (visible books only).
 */
export async function getFollowing(userId: string): Promise<FollowingUser[]> {
  // Step 1: get followed user IDs in recency order
  const { data: follows, error: followsError } = await db
    .from("follows")
    .select("followed_id")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })

  if (followsError || !follows || follows.length === 0) return []

  const followedIds = (follows as { followed_id: string }[]).map((f) => f.followed_id)

  // Step 2: fetch profiles for those users
  const { data: users } = await db
    .from("users")
    .select("id, display_name, username, photo_url")
    .in("id", followedIds)

  const userMap = new Map<string, { display_name: string; username: string; photo_url: string | null }>()
  for (const u of (users ?? []) as { id: string; display_name: string; username: string; photo_url: string | null }[]) {
    userMap.set(u.id, { display_name: u.display_name, username: u.username, photo_url: u.photo_url ?? null })
  }

  // Step 3: fetch their currently-reading books (visible only; one title per user is enough)
  const { data: reading } = await db
    .from("user_books")
    .select("user_id, books(title)")
    .in("user_id", followedIds)
    .eq("status", "reading")
    .eq("visibility", "visible")

  const readingMap = new Map<string, string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (reading ?? []) as any[]) {
    if (!readingMap.has(row.user_id) && row.books?.title) {
      readingMap.set(row.user_id, row.books.title)
    }
  }

  // Return in newest-follow-first order, dropping any ids whose profile is missing
  return followedIds.flatMap((id) => {
    const u = userMap.get(id)
    if (!u) return []
    return [
      {
        id,
        displayName: u.display_name,
        username: u.username,
        photoUrl: u.photo_url,
        currentlyReading: readingMap.get(id) ?? null,
      },
    ]
  })
}

/**
 * Returns the currently-reading title for one user (first visible book), or
 * null if they have nothing active. Used to backfill a freshly-followed row
 * after the optimistic prepend — kept separate so getFollowing stays batched.
 */
export async function getReadingTitle(userId: string): Promise<string | null> {
  const { data } = await db
    .from("user_books")
    .select("books(title)")
    .eq("user_id", userId)
    .eq("status", "reading")
    .eq("visibility", "visible")
    .limit(1)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any)?.books?.title ?? null
}

/**
 * Returns the profiles of everyone who follows the user, newest-first.
 */
export async function getFollowers(userId: string): Promise<UserSummary[]> {
  const { data: follows, error } = await db
    .from("follows")
    .select("follower_id")
    .eq("followed_id", userId)
    .order("created_at", { ascending: false })

  if (error || !follows || follows.length === 0) return []

  const followerIds = (follows as { follower_id: string }[]).map((f) => f.follower_id)

  const { data: users } = await db
    .from("users")
    .select("id, display_name, username, photo_url")
    .in("id", followerIds)

  if (!users) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap = new Map((users as any[]).map((u) => [u.id, u]))

  return followerIds.flatMap((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = userMap.get(id) as any
    if (!u) return []
    return [{ id, displayName: u.display_name, username: u.username, photoUrl: u.photo_url ?? null }]
  })
}

/**
 * Searches users by display_name OR username (case-insensitive, partial match).
 * Excludes the current user. Returns up to 20 results, each annotated
 * with whether the current user already follows them.
 */
export async function searchUsers(
  query: string,
  currentUserId: string,
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  // A leading "@" is how people type a handle — strip it so "@maria" matches the
  // stored username "maria". The escaped term guards %, _ and , from breaking the
  // ilike pattern / the PostgREST .or() comma syntax.
  const term = q.replace(/^@+/, "")
  const escaped = term.replace(/[%_,()]/g, "\\$&")

  const { data: users, error } = await db
    .from("users")
    .select("id, display_name, username, photo_url")
    .or(`display_name.ilike.%${escaped}%,username.ilike.%${escaped}%`)
    .neq("id", currentUserId)
    .limit(20)

  if (error || !users || users.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userIds = (users as any[]).map((u) => u.id) as string[]

  // Single query to find which of these users are already followed
  const { data: following } = await db
    .from("follows")
    .select("followed_id")
    .eq("follower_id", currentUserId)
    .in("followed_id", userIds)

  const followingSet = new Set(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((following ?? []) as any[]).map((f) => f.followed_id as string),
  )

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (users as any[]).map((u) => ({
    id: u.id,
    displayName: u.display_name,
    username: u.username,
    photoUrl: u.photo_url ?? null,
    isFollowing: followingSet.has(u.id),
  }))
}
