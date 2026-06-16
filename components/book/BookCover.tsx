"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"

interface BookCoverProps {
  /** Resolved cover URL (covers.openlibrary.org / curated). Null → placeholder. */
  coverUrl: string | null
  /** Book title — alt text, and the typographic placeholder content. */
  title: string
  /** Extra classes for the <img>/placeholder (sizing comes from the parent slot). */
  className?: string
  /** Eager-load above-the-fold covers (e.g. the book-detail hero). */
  priority?: boolean
}

/**
 * Renders a book cover into its parent slot — a positioned, aspect-ratioed box
 * (e.g. `relative w-full aspect-[2/3] rounded-lg overflow-hidden`). The <img> src
 * points DIRECTLY at covers.openlibrary.org; we never re-host the bytes (so this
 * deliberately is not next/image, which proxies + re-encodes through /_next/image).
 *
 * Fallback: when there's no cover URL, or the image errors / 404s (OL serves a 404
 * for a missing cover because the stored URL carries `?default=false`), it falls
 * through to an editorial top-aligned text cover — the title in EB Garamond,
 * left-aligned and anchored to the top on warm putty (#ECE4D8), with a hairline
 * rule beneath it. Everything is sized in container-query units so it scales
 * proportionally from a shelf thumbnail to the book-detail hero. Used everywhere
 * a cover renders.
 */
export function BookCover({ coverUrl, title, className, priority }: BookCoverProps) {
  // Track the URL that failed (not a bare boolean) so a re-render with a
  // different cover automatically retries — no reset-on-prop-change effect.
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const failed = !!coverUrl && failedUrl === coverUrl

  if (!coverUrl || failed) {
    // All metrics are container-query-relative (1cqw = 1% of the slot's width) so
    // the placeholder scales proportionally from a ~108px shelf thumbnail to the
    // book-detail hero. `inset` is the shared padding / corner anchor.
    const inset = "clamp(8px, 10cqw, 28px)"
    return (
      <div
        className={cn("absolute inset-0 overflow-hidden", className)}
        style={{
          backgroundColor: "#ECE4D8",
          border: "1px solid rgba(31, 27, 22, 0.07)",
          borderRadius: "inherit",
          boxSizing: "border-box",
          containerType: "inline-size",
        }}
        aria-label={title}
        role="img"
      >
        {/* Top-aligned editorial title block. overflow:hidden clips an extreme
            title rather than letting it spill out of the slot. */}
        <div style={{ position: "absolute", inset: 0, padding: inset, boxSizing: "border-box", overflow: "hidden" }}>
          <span
            style={{
              display: "block",
              textAlign: "left",
              fontFamily: "var(--font-serif)",
              fontWeight: 500,
              color: "rgba(31, 27, 22, 0.9)",
              lineHeight: 1.16,
              fontSize: "clamp(11px, 13.5cqw, 34px)",
            }}
          >
            {title}
          </span>
          {/* Hairline rule directly under the title. */}
          <div
            style={{ width: "17cqw", height: "1px", backgroundColor: "rgba(31, 27, 22, 0.18)", margin: "7cqw 0" }}
          />
        </div>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverUrl}
      alt={`Cover of ${title}`}
      onError={() => setFailedUrl(coverUrl)}
      loading={priority ? "eager" : "lazy"}
      className={cn("absolute inset-0 h-full w-full object-cover", className)}
    />
  )
}
