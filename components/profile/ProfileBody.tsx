"use client"

import { useState } from "react"
import Link from "next/link"
import { Trophy, BookOpen, Bookmark, BookX, Award, ChevronDown, ChevronRight } from "lucide-react"
import { ShelfBookCard } from "@/components/book/ShelfBookCard"
import type { ShelfBook } from "@/lib/profile"

// Every card across previews and the Shelf grid renders at the same width.
const CARD_SIZES = "(max-width: 640px) 30vw, 130px"

interface ProfileBodyProps {
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  /** Full finished list in canonical overall order — only the top 3 preview. */
  finished: ShelfBook[]
  dnf: ShelfBook[]
  /** Base path of this user's Shelf: "/shelf" (own) or `/user/${id}/shelf`. */
  shelfBasePath: string
  /** Own profile shows the DNF row + any per-reading action; friend hides both. */
  isOwn: boolean
  /** Optional extra rendered under each currently-reading card (e.g. "Mark
   *  finished" on the own profile). */
  renderReadingExtra?: (book: ShelfBook) => React.ReactNode
}

/**
 * The shared profile body — fixed section order for both own and friend
 * profiles: Top 3 → Currently reading → Want to read → Milestones → DNF (own
 * only). Headers live in the page; this owns everything below the taste line.
 */
export function ProfileBody({
  reading,
  wantToRead,
  finished,
  dnf,
  shelfBasePath,
  isOwn,
  renderReadingExtra,
}: ProfileBodyProps) {
  const top3 = finished.slice(0, 3)
  const wantPreview = wantToRead.slice(0, 3)
  const readingPreview = reading.slice(0, 3)

  return (
    <div className="space-y-8 px-5">
      {/* ── Top 3 ──────────────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Trophy className="size-4" />}
          title="Finished — Top 3"
          seeAll={{ href: `${shelfBasePath}?view=finished`, total: finished.length }}
        />
        {top3.length === 0 ? (
          <EmptyLine>No finished books yet.</EmptyLine>
        ) : (
          <PreviewGrid>
            {top3.map((book) => (
              <ShelfBookCard key={book.userBookId} book={book} sizes={CARD_SIZES} />
            ))}
          </PreviewGrid>
        )}
      </section>

      {/* ── Currently reading ──────────────────────────────────────────────── */}
      <section>
        <SectionHeader icon={<BookOpen className="size-4" />} title="Currently reading" />
        {readingPreview.length === 0 ? (
          <EmptyLine>Nothing on the nightstand right now.</EmptyLine>
        ) : (
          <PreviewGrid>
            {readingPreview.map((book) => (
              <div key={book.userBookId} className="flex flex-col gap-2">
                <ShelfBookCard book={book} sizes={CARD_SIZES} />
                {renderReadingExtra?.(book)}
              </div>
            ))}
          </PreviewGrid>
        )}
      </section>

      {/* ── Want to read ───────────────────────────────────────────────────── */}
      <section>
        <SectionHeader
          icon={<Bookmark className="size-4" />}
          title="Want to read"
          seeAll={{ href: `${shelfBasePath}?view=want`, total: wantToRead.length }}
        />
        {wantPreview.length === 0 ? (
          <EmptyLine>No books on the reading list.</EmptyLine>
        ) : (
          <PreviewGrid>
            {wantPreview.map((book) => (
              <ShelfBookCard key={book.userBookId} book={book} sizes={CARD_SIZES} />
            ))}
          </PreviewGrid>
        )}
      </section>

      {/* ── Milestones (existing placeholder, unchanged) ───────────────────── */}
      <section>
        <SectionHeader icon={<Award className="size-4" />} title="Milestones" />
        <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center space-y-1">
          <p className="text-sm text-foreground/40 font-sans">Milestones coming soon</p>
          <p className="text-xs text-foreground/30">Reading streaks, first book, 10-book club…</p>
        </div>
      </section>

      {/* ── DNF (own profile only) — header always shows so a new reader sees
          the shelf exists; the list/chevron appear once there's ≥1 book. ───── */}
      {isOwn && <DnfRow dnf={dnf} />}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionHeader({
  icon,
  title,
  seeAll,
}: {
  icon: React.ReactNode
  title: string
  /** When provided, renders a quiet "see all" link — hidden when total ≤ 3
   *  (the preview already shows everything in that case). */
  seeAll?: { href: string; total: number }
}) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="text-foreground/40">{icon}</span>
      <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/60 font-sans">
        {title}
      </h2>
      {seeAll && seeAll.total > 3 && (
        <Link
          href={seeAll.href}
          className="ml-auto flex items-center gap-0.5 text-xs text-foreground/50 hover:text-foreground/70 transition-colors"
        >
          see all
          <ChevronRight className="size-3" />
        </Link>
      )}
    </div>
  )
}

/** A single row of three cards — same grid the Shelf uses, so sizes match. */
function PreviewGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-3 gap-x-3 gap-y-6">{children}</div>
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-foreground/40 leading-relaxed py-1">{children}</p>
}

/**
 * Own-only "DNF" section. Same header treatment as Milestones / Want
 * to read (icon + uppercase label), with the count + privacy note as a subtitle
 * beneath. Collapsed by default; tapping the header expands the list in place.
 *
 * The header (icon + "DNF") + subtitle ALWAYS render, even with zero books, so a
 * new reader sees the shelf exists. When empty: subtitle reads "No books yet",
 * the chevron is hidden, and the header isn't interactive (nothing to reveal).
 * DNF deliberately never appears in the Shelf, for anyone. "DNF without shame":
 * neutral charcoal/muted, no error styling.
 */
function DnfRow({ dnf }: { dnf: ShelfBook[] }) {
  const [open, setOpen] = useState(false)
  const hasBooks = dnf.length > 0

  const header = (
    <>
      <div className="flex items-center gap-2">
        <span className="text-foreground/40">
          <BookX className="size-4" />
        </span>
        <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/60 font-sans">
          DNF
        </h2>
        {hasBooks && (
          <ChevronDown
            className={`ml-auto size-4 text-foreground/30 transition-transform ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>
      <p className="mt-1 text-xs text-foreground/40 font-sans tabular-nums group-hover:text-foreground/55 transition-colors">
        {hasBooks
          ? `${dnf.length} book${dnf.length !== 1 ? "s" : ""} · only you can see these`
          : "No books yet"}
      </p>
    </>
  )

  return (
    <section className="pt-2">
      {hasBooks ? (
        <button
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="w-full text-left group"
        >
          {header}
        </button>
      ) : (
        <div className="w-full">{header}</div>
      )}
      {hasBooks && open && (
        <div className="mt-4">
          <PreviewGrid>
            {dnf.map((book) => (
              <ShelfBookCard key={book.userBookId} book={book} sizes={CARD_SIZES} />
            ))}
          </PreviewGrid>
        </div>
      )}
    </section>
  )
}
