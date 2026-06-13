import Link from "next/link"

/**
 * Signed-out entry / welcome screen.
 *
 * Brand block (open-book line mark → wordmark → tagline) is vertically centered
 * in the viewport; the two CTAs are anchored near the bottom, safe-area aware.
 * The mark is the committed "line B" path — the same abstract cusped line used
 * on the OG share card — so the landing and share card stay consistent.
 */
export default function Home() {
  return (
    <main className="flex min-h-[100dvh] flex-col bg-background px-6">
      {/* ── Brand block — vertically centered ──────────────────────────────── */}
      <div className="flex flex-1 flex-col items-center justify-center">
        {/* Open-book line mark (brand "line B" — reused from the OG card). */}
        <svg
          width="130"
          height="29"
          viewBox="0 0 360 80"
          fill="none"
          aria-hidden="true"
          className="mb-5"
        >
          <path
            d="M16,40 C100,26 150,31 174,51 C178,55 182,55 186,51 C210,31 260,26 344,40"
            stroke="#9C4A2F"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>

        {/* Wordmark */}
        <h1
          className="text-[54px] leading-none text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Verso
        </h1>

        {/* Tagline — roman EB Garamond, muted warm grey. */}
        <p
          className="mt-3 text-[18px] leading-snug text-[#6E665B]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Reading is better with friends.
        </p>
      </div>

      {/* ── CTAs — anchored near the bottom, safe-area aware ────────────────── */}
      <div className="mx-auto w-full max-w-sm flex flex-col gap-3 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <Link
          href="/sign-up"
          className="w-full rounded-xl py-3.5 text-center text-base font-medium transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#9C4A2F", color: "#FAF8F4" }}
        >
          Get started
        </Link>
        <Link
          href="/sign-in"
          className="w-full rounded-xl border border-[rgba(31,27,22,0.18)] py-3.5 text-center text-base font-medium text-foreground transition-colors hover:bg-foreground/[0.03]"
        >
          Sign in
        </Link>
      </div>
    </main>
  )
}
