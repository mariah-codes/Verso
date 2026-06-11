"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { ChevronLeft, CheckCheck, BookOpen, Bookmark, BookX, CircleX, Eye, Lock } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { RankingFlow, type NewBookInfo } from "@/components/ranking/RankingFlow"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import {
  type BookStatus,
  changeBookStatus,
  clearRankingForRerank,
  removeFromShelf,
  restoreRanking,
  markAsFinished,
  saveBookGenre,
} from "@/lib/books"
import { TIER_LABELS } from "@/lib/ranking"
import { GenrePicker } from "@/components/book/GenrePicker"
import { StopReadingSheet } from "@/components/book/StopReadingSheet"
import { OwnReview } from "@/components/book/OwnReview"
import { FriendReviews } from "@/components/book/FriendReviews"
import { NoteEditorSheet, type NoteKind } from "@/components/book/NoteEditorSheet"
import { savePublicNote, savePrivateNote, fetchFriendReviews, type FriendReview } from "@/lib/reviews"
import { fetchRankedHearts, setHeart, type HeartState } from "@/lib/reactions"
import { fetchRankedCommentCounts } from "@/lib/comments"
import { Toast, useToast } from "@/components/shared/Toast"

// ── Types ─────────────────────────────────────────────────────────────────────

interface BookData {
  id: string
  title: string
  author: string
  coverUrl: string | null
  publishedYear: number | null
}

