// ── Feed ("From your circle") — data layer ────────────────────────────────────
// There is NO events table — the feed is DERIVED from followed users' user_books.
// Two event types (top-10-change was cut, see DECISION_LOG 2026-06-08):
//   • ranked        — status='finished' with a rank_position, ts = finished_at
//   • want_to_read  — status='want_to_read',                  ts = added_at
// Only visibility='visible' rows (DNF is already private at RLS, but we scope
// explicitly anyway). Reactions/comments are keyed by the synthetic event
// identity (event_type, event_subject_user_id, event_subject_book_id) — counted
// in batched follow-up queries since they don't FK to user_books.

import { supabase } from "./supabase"
import type { BookStatus } from "./books"
import type { ReactionEventType } from "./reactions"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** Most recent N events shown. Infinite scroll is a later pass. */
const FEED_LIMIT = 30

// ── Types ─────────────────────────────────────────────────────────────────────

// "reviewed" is a finished+ranked row that ALSO has a public_note — it upgrades
// the ranked event in place (same row, not a second event), sorts by reviewed_at,
// and renders the review card. "ranked" is the same row without a public_note.
export type FeedEventType = "ranked" | "want_to_read" | "reviewed"

export interface FeedActor {
  id: string
  displayName: string
  username: string
  photoUrl: string | null
}

export interface FeedBook {
  id: string
  title: string
  author: string
  coverUrl: string | null
}

export interface FeedEvent {
  /** Synthetic id = `${type}:${actorId}:${bookId}` — matches the reactions/
   *  comments event-identity tuple, so it doubles as the count lookup key. */
  id: string
  type: FeedEventType
  actor: FeedActor
  book: FeedBook
  /** ISO timestamp the event sorts/displays by: reviewed_at (reviewed),
   *  finished_at (ranked), or added_at (want_to_read). */
  timestamp: string
  /** Ranked/reviewed: frozen 0–10 score (null below the 10-book threshold). */
  score: number | null
  /** Ranked/reviewed: DB tier ('loved' | 'liked' | 'fine'). */
  tier: string | null
  /** Reviewed only: the public review text rendered inline on the card. */
  publicNote: string | null
  /** The event_type a heart keys on: finished-book events (ranked + reviewed)
   *  both use 'ranked'; want-to-read uses 'want_to_read'. Distinct from `type`,
   *  which carries the 'reviewed' display flavor. */
  reactionEventType: ReactionEventType
  reactionCount: number
  commentCount: number
  /** Whether the signed-in user has reacted — for wiring interactivity later. */
  viewerHasReacted: boolean
  /** The signed-in user's own status for this book (null if not on their shelf) —
   *  drives the feed save icon's three states (outline / filled / dimmed). */
  viewerStatus: BookStatus | null
}

// ── Relative time ─────────────────────────────────────────────────────────────

/** Compact relative time: "now", "5m", "2h", "1d", "3w", "2mo", "1y". Pure;
 *  `now` is injectable for testing. */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const diffSec = Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 1000))
  if (diffSec < 60) return "now"
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d`
  const wk = Math.floor(day / 7)
  if (wk < 5) return `${wk}w`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo}mo`
  return `${Math.floor(day / 365)}y`
}

// ── Query ─────────────────────────────────────────────────────────────────────

// public_note + reviewed_at drive the review upgrade; private_note is NEVER
// selected here (RLS is row-level; app-level discipline keeps it secret).
const EVENT_SELECT = `
  id, status, tier, rank_position, score, finished_at, added_at,
  public_note, reviewed_at,
  books ( id, title, author, cover_url ),
  actor:user_id ( id, display_name, username, photo_url )
` as const

/**
 * Derive the current user's feed: recent ranked + want-to-read events from the
 * people they follow, newest first, with reaction/comment counts. Returns [] when
 * they follow no one or no followed user has visible activity yet.
 */
