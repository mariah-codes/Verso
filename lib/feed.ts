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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/** Most recent N events shown. Infinite scroll is a later pass. */
const FEED_LIMIT = 30

// ── Types ─────────────────────────────────────────────────────────────────────

export type FeedEventType = "ranked" | "want_to_read"

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
  /** ISO timestamp: finished_at (ranked) or added_at (want_to_read). */
  timestamp: string
  /** Ranked only: frozen 0–10 score (null below the 10-book threshold). */
  score: number | null
  /** Ranked only: DB tier ('loved' | 'liked' | 'fine'). */
  tier: string | null
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

const EVENT_SELECT = `
  id, status, tier, rank_position, score, finished_at, added_at,
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

  // 2. Events — two ordered queries (one per type) so each is recency-biased
  //    independently, then merged. Visible only; ranked = finished + ranked.
  const [finishedRes, wantRes] = await Promise.all([
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
      .eq("status", "want_to_read")
      .order("added_at", { ascending: false })
      .limit(FEED_LIMIT * 2),
  ])

  if (finishedRes.error) console.error("[feed] finished:", finishedRes.error.message)
  if (wantRes.error) console.error("[feed] want_to_read:", wantRes.error.message)

  const events: FeedEvent[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toEvent = (r: any, type: FeedEventType, timestamp: string | null): FeedEvent | null => {
    if (!r.books || !r.actor || !timestamp) return null
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
      score: type === "ranked" ? (r.score ?? null) : null,
      tier: type === "ranked" ? (r.tier ?? null) : null,
      reactionCount: 0,
      commentCount: 0,
      viewerHasReacted: false,
      viewerStatus: null,
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const r of (finishedRes.data ?? []) as any[]) {
    const e = toEvent(r, "ranked", r.finished_at)
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
    e.reactionCount = reactionCounts.get(e.id) ?? 0
    e.commentCount = commentCounts.get(e.id) ?? 0
    e.viewerHasReacted = viewerReacted.has(e.id)
    e.viewerStatus = myStatusByBook.get(e.book.id) ?? null
  }

  return top
}
