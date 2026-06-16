// ── Onboarding — curated book data (pure, no Supabase) ────────────────────────
// The 66-book grid + cover URLs. Kept separate from lib/onboarding.ts (which
// pulls the Supabase client) so the cover grid, dev preview, etc. can import the
// data without dragging persistence into a server component.

import rawBooks from "@/public/onboarding-books.json"

export interface OnboardingBook {
  id: string
  title: string
  author: string
  category: string
  /** Open Library WORK key (e.g. "OL17821431W") — the SAME identifier the Search
   *  flow stores in books.open_library_id (lib/open-library.ts), so a grid book
   *  and a Search-added book dedupe to one books row. */
  olid: string
  /** Open Library cover_i, resolved into the JSON at build time. */
  coverId: number | null
}

export const ONBOARDING_BOOKS = rawBooks as OnboardingBook[]

/** sessionStorage key carrying the selected book ids from the covers step to the
 *  rank step (the only cross-step state; everything else persists to the DB). */
export const SELECTION_KEY = "verso_onboarding_selection"

/** Open Library cover image URL (M for grid, L for the rank/celebration beats). */
export function onboardingCoverUrl(coverId: number | null, size: "M" | "L" = "M"): string | null {
  return coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null
}
