import Image from "next/image"
import { BookOpen } from "lucide-react"
import { TIER_LABELS, type Tier } from "@/lib/ranking"

interface TierPromptProps {
  bookTitle: string
  coverUrl: string | null
  onSelect: (tier: Tier) => void
}

const TIERS: { tier: Tier; sublabel: string; emoji: string }[] = [
  { tier: "loved",  sublabel: "One of my favourites",  emoji: "❤️" },
  { tier: "liked",  sublabel: "Solid, enjoyed it",      emoji: "👍" },
  { tier: "fine",   sublabel: "Just wasn't my thing",   emoji: "🫤" },
]

export function TierPrompt({ bookTitle, coverUrl, onSelect }: TierPromptProps) {
  return (
    <div className="flex flex-col items-center gap-8 px-6 py-10">
      {/* Cover */}
      <div className="relative w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-lg">
        {coverUrl ? (
          <Image src={coverUrl} alt={`Cover of ${bookTitle}`} fill sizes="112px" className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-muted flex items-center justify-center">
            <BookOpen className="size-8 text-muted-foreground/40" />
          </div>
        )}
      </div>

      {/* Prompt */}
      <div className="text-center space-y-1">
        <p className="text-xs font-semibold tracking-widest uppercase text-foreground/40 font-sans">
          How was it?
        </p>
        <h2
          className="text-xl text-foreground leading-snug"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {bookTitle}
        </h2>
      </div>

      {/* Tier buttons */}
      <div className="flex flex-col gap-3 w-full">
        {TIERS.map(({ tier, sublabel, emoji }) => (
          <button
            key={tier}
            onClick={() => onSelect(tier)}
            className="flex items-center gap-4 w-full rounded-2xl bg-muted/60 hover:bg-muted active:scale-[0.98] px-5 py-4 text-left transition-all"
          >
            <span className="text-2xl">{emoji}</span>
            <span className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{TIER_LABELS[tier]}</span>
              <span className="text-xs text-foreground/50">{sublabel}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
