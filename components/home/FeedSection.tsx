"use client"

import { useState } from "react"
import Image from "next/image"
import { BookOpen, Bookmark, Heart, MessageCircle, Users } from "lucide-react"
import { TIER_LABELS, type Tier } from "@/lib/ranking"
import { saveToWantToRead, removeFromWantToRead, type BookStatus } from "@/lib/books"
import { formatRelativeTime, type FeedEvent } from "@/lib/feed"
import { Avatar } from "@/components/shared/Avatar"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import { Toast, useToast, type ToastPayload } from "@/components/shared/Toast"

/** Inactive (already finished/reading/dnf) save-bookmark fill — a quiet warm
 *  putty neutral, light enough that the eye skips past it (only the terracotta
 *  states should pop). */
const GREY_INACTIVE = "#D8CDBD"

interface FeedSectionProps {
  events: FeedEvent[]
  loading: boolean
  /** Signed-in user — needed to perform the save action. */
  userId: string | null
}

/**
 * "From your circle" — the activity feed below weekly picks on Home.
 *
 * This pass: display + the save action only. Heart/comment counts render but
 * aren't tappable yet, and the card itself is a no-op (the post/comment-thread
 * view it will open is the next pass). Save IS wired: a three-state bookmark.
 */
export function FeedSection({ events, loading, userId }: FeedSectionProps) {
  const [toast, showToast, dismissToast] = useToast()

  return (
    <section className="pt-8">
      {/* Divider between picks and feed */}
      <div className="border-t border-border mx-5" />

      {/* Header — icon + uppercase, matching the app's section-header convention */}
      <div className="px-5 pt-6 mb-4 flex items-center gap-2">
        <Users className="size-4 text-foreground/40" />
        <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/60 font-sans">
          From your circle
        </h2>
      </div>

      {loading ? (
        <div className="px-5 space-y-2.5">
          {[0, 1, 2].map((i) => <FeedItemSkeleton key={i} />)}
        </div>
      ) : events.length > 0 ? (
        <div className="px-5 space-y-2.5">
          {events.map((event) => (
            <FeedItem key={event.id} event={event} userId={userId} showToast={showToast} />
          ))}
        </div>
      ) : (
        <Empty />
      )}

      <Toast payload={toast} onDismiss={dismissToast} />
    </section>
  )
}

// ── Item ────────────────────────────────────────────────────────────────────

