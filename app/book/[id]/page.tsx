// Placeholder — full book detail page comes on Day 5 with ranking.
export default function BookPage({ params }: { params: { id: string } }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <p className="text-sm text-foreground/40 font-sans">
        Book detail coming soon · {params.id}
      </p>
    </div>
  )
}
