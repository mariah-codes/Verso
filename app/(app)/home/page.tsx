export default function HomePage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-2">
      <h1
        className="text-2xl text-foreground/70"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Home
      </h1>
      <p className="text-sm text-foreground/40 font-sans">
        Weekly picks &amp; friend activity — coming soon.
      </p>
    </div>
  )
}