function FeedItem({
  event,
  userId,
  showToast,
}: {
  event: FeedEvent
  userId: string | null
  showToast: (p: ToastPayload) => void
}) {
  const { actor, book, type, timestamp, score, tier } = event
  const action = type === "ranked" ? "ranked" : "wants to read"

  // Live status for this book on the viewer's shelf — drives the save icon.
  const [status, setStatus] = useState<BookStatus | null>(event.viewerStatus)
  const [busy, setBusy] = useState(false)

  const isSaved = status === "want_to_read"
  const isLocked = status === "finished" || status === "reading" || status === "dnf"

  async function handleSaveTap() {
    if (busy || !userId) return

    // Locked (finished/reading/dnf): never mutate — just explain.
    if (isLocked) {
      showToast(lockedNote(status, book.title))
      return
    }

    setBusy(true)
    if (isSaved) {
      // Unsave — the delete is also guarded to status='want_to_read' in the lib.
      const { error } = await removeFromWantToRead(book.id, userId)
      setBusy(false)
      if (error) { showToast({ variant: "error", message: "Couldn’t update — try again" }); return }
      setStatus(null)
      showToast({ variant: "note", message: "Removed from Want to read", bookTitle: book.title, icon: Bookmark })
    } else {
      // Add to want-to-read (status === null).
      const { error, alreadyOnShelf } = await saveToWantToRead(book.id, userId)
      setBusy(false)
      if (error) { showToast({ variant: "error", message: "Couldn’t save — try again" }); return }
      if (alreadyOnShelf) {
        // Race: added elsewhere since the feed loaded. Don't claim a save.
        showToast({ variant: "note", message: "Already on your shelf", bookTitle: book.title })
      } else {
        setStatus("want_to_read")
        showToast({ variant: "status", status: "want_to_read", bookTitle: book.title })
      }
    }
  }

  return (
    // Card tap is intentionally a no-op this pass — it will open the post /
    // comment-thread view next. It no longer navigates to book detail.
    <article className="rounded-2xl border border-border bg-[#FCFBF9] px-4 py-3.5">
      {/* Top row (Layout C): avatar → text → cover, vertically centered */}
      <div className="flex items-center gap-3">
        {/* Avatar (left) — leading identity; shared Avatar so it matches profiles */}
        <Avatar
          displayName={actor.displayName}
          photoUrl={actor.photoUrl}
          size={38}
          initialsClassName="text-xs"
        />

        {/* Text column (middle) */}
        <div className="flex-1 min-w-0">
          {/* Line 1 — actor + action · time */}
          <p className="text-sm leading-snug">
            <span className="font-semibold text-foreground">{firstName(actor.displayName)}</span>{" "}
            <span className="text-foreground/55">{action}</span>
            <span className="text-foreground/35"> · {formatRelativeTime(timestamp)}</span>
          </p>

          {/* Line 2 — title (serif) */}
          <p
            className="text-[15px] text-foreground leading-snug mt-1 line-clamp-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {book.title}
          </p>

          {/* Line 3 — ranked only. Score is the headline verdict — co-equal with
              the title (~16px). The tier fallback (no score yet) is a quiet,
              subordinate footnote (~12px, tertiary). */}
          {type === "ranked" && (
            score !== null ? (
              <div className="mt-1.5">
                <ScoreDisplay score={score} className="text-base" />
              </div>
            ) : tier ? (
              <p className="text-xs italic text-foreground/40 mt-1">
                {TIER_LABELS[tier as Tier] ?? tier}
              </p>
            ) : null
          )}
        </div>

        {/* Cover (right) — substantial but still secondary; not a link this pass */}
        <div className="relative w-12 aspect-[2/3] rounded-md overflow-hidden bg-muted shrink-0 shadow-sm">
          {book.coverUrl ? (
            <Image src={book.coverUrl} alt={`Cover of ${book.title}`} fill sizes="48px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <BookOpen className="size-4 text-muted-foreground opacity-40" />
            </div>
          )}
        </div>
      </div>

      {/* Action row — social (heart/comment) left, save right.
          Heart/comment are display-only this pass; save is the wired toggle.
          mt-3.5 / pt-3.5 keep the divider symmetric (14px above and below), and the
          14px below the icons (card py-3.5) matches — even rhythm top to bottom. */}
      <div className="mt-3.5 pt-3.5 border-t border-border/60 flex items-center justify-between">
        <div className="flex items-center gap-5 text-foreground/45">
          <span className="inline-flex items-center gap-1.5">
            <Heart className="size-[18px]" strokeWidth={1.75} />
            {event.reactionCount > 0 && (
              <span className="text-xs tabular-nums">{event.reactionCount}</span>
            )}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <MessageCircle className="size-[18px]" strokeWidth={1.75} />
            {event.commentCount > 0 && (
              <span className="text-xs tabular-nums">{event.commentCount}</span>
            )}
          </span>
        </div>

        <button
          onClick={handleSaveTap}
          disabled={busy}
          aria-label={
            isSaved ? "Remove from want to read"
            : isLocked ? `Already on your shelf (${status})`
            : "Save to want to read"
          }
          className="inline-flex items-center transition-opacity hover:opacity-80"
        >
          {/* Terracotta = live save control (outline = saveable, filled = saved);
              a quiet warm putty fill = inactive for this book. Terracotta-vs-putty
              is what makes the state distinct — the putty should recede. */}
          <Bookmark
            className="size-[18px]"
            strokeWidth={1.75}
            style={{
              color: isLocked ? GREY_INACTIVE : "#9C4A2F",
              fill: isSaved ? "#9C4A2F" : isLocked ? GREY_INACTIVE : "none",
            }}
          />
        </button>
      </div>
    </article>
  )
}

/**
 * Explanatory toast when the save target is locked (already finished/reading/dnf).
 * No icon passed → the "note" variant uses lucide Info, so these informational
 * toasts read as distinct from success toasts (which carry their action icon).
 */
function lockedNote(status: BookStatus | null, title: string): ToastPayload {
  switch (status) {
    case "finished": return { variant: "note", message: "Already finished",        bookTitle: title }
    case "reading":  return { variant: "note", message: "Already reading",          bookTitle: title }
    case "dnf":      return { variant: "note", message: "Already on your DNF list", bookTitle: title }
    default:         return { variant: "note", message: "Already on your shelf",    bookTitle: title }
  }
}

// ── Empty / loading ─────────────────────────────────────────────────────────

function Empty() {
  return (
    <div className="px-5 flex flex-col items-center text-center gap-3 py-10">
      <BookOpen className="size-7 text-foreground/15" strokeWidth={1.5} />
      <p className="text-sm text-foreground/45 max-w-xs leading-relaxed">
        When your friends rank or save books, you’ll see it here.
      </p>
    </div>
  )
}

function FeedItemSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-[#FCFBF9] px-4 py-3.5">
      <div className="flex gap-3">
        <div className="w-11 aspect-[2/3] rounded-md bg-muted animate-pulse shrink-0" />
        <div className="flex-1 space-y-2 pt-0.5">
          <div className="h-3.5 w-2/3 rounded bg-muted animate-pulse" />
          <div className="h-4 w-4/5 rounded bg-muted animate-pulse" />
          <div className="h-3 w-12 rounded bg-muted animate-pulse" />
        </div>
      </div>
      <div className="mt-3.5 pt-3.5 border-t border-border/60 flex items-center justify-between">
        <div className="flex gap-5">
          <div className="h-4 w-8 rounded bg-muted animate-pulse" />
          <div className="h-4 w-8 rounded bg-muted animate-pulse" />
        </div>
        <div className="h-4 w-4 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** First token of a display name ("Jared Duda" → "Jared") — same rule the picks
 *  captions use. Falls back to the whole string. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}
