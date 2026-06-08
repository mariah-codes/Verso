import Image from "next/image"
import { BookOpen } from "lucide-react"

interface BookPreview {
  title: string
  coverUrl: string | null
}

interface PairwiseCompareProps {
  newBook: BookPreview
  existingBook: BookPreview  // the pivot
  questionNum: number        // 1-based (for progress)
  totalEstimate: number
  onChoice: (choice: "new" | "existing" | "tie") => void
}

export function PairwiseCompare({
  newBook,
  existingBook,
  questionNum,
  totalEstimate,
  onChoice,
}: PairwiseCompareProps) {
  return (
    <div className="flex flex-col items-center gap-6 px-5 py-8">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalEstimate }).map((_, i) => (
          <div
            key={i}
            className={[
              "h-1.5 rounded-full transition-all",
              i < questionNum - 1
                ? "w-4 bg-[#9C4A2F]"
                : i === questionNum - 1
                  ? "w-4 bg-[#9C4A2F]/60"
                  : "w-4 bg-muted",
            ].join(" ")}
          />
        ))}
        <span className="text-xs text-foreground/35 ml-1 font-sans tabular-nums">
          {questionNum}/{totalEstimate}
        </span>
      </div>

      {/* Prompt */}
      <p className="text-xs font-semibold tracking-widest uppercase text-foreground/40 font-sans text-center">
        Which did you love more?
      </p>

      {/* Side-by-side covers — tap a cover to choose it.
          Left = existing (pivot), right = new (stays fixed). */}
      <div className="flex gap-4 items-start">
        <BookCover book={existingBook} onClick={() => onChoice("existing")} />
        <div className="flex items-center self-center pt-8">
          <span className="text-foreground/20 text-xs font-sans">vs</span>
        </div>
        <BookCover book={newBook} onClick={() => onChoice("new")} accent />
      </div>

      {/* Too tough to call */}
      <button
        onClick={() => onChoice("tie")}
        className="rounded-xl border border-dashed border-border hover:bg-muted/40 active:scale-[0.98] px-5 py-2.5 text-center transition-all"
      >
        <span className="text-xs text-foreground/40 font-sans">Too tough to call</span>
      </button>
    </div>
  )
}

function BookCover({ book, onClick, accent }: { book: BookPreview; onClick: () => void; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center gap-2 w-[120px] focus-visible:outline-none"
    >
      <div
        className={[
          "relative w-[120px] aspect-[2/3] rounded-xl overflow-hidden shadow-md transition-all",
          "group-hover:shadow-lg group-active:scale-[0.97]",
          accent
            ? "ring-2 ring-[#9C4A2F]/40 group-hover:ring-[#9C4A2F]/70"
            : "group-hover:ring-2 group-hover:ring-foreground/20",
        ].join(" ")}
      >
        {book.coverUrl ? (
          <Image src={book.coverUrl} alt={book.title} fill sizes="120px" className="object-cover" />
        ) : (
          <div className="absolute inset-0 bg-muted flex flex-col items-center justify-center gap-1 px-2">
            <BookOpen className="size-6 text-muted-foreground/40" />
            <span className="text-xs text-center text-muted-foreground line-clamp-3 leading-tight">
              {book.title}
            </span>
          </div>
        )}
      </div>
      {/* Title beneath — small, muted, centered, 2 lines max */}
      <span className="text-xs text-foreground/55 text-center leading-snug line-clamp-2">
        {book.title}
      </span>
    </button>
  )
}
