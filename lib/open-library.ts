// ── Open Library search wrapper ───────────────────────────────────────────────
// Primary book metadata source. No API key required.
// Docs: https://openlibrary.org/dev/docs/api

import { ONBOARDING_BOOKS, onboardingCoverUrl } from "./onboarding-books"

/**
 * Hand-verified covers for the 51 curated onboarding works, keyed by OL work id.
 * Live-search cover quality is best-effort (OL surfaces scans for some editions
 * and there's no reliable way to detect them), but the curated books — exactly
 * the popular ones people search — have clean covers we already vetted. So when a
 * search result IS one of them, we use the curated cover instead of the heuristic.
 */
const CURATED_COVER = new Map<string, string | null>(
  ONBOARDING_BOOKS.map((b) => [b.olid, onboardingCoverUrl(b.coverId, "M")]),
)

/** One English edition surfaced in a work's `editions` sub-document. */
interface OLEditionDoc {
  title?: string
  cover_i?: number
  language?: string[]
}

/** Raw shape returned by the Open Library search endpoint */
interface OLDoc {
  key: string             // e.g. "/works/OL45804W"
  title: string
  author_name?: string[]
  first_publish_year?: number
  cover_i?: number        // numeric cover ID used to build the image URL
  edition_count?: number  // canonical-work signal (most editions = the real work)
  /** Language-matched editions (requested via fields=…,editions + lang=en). */
  editions?: { docs?: OLEditionDoc[] }
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
  /** Open Library edition count — a canonical-work signal used only for ranking
   *  (a translated classic's real work has thousands of editions, an adaptation
   *  a handful). Not persisted. */
  editionCount?: number
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
    // Also pull a language-matched edition per work. With lang=en, OL surfaces
    // the English edition in `editions.docs` — we use its title/cover for display
    // (the work key stays the stored identifier). This mirrors the OL website,
    // which always renders a language-matched representative edition.
    fields: "key,title,author_name,first_publish_year,cover_i,edition_count,editions,editions.title,editions.cover_i,editions.language",
    lang: "en",
  })

  const res = await fetch(`https://openlibrary.org/search.json?${params}`, {
    cache: "no-store",
  })

  if (!res.ok) {
    throw new Error(`Open Library returned ${res.status}`)
  }

  const data: OLSearchResponse = await res.json()

  const normalised = data.docs.map((doc) => {
    // DISPLAY title: always the English edition's (falls back to work-level).
    const engEd = doc.editions?.docs?.find((e) => (e.language ?? []).includes("eng"))
    const title = engEd?.title ?? doc.title
    // COVER: a FOREIGN-titled work — one whose work title differs from its English
    // edition (e.g. "Le Comte de Monte Cristo" vs "The Count of Monte Cristo") —
    // takes the English edition's cover so we don't show a foreign cover. An
    // ENGLISH-titled work takes the WORK-level cover, which is less often the
    // library-scan edition that lang=en sometimes surfaces. Heuristic, not a
    // guarantee — see the V1 note in the PR. The stored id is always the work key.
    const foreignTitled = !!engEd && normKey(doc.title) !== normKey(title)
    const coverI = foreignTitled ? (engEd?.cover_i ?? doc.cover_i) : (doc.cover_i ?? engEd?.cover_i)
    const openLibraryId = doc.key.replace("/works/", "")
    // A curated book → its hand-verified cover; otherwise the heuristic cover.
    const coverUrl = CURATED_COVER.has(openLibraryId)
      ? CURATED_COVER.get(openLibraryId)!
      : coverI
        ? `https://covers.openlibrary.org/b/id/${coverI}-M.jpg`
        : null
    return {
      openLibraryId,
      title,
      author: doc.author_name?.[0] ?? "Unknown author",
      year: doc.first_publish_year ?? null,
      coverUrl,
      editionCount: doc.edition_count ?? 0,
    }
  })

  // Drop author-less / anonymous records outright — they're almost never the book
  // someone searched for, and demoting them still left them cluttering short
  // result sets. (Hard filter, unlike the junk-title demotion.)
  const named = normalised.filter((b) => !isAuthorless(b.author))
  return dedupeWorks(rankByQueryMatch(named, query)).slice(0, 10)
}

/** True for records with no usable author — the "Unknown author" fallback or an
 *  "Anonymous" credit. These are dropped from search results. */
function isAuthorless(author: string): boolean {
  const a = author.trim().toLowerCase()
  return a === "unknown author" || a === "anonymous"
}

/**
 * Normalize a title or author for comparing across Open Library's duplicate work
 * records: lowercase, strip accents, turn every run of punctuation/whitespace
 * (periods, hyphens, commas, colons…) into a single space, then drop a leading
 * article. So "The Count of Monte-Cristo", "Count of Monte Cristo.", and "The
 * Count of Monte Cristo" all collapse to "count of monte cristo".
 */
