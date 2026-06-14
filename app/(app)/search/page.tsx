"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Search, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useBookSearch } from "@/hooks/use-book-search"
import { BookCard, BookCardSkeleton } from "@/components/book/BookCard"
import { BookActionMenu, type BookAddedIds } from "@/components/book/BookActionMenu"
import { RankingFlow, type NewBookInfo } from "@/components/ranking/RankingFlow"
import { Toast, useToast } from "@/components/shared/Toast"
import type { BookSearchResult } from "@/lib/open-library"
import type { BookStatus } from "@/lib/books"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SearchPage() {
  const router = useRouter()
  const { query, setQuery, results, isLoading, error } = useBookSearch()
  const [userId, setUserId]               = useState<string | null>(null)
  const [selectedBook, setSelectedBook]   = useState<BookSearchResult | null>(null)
  const [rankingBook, setRankingBook]     = useState<NewBookInfo | null>(null)
  const inputRef                          = useRef<HTMLInputElement>(null)

  const [toastPayload, showToast, dismissToast] = useToast()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

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
    } else if (status === "dnf") {
      // DNF: no ranking flow (the menu already closes itself for non-finished);
      // fire the existing DNF toast. Row written by addBookToShelf matches the
      // dropdown/sheet DNF paths (status='dnf', visibility 'visible', null ranking).
      showToast({ variant: "dnf", bookTitle: book.title })
    } else {
      showToast({ variant: "status", status, bookTitle: book.title })
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
            <Search className="absolute left-3 size-4 text-foreground/40 pointer-events-none" strokeWidth={1.75} />
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
                <X className="size-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* ── Main content ──────────────────────────────────────────────── */}
        <main className="flex-1 px-4 py-5">
          {showPrompt && (
            <div className="flex flex-col items-center justify-center pt-20 gap-3 text-center">
              <div className="size-14 rounded-full flex items-center justify-center" style={{ backgroundColor: "#F0EAE0" }}>
                <Search className="size-6" style={{ color: "#B7AE9F" }} strokeWidth={1.75} />
              </div>
              <p className="text-xl text-foreground/70" style={{ fontFamily: "var(--font-serif)" }}>
                Find your next book
              </p>
              <p className="text-sm text-foreground/55 max-w-xs leading-relaxed">
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
              <p className="text-sm text-foreground/55">Try a different title or author name.</p>
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
          onExisting={(bookId) => {
            // Already on the shelf — go to its detail page (which surfaces a
            // toast) instead of re-ranking it.
            setSelectedBook(null)
            router.push(`/book/${bookId}?added=exists`)
          }}
        />
      )}

      {/* ── Ranking flow ──────────────────────────────────────────────────── */}
      {rankingBook && userId && (
        <RankingFlow
          book={rankingBook}
          userId={userId}
          onClose={() => setRankingBook(null)}
          onComplete={() =>
            showToast({ variant: "status", status: "finished", bookTitle: rankingBook.title })
          }
        />
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      <Toast payload={toastPayload} onDismiss={dismissToast} />
    </>
  )
}
