"use client"

import { useState } from "react"
import { Eye, Lock, Pencil } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatRelativeTime } from "@/lib/feed"
import { CommentThread } from "@/components/shared/CommentThread"
import { ClampText } from "@/components/shared/ClampText"
import { ReviewStats } from "./ReviewStats"
import type { NoteKind } from "./NoteEditorSheet"

interface OwnReviewProps {
  publicNote: string | null
  privateNote: string | null
  /** First-post timestamp of the public review — drives its relative time, the
   *  same timestamp the feed shows (reviewed_at, never re-bumped on edit). */
  publicReviewedAt: string | null
  /** Last-edit timestamp of the public review; null if never edited. Drives the
   *  quiet "edited" marker — no date shown on your own review. */
  publicEditedAt: string | null
  /** Heart state for your own finished-book event (you can heart your own). */
  hearted: boolean
  heartCount: number
  onToggleHeart: () => void
  /** Comment state for your own 'ranked' event — same thread as your feed card. */
  commentCount: number
  /** Current user id (= this review's subject; you can comment on your own). */
  viewerId: string
  bookId: string
  /** Reports the thread's live count up so the page's bubble badge stays in sync. */
  onCommentCountChange: (count: number) => void
  /** Opens the editor sheet for the tapped zone. */
  onEdit: (kind: NoteKind) => void
}

/**
 * The owner's review block on book detail, shown only when MY row is finished.
 * Two zones, top to bottom:
 *   • PUBLIC — sits on the cream, no card; the social review friends will see.
 *   • PRIVATE — a filled putty block; a personal annotation, never social.
 * Empty and filled states share the same geometry (placeholder ↔ content, hint ↔
 * pencil) so tapping in/out never shifts layout.
 */
export function OwnReview({
  publicNote,
  privateNote,
  publicReviewedAt,
  publicEditedAt,
  hearted,
  heartCount,
  onToggleHeart,
  commentCount,
  viewerId,
  bookId,
  onCommentCountChange,
  onEdit,
}: OwnReviewProps) {
  const hasPublic = !!publicNote
  const hasPrivate = !!privateNote
  const [commentsOpen, setCommentsOpen] = useState(false)

  // Meta line for your own review: relative time (first-post), then "edited" if
  // it's been edited since. Matches the feed's timestamp for the same review.
  const publicMeta = hasPublic
    ? [
        publicReviewedAt ? formatRelativeTime(publicReviewedAt) : null,
        publicEditedAt ? "edited" : null,
      ].filter(Boolean).join(" · ")
    : ""

  return (
    <div className="w-full max-w-sm pt-5 border-t border-border/50 space-y-5">
      {/* ── Public review — on the cream, no card/border/fill ───────────────── */}
      <div>
        {hasPublic ? (
          <>
            {/* The label row (with pencil) is the edit affordance; the body is a
                separate read-display so tapping/expanding it never edits. */}
            <button onClick={() => onEdit("public")} className="w-full text-left block">
              <ReviewLabelRow
                Icon={Eye}
                iconStyle={{ color: "#9C4A2F" }}
                label="Your review"
                meta={publicMeta || undefined}
                filled
                hint="Visible to friends"
              />
            </button>
            <ClampText
              text={publicNote!}
              className="mt-2 text-[14px] leading-relaxed text-foreground"
              fadeColor="var(--background)"
            />
            <div className="mt-2">
              <ReviewStats
                hearted={hearted}
                heartCount={heartCount}
                onToggleHeart={onToggleHeart}
                commentCount={commentCount}
                onToggleComments={() => setCommentsOpen((o) => !o)}
              />
              {commentsOpen && (
                <div className="mt-4">
                  <CommentThread
                    eventType="ranked"
                    subjectUserId={viewerId}
                    bookId={bookId}
                    viewerId={viewerId}
                    onCountChange={onCommentCountChange}
                  />
                </div>
              )}
            </div>
          </>
        ) : (
          // Empty: the whole zone invites a tap to add.
          <button onClick={() => onEdit("public")} className="w-full text-left block">
            <ReviewLabelRow
              Icon={Eye}
              iconStyle={{ color: "#9C4A2F" }}
              label="Review"
              filled={false}
              hint="Visible to friends"
            />
            <p className="mt-2 text-[14px] italic text-foreground/40">
              Add a few words for friends…
            </p>
          </button>
        )}
      </div>

      {/* ── Private thoughts — always a filled putty block, never social ────── */}
      <div className="rounded-xl px-[13px] py-[11px]" style={{ backgroundColor: "#ECE4D8" }}>
        {hasPrivate ? (
          <>
            <button onClick={() => onEdit("private")} className="w-full text-left block">
              <ReviewLabelRow
                Icon={Lock}
                iconClassName="text-foreground/40"
                label="Private thoughts"
                filled
                hint="Only you"
              />
            </button>
            <ClampText
              text={privateNote!}
              className="mt-2 text-[14px] leading-relaxed text-foreground"
              fadeColor="#ECE4D8"
            />
          </>
        ) : (
          <button onClick={() => onEdit("private")} className="w-full text-left block">
            <ReviewLabelRow
              Icon={Lock}
              iconClassName="text-foreground/40"
              label="Private thoughts"
              filled={false}
              hint="Only you"
            />
            <p className="mt-2 text-[14px] italic text-foreground/40">Just for you…</p>
          </button>
        )}
      </div>
    </div>
  )
}

// ── Shared label row ──────────────────────────────────────────────────────────

/**
 * The icon + label + right-side hint/pencil row, shared by BOTH zones so their
 * sizing can never diverge: label 13px/medium, icon 14px, hint 11px — all sized
 * explicitly here, so a wrapper's text-size class can't cascade into it.
 */
function ReviewLabelRow({
  Icon,
  iconClassName,
  iconStyle,
  label,
  meta,
  filled,
  hint,
}: {
  Icon: React.ElementType
  iconClassName?: string
  iconStyle?: React.CSSProperties
  label: string
  /** Optional quiet marker after the label (e.g. "edited"), 11px muted. */
  meta?: string
  filled: boolean
  hint: string
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-1.5">
        <Icon className={cn("size-4 shrink-0", iconClassName)} style={iconStyle} />
        <span className="text-[15px] font-medium leading-none text-foreground/70">
          {label}
        </span>
        {meta && (
          // 12px /40 — same size/color as the friend-review meta line. The "· "
          // plus the row's gap-1.5 is enough separation; no extra margin.
          <span className="text-[12px] leading-none text-foreground/40">· {meta}</span>
        )}
      </span>
      {filled ? (
        <Pencil className="size-4 text-foreground/40"  strokeWidth={1.75} />
      ) : (
        <span className="text-[11px] leading-none text-foreground/40">{hint}</span>
      )}
    </div>
  )
}
