// ── Follow system — pure Supabase interactions, no React ──────────────────────

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserSummary {
  id: string
  displayName: string
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

export async function followUser(
  followerId: string,
  followedId: string,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("follows")
    .insert({ follower_id: followerId, followed_id: followedId })
  return { error: error?.message ?? null }
}

export async function unfollowUser(
  followerId: string,
  followedId: string,
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("followed_id", followedId)
  return { error: error?.message ?? null }
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
    .select("id, display_name, photo_url")
    .in("id", followedIds)

  const userMap = new Map<string, { display_name: string; photo_url: string | null }>()
  for (const u of (users ?? []) as { id: string; display_name: string; photo_url: string | null }[]) {
    userMap.set(u.id, { display_name: u.display_name, photo_url: u.photo_url ?? null })
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
        photoUrl: u.photo_url,
        currentlyReading: readingMap.get(id) ?? null,
      },
    ]
  })
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
    .select("id, display_name, photo_url")
    .in("id", followerIds)

  if (!users) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userMap = new Map((users as any[]).map((u) => [u.id, u]))

  return followerIds.flatMap((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const u = userMap.get(id) as any
    if (!u) return []
    return [{ id, displayName: u.display_name, photoUrl: u.photo_url ?? null }]
  })
}

/**
 * Searches users by display_name (case-insensitive, partial match).
 * Excludes the current user. Returns up to 20 results, each annotated
 * with whether the current user already follows them.
 */
export async function searchUsers(
  query: string,
  currentUserId: string,
): Promise<SearchResult[]> {
  if (!query.trim()) return []

  const { data: users, error } = await db
    .from("users")
    .select("id, display_name, photo_url")
    .ilike("display_name", `%${query.trim()}%`)
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
    photoUrl: u.photo_url ?? null,
    isFollowing: followingSet.has(u.id),
  }))
}
