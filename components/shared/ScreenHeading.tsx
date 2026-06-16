import { cn } from "@/lib/utils"

interface ScreenHeadingProps {
  /** Sentence-case screen title. */
  title: string
  /** Optional supporting line beneath, in muted charcoal (~0.55). */
  subtitle?: string
  /** Title font-size. In-app screens (Home, Shelf) use text-2xl; the roomier
   *  onboarding / settings screens use text-3xl (the default). */
  size?: "text-2xl" | "text-3xl"
  /** Outer-wrapper classes — call sites own their own margins. */
  className?: string
}

/**
 * The single screen-title treatment across the app: EB Garamond serif at full
 * charcoal (#1F1B16 via text-foreground), sentence case, no icon, with an
 * optional muted subtitle beneath. The explicit Georgia fallback keeps the brief
 * next/font swap window from flashing Times. Every top-level screen title renders
 * through this so they can't drift in color, weight, or get a stray icon.
 */
export function ScreenHeading({ title, subtitle, size = "text-3xl", className }: ScreenHeadingProps) {
  return (
    <div className={className}>
      <h1
        className={cn(size, "text-foreground leading-tight")}
        style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
      >
        {title}
      </h1>
      {subtitle && <p className="text-sm text-foreground/55 mt-2">{subtitle}</p>}
    </div>
  )
}
