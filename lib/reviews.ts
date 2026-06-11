// ── Reviews — public/private note authoring + friends' review reads ───────────
// A "review" = a FINISHED user_books row with a non-empty public_note (the social
// object). private_note is an owner-only personal annotation and is NEVER selected
// in any query for another user's rows: RLS is row-level and cannot hide the column
// on a row a friend may read, so app-level select discipline is what keeps it secret.

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Authoring (owner-only via the existing user_books UPDATE policy) ───────────

/**
 * Saves the owner's private note. Empty/whitespace clears it (sets NULL).
 * Never touches reviewed_at — that timestamp belongs to the public review alone.
 */
export async function savePrivateNote(
  userBookId: string,
  text: string,
): Promise<{ error: string | null }> {
  const trimmed = text.trim()
  const { error } = await db
    .from("user_books")
    .update({ private_note: trimmed || null })
    .eq("id", userBookId)
  return { error: error?.message ?? null }
}

/**
 * Saves the owner's public review with first-post / edit semantics:
 *   • First post (no existing review): set public_note, stamp reviewed_at once,
 *     leave edited_at null.
 *   • Edit of an existing review: set public_note, KEEP reviewed_at (never
 *     re-bumped), stamp edited_at = now().
 *   • Clear (empty/whitespace): null all three, so a future re-post is a fresh
 *     first-post — this is how a review is deleted (no separate delete control).
 *
 * Whether a review already exists is read from reviewed_at (non-null ⟺ a live
 * review), so we read the row first to decide which timestamp to write.
 */
export async function savePublicNote(
  userBookId: string,
  text: string,
): Promise<{ error: string | null }> {
  const trimmed = text.trim()

  // Read current state to choose first-post vs edit vs clear.
  const { data: row, error: readErr } = await db
    .from("user_books")
    .select("reviewed_at")
    .eq("id", userBookId)
    .single()
  if (readErr) return { error: readErr.message }

  const hasExistingReview = row?.reviewed_at != null
  const now = new Date().toISOString()

  const patch = !trimmed
    ? { public_note: null, reviewed_at: null, edited_at: null }
    : hasExistingReview
      ? { public_note: trimmed, edited_at: now }          // edit — reviewed_at untouched
      : { public_note: trimmed, reviewed_at: now }        // first post — edited_at stays null

  const { error } = await db.from("user_books").update(patch).eq("id", userBookId)
  return { error: error?.message ?? null }
}

// ── Friends' reviews (discovery surface on book detail) ────────────────────────

export interface FriendReview {
  userId: string
  displayName: string
  photoUrl: string | null
  /** DB tier ('loved' | 'liked' | 'fine'). */
  tier: string | null
  /** Frozen 0–10 score; null below the display threshold. */
  score: number | null
  publicNote: string
  /** First-post timestamp — drives the relative time and feed ordering. */
  reviewedAt: string | null
  /** Last-edit timestamp; null if never edited — drives the "edited" marker. */
  editedAt: string | null
}

/**
 * Reviews for `bookId` written by people `userId` follows: finished, visible, with
 * a public_note — newest review first (reviewed_at desc).
 *
 * The SELECT lists EXPLICIT COLUMNS ONLY — private_note is deliberately absent and
 * must never be added here (see the file header). Returns [] when the viewer
 * follows no one or no followed user has reviewed this book.
 */
export async function fetchFriendReviews(
  userId: string,
  bookId: string,
): Promise<FriendReview[]> {
  // 1. Who the viewer follows.
  const { data: follows } = await db
    .from("follows")
    .select("followed_id")
    .eq("follower_id", userId)

  const followedIds = ((follows ?? []) as { followed_id: string }[]).map((f) => f.followed_id)
  if (followedIds.length === 0) return []

  // 2. Their public reviews for this book. private_note is NOT in this list.
  const { data, error } = await db
    .from("user_books")
    .select("user_id, tier, score, public_note, reviewed_at, edited_at, reviewer:user_id ( display_name, photo_url )")
    .eq("book_id", bookId)
    .in("user_id", followedIds)
    .eq("status", "finished")
    .eq("visibility", "visible")
    .not("public_note", "is", null)
    .order("reviewed_at", { ascending: false, nullsFirst: false })

  if (error) {
    console.error("[reviews] fetchFriendReviews:", error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    userId: r.user_id,
    displayName: r.reviewer?.display_name ?? "",
    photoUrl: r.reviewer?.photo_url ?? null,
    tier: r.tier ?? null,
    score: r.score ?? null,
    publicNote: r.public_note,
    reviewedAt: r.reviewed_at ?? null,
    editedAt: r.edited_at ?? null,
  }))
}
