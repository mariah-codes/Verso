import { cn } from "@/lib/utils"
import { formatScore } from "@/lib/ranking"

interface ScoreDisplayProps {
  score: number
  /** Tailwind classes for font-size and any other layout tweaks.
   *  The font family (EB Garamond), weight, color, and tabular-nums are always applied. */
  className?: string
}

/**
 * Single source of truth for score rendering across the app.
 * Always: EB Garamond serif · terracotta #9C4A2F · medium · tabular-nums
 * Caller controls size via className.
 */
export function ScoreDisplay({ score, className }: ScoreDisplayProps) {
  return (
    <span
      className={cn("font-medium tabular-nums", className)}
      style={{ fontFamily: "var(--font-serif)", color: "#9C4A2F" }}
    >
      {formatScore(score)}
    </span>
  )
}
