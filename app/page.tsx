import type { Metadata, Viewport } from "next"
import Link from "next/link"

/**
 * Signed-out entry / welcome screen — terracotta, centered, editorial.
 *
 * Full-bleed terracotta filling the viewport behind the safe-area insets; the
 * brand (wordmark + tagline) sits high-center, a wide cream "horizon" line mark
 * sits low and separate beneath it, and the inverted CTAs ground the bottom.
 * The wordmark is Cormorant Garamond (landing-only); the tagline is EB Garamond.
 */

// Per-route overrides — ONLY this screen is light-on-terracotta. The rest of the
// app stays dark-on-cream, so these don't touch the global config:
//  • statusBarStyle "black-translucent" → white iOS status-bar text over our bg.
//  • themeColor terracotta → Safari's chrome tints to match instead of cream.
export const metadata: Metadata = {
  appleWebApp: { capable: true, title: "Verso", statusBarStyle: "black-translucent" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#9C4A2F",
}

export default function Home() {
  return (
    // Terracotta fills 100dvh INCLUDING behind the insets; safe-area padding is
    // applied inside so nothing letterboxes the background.
    <main className="flex min-h-[100dvh] flex-col items-center bg-[#9C4A2F] px-6 pt-[env(safe-area-inset-top)] pb-[calc(env(safe-area-inset-bottom)+44px)]">
      {/* Spacer 2.6 */}
      <div className="flex-[2.6]" />

      {/* Wordmark + tagline — centered, one locked unit. */}
      <div className="text-center">
        <h1
          className="text-[clamp(56px,21vw,88px)] leading-none text-[#FAF8F4]"
          style={{ fontFamily: "var(--font-cormorant)" }}
        >
          Verso
        </h1>
        <p
          className="mt-3 whitespace-nowrap text-[17px] leading-snug"
          style={{ fontFamily: "var(--font-serif)", color: "rgba(250,248,244,0.82)" }}
        >
          Reading is better with friends.
        </p>
      </div>

      {/* Spacer 1.3 */}
      <div className="flex-[1.3]" />

      {/* Wide line mark — a low cream "horizon", full content width, separate from
          the wordmark. viewBox stretches to 100% width with a shallow central cusp. */}
      <svg
        viewBox="0 0 300 16"
        fill="none"
        aria-hidden="true"
        className="block w-full"
      >
        <path
          d="M2 6 Q 146 6 150 12 Q 154 6 298 6"
          stroke="#FAF8F4"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>

      {/* Spacer 2.6 */}
      <div className="flex-[2.6]" />

      {/* CTAs — inverted primary (cream fill, terracotta text), grounded bottom. */}
      <div className="w-full">
        <Link
          href="/sign-up"
          className="flex h-14 w-full items-center justify-center rounded-[14px] text-base font-medium transition-opacity hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#FAF8F4", color: "#9C4A2F" }}
        >
          Get started
        </Link>
        <div className="mt-5 text-center">
          <Link
            href="/sign-in"
            className="text-base text-[#FAF8F4] transition-opacity hover:opacity-80"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
  )
}
