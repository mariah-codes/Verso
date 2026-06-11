"use client"

import { Heart, MessageCircle } from "lucide-react"

interface ReviewStatsProps {
  /** Whether the current viewer has hearted this event. */
  hearted: boolean
  /** Total heart count for the event. */
  heartCount: number
  /** Toggle the viewer's heart. */
  onToggleHeart: () => void
  /** Total comment count for the event. */
  commentCount: number
  /** Expand/collapse the comment thread for this event. */
  onToggleComments: () => void
}

/**
 * Heart + comment-bubble row for a review. Both are wired now (C2): the heart
 * toggles (filled terracotta when reacted), the comment bubble toggles the
 * thread. A 0 count renders no number, matching the feed.
 *
 * Render-only: all state + the toggles are owned by the parent (page/feed),
 * persistence lives in lib/reactions + lib/comments.
 */
export function ReviewStats({
  hearted,
  heartCount,
  onToggleHeart,
  commentCount,
  onToggleComments,
}: ReviewStatsProps) {
  return (
    <div className="flex items-center gap-5 text-foreground/40">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleHeart() }}
        aria-label={hearted ? "Remove heart" : "Heart"}
        aria-pressed={hearted}
        className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
      >
        <Heart
          className="size-[18px]"
          strokeWidth={1.75}
          style={{
            color: hearted ? "#9C4A2F" : undefined,
            fill: hearted ? "#9C4A2F" : "none",
          }}
        />
        {heartCount > 0 && <span className="text-xs tabular-nums">{heartCount}</span>}
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleComments() }}
        aria-label="Comments"
        className="inline-flex items-center gap-1.5 transition-opacity hover:opacity-80"
      >
        <MessageCircle className="size-[18px]" strokeWidth={1.75} />
        {commentCount > 0 && <span className="text-xs tabular-nums">{commentCount}</span>}
      </button>
    </div>
  )
}
