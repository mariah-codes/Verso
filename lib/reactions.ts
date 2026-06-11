// ── Reactions — heart toggle + batched reads ──────────────────────────────────
// A heart attaches to a finished-book / want-to-read EVENT (the user_books row),
// not to the review note. It keys on the reactions table as:
//   (user_id = reactor, event_type, event_subject_user_id = event author,
//    event_subject_book_id = book, reaction_type = 'heart')
// with a UNIQUE on (user_id, event_type, event_subject_user_id, event_subject_book_id).
//
// Reviewed-flavor feed cards are still event_type='ranked' here, so a review
// hearted in the feed and on book detail is the SAME row. Self-reactions are
// allowed (RLS permits reactor = author). Reads are batched — never N+1 per card.

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** The reaction's event_type — finished-book events (ranked + reviewed cards)
 *  all key as 'ranked'; want-to-read cards key as 'want_to_read'. */
export type ReactionEventType = "ranked" | "want_to_read"

export interface HeartState {
  count: number
  /** Whether the current viewer has a heart row for this event. */
  reacted: boolean
}

/**
 * Add or remove the viewer's heart for one event. `react=true` inserts, `false`
 * deletes the matching row. The caller decides direction from current state and
 * handles optimistic UI + revert.
 */
export async function setHeart(params: {
  reactorId: string
  eventType: ReactionEventType
  subjectUserId: string
  bookId: string
  react: boolean
}): Promise<{ error: string | null }> {
  const { reactorId, eventType, subjectUserId, bookId, react } = params

  if (react) {
    const { error } = await db.from("reactions").insert({
      user_id: reactorId,
      event_type: eventType,
      event_subject_user_id: subjectUserId,
      event_subject_book_id: bookId,
      reaction_type: "heart",
    })
    return { error: error?.message ?? null }
  }

  const { error } = await db
    .from("reactions")
    .delete()
    .eq("user_id", reactorId)
    .eq("event_type", eventType)
    .eq("event_subject_user_id", subjectUserId)
    .eq("event_subject_book_id", bookId)
    .eq("reaction_type", "heart")
  return { error: error?.message ?? null }
}

/**
 * Heart state for every 'ranked' event on `bookId`, keyed by the event's subject
 * user (the reviewer/ranker). One query backs both the own-review and all
 * friend-review hearts on the book detail page. Missing key ⇒ {count:0,reacted:false}.
 */
export async function fetchRankedHearts(
  viewerId: string,
  bookId: string,
): Promise<Map<string, HeartState>> {
  const { data, error } = await db
    .from("reactions")
    .select("event_subject_user_id, user_id")
    .eq("event_subject_book_id", bookId)
    .eq("event_type", "ranked")
    .eq("reaction_type", "heart")

  const map = new Map<string, HeartState>()
  if (error) {
    console.error("[reactions] fetchRankedHearts:", error.message)
    return map
  }

  for (const r of (data ?? []) as { event_subject_user_id: string; user_id: string }[]) {
    const s = map.get(r.event_subject_user_id) ?? { count: 0, reacted: false }
    s.count += 1
    if (r.user_id === viewerId) s.reacted = true
    map.set(r.event_subject_user_id, s)
  }
  return map
}
