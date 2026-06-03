// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { supabase } from "./supabase"

// Database types will be fully typed after running:
//   npx supabase gen types typescript --project-id <id> > lib/database.types.ts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Types ─────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  displayName: string
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
  addedAt: string
  finishedAt: string | null
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
    addedAt: row.added_at,
    finishedAt: row.finished_at ?? null,
  }
}

// The joined select shape used by every shelf query
const SHELF_SELECT = `
  id,
  status,
  tier,
  rank_position,
  added_at,
  finished_at,
  books (
    id,
    title,
    author,
    cover_url
  )
` as const

// ── Queries ───────────────────────────────────────────────────────────────────

export async function fetchProfile(
  userId: string
): Promise<UserProfile | null> {
  const { data, error } = await db
    .from("users")
    .select("id, display_name, photo_url, created_at")
    .eq("id", userId)
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    displayName: data.display_name,
    photoUrl: data.photo_url ?? null,
    createdAt: data.created_at,
  }
}

/**
 * Fetches user_books rows joined with books for a given status.
 * Finished books are ordered by finished_at desc; others by added_at desc.
 */
export async function fetchShelf(
  userId: string,
  status: "reading" | "want_to_read" | "finished" | "dnf",
  limit?: number
): Promise<ShelfBook[]> {
  const orderCol = status === "finished" ? "finished_at" : "added_at"

  let q = db
    .from("user_books")
    .select(SHELF_SELECT)
    .eq("user_id", userId)
    .eq("status", status)
    .order(orderCol, { ascending: false })

  if (limit !== undefined) q = q.limit(limit)

  const { data, error } = await q

  if (error) {
    console.error(`[profile] fetchShelf(${status}):`, error.message)
    return []
  }

  return (data ?? []).map(rowToShelfBook)
}

/**
 * Fetches all four shelves in parallel. Use this on the /me page so we make
 * one round-trip worth of concurrent queries rather than four sequential ones.
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
    fetchShelf(userId, "want_to_read", 5),
    fetchShelf(userId, "finished"),
    fetchShelf(userId, "dnf"),
  ])

  return { profile, reading, wantToRead, finished, dnf }
}
