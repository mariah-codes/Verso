// ── Comments — feed-event / review thread data layer ──────────────────────────
// Comments key on a feed EVENT exactly like hearts (lib/reactions.ts):
//   (user_id = author, event_type, event_subject_user_id = event author,
//    event_subject_book_id = book)
// Finished-book / review cards key as 'ranked', want-to-read cards as
// 'want_to_read'. Because a review IS a 'ranked' event, a review's thread in the
// feed and on book detail are the SAME rows. RLS: read all, insert/delete by author.
//
// private_note is never touched here — comments join the users table only.

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** The event_type a comment keys on — mirrors ReactionEventType. */
export type CommentEventType = "ranked" | "want_to_read"

export interface Comment {
  id: string
  /** Comment author (drives the owner-only delete affordance). */
  userId: string
  displayName: string
  photoUrl: string | null
  text: string
  createdAt: string
}

const COMMENT_SELECT =
  "id, user_id, text, created_at, author:user_id ( display_name, photo_url )" as const

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToComment(r: any): Comment {
  return {
    id: r.id,
    userId: r.user_id,
    displayName: r.author?.display_name ?? "",
    photoUrl: r.author?.photo_url ?? null,
    text: r.text,
    createdAt: r.created_at,
  }
}

/**
 * The thread for one event, oldest first. Explicit columns + a users join only —
 * never selects private_note (or any user_books column).
 */
export async function fetchComments(
  eventType: CommentEventType,
  subjectUserId: string,
  bookId: string,
): Promise<Comment[]> {
  const { data, error } = await db
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("event_type", eventType)
    .eq("event_subject_user_id", subjectUserId)
    .eq("event_subject_book_id", bookId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[comments] fetchComments:", error.message)
    return []
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((data ?? []) as any[]).map(rowToComment)
}

/**
 * Add a comment to an event. Trims, rejects empty, inserts, and returns the
 * inserted row joined with its author so the caller can append it directly.
 */
export async function addComment(params: {
  authorId: string
  eventType: CommentEventType
  subjectUserId: string
  bookId: string
  text: string
}): Promise<{ comment: Comment | null; error: string | null }> {
  const trimmed = params.text.trim()
  if (!trimmed) return { comment: null, error: "Empty comment" }

  const { data, error } = await db
    .from("comments")
    .insert({
      user_id: params.authorId,
      event_type: params.eventType,
      event_subject_user_id: params.subjectUserId,
      event_subject_book_id: params.bookId,
      text: trimmed,
    })
    .select(COMMENT_SELECT)
    .single()

  if (error) return { comment: null, error: error.message }
  return { comment: rowToComment(data), error: null }
}

/** Delete a comment. RLS enforces author-only — no app-side ownership check needed. */
export async function deleteComment(commentId: string): Promise<{ error: string | null }> {
  const { error } = await db.from("comments").delete().eq("id", commentId)
  return { error: error?.message ?? null }
}

/**
 * Comment counts for every 'ranked' event on a book, keyed by the event's
 * subject user. Backs the book-detail review bubbles (own + friends') in one
 * query — no N+1. Mirrors lib/reactions.fetchRankedHearts.
 */
export async function fetchRankedCommentCounts(bookId: string): Promise<Map<string, number>> {
  const { data, error } = await db
    .from("comments")
    .select("event_subject_user_id")
    .eq("event_subject_book_id", bookId)
    .eq("event_type", "ranked")

  const map = new Map<string, number>()
  if (error) {
    console.error("[comments] fetchRankedCommentCounts:", error.message)
    return map
  }
  for (const r of (data ?? []) as { event_subject_user_id: string }[]) {
    map.set(r.event_subject_user_id, (map.get(r.event_subject_user_id) ?? 0) + 1)
  }
  return map
}
