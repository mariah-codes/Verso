"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Avatar } from "@/components/shared/Avatar"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import { formatRelativeTime } from "@/lib/feed"
import { CommentThread } from "@/components/shared/CommentThread"
import { ReviewStats } from "./ReviewStats"
import type { FriendReview } from "@/lib/reviews"
import type { HeartState } from "@/lib/reactions"

interface FriendReviewsProps {
  reviews: FriendReview[]
  loading: boolean
  /** Heart state per review author (subject user id). Missing ⇒ 0 / not reacted. */
  hearts: Map<string, HeartState>
  /** Toggle the viewer's heart on a given review (keyed by its author's id). */
  onToggleHeart: (subjectUserId: string) => void
  /** Comment count per review author. Missing ⇒ 0. */
  commentCounts: Map<string, number>
  /** Reports a thread's live count up (keyed by review author) so the bubble
   *  badge stays in sync. */
  onCommentCountChange: (subjectUserId: string, count: number) => void
  /** Current user — comment author for any thread opened here. */
  viewerId: string | null
  bookId: string
}

/** Short tier label for the meta line — "Loved it" reads long inline. */
const SHORT_TIER: Record<string, string> = {
  loved: "Loved",
  liked: "Liked",
  fine: "Wasn't for me",
}

/** First token of a display name ("Jared Duda" → "Jared"). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/** Time meta shown inline after the name (feed-style): "20h", or "20h · edited"
 *  when edited since first post. Time is the first-post timestamp (reviewed_at),
 *  so an edit never moves it. The score lives in its own terracotta badge; the
 *  tier is shown there only when there's no score yet (DECISION_LOG 2026-06-08:
 *  rank position is never shown). */
function timeMeta(r: FriendReview): string {
  const parts: string[] = []
  if (r.reviewedAt) parts.push(formatRelativeTime(r.reviewedAt))
  if (r.editedAt) parts.push("edited")
  return parts.join(" · ")
}

/**
 * "Reviews from friends" — the discovery surface, shown on every book page
 * regardless of the viewer's own status. The most recent review is expanded; the
 * rest collapse to their header row and expand in place on tap (client-only).
 */
export function FriendReviews({
  reviews,
  loading,
  hearts,
  onToggleHeart,
  commentCounts,
  onCommentCountChange,
  viewerId,
  bookId,
}: FriendReviewsProps) {
  // `toggled` holds rows whose state differs from their default (row 0 open, the
  // rest closed) — so the newest is open until tapped, and others open on tap.
  const [toggled, setToggled] = useState<Set<string>>(new Set())
  const isOpen = (r: FriendReview, idx: number) =>
    toggled.has(r.userId) ? idx !== 0 : idx === 0

  function toggle(id: string) {
    setToggled((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // Per-review comment-thread expansion (independent of the row expand above).
  const [commentsOpen, setCommentsOpen] = useState<Set<string>>(new Set())
  function toggleComments(id: string) {
    setCommentsOpen((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="w-full max-w-sm pt-5 border-t border-border/50">
      <h3 className="text-[15px] font-medium text-foreground/75 mb-2">Reviews from friends</h3>

      {loading ? (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="size-[26px] rounded-full bg-muted animate-pulse shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-3 w-20 rounded bg-muted animate-pulse" />
                <div className="h-2.5 w-28 rounded bg-muted animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        // Cold-start is the common case at launch — a quiet inline line under the
        // header, not a centered placeholder that dominates the empty screen.
        <p className="text-[13px] italic text-foreground/40">
          No reviews from friends yet
        </p>
      ) : (
        <div>
          {reviews.map((r, idx) => {
            const open = isOpen(r, idx)
            return (
              <div
                key={r.userId}
                className="py-3 first:pt-0 border-t border-[#F0EAE0] first:border-t-0"
              >
                <button
                  onClick={() => toggle(r.userId)}
                  className="w-full flex items-center gap-2.5 text-left"
                >
                  <Avatar
                    displayName={r.displayName}
                    photoUrl={r.photoUrl}
                    size={26}
                    initialsClassName="text-[10px]"
                  />
                  {/* Name + time on one line, like the feed header. */}
                  <p className="flex-1 min-w-0 truncate text-[14px] leading-snug">
                    <span className="font-medium text-foreground">{firstName(r.displayName)}</span>
                    {timeMeta(r) && <span className="text-foreground/40"> · {timeMeta(r)}</span>}
                  </p>
                  {/* Rating badge — terracotta EB Garamond, the app's score
                      treatment. Falls back to the tier (italic, muted) only when
                      there's no score yet, echoing the feed. */}
                  {r.score !== null ? (
                    <ScoreDisplay score={r.score} className="text-base shrink-0" />
                  ) : r.tier && SHORT_TIER[r.tier] ? (
                    <span className="shrink-0 text-[12px] italic text-foreground/40">
                      {SHORT_TIER[r.tier]}
                    </span>
                  ) : null}
                  <ChevronDown
                    className={`size-4 shrink-0 text-foreground/30 transition-transform ${open ? "rotate-180" : ""}`}
                  />
                </button>

                {open && (
                  <div className="mt-2 pl-[34px]">
                    <p className="text-[14px] leading-relaxed text-foreground whitespace-pre-line">
                      {r.publicNote}
                    </p>
                    <div className="mt-2">
                      <ReviewStats
                        hearted={hearts.get(r.userId)?.reacted ?? false}
                        heartCount={hearts.get(r.userId)?.count ?? 0}
                        onToggleHeart={() => onToggleHeart(r.userId)}
                        commentCount={commentCounts.get(r.userId) ?? 0}
                        onToggleComments={() => toggleComments(r.userId)}
                      />
                      {commentsOpen.has(r.userId) && (
                        <div className="mt-4">
                          <CommentThread
                            eventType="ranked"
                            subjectUserId={r.userId}
                            bookId={bookId}
                            viewerId={viewerId}
                            onCountChange={(n) => onCommentCountChange(r.userId, n)}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
