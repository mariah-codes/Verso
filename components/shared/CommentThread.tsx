"use client"

import { useEffect, useState } from "react"
import { Avatar } from "@/components/shared/Avatar"
import { formatRelativeTime } from "@/lib/feed"
import { fetchProfile } from "@/lib/profile"
import {
  fetchComments,
  addComment,
  deleteComment,
  type Comment,
  type CommentEventType,
} from "@/lib/comments"

interface CommentThreadProps {
  /** The event_type the thread keys on ('ranked' for review/finished cards,
   *  'want_to_read' for WTR cards). */
  eventType: CommentEventType
  /** The event's subject user (reviewer/ranker). */
  subjectUserId: string
  bookId: string
  /** Current user — comment author; null disables the composer (read-only). */
  viewerId: string | null
  /** Reports the thread's live comment count up so the bubble badge stays in
   *  sync (called after load and after every add/delete). */
  onCountChange?: (count: number) => void
}

/** First token of a display name ("Jared Duda" → "Jared"). */
function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name
}

/**
 * The one comment thread, rendered identically in the feed and on book detail.
 * Owns its own data (loads on mount), composer, optimistic add, and owner-only
 * delete. All persistence lives in lib/comments — this is interaction + markup.
 *
 * Greys follow the established ramp: author name full foreground, body /70,
 * timestamps + the delete affordance /40.
 */
export function CommentThread({
  eventType,
  subjectUserId,
  bookId,
  viewerId,
  onCountChange,
}: CommentThreadProps) {
  const [comments, setComments] = useState<Comment[] | null>(null)
  // Viewer identity for rendering optimistic comments before the server echoes.
  const [viewer, setViewer] = useState<{ displayName: string; photoUrl: string | null } | null>(null)
  const [text, setText] = useState("")
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load the thread (and the viewer's profile for optimistic rows) on mount.
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchComments(eventType, subjectUserId, bookId),
      viewerId ? fetchProfile(viewerId) : Promise.resolve(null),
    ]).then(([list, profile]) => {
      if (cancelled) return
      setComments(list)
      if (profile) setViewer({ displayName: profile.displayName, photoUrl: profile.photoUrl })
      onCountChange?.(list.length)
    })
    return () => { cancelled = true }
    // onCountChange intentionally omitted — identity-stable per render isn't
    // guaranteed and we only want this to run on key change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, subjectUserId, bookId, viewerId])

  async function handlePost() {
    const trimmed = text.trim()
    if (!trimmed || posting || !viewerId) return
    setError(null)
    setPosting(true)

    // Optimistic temp row using the viewer's identity.
    const tempId = `temp-${Date.now()}`
    const optimistic: Comment = {
      id: tempId,
      userId: viewerId,
      displayName: viewer?.displayName ?? "You",
      photoUrl: viewer?.photoUrl ?? null,
      text: trimmed,
      createdAt: new Date().toISOString(),
    }
    const base = comments ?? []
    setComments([...base, optimistic])
    setText("")
    onCountChange?.(base.length + 1)

    const { comment, error: addErr } = await addComment({
      authorId: viewerId,
      eventType,
      subjectUserId,
      bookId,
      text: trimmed,
    })
    setPosting(false)

    if (addErr || !comment) {
      // Revert the optimistic row.
      setComments((prev) => (prev ?? []).filter((c) => c.id !== tempId))
      onCountChange?.(base.length)
      setText(trimmed) // give the text back so it isn't lost
      setError("Couldn’t post — try again")
      return
    }
    // Swap the temp row for the real one (real id enables delete).
    setComments((prev) => (prev ?? []).map((c) => (c.id === tempId ? comment : c)))
  }

  async function handleDelete(id: string) {
    const prev = comments ?? []
    const next = prev.filter((c) => c.id !== id)
    setComments(next)
    onCountChange?.(next.length)

    const { error: delErr } = await deleteComment(id)
    if (delErr) {
      setComments(prev) // restore
      onCountChange?.(prev.length)
      setError("Couldn’t delete — try again")
    }
  }

  return (
    // Top spacing is owned by each call site (feed divider / review gap).
    <div className="space-y-3">
      {/* List */}
      {comments === null ? (
        <p className="text-[13px] text-foreground/40">Loading…</p>
      ) : comments.length === 0 ? (
        <p className="text-[13px] text-foreground/40">No comments yet.</p>
      ) : (
        // Dense thread (Beli/IG): avatar top-aligned to the first text line;
        // bold name inline with the comment text wrapping underneath; a quiet
        // meta row (time · Delete) below. Comments separated by whitespace.
        <div className="space-y-4">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2.5">
              {/* mt-0.5 pins the avatar to the FIRST line of text (leading-relaxed
                  adds space above the cap), not to the block's vertical center. */}
              <Avatar
                displayName={c.displayName}
                photoUrl={c.photoUrl}
                size={24}
                initialsClassName="text-[9px]"
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                {/* One continuous block: bold name, then the comment inline. */}
                <p className="text-[14px] leading-relaxed text-foreground/70 whitespace-pre-line">
                  <span className="font-semibold text-foreground">{firstName(c.displayName)}</span>{" "}
                  {c.text}
                </p>
                {/* Meta row — quiet, left-aligned, at the /40 tier. */}
                <div className="mt-1 flex items-center gap-3 text-xs text-foreground/40">
                  <span>{formatRelativeTime(c.createdAt)}</span>
                  {viewerId === c.userId && (
                    <button
                      type="button"
                      onClick={() => handleDelete(c.id)}
                      className="hover:text-foreground/60 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      {viewerId && (
        <div className="flex items-center gap-2">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handlePost() } }}
            placeholder="Add a comment…"
            maxLength={1000}
            disabled={posting}
            className="flex-1 min-w-0 rounded-full border border-input bg-muted/50 px-3.5 py-2 text-[14px] text-foreground placeholder:text-foreground/30 outline-none focus:border-ring disabled:opacity-50"
          />
          <button
            type="button"
            onClick={handlePost}
            disabled={!text.trim() || posting}
            className="shrink-0 rounded-full px-4 py-2 text-[13px] font-medium text-white disabled:opacity-40 transition-opacity"
            style={{ backgroundColor: "#9C4A2F" }}
          >
            Post
          </button>
        </div>
      )}

      {error && <p className="text-[11px] text-[#A8321A]">{error}</p>}
    </div>
  )
}
