// ── Open Library search wrapper ───────────────────────────────────────────────
// Primary book metadata source. No API key required.
// Docs: https://openlibrary.org/dev/docs/api

/** Raw shape returned by the Open Library search endpoint */
interface OLDoc {
  key: string             // e.g. "/works/OL45804W"
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number        // numeric cover ID used to build the image URL
}

interface OLSearchResponse {
  docs: OLDoc[]
  numFound: number
}

/** Normalised book data used throughout the app */
export interface BookSearchResult {
  /** Open Library work ID, e.g. "OL45804W" (stored in books.open_library_id) */
  openLibraryId: string
  title: string
  author: string
  year: number | null
  /** Full URL ready to pass to <Image> — null when no cover exists */
  coverUrl: string | null
}

/**
 * Search Open Library for books matching `query`.
 * Returns an empty array for blank queries; throws on network errors.
 *
 * Sorting strategy: Open Library's `language` filter is unreliable and
 * frequently returns non-English editions first regardless. Instead we fetch
 * more candidates than we need and re-rank them ourselves: results whose
 * titles contain the most query words rank highest. A Czech title for an
 * English query scores 0 and sinks to the bottom.
 */
export async function searchBooks(query: string): Promise<BookSearchResult[]> {
  if (!query.trim()) return []

  // Fetch 3× more than we need so the re-rank has enough candidates to work
  // with even if OL front-loads non-English editions.
  const params = new URLSearchParams({
    q: query,
    limit: "30",
    fields: "key,title,author_name,first_publish_year,cover_i",
  })

  const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Open Library returned ${res.status}`)
  }

  const data: OLSearchResponse = await res.json()

  const normalised = data.docs.map((doc) => ({
    openLibraryId: doc.key.replace("/works/", ""),
    title: doc.title,
    author: doc.author_name?.[0] ?? "Unknown author",
    year: doc.first_publish_year ?? null,
    coverUrl: doc.cover_i
      ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-M.jpg`
      : null,
  }))

  return rankByQueryMatch(normalised, query).slice(0, 10)
}

/**
 * Re-ranks results so that titles containing the most words from `query`
 * appear first. Comparison is case-insensitive; stop-words under 3 characters
 * are skipped so "of" / "the" don't pollute the score.
 *
 * Ties preserve Open Library's original order (stable sort).
 */
function rankByQueryMatch(
  results: BookSearchResult[],
  query: string
): BookSearchResult[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)

  if (words.length === 0) return results

  const scored = results.map((book, originalIndex) => {
    const titleLower = book.title.toLowerCase()
    const matches = words.filter((w) => titleLower.includes(w)).length
    return { book, score: matches, originalIndex }
  })

  scored.sort((a, b) =>
    b.score !== a.score ? b.score - a.score : a.originalIndex - b.originalIndex
  )

  return scored.map((s) => s.book)
}
