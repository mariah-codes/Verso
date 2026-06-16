"use client"

import { useEffect, useRef, useState } from "react"
import { X, CheckCheck, BookOpen, Bookmark, BookX } from "lucide-react"
import { BookCover } from "@/components/book/BookCover"
import { addBookToShelf, type BookStatus } from "@/lib/books"
import type { BookSearchResult } from "@/lib/open-library"

export interface BookAddedIds {
  bookId: string
  userBookId: string
}

interface BookActionMenuProps {
  book: BookSearchResult | null
  userId: string
  onClose: () => void
  /** Called after a successful shelf add. ids contains the Supabase row IDs
   *  so the caller can open the ranking flow without another round-trip. */
  onSuccess: (book: BookSearchResult, status: BookStatus, ids: BookAddedIds) => void
  /** Called when the book is already on the user's shelf and we declined to
   *  re-add / re-rank it — the caller routes to that book's detail page. */
  onExisting: (bookId: string) => void
}

const STATUS_OPTIONS: {
  status: BookStatus
  Icon: React.ElementType
  label: string
}[] = [
  { status: "want_to_read", label: "Want to read",       Icon: Bookmark   },
  { status: "reading",      label: "Currently reading", Icon: BookOpen   },
  { status: "finished",     label: "Finished",           Icon: CheckCheck },
  { status: "dnf",          label: "Did not finish",     Icon: BookX      },
]

/**
 * Mobile-first bottom sheet that lets the user pick a shelf status for a book.
 * Traps focus and restores it on close.
 */
export function BookActionMenu({
  book,
  userId,
  onClose,
  onSuccess,
  onExisting,
}: BookActionMenuProps) {
  const [submitting, setSubmitting] = useState<BookStatus | null>(null)
  const [sheetError, setSheetError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const isOpen = !!book

  // Focus the panel when it opens so keyboard / screen-reader users can use it
  useEffect(() => {
    if (isOpen) {
      panelRef.current?.focus()
      setSheetError(null)
    }
  }, [isOpen])

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [isOpen, onClose])

  async function handleSelect(status: BookStatus) {
    if (!book || submitting) return
    setSubmitting(status)
    setSheetError(null)

    const { error, bookId, userBookId, alreadyOnShelf } = await addBookToShelf(book, status, userId)

    setSubmitting(null)

    if (error || !bookId || !userBookId) {
      setSheetError(error ?? "Something went wrong")
      return
    }

    // Already on the shelf — don't re-rank. Route to the book's detail page.
    if (alreadyOnShelf) {
      onExisting(bookId)
      onClose()
      return
    }

    onSuccess(book, status, { bookId, userBookId })
    // For "finished" the parent will open the ranking flow — don't close here;
    // the parent controls when to close so the sheet doesn't flicker.
    if (status !== "finished") onClose()
  }

  return (
    <>
      {/* ── Backdrop ─────────────────────────────────────────────────────── */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          "fixed inset-0 z-40 bg-black/40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        ].join(" ")}
      />

      {/* ── Sheet panel ──────────────────────────────────────────────────── */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Add to shelf"
        tabIndex={-1}
        className={[
          "fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-background",
          "shadow-[0_-4px_32px_rgba(0,0,0,0.12)] outline-none",
          "transition-transform duration-300 ease-out",
          isOpen ? "translate-y-0" : "translate-y-full",
        ].join(" ")}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="h-1 w-10 rounded-full bg-foreground/10" />
        </div>

        {/* Book preview header */}
        {book && (
          <div className="flex items-start gap-4 px-5 pt-3 pb-4 border-b border-border">
            {/* Mini cover */}
            <div className="relative w-12 aspect-[2/3] rounded-lg overflow-hidden bg-muted shrink-0">
              <BookCover coverUrl={book.coverUrl} title={book.title} />
            </div>

            {/* Title / author */}
            <div className="flex-1 min-w-0 pt-0.5 space-y-0.5">
              <p
                className="text-[17px] font-medium text-foreground leading-snug line-clamp-2 tracking-[0.01em]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {book.title}
              </p>
              <p className="text-sm text-foreground/60 line-clamp-1">
                {book.author}
                {book.year ? ` · ${book.year}` : ""}
              </p>
            </div>

            {/* Close button */}
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 p-1 -mr-1 rounded-full text-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="size-5"  strokeWidth={1.75} />
            </button>
          </div>
        )}

        {/* Status options */}
        <div className="px-4 py-3 space-y-2">
          {STATUS_OPTIONS.map(({ status, label, Icon }) => {
            const isThis = submitting === status
            const anySubmitting = submitting !== null

            return (
              <button
                key={status}
                onClick={() => handleSelect(status)}
                disabled={anySubmitting}
                className={[
                  "flex items-center gap-3 w-full rounded-xl px-4 py-4",
                  "text-sm font-medium text-left transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  isThis
                    ? "bg-[#9C4A2F]/10 text-[#9C4A2F]"
                    : "bg-muted/60 hover:bg-muted text-foreground/70",
                ].join(" ")}
              >
                {isThis ? (
                  <Spinner />
                ) : (
                  <Icon className="size-5 shrink-0" strokeWidth={1.75} />
                )}
                {label}
              </button>
            )
          })}
        </div>

        {sheetError && (
          <p className="px-5 pb-4 text-sm text-destructive text-center">
            {sheetError}
          </p>
        )}

        {/* Safe area spacer for devices with home indicator */}
        <div className="pb-safe h-6" />
      </div>
    </>
  )
}

function Spinner() {
  return (
    <svg
      className="size-5 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {/* Faint full circle — track */}
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="#9C4A2F"
        strokeWidth="2.5"
        strokeOpacity="0.2"
      />
      {/* ~270° arc — the spinning head */}
      <path
        d="M12 3a9 9 0 0 1 9 9"
        stroke="#9C4A2F"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  )
}
