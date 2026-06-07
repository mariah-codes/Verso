"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import {
  fetchFinishedOrdered,
  fetchShelf,
  fetchProfile,
  type ShelfBook,
} from "@/lib/profile"
import { ShelfBookCard, ShelfBookCardSkeleton } from "@/components/book/ShelfBookCard"

type View = "finished" | "want"

// How many cards to reveal per infinite-scroll page.
const PAGE_SIZE = 18

interface ShelfViewProps {
  userId: string
  /** Own shelf (reached via the tab) vs a friend's (reached via "see all"). */
  isOwn: boolean
}

/**
 * The full browsable archive for one user — own via the Shelf tab, a friend's
 * via "see all" on their profile. Two sub-views (Finished, ranked + infinite
 * scroll; Want to read, newest-first). DNF is never shown here, for anyone.
 *
 * Reads the initial sub-view from `?view=` so profile "see all" links can deep-
 * link straight to Finished or Want-to-read.
 */
export function ShelfView({ userId, isOwn }: ShelfViewProps) {
  const router = useRouter()
  const params = useSearchParams()
  const initialView: View = params.get("view") === "want" ? "want" : "finished"

  const [view, setView] = useState<View>(initialView)
  const [finished, setFinished] = useState<ShelfBook[] | null>(null)
  const [wantToRead, setWantToRead] = useState<ShelfBook[] | null>(null)
  const [displayName, setDisplayName] = useState<string | null>(null)

  // Infinite scroll: how many cards of the active list are currently revealed.
  const [shownCount, setShownCount] = useState(PAGE_SIZE)

  // ── Load ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetchFinishedOrdered(userId),
      fetchShelf(userId, "want_to_read"),
      isOwn ? Promise.resolve(null) : fetchProfile(userId),
    ]).then(([f, w, p]) => {
      if (cancelled) return
      setFinished(f)
      setWantToRead(w)
      if (p) setDisplayName(p.displayName)
    })
    return () => { cancelled = true }
  }, [userId, isOwn])

  // Reset the reveal window whenever the sub-view changes.
  useEffect(() => { setShownCount(PAGE_SIZE) }, [view])

  const loading = finished === null || wantToRead === null
  const activeList = view === "finished" ? finished : wantToRead
  const shown = activeList?.slice(0, shownCount) ?? []
  const hasMore = !!activeList && shownCount < activeList.length

  // ── Infinite-scroll sentinel ─────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const observe = useCallback((node: HTMLDivElement | null) => {
    sentinelRef.current = node
    if (!node) return
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) setShownCount((c) => c + PAGE_SIZE)
    }, { rootMargin: "400px" })
    io.observe(node)
    return () => io.disconnect()
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background pb-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm px-5 pt-4 pb-3">
        {isOwn ? (
          <h1
            className="text-2xl text-foreground"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Your shelf
          </h1>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="-ml-1 p-1 text-foreground/50 hover:text-foreground transition-colors"
            >
              <ChevronLeft className="size-5" />
            </button>
            <h1
              className="text-xl text-foreground truncate"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {displayName ? `${displayName}’s shelf` : "Shelf"}
            </h1>
          </div>
        )}

        {/* Segmented control */}
        <div className="mt-3 inline-flex rounded-xl bg-muted/60 p-0.5">
          <SegButton active={view === "finished"} onClick={() => setView("finished")}>
            Finished
          </SegButton>
          <SegButton active={view === "want"} onClick={() => setView("want")}>
            Want to read
          </SegButton>
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────────── */}
      <div className="px-5 pt-2">
        {loading ? (
          <Grid>
            {Array.from({ length: 9 }).map((_, i) => <ShelfBookCardSkeleton key={i} />)}
          </Grid>
        ) : shown.length === 0 ? (
          <p className="text-sm text-foreground/40 leading-relaxed py-10 text-center">
            {view === "finished"
              ? "No finished books yet."
              : "No books on the reading list."}
          </p>
        ) : (
          <>
            <Grid>
              {shown.map((book) => (
                <ShelfBookCard key={book.userBookId} book={book} sizes="(max-width: 640px) 30vw, 130px" />
              ))}
            </Grid>
            {hasMore && <div ref={observe} className="h-10" aria-hidden="true" />}
          </>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-6">{children}</div>
}

function SegButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className="rounded-[10px] px-4 py-1.5 text-xs font-medium transition-colors"
      style={
        active
          ? { backgroundColor: "#FAF8F4", color: "#9C4A2F", boxShadow: "0 1px 2px rgba(0,0,0,0.06)" }
          : { color: "color-mix(in srgb, var(--foreground) 45%, transparent)" }
      }
    >
      {children}
    </button>
  )
}