export async function getFeed(userId: string): Promise<FeedEvent[]> {
  // 1. Who they follow.
  const { data: follows } = await db
    .from("follows")
    .select("followed_id")
    .eq("follower_id", userId)

  const followedIds = ((follows ?? []) as { followed_id: string }[]).map((f) => f.followed_id)
  if (followedIds.length === 0) return []

  // 2. Events — ordered queries (recency-biased per stream) then merged. Visible
  //    only. The finished side runs TWICE: once by finished_at (the ranked
  //    stream) and once by reviewed_at restricted to reviewed rows — the latter
  //    catches reviews posted long after the book was finished, which the
  //    finished_at ordering would push past the limit window. The two finished
  //    streams overlap on reviewed-recently-finished rows, so they're deduped by
  //    user_books id below; each row becomes ONE event (a review if it has a
  //    public_note, else a plain ranked card — never both).
  const [rankedRes, reviewRes, wantRes] = await Promise.all([
    db.from("user_books").select(EVENT_SELECT)
      .in("user_id", followedIds)
      .eq("visibility", "visible")
      .eq("status", "finished")
      .not("rank_position", "is", null)
      .order("finished_at", { ascending: false })
      .limit(FEED_LIMIT * 2),
    db.from("user_books").select(EVENT_SELECT)
      .in("user_id", followedIds)
      .eq("visibility", "visible")
      .eq("status", "finished")
      .not("rank_position", "is", null)
      .not("public_note", "is", null)
      .order("reviewed_at", { ascending: false, nullsFirst: false })
      .limit(FEED_LIMIT * 2),
    db.from("user_books").select(EVENT_SELECT)
      .in("user_id", followedIds)
      .eq("visibility", "visible")
      .eq("status", "want_to_read")
      .order("added_at", { ascending: false })
      .limit(FEED_LIMIT * 2),
  ])

  if (rankedRes.error) console.error("[feed] ranked:", rankedRes.error.message)
  if (reviewRes.error) console.error("[feed] reviewed:", reviewRes.error.message)
  if (wantRes.error) console.error("[feed] want_to_read:", wantRes.error.message)

  const events: FeedEvent[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toEvent = (r: any, type: FeedEventType, timestamp: string | null): FeedEvent | null => {
    if (!r.books || !r.actor || !timestamp) return null
    const isFinished = type === "ranked" || type === "reviewed"
    return {
      id: `${type}:${r.actor.id}:${r.books.id}`,
      type,
      timestamp,
      actor: {
        id: r.actor.id,
        displayName: r.actor.display_name,
        username: r.actor.username,
        photoUrl: r.actor.photo_url ?? null,
      },
      book: {
        id: r.books.id,
        title: r.books.title,
        author: r.books.author,
        coverUrl: r.books.cover_url || null,
      },
      score: isFinished ? (r.score ?? null) : null,
      tier: isFinished ? (r.tier ?? null) : null,
      publicNote: type === "reviewed" ? (r.public_note ?? null) : null,
      reactionEventType: type === "want_to_read" ? "want_to_read" : "ranked",
      reactionCount: 0,
      commentCount: 0,
      viewerHasReacted: false,
      viewerStatus: null,
    }
  }

  // Merge & dedup the two finished streams by user_books id. A row with a
  // public_note becomes a review event sorted by reviewed_at (first-post); a row
  // without one stays a ranked event sorted by finished_at. A later edit only
  // touches edited_at, so reviewed_at — and thus feed position — never moves.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const finishedRows = new Map<string, any>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of [...(rankedRes.data ?? []), ...(reviewRes.data ?? [])] as any[]) {
    finishedRows.set(r.id, r)
  }
  for (const r of finishedRows.values()) {
    const isReview = !!r.public_note
    const e = isReview
      ? toEvent(r, "reviewed", r.reviewed_at ?? r.finished_at)
      : toEvent(r, "ranked", r.finished_at)
    if (e) events.push(e)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (wantRes.data ?? []) as any[]) {
    const e = toEvent(r, "want_to_read", r.added_at)
    if (e) events.push(e)
  }

  events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const top = events.slice(0, FEED_LIMIT)
  if (top.length === 0) return []

  // 3. Reaction + comment counts (batched, by synthetic event identity).
  const bookIds = [...new Set(top.map((e) => e.book.id))]
  const actorIds = [...new Set(top.map((e) => e.actor.id))]

  const [reactRes, commentRes, mineRes] = await Promise.all([
    db.from("reactions")
      .select("event_type, event_subject_user_id, event_subject_book_id, user_id")
      .in("event_subject_book_id", bookIds)
      .in("event_subject_user_id", actorIds),
    db.from("comments")
      .select("event_type, event_subject_user_id, event_subject_book_id")
      .in("event_subject_book_id", bookIds)
      .in("event_subject_user_id", actorIds),
    // The viewer's own rows among the feed's books — status drives the save icon.
    db.from("user_books")
      .select("book_id, status")
      .eq("user_id", userId)
      .in("book_id", bookIds),
  ])

  const myStatusByBook = new Map<string, BookStatus>()
  for (const r of (mineRes.data ?? []) as { book_id: string; status: BookStatus }[]) {
    myStatusByBook.set(r.book_id, r.status)
  }

  const eventKey = (t: string, u: string, b: string) => `${t}:${u}:${b}`

  const reactionCounts = new Map<string, number>()
  const viewerReacted = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (reactRes.data ?? []) as any[]) {
    const key = eventKey(row.event_type, row.event_subject_user_id, row.event_subject_book_id)
    reactionCounts.set(key, (reactionCounts.get(key) ?? 0) + 1)
    if (row.user_id === userId) viewerReacted.add(key)
  }

  const commentCounts = new Map<string, number>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (commentRes.data ?? []) as any[]) {
    const key = eventKey(row.event_type, row.event_subject_user_id, row.event_subject_book_id)
    commentCounts.set(key, (commentCounts.get(key) ?? 0) + 1)
  }

  for (const e of top) {
    // Hearts/comments key on the reaction event_type ('ranked' for reviewed
    // cards too), NOT the display id (which carries the 'reviewed' flavor).
    const rkey = eventKey(e.reactionEventType, e.actor.id, e.book.id)
    e.reactionCount = reactionCounts.get(rkey) ?? 0
    e.commentCount = commentCounts.get(rkey) ?? 0
    e.viewerHasReacted = viewerReacted.has(rkey)
    e.viewerStatus = myStatusByBook.get(e.book.id) ?? null
  }

  return top
}
