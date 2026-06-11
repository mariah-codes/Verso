"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import { BookOpen } from "lucide-react"
import { SCORE_DISPLAY_THRESHOLD, TIER_LABELS, type Tier } from "@/lib/ranking"
import { fetchUserBookGenre, saveBookGenre } from "@/lib/books"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import { GenrePicker } from "@/components/book/GenrePicker"

interface RankingResultProps {
  bookTitle: string
  coverUrl: string | null
  /** Total FINISHED books post-ranking — the denominator in "#X of N". */
  finishedCount: number
  tier: Tier | null
  score: number | null
  overallRank: number | null    // 1-based across all finished books; null = unknown
  userBookId: string
  onDone: () => void
}

export function RankingResult({
  bookTitle,
  coverUrl,
  finishedCount,
  tier,
  score,
  overallRank,
  userBookId,
  onDone,
}: RankingResultProps) {
  // Fade-in + scale animation (1.0 → 1.02 per spec)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 50)
    return () => clearTimeout(t)
  }, [])

  const isAboveThreshold = finishedCount >= SCORE_DISPLAY_THRESHOLD

  // Genre — optional, skippable step. Only offered when this row has no genre
  // yet (a re-rank of an already-tagged book skips it; edit lives on book detail).
  const [genre, setGenre] = useState<string | null>(null)
  const [genreLoaded, setGenreLoaded] = useState(false)
  const [savingGenre, setSavingGenre] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetchUserBookGenre(userBookId).then((g) => {
      if (cancelled) return
      setGenre(g)
      setGenreLoaded(true)
    })
    return () => { cancelled = true }
  }, [userBookId])

  async function handleSelectGenre(value: string) {
    setSavingGenre(true)
    setGenre(value)            // optimistic — collapses picker into confirmation
    const { error } = await saveBookGenre(userBookId, value)
    if (error) setGenre(null)  // revert so the user can retry
    setSavingGenre(false)
  }

  const showScore = isAboveThreshold && score !== null

  return (
    <div className="flex flex-col items-center gap-6 px-6 py-10">
      {/* Animated result card */}
      <div
        className="flex flex-col items-center gap-5 transition-all duration-300 ease-out"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? "scale(1.02)" : "scale(1.0)",
        }}
      >
        {/* Cover */}
        <div className="relative w-32 aspect-[2/3] rounded-xl overflow-hidden shadow-xl">
          {coverUrl ? (
            <Image src={coverUrl} alt={`Cover of ${bookTitle}`} fill sizes="128px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 bg-muted flex items-center justify-center">
              <BookOpen className="size-8 text-muted-foreground/40" />
            </div>
          )}
        </div>

        {/* Result text */}
        <div className="text-center space-y-2">
          <h2
            className="text-xl text-foreground leading-snug"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {bookTitle}
          </h2>
          {showScore && (
            <ScoreDisplay score={score!} className="text-3xl" />
          )}
          {/* Tier line — folds the overall rank in: "Loved it · #9 of 16".
              #X counts finished books only (finishedCount is the post-ranking
              finished total). */}
          {(tier || overallRank !== null) && (
            <p className="text-sm text-foreground/55 tabular-nums">
              {tier && TIER_LABELS[tier]}
              {tier && overallRank !== null && " · "}
              {overallRank !== null && `#${overallRank} of ${finishedCount}`}
            </p>
          )}
        </div>
      </div>

      {/* Genre — optional, skippable. Only shown when this book is untagged for
          this user. Selecting saves immediately; the reveal stays the payoff and
          this just rides along below it. */}
      {genreLoaded && (
        <div
          className="w-full transition-all duration-300 ease-out"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {genre === null ? (
            <div className="space-y-2.5">
              <p className="text-xs text-foreground/40 font-sans tracking-wide">
                Add a genre? <span className="text-foreground/30">(optional)</span>
              </p>
              <GenrePicker onSelect={handleSelectGenre} />
            </div>
          ) : (
            <p className="text-xs text-foreground/45 font-sans">
              Genre · <span className="text-foreground/70">{genre}</span>
              {savingGenre && <span className="text-foreground/30"> · saving…</span>}
            </p>
          )}
        </div>
      )}

      {/* Done */}
      <button
        onClick={onDone}
        className="w-full rounded-xl py-3 text-sm font-medium bg-muted hover:bg-muted/80 text-foreground transition-colors"
      >
        Done
      </button>
    </div>
  )
}
