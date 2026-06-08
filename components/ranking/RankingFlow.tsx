"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import {
  SCORE_DISPLAY_THRESHOLD,
  getNextComparison,
  insertAtPosition,
  scoreForNewBook,
  seedScores,
  estimatedComparisons,
  type Tier,
  type ComparisonRecord,
} from "@/lib/ranking"
import {
  fetchTierBooks,
  fetchFinishedCount,
  fetchAllFinishedForSeed,
  fetchOverallRank,
  persistRankingResult,
  type FetchedRankedBook,
} from "@/lib/ranking-data"
import { TierPrompt } from "./TierPrompt"
import { PairwiseCompare } from "./PairwiseCompare"
import { RankingResult } from "./RankingResult"

// ── Types ─────────────────────────────────────────────────────────────────────

export interface NewBookInfo {
  bookId: string       // books.id
  userBookId: string   // user_books.id
  title: string
  coverUrl: string | null
}

interface RankingFlowProps {
  book: NewBookInfo
  userId: string
  onClose: () => void
  /** Called after a successful ranking so the caller can refresh its data. */
  onComplete: () => void
}

type Phase = "tier" | "loading" | "comparing" | "saving" | "result" | "error"

// ── Component ─────────────────────────────────────────────────────────────────

export function RankingFlow({ book, userId, onClose, onComplete }: RankingFlowProps) {
  const [phase, setPhase] = useState<Phase>("tier")

  // Tier selection
  const [tier, setTier] = useState<Tier | null>(null)

  // Fetched state
  const [tierBooks, setTierBooks] = useState<FetchedRankedBook[]>([])
  const [finishedCount, setFinishedCount] = useState(0)

  // Binary search bounds (0-based, hi exclusive)
  const [lo, setLo] = useState(0)
  const [hi, setHi] = useState(0)

  // Comparison history this session
  const [sessionComparisons, setSessionComparisons] = useState<ComparisonRecord[]>([])

  // Tie tracking
  const [isTie, setIsTie] = useState(false)
  const [tieWithBook, setTieWithBook] = useState<FetchedRankedBook | null>(null)

  // Result state (set before transitioning to "result" phase)
  const [finalRankPosition, setFinalRankPosition] = useState(1)
  const [newBookScore, setNewBookScore] = useState<number | null>(null)
  const [overallRank, setOverallRank] = useState<number | null>(null)

  // Error
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // ── Handlers ─────────────────────────────────────────────────────────────

  async function handleTierSelect(selectedTier: Tier) {
    setTier(selectedTier)
    setPhase("loading")

    const [books, count] = await Promise.all([
      fetchTierBooks(userId, selectedTier),
      fetchFinishedCount(userId),
    ])

    setTierBooks(books)
    setFinishedCount(count)

    if (books.length === 0) {
      // Empty tier — no comparisons, insert at position 1
      await resolveAndSave(selectedTier, books, count, 0, [], false, null)
    } else {
      setLo(0)
      setHi(books.length)
      setPhase("comparing")
    }
  }

  function handleChoice(choice: "new" | "existing" | "tie") {
    const step = getNextComparison(tierBooks, lo, hi)
    if (step.done) return // should not happen

    const { pivotIndex } = step as Extract<typeof step, { done: false }>
    // Use tierBooks[pivotIndex] so we get FetchedRankedBook (has userBookId)
    const pivot = tierBooks[pivotIndex]

    if (choice === "tie") {
      // Tie: place new book immediately below pivot, copy pivot's score
      setIsTie(true)
      setTieWithBook(pivot)
      resolveAndSave(tier!, tierBooks, finishedCount, pivotIndex + 1, sessionComparisons, true, pivot)
      return
    }

    // Record this decisive comparison
    const comparison: ComparisonRecord = {
      bookAId: pivot.bookId,
      bookBId: book.bookId,
      winnerId: choice === "new" ? book.bookId : pivot.bookId,
      tier: tier!,
    }
    const nextComparisons = [...sessionComparisons, comparison]

    // Narrow the search window
    const nextLo = choice === "new" ? lo : pivotIndex + 1
    const nextHi = choice === "new" ? pivotIndex : hi

    if (nextLo >= nextHi) {
      // Resolved — go straight to persist, no extra render needed
      setSessionComparisons(nextComparisons)
      resolveAndSave(tier!, tierBooks, finishedCount, nextLo, nextComparisons, false, null)
    } else {
      setSessionComparisons(nextComparisons)
      setLo(nextLo)
      setHi(nextHi)
    }
  }

  /**
   * Returns a copy of the grouped seed lists with the newly-ranked book spliced
   * into `tier` at `insertAt` (0-based). Used only on a seed crossing, where the
   * new book isn't yet present in the fetched lists (no rank_position yet).
   * Closes over `book` for the new entry's identity.
   */
  function spliceNewBook(
    allForSeed: { loved: FetchedRankedBook[]; liked: FetchedRankedBook[]; fine: FetchedRankedBook[] },
    tier: Tier,
    insertAt: number,
    newRankPos: number,
  ) {
    const newEntry: FetchedRankedBook = {
      userBookId: book.userBookId,
      bookId: book.bookId,
      title: book.title,
      coverUrl: book.coverUrl,
      rankPosition: newRankPos,
      score: null,
    }
    const tierCopy = [...allForSeed[tier]]
    tierCopy.splice(insertAt, 0, newEntry)
    return { ...allForSeed, [tier]: tierCopy }
  }

  /**
   * Central resolve + persist function.
   * All params passed explicitly so we don't depend on state snapshots.
   */
  async function resolveAndSave(
    selectedTier: Tier,
    books: FetchedRankedBook[],
    count: number,
    insertAt: number,          // 0-based
    comparisons: ComparisonRecord[],
    tie: boolean,
    tieBook: FetchedRankedBook | null,
  ) {
    setPhase("saving")

    const isAboveThreshold = count >= SCORE_DISPLAY_THRESHOLD
    const newRankPos       = insertAt + 1

    // ── Compute the new book's frozen score ──────────────────────────────
    let score: number | null = null
    let allForSeed: Awaited<ReturnType<typeof fetchAllFinishedForSeed>> | null = null
    let scoreMap = new Map<string, number>()
    let isSeedCrossing = false

    // Above threshold, we must decide between two paths: (a) seed/heal the whole
    // shelf if any finished book still lacks a score, or (b) score only the new
    // book. We detect that by inspecting the actual scores, NOT by testing
    // count === 10 — that strict check silently misses the crossing if the
    // count ever lands above 10 with unscored books (interrupted seed, backfill).
    if (isAboveThreshold) {
      allForSeed = await fetchAllFinishedForSeed(userId)
      const hasAnyNullScores = [
        ...allForSeed.loved,
        ...allForSeed.liked,
        ...allForSeed.fine,
      ].some((b) => b.score === null)
      isSeedCrossing = hasAnyNullScores
    }

    if (tie && tieBook) {
      // Tie: the new book matches the pivot's score and sits just below it.
      if (isSeedCrossing && allForSeed) {
        // Seeding at the same time — derive the pivot's seeded score so the
        // tie still means "same as pivot" after the shelf is seeded.
        allForSeed = spliceNewBook(allForSeed, selectedTier, insertAt, newRankPos)
        scoreMap = seedScores(allForSeed)
        score = scoreMap.get(tieBook.bookId) ?? null
      } else {
        // Copy pivot's score (null if still below threshold).
        score = isAboveThreshold ? (tieBook.score ?? null) : null
      }

    } else if (isSeedCrossing && allForSeed) {
      // Seed/heal ALL finished books, including this one.
      // (fetchAllFinishedForSeed excludes unranked rows, so splice the new book in.)
      allForSeed = spliceNewBook(allForSeed, selectedTier, insertAt, newRankPos)
      scoreMap = seedScores(allForSeed)
      score = scoreMap.get(book.bookId) ?? null

    } else if (isAboveThreshold) {
      // Above threshold, every existing book already scored — score only this one.
      const neighborAbove = insertAt > 0            ? books[insertAt - 1] : null
      const neighborBelow = insertAt < books.length ? books[insertAt]     : null
      score = scoreForNewBook({
        neighborAboveScore: neighborAbove?.score ?? null,
        neighborBelowScore: neighborBelow?.score ?? null,
        tier: selectedTier,
      })
      // Not seeding — make sure persist doesn't write seed scores.
      allForSeed = null
    }

    // ── Persist ──────────────────────────────────────────────────────────
    const { error } = await persistRankingResult({
      userId,
      newBookId: book.bookId,
      newUserBookId: book.userBookId,
      tier: selectedTier,
      newRankPosition: newRankPos,
      tierWasEmpty: books.length === 0,
      sessionComparisons: comparisons,
      newBookScore: score,
      isSeedCrossing,
      seedScoreMap: scoreMap,
      allFinishedForSeed: allForSeed,
    })

    if (error) {
      setErrorMsg(error)
      setPhase("error")
      return
    }

    // ── Fetch overall rank for top-10 check ──────────────────────────────
    const rank = await fetchOverallRank(userId, book.bookId)

    setFinalRankPosition(newRankPos)
    setNewBookScore(score)
    setOverallRank(rank)
    setPhase("result")
  }

  // ── Derive comparison display data ────────────────────────────────────

  const currentStep = phase === "comparing"
    ? getNextComparison(tierBooks, lo, hi)
    : null

  const questionNum     = sessionComparisons.length + 1
  const totalEstimate   = Math.max(estimatedComparisons(tierBooks.length), questionNum)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-safe pt-4 pb-2 border-b border-border shrink-0">
        <span
          className="text-base text-foreground/70"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {phase === "tier"
            ? "How was it?"
            : phase === "comparing"
              ? "Rank it"
              : phase === "result"
                ? "Ranked"
                : " "}
        </span>
        <button
          onClick={onClose}
          aria-label="Close ranking"
          className="p-2 -mr-2 rounded-full text-foreground/40 hover:text-foreground transition-colors"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Body — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {phase === "tier" && (
          <TierPrompt
            bookTitle={book.title}
            coverUrl={book.coverUrl}
            onSelect={handleTierSelect}
          />
        )}

        {(phase === "loading" || phase === "saving") && (
          <div className="flex flex-col items-center justify-center h-full gap-3 py-20">
            <Spinner />
            <p className="text-sm text-foreground/40">
              {phase === "saving" ? "Saving…" : "Loading…"}
            </p>
          </div>
        )}

        {phase === "comparing" && currentStep && !currentStep.done && (
          <PairwiseCompare
            newBook={{ title: book.title, coverUrl: book.coverUrl }}
            existingBook={{
              title: currentStep.pivot.title,
              coverUrl: currentStep.pivot.coverUrl,
            }}
            questionNum={questionNum}
            totalEstimate={totalEstimate}
            onChoice={handleChoice}
          />
        )}

        {phase === "result" && (
          <RankingResult
            bookTitle={book.title}
            coverUrl={book.coverUrl}
            finishedCount={finishedCount}
            tier={tier}
            score={newBookScore}
            overallRank={overallRank}
            userBookId={book.userBookId}
            onDone={() => { onComplete(); onClose() }}
          />
        )}

        {phase === "error" && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 py-20 text-center">
            <p className="text-sm text-destructive">{errorMsg}</p>
            <button
              onClick={() => setPhase("tier")}
              className="text-sm text-foreground/50 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="size-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#9C4A2F" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#9C4A2F" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
