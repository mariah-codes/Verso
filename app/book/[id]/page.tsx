"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Image from "next/image"
import { ChevronLeft } from "lucide-react"
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
} from "@/lib/books"
import { TIER_LABELS } from "@/lib/ranking"

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
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SHELF_OPTIONS: { status: BookStatus; label: string }[] = [
  { status: "want_to_read", label: "Want to read" },
  { status: "reading",      label: "Reading"       },
  { status: "finished",     label: "Finished"      },
]

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

  // ── Data loading ────────────────────────────────────────────────────────────

  const refresh = useCallback(async (uid: string) => {
    const { data: ub } = await db
      .from("user_books")
      .select("id, status, tier, score, rank_position")
      .eq("book_id", id)
      .eq("user_id", uid)
      .maybeSingle()

    setUserBook(ub ? {
      userBookId:   ub.id,
      status:       ub.status,
      tier:         ub.tier ?? null,
      score:        ub.score ?? null,
      rankPosition: ub.rank_position ?? null,
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
      await changeBookStatus(
        userBook.userBookId, newStatus, userBook.status,
        userId, userBook.tier, userBook.rankPosition,
      )
      await refresh(userId)
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
        visibility: "visible",
        was_started: status === "reading" || status === "finished",
        finished_at: status === "finished" ? new Date().toISOString() : null,
      })
      .select("id")
      .single()

    if (!error && ub) {
      await refresh(userId)
      if (status === "finished") {
        prevStatusRef.current = "not_in_library"
        rankingDoneRef.current = false
        setRankingBook({ bookId: book.id, userBookId: ub.id,
                         title: book.title, coverUrl: book.coverUrl })
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

  async function handleRemove() {
    if (!userBook || !userId) return
    setRemoving(true)
    await removeFromShelf(
      userBook.userBookId, userId, userBook.tier, userBook.rankPosition,
    )
    router.back()
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

        <div className="px-5 pb-16 flex flex-col items-center gap-7">

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

          {/* ── Score + tier + re-rank (finished only) ──────────────────────── */}
          {isFinished && userBook && (
            <div className="w-full max-w-xs flex flex-col items-center gap-2">
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
                  <span>{changingStatus ? "Saving…" : STATUS_OPTION_LABEL[userBook.status]}</span>
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
                    {SHELF_OPTIONS.map(({ status, label }) => {
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
                          {/* Active indicator dot */}
                          <span className={`size-1.5 rounded-full shrink-0 ${active ? "bg-[#9C4A2F]" : "bg-transparent"}`} />
                          {label}
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            ) : (
              /* Not on shelf — show all three options directly */
              userId && (
                <div className="space-y-1.5">
                  <p className="text-xs text-foreground/40 font-sans uppercase tracking-widest px-0.5 mb-2">
                    Add to shelf
                  </p>
                  {SHELF_OPTIONS.map(({ status, label }) => (
                    <button
                      key={status}
                      onClick={() => handleAddToShelf(status)}
                      disabled={changingStatus}
                      className={[
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl",
                        "text-sm text-left border border-border transition-colors",
                        "text-foreground/70 hover:border-[#9C4A2F]/40 hover:bg-[#9C4A2F]/5",
                        "disabled:opacity-50",
                      ].join(" ")}
                    >
                      <span className="size-1.5 rounded-full shrink-0 bg-foreground/20" />
                      {label}
                    </button>
                  ))}
                </div>
              )
            )}
          </div>

          {/* ── Remove from shelf ───────────────────────────────────────────── */}
          {userBook && (
            <div className="w-full max-w-xs pt-4 border-t border-border/50">
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
                    className="text-xs font-medium text-destructive underline underline-offset-2 disabled:opacity-40"
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
            rankingDoneRef.current = true
            rerankSnapshotRef.current = null
            await refresh(userId)
          }}
        />
      )}
    </>
  )
}

// ── Local helpers ─────────────────────────────────────────────────────────────

// Label string for the collapsed status button
const STATUS_OPTION_LABEL: Record<BookStatus, string> = {
  want_to_read: "Want to read",
  reading:      "Reading",
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
      <div className="px-5 pb-16 flex flex-col items-center gap-7">
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
