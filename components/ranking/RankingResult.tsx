"use client"

import { useEffect, useRef, useState } from "react"
import Image from "next/image"
import { BookOpen } from "lucide-react"
import { formatScore, SCORE_DISPLAY_THRESHOLD, type Tier } from "@/lib/ranking"
import { saveBookNote } from "@/lib/ranking-data"

const TIER_LABELS: Record<Tier, string> = {
  loved: "loved",
  liked: "liked",
  fine: "fine",
}

interface RankingResultProps {
  bookTitle: string
  coverUrl: string | null
  tier: Tier
  rankPosition: number          // 1-based, final position in tier
  finishedCount: number         // total finished books (post-ranking)
  score: number | null
  isTie: boolean
  tieWithTitle: string | null
  overallRank: number | null    // 1-based across all tiers; null = unknown
  userBookId: string
  onDone: () => void
}

export function RankingResult({
  bookTitle,
  coverUrl,
  tier,
  rankPosition,
  finishedCount,
  score,
  isTie,
  tieWithTitle,
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
  const isTop10 = overallRank !== null && overallRank <= 10

  // Note prompt state
  const [showNote, setShowNote] = useState(false)
  const [note, setNote] = useState("")
  const [noteSaving, setNoteSaving] = useState(false)
  const [noteSaved, setNoteSaved] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (showNote) textareaRef.current?.focus()
  }, [showNote])

  async function handleSaveNote() {
    if (!note.trim()) { setShowNote(false); return }
    setNoteSaving(true)
    await saveBookNote(userBookId, note.trim())
    setNoteSaving(false)
    setNoteSaved(true)
    setTimeout(() => setShowNote(false), 800)
  }

  // ── Copy ──────────────────────────────────────────────────────────────────

  const positionLine = isTie && tieWithTitle
    ? `About the same as ${tieWithTitle}`
    : `Your #${rankPosition} ${TIER_LABELS[tier]}`

  const scoreLine = isAboveThreshold && score !== null
    ? `${formatScore(score)}`
    : null

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
          <div className="flex items-center justify-center gap-2 flex-wrap">
            {scoreLine && (
              <>
                <span className="text-2xl font-bold tabular-nums" style={{ color: "#9C4A2F" }}>
                  {scoreLine}
                </span>
                <span className="text-foreground/30">·</span>
              </>
            )}
            <span className="text-sm text-foreground/60">{positionLine}</span>
          </div>
        </div>
      </div>

      {/* Top-10 note prompt */}
      {isTop10 && !noteSaved && (
        <div
          className="w-full transition-all duration-300 ease-out"
          style={{ opacity: visible ? 1 : 0 }}
        >
          {!showNote ? (
            <button
              onClick={() => setShowNote(true)}
              className="w-full rounded-xl border border-dashed border-[#9C4A2F]/30 px-4 py-3 text-center"
            >
              <p className="text-xs font-semibold text-[#9C4A2F] tracking-wide">
                This cracked your top 10 ✦
              </p>
              <p className="text-xs text-foreground/40 mt-0.5">
                What stayed with you? (optional)
              </p>
            </button>
          ) : (
            <div className="space-y-2">
              <textarea
                ref={textareaRef}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="A line or two about what made it special…"
                rows={3}
                className="w-full rounded-xl border border-input bg-muted/50 px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/30 outline-none focus:border-ring resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSaveNote}
                  disabled={noteSaving}
                  className="flex-1 rounded-xl py-2.5 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: "#9C4A2F" }}
                >
                  {noteSaving ? "Saving…" : noteSaved ? "Saved ✓" : "Save note"}
                </button>
                <button
                  onClick={() => setShowNote(false)}
                  className="px-4 rounded-xl py-2.5 text-sm text-foreground/40 hover:text-foreground transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>
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