function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the /, "")
    // Drop a trailing volume/part indicator so "… Volume II" / "… Vol 2" collapses
    // onto the base title (same-author volume splits are duplicates of the work).
    .replace(/\s+(vol(ume)?|part|book|bk)\s*(\d+|[ivxlcdm]+)$/, "")
    .trim()
}

/**
 * Collapse duplicate records of the same book so it can't surface — and be
 * ranked — twice. Open Library returns a stable work key (OL…W) per doc and
 * frequently also holds several distinct work records for one title; two users
 * each adding a different one would silently break taste-match overlap (it joins
 * on book_id). Two passes, both keeping the canonical (highest-edition-count)
 * record and preserving the survivors' ranked order:
 *
 *   1. PRIMARY — group by Open Library work key. Collapses exact-work duplicates
 *      (same OL…W appearing more than once once editions are expanded). A record
 *      with no key falls back to its normalized title+author as the group key.
 *   2. FALLBACK — group the survivors by normalized title + primary author, so
 *      DISTINCT work records of the same book (different OL…W, same title) also
 *      collapse to one. Same title with a DIFFERENT author is left alone.
 */
function dedupeWorks(results: BookSearchResult[]): BookSearchResult[] {
  const keepHighestEditionCount = (
    rows: BookSearchResult[],
    keyOf: (r: BookSearchResult) => string,
  ): BookSearchResult[] => {
    const canonical = new Map<string, BookSearchResult>()
    for (const r of rows) {
      const k = keyOf(r)
      const cur = canonical.get(k)
      if (!cur || (r.editionCount ?? 0) > (cur.editionCount ?? 0)) canonical.set(k, r)
    }
    const keep = new Set(canonical.values())
    return rows.filter((r) => keep.has(r))
  }

  // 1. Work key primary (title+author only when a key is missing).
  const byWork = keepHighestEditionCount(
    results,
    (r) => r.openLibraryId || `t:${normKey(r.title)}|${normKey(r.author)}`,
  )
  // 2. Normalized title+author across distinct work records.
  return keepHighestEditionCount(byWork, (r) => `${normKey(r.title)}|${normKey(r.author)}`)
}

/**
 * Study-guide / box-set / "summary of" works whose titles echo the real book's
 * words (so they'd otherwise rank as well as the canonical edition). We DEMOTE
 * these, never drop them — Search still shows everything, just the real book first.
 */
const JUNK_TITLE =
  /\b(summary|analysis|conversation starters?|conversations? (on|about)|study guide|workbook|collection|boxed set|box set|omnibus|\d+\s+books?|tie[- ]?in|collector'?s?|deluxe|trivia|review of|key\s?takeaways?|sidekick|instaread|sparknotes|cliffsnotes|companion to|guide to|annotated|manga|graphic novel|illustrated|adaptation|picture book|board book|coloring)\b/i

/**
 * Re-ranks results so the CANONICAL work surfaces first:
 *   1. demote junk titles ("Summary of/Collection/Workbook") to the bottom
 *      (demotion, not removal — everything still shows);
 *   2. then most query words in the title;
 *   3. then query words matched in the author (real-author tiebreak, so a query
 *      that names the author lifts that author's edition);
 *   4. then edition count (the canonical work for a translated classic has far
 *      more editions than an adaptation — breaks ties between same-title works);
 *   5. then Open Library's original order (stable).
 * Comparison is case-insensitive; stop-words under 3 characters are skipped.
 */
function rankByQueryMatch(
  results: BookSearchResult[],
  query: string
): BookSearchResult[] {
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length >= 3)

  const scored = results.map((book, originalIndex) => {
    const titleLower = book.title.toLowerCase()
    const authorLower = book.author.toLowerCase()
    return {
      book,
      // Junk titles sink to the bottom tier (author-less records are already
      // filtered out upstream).
      demote: JUNK_TITLE.test(book.title) ? 1 : 0,
      titleMatches: words.filter((w) => titleLower.includes(w)).length,
      authorMatches: words.filter((w) => authorLower.includes(w)).length,
      originalIndex,
    }
  })

  scored.sort(
    (a, b) =>
      a.demote - b.demote ||                       // junk titles last
      b.titleMatches - a.titleMatches ||          // most title words
      b.authorMatches - a.authorMatches ||        // real-author tiebreak
      (b.book.editionCount ?? 0) - (a.book.editionCount ?? 0) || // canonical work
      a.originalIndex - b.originalIndex            // stable
  )

  return scored.map((s) => s.book)
}
