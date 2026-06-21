import type { Metadata, Viewport } from "next"
import { Inter, EB_Garamond, Cormorant_Garamond } from "next/font/google"
import "./globals.css"
import { PreventZoom } from "@/components/shared/PreventZoom"

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
})

const ebGaramond = EB_Garamond({
  variable: "--font-serif",
  subsets: ["latin"],
  display: "swap",
})

// Landing/marketing WORDMARK only — never applied in-app (EB Garamond stays the
// in-app serif). Exposed as --font-cormorant; used solely on the "Verso" wordmark.
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  weight: "500",
  subsets: ["latin"],
  display: "swap",
})

// ── Viewport ──────────────────────────────────────────────────────────────────
// Separate export from `metadata` — required by Next.js 15 (themeColor and
// viewport config moved out of metadata in v14; putting them in metadata emits
// a deprecation warning and they're ignored in v15).

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Required for env(safe-area-inset-*) to report real values (home-bar inset)
  // in the installed standalone PWA — without it the insets are always 0.
  viewportFit: "cover",
  themeColor: "#FAF8F4",
}

// ── Metadata ──────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Verso",
  description: "Find your next book through the friends whose taste you actually trust",

  // PWA manifest — tells the browser this is an installable app.
  manifest: "/manifest.json",

  // iOS PWA — makes "Add to Home Screen" on iPhone behave like a native app:
  // no browser chrome, correct title on the home screen, default status bar.
  // `appleWebApp` emits `mobile-web-app-capable` + title + status bar style.
  // `other` adds the older `apple-mobile-web-app-capable` for max compatibility
  // with iOS versions that predate the W3C-aligned tag.
  appleWebApp: {
    capable: true,
    title: "Verso",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },

  // Favicon (app/favicon.ico) and the iOS home-screen icon (app/apple-icon.png)
  // are wired via the App Router file conventions — Next emits the <link> tags
  // automatically, so no `icons` config is needed here.

  // Open Graph — controls the link preview when joinverso.io is shared.
  openGraph: {
    title: "Verso",
    description: "Reading is better with friends.",
    url: "https://www.joinverso.io",
    siteName: "Verso",
    type: "website",
    images: [
      {
        url: "https://www.joinverso.io/og-image.png",
        width: 1200,
        height: 630,
        alt: "Verso — social book tracking",
      },
    ],
  },

  // Twitter / X card
  twitter: {
    card: "summary_large_image",
    title: "Verso",
    description: "Reading is better with friends.",
    images: ["https://www.joinverso.io/og-image.png"],
  },
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${ebGaramond.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <PreventZoom />
        {children}
      </body>
    </html>
  )
}
