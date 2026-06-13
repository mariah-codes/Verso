import Link from "next/link"
import Image from "next/image"
import { BookOpen, AlignLeft } from "lucide-react"
import { cn } from "@/lib/utils"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import type { ShelfBook } from "@/lib/profile"

interface ShelfBookCardProps {
  book: ShelfBook
  /** Tailwind width class — caller controls size so the card works in both
   *  horizontal scroll rows and the finished grid. */
  className?: string
  /** next/image sizes hint — should match the rendered CSS width */
  sizes?: string
}

/**
 * A tappable book card for shelf sections on /me.
 * Routes to /book/[id] using the Supabase book UUID.
 */
export function ShelfBookCard({
  book,
  className,
  sizes = "110px",
}: ShelfBookCardProps) {
  return (
    <Link
      href={`/book/${book.bookId}`}
      className={cn(
        "group flex flex-col gap-2 shrink-0 focus-visible:outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring rounded-lg",
        className
      )}
    >
      {/* Cover */}
      <div className="relative w-full aspect-[2/3] rounded-lg overflow-hidden bg-muted shadow-sm transition-shadow group-hover:shadow-md">
        {book.coverUrl ? (
          <Image
            src={book.coverUrl}
            alt={`Cover of ${book.title}`}
            fill
            sizes={sizes}
            className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-muted px-2">
            <BookOpen className="size-5 text-muted-foreground opacity-40"  strokeWidth={1.75} />
            <span className="text-[10px] text-muted-foreground text-center leading-snug line-clamp-3">
              {book.title}
            </span>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="space-y-0.5 px-0.5">
        {/* Title + score on one row: title (flex-1) absorbs all width and is the
            only element that truncates; the score + review glyph are grouped
            shrink-0 on the right. The AlignLeft glyph sits right after the score
            — muted terracotta so it reads as "your writing here", not a grey
            system icon. */}
        <div className="flex items-baseline justify-between gap-1">
          <p className="flex-1 min-w-0 text-[15px] text-foreground leading-snug truncate font-serif tracking-[0.01em]">
            {book.title}
          </p>
          {book.status === "finished" && (book.score !== null || book.hasPublicNote) && (
            <span className="flex items-center gap-[3px] shrink-0">
              {book.score !== null && <ScoreDisplay score={book.score} className="text-sm shrink-0" />}
              {book.hasPublicNote && (
                <AlignLeft className="size-[10px] shrink-0" style={{ color: "#B0623F" }}  strokeWidth={1.75} />
              )}
            </span>
          )}
        </div>
        <p className="text-xs text-foreground/55 line-clamp-1">
          {book.author}
        </p>
      </div>
    </Link>
  )
}

export function ShelfBookCardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2 shrink-0", className)}>
      <div className="w-full aspect-[2/3] rounded-lg bg-muted animate-pulse" />
      <div className="space-y-1 px-0.5">
        <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-3/5 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
