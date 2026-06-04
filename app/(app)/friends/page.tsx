export default function FriendsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 gap-2">
      <h1
        className="text-2xl text-foreground/70"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Friends
      </h1>
      <p className="text-sm text-foreground/40 font-sans">
        Taste-match scores &amp; friend shelves — coming soon.
      </p>
    </div>
  )
}
