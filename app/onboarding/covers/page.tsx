"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { Check } from "lucide-react"
import { ONBOARDING_BOOKS, onboardingCoverUrl, SELECTION_KEY } from "@/lib/onboarding-books"

export default function OnboardingCovers() {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Viewport-fixed bottom-fade scroll hint: signals "there's more below" the
  // moment the page loads (the grid runs past the fold), and fades out once the
  // window is scrolled to within ~60px of the bottom — by then the Continue
  // button at the end of the page is naturally in view.
  const [showFade, setShowFade] = useState(true)

  useEffect(() => {
    const update = () => {
      const doc = document.documentElement
      const nearBottom = window.innerHeight + window.scrollY >= doc.scrollHeight - 60
      // Also hide if the page doesn't overflow (nothing to scroll).
      setShowFade(!nearBottom && doc.scrollHeight > window.innerHeight + 1)
    }
    update()
    window.addEventListener("scroll", update, { passive: true })
    window.addEventListener("resize", update)
    return () => {
      window.removeEventListener("scroll", update)
      window.removeEventListener("resize", update)
    }
  }, [])

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
    <div className="flex flex-col">
      {/* Heading */}
      <div className="px-5 pt-2 pb-4">
        <h1 className="text-3xl text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Which have you read?
        </h1>
        <p className="text-sm text-foreground/55 mt-2">
          The more you add, the better your taste match. Aim for 10+.
        </p>
      </div>

      {/* Grid — flows in the document; the page scrolls on the window. */}
      <div className="px-5 pb-6">
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
                    <Check className="size-3.5 text-white" strokeWidth={1.75} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* CTA — at the natural end of the page; comes into view at the bottom of
          the scroll (which is also when the fade hint clears). Live count; light
          terracotta at rest, full #9C4A2F once a book is selected. */}
      <div className="border-t border-border/50 bg-background px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
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

      {/* Bottom-fade scroll hint — viewport-fixed at the bottom of the screen,
          above the grid but below nav chrome. pointer-events off so taps pass
          through to covers. Fades out near the bottom (Continue in view). */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 h-20 z-30 transition-opacity duration-300"
        style={{
          background: "linear-gradient(to bottom, rgba(250,248,244,0), #FAF8F4)",
          opacity: showFade ? 1 : 0,
        }}
      />
    </div>
  )
}
