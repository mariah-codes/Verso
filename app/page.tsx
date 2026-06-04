import Link from "next/link"

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center min-h-screen bg-background px-6">
      <h1
        className="text-7xl tracking-tight text-foreground"
        style={{ fontFamily: "var(--font-serif)" }}
      >
        Verso
      </h1>
      <p className="mt-4 text-sm text-foreground/50 font-sans tracking-widest uppercase">
        Your reading life, shared
      </p>

      <div className="mt-10 flex flex-col items-center gap-3 w-full max-w-xs">
        <Link
          href="/sign-up"
          className="w-full rounded-xl py-3 text-center text-sm font-medium text-white transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#9C4A2F" }}
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="w-full rounded-xl py-3 text-center text-sm font-medium text-foreground/70 border border-border transition-colors hover:bg-muted"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
