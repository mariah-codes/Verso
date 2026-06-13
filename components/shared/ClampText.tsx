"use client"

import { useCallback, useState } from "react"
import { cn } from "@/lib/utils"

interface ClampTextProps {
  text: string
  /** Classes for the text block (size / color / leading / margin). The "more" /
   *  "less" toggle inherits the size from here and only overrides the color. */
  className?: string
  /** Background color behind the text — used for the inline "more" fade so it
   *  blends in (cream for the public review, putty for private thoughts). */
  fadeColor: string
}

/**
 * Plain-text body clamped to 3 lines with an inline "more" / "less" toggle (no
 * rich text). When collapsed, "more" sits at the END of the third line behind a
 * gradient fade — so the truncation reads as "…text fades… more" on one row,
 * instead of a hard browser ellipsis on its own line in a different color.
 * Overflow is measured via a ref callback (not a useEffect) to satisfy the
 * no-setState-in-effect rule.
 */
export function ClampText({ text, className, fadeColor }: ClampTextProps) {
  const [expanded, setExpanded] = useState(false)
  const [overflows, setOverflows] = useState(false)

  const measure = useCallback((el: HTMLParagraphElement | null) => {
    if (el) setOverflows(el.scrollHeight - el.clientHeight > 1)
  }, [])

  if (expanded) {
    return (
      <p className={cn(className, "whitespace-pre-line")}>
        {text}{" "}
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="font-medium text-foreground/40 hover:text-foreground/70 transition-colors"
        >
          less
        </button>
      </p>
    )
  }

  // className lives on the wrapper so the <p> and the "more" button both inherit
  // its font-size/leading; the button only re-colors itself muted.
  return (
    <div className={cn(className, "relative")}>
      <p ref={measure} className="whitespace-pre-line line-clamp-3">
        {text}
      </p>
      {overflows && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          // End of line 3. The left fade masks the clamped text + the browser's
          // own ellipsis; we render our own "… more" so the ellipsis is visible
          // and the SAME muted color as "more", inline on one row.
          className="absolute bottom-0 right-0 pl-8 text-foreground/40 hover:text-foreground/70 transition-colors"
          style={{ background: `linear-gradient(to right, transparent, ${fadeColor} 1.75rem)` }}
        >
          <span aria-hidden>… </span>
          <span className="font-medium">more</span>
        </button>
      )}
    </div>
  )
}
