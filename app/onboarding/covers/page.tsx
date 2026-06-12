"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Check } from "lucide-react"
import { ONBOARDING_BOOKS, onboardingCoverUrl, SELECTION_KEY } from "@/lib/onboarding-books"

export default function OnboardingCovers() {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleContinue() {
    const ids = ONBOARDING_BOOKS.filter((b) => selected.has(b.id)).map((b) => b.id)
    if (ids.length === 0) {
      // Nothing to rank — skip the game and the celebration beat.
      router.push("/onboarding/friends")
      return
    }
    sessionStorage.setItem(SELECTION_KEY, JSON.stringify(ids))
    router.push("/onboarding/rank")
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Heading */}
      <div className="px-5 pt-2 pb-4 shrink-0">
        <h1 className="text-3xl text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Which have you read?
        </h1>
        <p className="text-sm text-foreground/55 mt-2">
          The more you add, the better your taste match. Aim for 10+.
        </p>
      </div>

      {/* Scrolling grid — pb-4 only: the CTA below is a flex footer, not an
          overlay, so the grid needs just normal end spacing (no void). */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        <div className="grid grid-cols-3 gap-3">
          {ONBOARDING_BOOKS.map((b) => {
            const url = onboardingCoverUrl(b.coverId, "M")
            const on = selected.has(b.id)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => toggle(b.id)}
                aria-pressed={on}
                aria-label={b.title}
                className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted text-left"
              >
                {url ? (
                  <Image src={url} alt="" fill sizes="120px" className="object-cover" unoptimized />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] text-foreground/40">
                    {b.title}
                  </span>
                )}
                {/* Selection ring — outline, offset, never dims the cover */}
                {on && (
                  <span
                    className="absolute inset-0 rounded-lg pointer-events-none"
                    style={{ boxShadow: "inset 0 0 0 2.5px #9C4A2F", outline: "2px solid #9C4A2F", outlineOffset: "2px" }}
                  />
                )}
                {/* Check badge */}
                {on && (
                  <span
                    className="absolute top-1.5 right-1.5 size-5 rounded-full flex items-center justify-center shadow"
                    style={{ backgroundColor: "#9C4A2F" }}
                  >
                    <Check className="size-3.5 text-white" strokeWidth={3} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* CTA footer — always tappable (works at 0), live count. Light terracotta
          at rest, full #9C4A2F once a book is selected (the app's primary-button
          treatment, via opacity like the review/comment submit buttons). */}
      <div className="shrink-0 border-t border-border/50 bg-background px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
        <button
          onClick={handleContinue}
          className={`w-full rounded-xl py-3.5 text-base font-medium text-white transition-opacity ${
            selected.size > 0 ? "opacity-100" : "opacity-40"
          }`}
          style={{ backgroundColor: "#9C4A2F" }}
        >
          Continue{selected.size > 0 ? ` · ${selected.size} selected` : ""}
        </button>
      </div>
    </div>
  )
}