interface UserBookData {
  userBookId: string
  status: BookStatus
  tier: string | null
  score: number | null
  rankPosition: number | null
  genre: string | null
  publicNote: string | null
  privateNote: string | null
  /** First-post timestamp of the public review (never re-bumped on edit) —
   *  drives the review's relative time, agreeing with the feed. */
  publicReviewedAt: string | null
  publicEditedAt: string | null
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHELF_OPTIONS: { status: BookStatus; label: string; Icon: React.ElementType }[] = [
  { status: "want_to_read", label: "Want to read",       Icon: Bookmark   },
  { status: "reading",      label: "Currently reading", Icon: BookOpen   },
  { status: "finished",     label: "Finished",           Icon: CheckCheck },
] // order matches BookActionMenu: Want to read → Currently reading → Finished

// The status switcher (for books already on the shelf) offers DNF as a direct
// state, beneath the three main statuses. DNF is intentionally absent from
// SHELF_OPTIONS so it never appears in the "Add to shelf" list for a book that
// isn't on the shelf yet (nor in the Search/Add menu).
const STATUS_DROPDOWN_OPTIONS: { status: BookStatus; label: string; Icon: React.ElementType }[] = [
  ...SHELF_OPTIONS,
  { status: "dnf", label: "Did not finish", Icon: BookX },
]

/** Quick lookup — icon for the closed trigger button. */
const STATUS_ICON: Record<BookStatus, React.ElementType> = {
  want_to_read: Bookmark,
  reading:      BookOpen,
  finished:     CheckCheck,
  dnf:          BookX, // crossed-book = the one DNF glyph, used everywhere DNF appears
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Page ──────────────────────────────────────────────────────────────────────

export default function BookPage() {
  const { id }  = useParams<{ id: string }>()
  const router  = useRouter()

  const [book, setBook]         = useState<BookData | null>(null)
  const [userBook, setUserBook] = useState<UserBookData | null>(null)
  const [userId, setUserId]     = useState<string | null>(null)
  const [loading, setLoading]   = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Status switcher
  const [statusOpen, setStatusOpen]     = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  // Re-rank / ranking flow
  const [rankingBook, setRankingBook]   = useState<NewBookInfo | null>(null)
  const [reranking, setReranking]       = useState(false)
  // Tracks the status before RankingFlow opened so we can revert on cancel
  const prevStatusRef = useRef<BookStatus | "not_in_library" | "reranking" | null>(null)
  const rankingDoneRef = useRef(false)
  // Snapshot of ranking data captured before a re-rank so we can restore on cancel
  const rerankSnapshotRef = useRef<{ tier: string; rankPosition: number; score: number | null } | null>(null)

  // Remove confirm
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [removing, setRemoving]           = useState(false)

  // Stop reading → "Save for later or DNF?" prompt
  const [stopOpen, setStopOpen] = useState(false)
  const [stopping, setStopping] = useState(false)

  // Toast
  const [toast, showToast, dismissToast] = useToast()

  // Genre edit
  const [genreEditing, setGenreEditing] = useState(false)
  const [savingGenre, setSavingGenre]   = useState(false)

  // Reviews — own note editor + friends' reviews (discovery surface)
  const [editorKind, setEditorKind]       = useState<NoteKind | null>(null)
  const [savingNote, setSavingNote]       = useState(false)
  const [friendReviews, setFriendReviews] = useState<FriendReview[]>([])
  const [reviewsLoading, setReviewsLoading] = useState(true)
  // Heart state for this book's 'ranked' events, keyed by event-author id (mine
  // + each friend reviewer's). One batched read backs every heart on the page.
  const [hearts, setHearts] = useState<Map<string, HeartState>>(new Map())
  // Comment counts for this book's 'ranked' events, keyed by event-author id —
  // backs the review bubbles before a thread is expanded.
  const [commentCounts, setCommentCounts] = useState<Map<string, number>>(new Map())

  // ── Data loading ────────────────────────────────────────────────────────────

  const refresh = useCallback(async (uid: string) => {
    const { data: ub } = await db
      .from("user_books")
      .select("id, status, tier, score, rank_position, genre, public_note, private_note, reviewed_at, edited_at")
      .eq("book_id", id)
      .eq("user_id", uid)
      .maybeSingle()

    setUserBook(ub ? {
      userBookId:   ub.id,
      status:       ub.status,
      tier:         ub.tier ?? null,
      score:        ub.score ?? null,
      rankPosition: ub.rank_position ?? null,
      genre:        ub.genre ?? null,
      publicNote:   ub.public_note ?? null,
      publicReviewedAt: ub.reviewed_at ?? null,
      privateNote:  ub.private_note ?? null,
      publicEditedAt: ub.edited_at ?? null,
    } : null)
  }, [id])

  useEffect(() => {
    async function load() {
      const [{ data: { user } }, bookRes] = await Promise.all([
        supabase.auth.getUser(),
        db.from("books")
          .select("id, title, author, cover_url, published_year")
          .eq("id", id)
          .single(),
      ])

      if (bookRes.error || !bookRes.data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const b = bookRes.data
      setBook({ id: b.id, title: b.title, author: b.author,
                coverUrl: b.cover_url || null, publishedYear: b.published_year ?? null })

      if (user) {
        setUserId(user.id)
        await refresh(user.id)
        // Friends' reviews — independent of my own status; load in the background
        // so the page paints without waiting on it.
        fetchFriendReviews(user.id, id)
          .then(setFriendReviews)
          .finally(() => setReviewsLoading(false))
        // Hearts for every 'ranked' event on this book (mine + friends').
        fetchRankedHearts(user.id, id).then(setHearts)
        // Comment counts for every 'ranked' event on this book.
        fetchRankedCommentCounts(id).then(setCommentCounts)
      } else {
        setReviewsLoading(false)
      }

      setLoading(false)
    }
    load()
  }, [id, refresh])

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleStatusPick(newStatus: BookStatus) {
    if (!userBook || !userId || changingStatus) return
    if (newStatus === userBook.status) { setStatusOpen(false); return }

    setChangingStatus(true)
    setStatusOpen(false)

    if (newStatus === "finished") {
      // Mark finished then open ranking flow; remember prior status to revert on cancel
      prevStatusRef.current = userBook.status
      rankingDoneRef.current = false
      await markAsFinished(userBook.userBookId)
      await refresh(userId)
      setRankingBook({
        bookId:     book!.id,
        userBookId: userBook.userBookId,
        title:      book!.title,
        coverUrl:   book!.coverUrl,
      })
    } else {
      // Any non-finished target — including DNF — writes through changeBookStatus,
      // so the dropdown's DNF lands in the exact same row state as the stop-reading
      // sheet (status='dnf'; tier/rank/score/finished_at cleared and the rank gap
      // closed when leaving 'finished'). It never opens the ranking flow.
      const { error } = await changeBookStatus(
        userBook.userBookId, newStatus, userBook.status,
        userId, userBook.tier, userBook.rankPosition,
      )
      await refresh(userId)
      if (error) {
        showToast({ variant: "error", message: "Couldn’t update — try again" })
      } else if (newStatus === "dnf") {
        showToast({ variant: "dnf", bookTitle: book?.title })
      } else {
        // want_to_read / reading — confirm with the matching status toast so no
        // dropdown status change is silent. (Finished doesn't reach here: it opens
        // the ranking flow, which is its own feedback.)
        showToast({ variant: "status", status: newStatus, bookTitle: book?.title })
      }
    }

    setChangingStatus(false)
  }

  async function handleAddToShelf(status: BookStatus) {
    if (!userId || !book) return
    setChangingStatus(true)

    // Insert user_books row directly (book already in DB)
    const { data: ub, error } = await db
      .from("user_books")
      .insert({
        user_id:    userId,
        book_id:    book.id,
        status,
        // DNF is private at the data level; everything else is visible. DNF also
        // presupposes the book was started.
        visibility:  status === "dnf" ? "private" : "visible",
        was_started: status === "reading" || status === "finished" || status === "dnf",
        finished_at: status === "finished" ? new Date().toISOString() : null,
      })
      .select("id")
      .single()

    if (error || !ub) {
      showToast({ variant: "error", message: "Couldn’t add — try again" })
    } else {
      await refresh(userId)
      if (status === "finished") {
        // Finished opens the ranking flow — that's its own feedback, no toast.
        prevStatusRef.current = "not_in_library"
        rankingDoneRef.current = false
        setRankingBook({ bookId: book.id, userBookId: ub.id,
                         title: book.title, coverUrl: book.coverUrl })
      } else if (status === "dnf") {
        // DNF inserts status='dnf' (visibility 'visible', tier/rank/score null) —
        // same row shape as the dropdown/sheet DNF paths. No ranking flow.
        showToast({ variant: "dnf", bookTitle: book.title })
      } else {
        // want_to_read / reading — confirm the add with the matching status toast.
        showToast({ variant: "status", status, bookTitle: book.title })
      }
    }

    setChangingStatus(false)
  }

  async function handleRerank() {
    if (!userBook || !userId || !book) return

    setReranking(true)
    rankingDoneRef.current = false

    if (userBook.tier && userBook.rankPosition !== null) {
      // Save a full snapshot so we can restore on cancel — the original score is
      // never lost regardless of what happens in the flow.
      rerankSnapshotRef.current = {
        tier:         userBook.tier,
        rankPosition: userBook.rankPosition,
        score:        userBook.score,
      }
      prevStatusRef.current = "reranking"

      // Clear the old position to remove this book from the comparison pool
      // and close the gap in its tier. On cancel we reverse this exactly.
      const { error } = await clearRankingForRerank(
        userBook.userBookId, userId, userBook.tier, userBook.rankPosition,
      )
      if (error) {
        rerankSnapshotRef.current = null
        prevStatusRef.current = null
        setReranking(false)
        return
      }
      await refresh(userId)
    } else {
      // Book is already in a broken finished-but-unranked state — just open the
      // flow. Cancel will do nothing (prevStatusRef stays "finished").
      prevStatusRef.current = "finished"
      rerankSnapshotRef.current = null
    }

    setRankingBook({
      bookId:     book.id,
      userBookId: userBook.userBookId,
      title:      book.title,
      coverUrl:   book.coverUrl,
    })
    setReranking(false)
  }

  async function handleRankingCancel() {
    // onClose is also called after a successful ranking (Done button fires
    // onComplete then onClose). Only revert if ranking was NOT completed.
    if (rankingDoneRef.current) {
      setRankingBook(null)
      prevStatusRef.current  = null
      rankingDoneRef.current = false
      return
    }

    const prev = prevStatusRef.current
    const rb   = rankingBook

    setRankingBook(null)
    prevStatusRef.current  = null
    rankingDoneRef.current = false

    if (!rb || !userId) return

    if (prev === "not_in_library") {
      // Book was just added to trigger this flow — delete the row entirely
      await db.from("user_books").delete().eq("id", rb.userBookId)
    } else if (prev === "reranking") {
      // User cancelled a re-rank. Restore the original tier/rank_position/score
      // exactly so the book is indistinguishable from before they tapped Re-rank.
      const snap = rerankSnapshotRef.current
      if (snap) {
        await restoreRanking(rb.userBookId, userId, snap.tier, snap.rankPosition, snap.score)
      }
      rerankSnapshotRef.current = null
    } else if (prev && prev !== "finished") {
      // Book had a prior non-finished status — revert (also clears finished fields)
      await changeBookStatus(
        rb.userBookId, prev as BookStatus, "finished",
        userId, null, null,
      )
    }
    // prev === "finished" (broke state cancel) — leave as finished-but-unranked;
    // Re-rank button will be visible and the user can try again.

    await refresh(userId)
  }

  async function handleGenreSelect(genre: string) {
    if (!userBook || !userId || savingGenre) return
    setSavingGenre(true)
    const prev = userBook.genre
    setUserBook({ ...userBook, genre })   // optimistic
    setGenreEditing(false)
    const { error } = await saveBookGenre(userBook.userBookId, genre)
    if (error) setUserBook({ ...userBook, genre: prev })  // revert
    setSavingGenre(false)
  }

  /**
   * Save (or clear) the public review / private note for my row. Empty text
   * clears the column — that's how a review is deleted, no separate control.
   * Optimistic: the zone updates immediately and reverts on error.
   */
  async function handleSaveNote(text: string) {
    if (!userBook || !userId || editorKind === null || savingNote) return
    const kind = editorKind
    const trimmed = text.trim()
    const prev = userBook

    setSavingNote(true)
    if (kind === "public") {
      // Mirror savePublicNote's timestamp logic optimistically: editing an
      // existing review (had text → still has text) sets the edited marker;
      // a first post or a clear leaves/sets it null.
      const wasReview = !!userBook.publicNote
      const nowIso = new Date().toISOString()
      setUserBook({
        ...userBook,
        publicNote: trimmed || null,
        // First post stamps reviewed_at; an edit keeps it; clearing nulls it.
        publicReviewedAt: trimmed ? (wasReview ? userBook.publicReviewedAt : nowIso) : null,
        // An edit of an existing review sets the edited marker; first post/clear null.
        publicEditedAt: trimmed ? (wasReview ? nowIso : null) : null,
      })
    } else {
      setUserBook({ ...userBook, privateNote: trimmed || null })
    }

    const { error } = kind === "public"
      ? await savePublicNote(userBook.userBookId, text)
      : await savePrivateNote(userBook.userBookId, text)

    setSavingNote(false)
    if (error) {
      setUserBook(prev)   // revert
      showToast({ variant: "error", message: "Couldn’t save — try again" })
      return
    }

    setEditorKind(null)
    const label = kind === "public"
      ? (trimmed ? "Review saved" : "Review removed")
      : (trimmed ? "Note saved" : "Note removed")
    showToast({ variant: "note", message: label, icon: kind === "public" ? Eye : Lock })
  }

  /**
   * Toggle the viewer's heart on a 'ranked' event for this book, keyed by the
   * event's author (subjectUserId — my own id for my review, the friend's id for
   * theirs). Optimistic; reverts on error.
   */
  async function toggleHeart(subjectUserId: string) {
    if (!userId || !book) return
    const cur = hearts.get(subjectUserId) ?? { count: 0, reacted: false }
    const next: HeartState = {
      reacted: !cur.reacted,
      count: cur.count + (cur.reacted ? -1 : 1),
    }
    setHearts((prev) => new Map(prev).set(subjectUserId, next))   // optimistic

    const { error } = await setHeart({
      reactorId: userId,
      eventType: "ranked",
      subjectUserId,
      bookId: book.id,
      react: next.reacted,
    })
    if (error) {
      setHearts((prev) => new Map(prev).set(subjectUserId, cur))  // revert
      showToast({ variant: "error", message: "Couldn’t update — try again" })
    }
  }

  /** Keep a review's comment-count badge in sync with its open thread. */
  function updateCommentCount(subjectUserId: string, count: number) {
    setCommentCounts((prev) => new Map(prev).set(subjectUserId, count))
  }

  async function handleRemove() {
    if (!userBook || !userId) return
    setRemoving(true)
    await removeFromShelf(
      userBook.userBookId, userId, userBook.tier, userBook.rankPosition,
    )
    router.back()
  }

  /**
   * Stop reading a currently-reading book — the two outcomes of the prompt:
   *  - "want_to_read" (save for later): back on the reading list with was_started
   *    set, so it reads as a book you've already cracked open.
   *  - "dnf": moves to the private DNF list (own profile only, excluded from recs).
   * Both reuse changeBookStatus; a reading book carries no tier/rank to unwind.
   */
  async function handleStopReading(target: "want_to_read" | "dnf") {
    if (!userBook || !userId || !book || stopping) return
    setStopping(true)
    const { error } = await changeBookStatus(
      userBook.userBookId, target, userBook.status,
      userId, userBook.tier, userBook.rankPosition,
    )
    if (error) {
      showToast({ variant: "error", message: "Couldn’t update — try again" })
    } else {
      await refresh(userId)
      showToast(
        target === "dnf"
          ? { variant: "dnf",    bookTitle: book.title }
          : { variant: "status", status: "want_to_read", bookTitle: book.title },
      )
    }
    setStopOpen(false)
    setStopping(false)
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) return <Skeleton onBack={() => router.back()} />

  if (notFound || !book) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-foreground/40">Book not found.</p>
        <button onClick={() => router.back()} className="text-sm underline underline-offset-2 text-foreground/50">
          Go back
        </button>
      </div>
    )
  }

  const isFinished = userBook?.status === "finished"

  return (
    <>
      <div className="min-h-screen bg-background">
        {/* ── Back ──────────────────────────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm px-3 py-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1 text-foreground/50 hover:text-foreground transition-colors"
          >
            <ChevronLeft className="size-5" />
            <span className="text-sm">Back</span>
          </button>
        </div>

        {/* Main vertical stack — one SECTION gap (20px) governs every
            section→section break; tighter INTRA spacing (8px) lives inside each
            block. No per-element rhythm margins. */}
        <div className="px-5 pb-16 flex flex-col items-center gap-5">

          {/* ── Cover ───────────────────────────────────────────────────────── */}
          <div className="relative w-[170px] aspect-[2/3] rounded-xl overflow-hidden shadow-lg bg-muted mt-1">
            {book.coverUrl
              ? <Image src={book.coverUrl} alt={`Cover of ${book.title}`} fill sizes="170px" className="object-cover" priority />
              : <div className="absolute inset-0 bg-muted" />}
          </div>

          {/* ── Title / author ──────────────────────────────────────────────── */}
          <div className="text-center space-y-1 w-full max-w-xs">
            <h1 className="text-2xl text-foreground leading-snug" style={{ fontFamily: "var(--font-serif)" }}>
              {book.title}
            </h1>
            <p className="text-sm text-foreground/55">
              {book.author}{book.publishedYear ? ` · ${book.publishedYear}` : ""}
            </p>
          </div>

          {/* ── Score + tier + genre (per-user metadata) ────────────────────── */}
          {userBook && (
            <div className="w-full max-w-xs flex flex-col items-center gap-2">
              {/* Score + tier · re-rank (finished only).
                  HERO-VERDICT WRAPPER — the one sanctioned exception to the
                  "spacing comes from the parent gap, never per-element margins"
                  rule, scoped to this block alone. The score's 8px gap to the
                  tier line (INTRA) is set by this wrapper's gap-2; the -mt-3
                  cancels 12px of the 20px SECTION gap above, leaving 8px to the
                  author line so the score sits with equal air above and below —
                  optically centered between author and tier. Genre (a sibling in
                  the outer block) keeps its normal 8px gap below the tier. */}
              {isFinished && (
                <div className="flex flex-col items-center gap-2 -mt-3">
                  {userBook.score !== null && (
                    <ScoreDisplay score={userBook.score} className="text-5xl leading-none" />
                  )}
                  <div className="flex items-center gap-3">
                    {userBook.tier && (
                      <span className="text-sm text-foreground/55">
                        {TIER_LABELS[userBook.tier as keyof typeof TIER_LABELS] ?? userBook.tier}
                      </span>
                    )}
                    {/* Re-rank button — right next to tier */}
                    <button
                      onClick={handleRerank}
                      disabled={reranking || changingStatus}
                      className="text-sm font-medium underline underline-offset-2 disabled:opacity-40 transition-opacity"
                      style={{ color: "#9C4A2F" }}
                    >
                      {reranking ? "Clearing…" : "Re-rank"}
                    </button>
                  </div>
                </div>
              )}

              {/* Genre — read state is plain text mirroring the tier line above
                  ("Narrative non-fiction · Edit"); editing swaps in the picker. */}
              {genreEditing ? (
                <div className="w-full space-y-2 text-left">
                  <p className="text-xs text-foreground/40 font-sans uppercase tracking-widest">
                    Genre
                  </p>
                  <GenrePicker
                    selected={userBook.genre}
                    onSelect={handleGenreSelect}
                    onCancel={() => setGenreEditing(false)}
                  />
                </div>
              ) : userBook.genre ? (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-foreground/55">{userBook.genre}</span>
                  <button
                    onClick={() => setGenreEditing(true)}
                    disabled={savingGenre}
                    className="text-sm font-medium underline underline-offset-2 disabled:opacity-40 transition-opacity"
                    style={{ color: "#9C4A2F" }}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setGenreEditing(true)}
                  className="text-sm font-medium underline underline-offset-2"
                  style={{ color: "#9C4A2F" }}
                >
                  + Add genre
                </button>
              )}
            </div>
          )}

          {/* ── Shelf status control ────────────────────────────────────────── */}
          <div className="w-full max-w-xs space-y-2">
            {userBook ? (
              <>
                {/* Current status — tappable, looks interactive */}
                <button
                  onClick={() => setStatusOpen((o) => !o)}
                  disabled={changingStatus}
                  className={[
                    "w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all",
                    "text-sm font-medium disabled:opacity-50",
                    statusOpen
                      ? "border-[#9C4A2F]/50 bg-[#9C4A2F]/5 text-[#9C4A2F]"
                      : "border-border bg-muted/40 text-foreground/70 hover:border-foreground/20",
                  ].join(" ")}
                >
                  <span className="flex items-center gap-2">
                    {!changingStatus && (() => { const TriggerIcon = STATUS_ICON[userBook.status]; return <TriggerIcon className="size-4 shrink-0" /> })()}
                    {changingStatus ? "Saving…" : STATUS_OPTION_LABEL[userBook.status]}
                  </span>
                  <svg
                    viewBox="0 0 16 16"
                    className={`size-4 transition-transform ${statusOpen ? "rotate-180 text-[#9C4A2F]" : "text-foreground/30"}`}
                    fill="none" stroke="currentColor" strokeWidth="1.5"
                  >
                    <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {/* Inline options — slide open */}
                {statusOpen && (
                  <div className="rounded-xl border border-border overflow-hidden">
                    {STATUS_DROPDOWN_OPTIONS.map(({ status, label, Icon }) => {
                      const active = status === userBook.status
                      return (
                        <button
                          key={status}
                          onClick={() => handleStatusPick(status)}
                          className={[
                            "w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors",
                            "border-b border-border/50 last:border-0",
                            active
                              ? "bg-[#9C4A2F]/6 text-[#9C4A2F] font-medium"
                              : "bg-background text-foreground/70 hover:bg-muted/40",
                          ].join(" ")}
                        >
                          <Icon className="size-4 shrink-0" />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Not on shelf — show all four options directly as status rows */
              userId && (
                <div className="space-y-1.5">
                  <p className="text-xs text-foreground/40 font-sans uppercase tracking-widest px-0.5 mb-2">
                    Add to shelf
                  </p>
                  {STATUS_DROPDOWN_OPTIONS.map(({ status, label, Icon }) => (
                    <button
                      key={status}
                      onClick={() => handleAddToShelf(status)}
                      disabled={changingStatus}
                      // Row styling copied verbatim from the Search BookActionMenu
                      // rows so a status option looks identical on both surfaces.
                      className={[
                        "flex items-center gap-3 w-full rounded-xl px-4 py-4",
                        "text-sm font-medium text-left transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        "bg-muted/60 hover:bg-muted text-foreground/70",
                      ].join(" ")}
                    >
                      <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                      {label}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* ── Stop reading — quiet secondary affordance under the status ──────
              control. Opens the bottom sheet; deliberately recedes so the
              status dropdown stays the primary action. */}
          {userBook?.status === "reading" && (
            <div className="w-full max-w-xs flex justify-center">
              <button
                onClick={() => setStopOpen(true)}
                className="inline-flex items-center gap-1.5 text-xs text-foreground/60 hover:text-foreground/80 underline underline-offset-4 transition-colors"
              >
                <CircleX className="size-3.5 shrink-0" strokeWidth={1.75} />
                Stop reading
              </button>
            </div>
          )}

          {/* ── My review (finished only) ───────────────────────────────────── */}
          {isFinished && userBook && (
            <OwnReview
              publicNote={userBook.publicNote}
              privateNote={userBook.privateNote}
              publicReviewedAt={userBook.publicReviewedAt}
              publicEditedAt={userBook.publicEditedAt}
              hearted={userId ? (hearts.get(userId)?.reacted ?? false) : false}
              heartCount={userId ? (hearts.get(userId)?.count ?? 0) : 0}
              onToggleHeart={() => { if (userId) toggleHeart(userId) }}
              commentCount={userId ? (commentCounts.get(userId) ?? 0) : 0}
              viewerId={userId ?? ""}
              bookId={book.id}
              onCommentCountChange={(n) => { if (userId) updateCommentCount(userId, n) }}
              onEdit={setEditorKind}
            />
          )}

          {/* ── Reviews from friends — discovery surface, shown on any book ──── */}
          {userId && (
            <FriendReviews
              reviews={friendReviews}
              loading={reviewsLoading}
              hearts={hearts}
              onToggleHeart={toggleHeart}
              commentCounts={commentCounts}
              onCommentCountChange={updateCommentCount}
              viewerId={userId}
              bookId={book.id}
            />
          )}

          {/* ── Remove from shelf ───────────────────────────────────────────── */}
          {userBook && (
            <div className="w-full max-w-xs pt-5 border-t border-border/50">
              {!confirmRemove ? (
                <button
                  onClick={() => {
                    // Only finished books need a confirm — ranking data would be lost.
                    // Unranked books (want-to-read, reading) remove immediately.
                    userBook.status === "finished"
                      ? setConfirmRemove(true)
                      : handleRemove()
                  }}
                  className="text-xs text-foreground/35 hover:text-foreground/60 transition-colors underline underline-offset-2"
                >
                  Remove from shelf
                </button>
              ) : (
                <div className="flex items-center gap-4">
                  <span className="text-xs text-foreground/50">Remove this book?</span>
                  <button
                    onClick={handleRemove}
                    disabled={removing}
                    className="text-xs font-medium underline underline-offset-2 disabled:opacity-40"
                    style={{ color: "#A8321A" }}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </button>
                  <button
                    onClick={() => setConfirmRemove(false)}
                    className="text-xs text-foreground/40 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {/* ── Ranking flow ──────────────────────────────────────────────────────── */}
      {rankingBook && userId && (
        <RankingFlow
          book={rankingBook}
          userId={userId}
          onClose={handleRankingCancel}
          onComplete={async () => {
            // This onComplete is shared by the re-rank flow. Only a FRESH finish
            // should confirm "Marked as Finished" — a re-rank (prevStatus
            // "reranking" or the broken-state "finished") must stay silent, since
            // the book was already finished. Capture before the await/ref reset.
            const wasFreshFinish =
              prevStatusRef.current !== "reranking" &&
              prevStatusRef.current !== "finished"
            rankingDoneRef.current = true
            rerankSnapshotRef.current = null
            await refresh(userId)
            if (wasFreshFinish) {
              showToast({ variant: "status", status: "finished", bookTitle: book?.title })
            }
          }}
        />
      )}

      {/* ── Stop reading sheet ────────────────────────────────────────────────── */}
      <StopReadingSheet
        open={stopOpen}
        onOpenChange={setStopOpen}
        onSaveForLater={() => handleStopReading("want_to_read")}
        onDnf={() => handleStopReading("dnf")}
        pending={stopping}
      />

      {/* ── Note editor (public review / private thoughts) ────────────────────── */}
      <NoteEditorSheet
        open={editorKind !== null}
        onOpenChange={(o) => { if (!o) setEditorKind(null) }}
        kind={editorKind ?? "public"}
        initialValue={
          editorKind === "private"
            ? (userBook?.privateNote ?? "")
            : (userBook?.publicNote ?? "")
        }
        onSave={handleSaveNote}
        saving={savingNote}
      />

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      <Toast payload={toast} onDismiss={dismissToast} />
    </>
  )
}

// ── Local helpers ─────────────────────────────────────────────────────────────

// Label string for the collapsed status button
const STATUS_OPTION_LABEL: Record<BookStatus, string> = {
  want_to_read: "Want to read",
  reading:      "Currently reading",
  finished:     "Finished",
  dnf:          "Did not finish",
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function Skeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 py-3">
        <button onClick={onBack} className="flex items-center gap-1 text-foreground/50">
          <ChevronLeft className="size-5" /><span className="text-sm">Back</span>
        </button>
      </div>
      <div className="px-5 pb-16 flex flex-col items-center gap-5">
        <div className="w-[170px] aspect-[2/3] rounded-xl bg-muted animate-pulse mt-1" />
        <div className="space-y-2 w-full max-w-xs flex flex-col items-center">
          <div className="h-7 w-48 rounded-lg bg-muted animate-pulse" />
          <div className="h-4 w-32 rounded bg-muted animate-pulse" />
        </div>
        <div className="w-full max-w-xs h-12 rounded-xl bg-muted animate-pulse" />
      </div>
    </div>
  )
}
