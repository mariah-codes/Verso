"use client"

import { useEffect, useRef, useState } from "react"
import { Search, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useBookSearch } from "@/hooks/use-book-search"
import { BookCard, BookCardSkeleton } from "@/components/book/BookCard"
import { BookActionMenu, type BookAddedIds } from "@/components/book/BookActionMenu"
import { RankingFlow, type NewBookInfo } from "@/components/ranking/RankingFlow"
import type { BookSearchResult } from "@/lib/open-library"
import type { BookStatus } from "@/lib/books"

// ── Toast labels ──────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<BookStatus, string> = {
  finished:     "Marked as read",
  reading:      "Added to currently reading",
  want_to_read: "Saved to want-to-read",
  dnf:          "Added to DNF",
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const { query, setQuery, results, isLoading, error } = useBookSearch()
  const [userId, setUserId]               = useState<string | null>(null)
  const [selectedBook, setSelectedBook]   = useState<BookSearchResult | null>(null)
  const [rankingBook, setRankingBook]     = useState<NewBookInfo | null>(null)
  const [toast, setToast]                 = useState<string | null>(null)
  const inputRef                          = useRef<HTMLInputElement>(null)
  const toastTimer                        = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  function showToast(message: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(message)
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }

  function handleSuccess(
    book: BookSearchResult,
    status: BookStatus,
    ids: BookAddedIds,
  ) {
    if (status === "finished") {
      // Close the action sheet then open the ranking flow full-screen
      setSelectedBook(null)
      setRankingBook({
        bookId:     ids.bookId,
        userBookId: ids.userBookId,
        title:      book.title,
        coverUrl:   book.coverUrl ?? null,
      })
    } else {
      showToast(`${STATUS_LABELS[status]}: ${book.title}`)
    }
  }

  function clearQuery() {
    setQuery("")
    inputRef.current?.focus()
  }

  const showSkeletons = isLoading
  const showEmpty     = !isLoading && !!query.trim() && results.length === 0 && !error
  const showPrompt    = !query.trim() && !isLoading
  const showResults   = results.length > 0 && !isLoading

  return (
    <>
      <div className="flex flex-col min-h-screen bg-background">
        {/* ── Sticky search bar ─────────────────────────────────────────── */}
        <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
          <div className="relative flex items-center">
            <Search className="absolute left-3 size-4 text-foreground/40 pointer-events-none" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by title, author, or ISBN…"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              className={[
                "w-full h-10 rounded-xl border border-input bg-muted/50",
                "pl-9 pr-9 text-sm text-foreground placeholder:text-foreground/40",
                "outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all",
              ].join(" ")}
            />
            {query && (
              <button
                onClick={clearQuery}
                aria-label="Clear search"
                className="absolute right-3 text-foreground/40 hover:text-foreground transition-colors"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 px-4 py-5">
          {showPrompt && (
            <div className="flex flex-col items-center justify-center pt-20 gap-3 text-center">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Search className="size-6 text-foreground/30" />
              </div>
              <p className="text-xl text-foreground/80" style={{ fontFamily: "var(--font-serif)" }}>
                Find your next book
              </p>
              <p className="text-sm text-foreground/50 max-w-xs leading-relaxed">
                Search Open Library&apos;s catalogue of millions of books and add them to your shelf.
              </p>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive text-center pt-10">{error}</p>
          )}

          {showSkeletons && (
            <div className="grid grid-cols-3 gap-x-3 gap-y-6">
              {Array.from({ length: 9 }).map((_, i) => (
                <BookCardSkeleton key={i} />
              ))}
            </div>
          )}

          {showEmpty && (
            <div className="flex flex-col items-center justify-center pt-16 gap-3 text-center">
              <p className="text-xl text-foreground/70" style={{ fontFamily: "var(--font-serif)" }}>
                No books found
              </p>
              <p className="text-sm text-foreground/50">Try a different title or author name.</p>
            </div>
          )}

          {showResults && (
            <>
              <p className="text-xs text-foreground/40 mb-4 font-sans tracking-wide">
                {results.length} result{results.length !== 1 ? "s" : ""} for &ldquo;{query}&rdquo;
              </p>
              <div className="grid grid-cols-3 gap-x-3 gap-y-6">
                {results.map((book) => (
                  <BookCard key={book.openLibraryId} book={book} onClick={() => setSelectedBook(book)} />
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ── Action sheet ──────────────────────────────────────────────────── */}
      {userId && (
        <BookActionMenu
          book={selectedBook}
          userId={userId}
          onClose={() => setSelectedBook(null)}
          onSuccess={handleSuccess}
        />
      )}

      {/* ── Ranking flow ──────────────────────────────────────────────────── */}
      {rankingBook && userId && (
        <RankingFlow
          book={rankingBook}
          userId={userId}
          onClose={() => setRankingBook(null)}
          onComplete={() => showToast(`Ranked: ${rankingBook.title}`)}
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <div
        aria-live="polite"
        aria-atomic="true"
        className={[
          "fixed bottom-6 inset-x-4 z-50 flex justify-center pointer-events-none",
          "transition-all duration-300",
          toast ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
        ].join(" ")}
      >
        <div className="bg-foreground text-background text-sm font-medium px-4 py-2.5 rounded-xl shadow-lg max-w-sm text-center">
          {toast}
        </div>
      </div>
    </>
  )
}
