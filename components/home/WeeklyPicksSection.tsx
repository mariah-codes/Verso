"use client"

import Link from "next/link"
import Image from "next/image"
import { BookOpen, BookPlus, UserPlus } from "lucide-react"
import type { EnrichedPick } from "@/lib/weekly-picks-data"

interface WeeklyPicksSectionProps {
  picks: EnrichedPick[]
  loading: boolean
}

/**
 * "This week's picks" — the top of Home. Three states:
 *  - loading: header + tagline + skeleton cards
 *  - populated: horizontal scroll of up to 5 pick cards
 *  - cold start (no picks): ghost placeholders + a "warming up" prompt with
 *    two entry-point chips. Never a blank section.
 */
export function WeeklyPicksSection({ picks, loading }: WeeklyPicksSectionProps) {
  return (
    <section className="pt-6">
      {/* One shared px-5 wrapper governs the LEFT inset of both the heading and the
          strip, so the first cover lines up exactly with the heading text. The
          strip itself breaks out to the right (-mr-5) for the peek; its left stays
          at this wrapper's padding. */}
      <div className="px-5">
        <Header />
        {loading ? (
          <CardRow>
            {[0, 1, 2, 3].map((i) => (
              <PickCardSkeleton key={i} />
            ))}
          </CardRow>
        ) : picks.length > 0 ? (
          <CardRow>
            {picks.map((pick) => (
              <PickCard key={pick.bookId} pick={pick} />
            ))}
          </CardRow>
        ) : (
          <ColdStart />
        )}
      </div>
    </section>
  )
}

// ── Header ──────────────────────────────────────────────────────────────────

function Header() {
  return (
    // No own horizontal padding — the parent px-5 wrapper provides the left inset
    // that the strip below shares.
    <div className="mb-4">
      {/* Single shared heading for all three states (loading/populated/cold-start)
          so they're guaranteed identical. Explicit serif fallback stack means the
          brief next/font "swap" window degrades to Georgia, not the browser default
          (Times) — which is what made the populated state look "off" before. */}
      <h2
        className="text-2xl text-foreground"
        style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
      >
        This week’s picks
      </h2>
      {/* Supporting label tier (/55) — matches the feed's "reviewed" verb. */}
      <p className="text-sm text-foreground/55 mt-0.5">From friends who share your taste</p>
    </div>
  )
}

/**
 * Horizontal scroll row, rendered INSIDE the section's px-5 wrapper. It takes NO
 * left padding of its own — so the first cover's left edge is the wrapper's left
 * inset, identical to the heading's. `-mr-5` breaks the scroll viewport out to the
 * screen's right edge so the next cover peeks (the scroll cue); `pr-5` on the inner
 * track re-insets the LAST cover when you scroll to the end. Covers are sized so
 * ~2.5 show at once.
 */
function CardRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-none snap-x -mr-5">
      <div className="flex gap-4 w-max pr-5 pb-1">{children}</div>
    </div>
  )
}

// ── Populated card ──────────────────────────────────────────────────────────

// ~33vw (capped) shows roughly 2.5 covers at once → a clear half-cover peek,
// independent of how many picks (2–5) there are. A short list just doesn't fill
// the width; a full list scrolls.
const CARD_W = "w-[33vw] max-w-[150px]"

function PickCard({ pick }: { pick: EnrichedPick }) {
  return (
    <div className={`${CARD_W} shrink-0 snap-start`}>
      <Link
        href={`/book/${pick.bookId}`}
        className="group block focus-visible:outline-none"
      >
        <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm transition-shadow group-hover:shadow-md">
          {pick.coverUrl ? (
            <Image
              src={pick.coverUrl}
              alt={`Cover of ${pick.title}`}
              fill
              sizes="128px"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted px-2">
              <BookOpen className="size-5 text-muted-foreground opacity-40" />
              <span className="text-[10px] text-muted-foreground text-center leading-snug line-clamp-3">
                {pick.title}
              </span>
            </div>
          )}
        </div>
        <p className="mt-2 text-xs font-medium text-foreground leading-snug line-clamp-2 px-0.5">
          {pick.title}
        </p>
      </Link>
      {/* Meta tier (/40) — same weight as the feed's timestamp & counts. */}
      <p className="mt-1 text-[11px] italic text-foreground/40 leading-snug px-0.5">
        {provenanceCaption(pick)}
      </p>
    </div>
  )
}

/**
 * Provenance caption from a pick's tier + friend_count. First name only, tier
 * only — never rank.
 *   loved,  1   → "Loved by Sarah"
 *   loved,  3   → "Loved by Sarah & 2 others"
 *   liked,  2   → "Liked by James & 1 other"
 *   want_to_read → "Maya wants to read this"
 */
export function provenanceCaption({ tier, friendName, friendCount }: EnrichedPick): string {
  const first = firstName(friendName)
  if (tier === "want_to_read") return `${first} wants to read this`

  const verb = tier === "loved" ? "Loved" : "Liked"
  const others = friendCount - 1
  if (others <= 0) return `${verb} by ${first}`
  return `${verb} by ${first} & ${others} ${others === 1 ? "other" : "others"}`
}

/** First token of a display name ("Jared Duda" → "Jared"). Falls back to the
 *  whole string if there's no whitespace. */
function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] || displayName
}

function PickCardSkeleton() {
  return (
    <div className={`${CARD_W} shrink-0`}>
      <div className="w-full aspect-[2/3] rounded-lg bg-muted animate-pulse" />
      <div className="mt-2 h-3 w-4/5 rounded bg-muted animate-pulse" />
      <div className="mt-1.5 h-2.5 w-3/5 rounded bg-muted animate-pulse" />
    </div>
  )
}

// ── Cold start ──────────────────────────────────────────────────────────────

function ColdStart() {
  return (
    // No own horizontal padding — sits inside the section's px-5 wrapper.
    <div>
      {/* Ghost covers — flex-1 so three fit the row without overflow (decoupled
          from the populated card's vw width, which would overflow at ×3). */}
      <div className="flex gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex-1 aspect-[2/3] rounded-lg border-2 border-dashed border-border flex items-center justify-center"
          >
            <BookOpen className="size-6 text-foreground/15" strokeWidth={1.5} />
          </div>
        ))}
      </div>

      {/* Warming-up prompt — stronger border + subtle warm fill so the card has
          presence against the cream page rather than melting into it. */}
      <div className="mt-4 rounded-xl border border-foreground/10 bg-foreground/[0.025] px-4 py-4">
        <p className="text-sm font-semibold text-foreground">Your picks are warming up</p>
        <p className="text-sm text-foreground/55 mt-1 leading-relaxed">
          Picks get better as you and your friends add more of what you’ve read.
        </p>
        <div className="flex flex-wrap gap-2 mt-3.5">
          <ChipLink href="/friends" Icon={UserPlus} label="Find more friends" />
          <ChipLink href="/search" Icon={BookPlus} label="Add books you’ve read" />
        </div>
      </div>
    </div>
  )
}

/** Filled chip that reads as a tappable button: near-white surface against the
 *  card, with the one terracotta accent on the screen (the icon). */
function ChipLink({ href, Icon, label }: { href: string; Icon: React.ElementType; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-[#FCFBF9] px-3 py-1.5 text-xs font-medium text-foreground/75 hover:border-[#9C4A2F]/40 transition-colors"
    >
      <Icon className="size-3.5 shrink-0" style={{ color: "#9C4A2F" }} />
      {label}
    </Link>
  )
}
