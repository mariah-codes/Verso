import { BookCover } from "@/components/book/BookCover"
import type { BookSearchResult } from "@/lib/open-library"

interface BookCardProps {
  book: BookSearchResult
  onClick: () => void
}

/**
 * Search result card — ~130 px wide, prominent cover, compact metadata below.
 * Width is fixed so the grid stays predictable across screen sizes.
 */
export function BookCard({ book, onClick }: BookCardProps) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col gap-2 text-left w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      {/* Cover — 2:3 portrait ratio, fixed to card width */}
      <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm transition-shadow group-hover:shadow-md">
        <BookCover
          coverUrl={book.coverUrl}
          title={book.title}
          className="transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>

      {/* Metadata — tight, two lines max */}
      <div className="space-y-0.5 px-0.5">
        <p className="text-[15px] text-foreground leading-tight line-clamp-2 font-serif tracking-[0.01em]">
          {book.title}
        </p>
        <p className="text-[10px] text-foreground/55 line-clamp-1">{book.author}</p>
      </div>
    </button>
  )
}

/** Skeleton placeholder shown while search results are loading */
export function BookCardSkeleton() {
  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="w-full aspect-[2/3] rounded-lg bg-muted animate-pulse" />
      <div className="space-y-1 px-0.5">
        <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
