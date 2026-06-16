// ── Open Library search wrapper ───────────────────────────────────────────────
// Primary book metadata source. No API key required.
// Docs: https://openlibrary.org/dev/docs/api

import { ONBOARDING_BOOKS, onboardingCoverUrl } from "./onboarding-books"

/** Open Library cover image base. Cover-ID and OLID lookups are exempt from OL's
 *  cover rate limit; ISBN/OCLC/LCCN lookups are throttled to 100/IP/5min. */
const COVERS = "https://covers.openlibrary.org/b"

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
    const openLibraryId = doc.key.replace("/works/", "")
    // Search-thumbnail cover — best-effort and fast (NO per-result network calls).
    // A FOREIGN-titled work (work title differs from its English edition title —
    // e.g. Kundera's Czech "Nesnesitelná lehkost bytí" vs "The Unbearable Lightness
    // of Being") usually has a foreign work-default cover, so use the English
    // edition's cover instead. An English-titled work keeps its work-default cover
    // (lang=en sometimes surfaces an odd single edition). Ladder: curated override
    // → this cover → null. The high-quality good-edition cover is resolved at ADD
    // time via resolveCoverUrl(); `?default=false` makes OL 404 on a missing cover
    // so the render layer falls through to the typographic placeholder.
    const foreignTitled = !!engEd && normKey(doc.title) !== normKey(title)
    const coverI = foreignTitled ? (engEd?.cover_i ?? doc.cover_i) : (doc.cover_i ?? engEd?.cover_i)
    const coverUrl = CURATED_COVER.has(openLibraryId)
      ? CURATED_COVER.get(openLibraryId)!
      : coverI
        ? `${COVERS}/id/${coverI}-M.jpg?default=false`
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

// ── Cover resolution (add-time) ───────────────────────────────────────────────

/** One edition from a work's editions.json (only the fields we read). */
interface OLEdition {
  isbn_13?: string[]
  publish_date?: string
  publishers?: string[]
  covers?: number[]
  languages?: { key: string }[]
}

/** First valid 13-digit ISBN on an edition (hyphens/spaces tolerated). */
function isbn13Of(ed: OLEdition): string | null {
  for (const raw of ed.isbn_13 ?? []) {
    const digits = raw.replace(/[^0-9]/g, "")
    if (digits.length === 13) return digits
  }
  return null
}

/** First real (positive) cover id on an edition; OL uses -1 / 0 for "none". */
function coverIdOf(ed: OLEdition): number | null {
  return (ed.covers ?? []).find((c) => c > 0) ?? null
}

/** A representative 4-digit year from an edition's free-text publish_date
 *  ("2003", "March 2003"…); 0 when unknown so it sorts last. */
function editionYear(ed: OLEdition): number {
  const m = (ed.publish_date ?? "").match(/\b(1[5-9]\d{2}|20\d{2})\b/)
  return m ? Number(m[1]) : 0
}

function hasNamedPublisher(ed: OLEdition): boolean {
  return (ed.publishers ?? []).some((p) => p && p.trim() && !/not identified/i.test(p))
}

function isEnglishEdition(ed: OLEdition): boolean {
  return (ed.languages ?? []).some((l) => l.key === "/languages/eng")
}

/**
 * Resolve the cover URL to STORE on books.cover_url for a work, at add-time.
 * Ladder (the resolved URL is stored, never the image bytes):
 *   (a) curated override (the 51 onboarding works) →
 *   (b) good modern edition — the first English edition with an ISBN-13 and a
 *       cover, soft-tiebroken toward a named publisher then a recent year (an
 *       ISBN-13 reliably separates a designed commercial cover from a pre-ISBN
 *       Internet-Archive scan of an 1800s printing) →
 *   (c) the work-level default cover (`fallbackWorkCover`) →
 *   (d) null.
 * Cover-ID lookups are used when available (rate-limit-exempt); ISBN lookups are
 * the per-edition fallback. `?default=false` makes a missing cover 404 so the
 * <img onError> render fallback can detect it. NOT a general edition scorer —
 * the ISBN-13 rule is the whole heuristic.
 */
export async function resolveCoverUrl(
  openLibraryId: string,
  fallbackWorkCover: string | null,
): Promise<string | null> {
  // (a) curated override.
  if (CURATED_COVER.has(openLibraryId)) return CURATED_COVER.get(openLibraryId)!

  // (b) good modern edition.
  try {
    const res = await fetch(
      `https://openlibrary.org/works/${openLibraryId}/editions.json?limit=200`,
      { cache: "no-store" },
    )
    if (res.ok) {
      const entries: OLEdition[] = (await res.json())?.entries ?? []
      const withIsbn = entries.filter((e) => isbn13Of(e))
      const english = withIsbn.filter(isEnglishEdition)
      // Prefer English; fall back to any ISBN-13 edition only if no English one.
      const pool = (english.length ? english : withIsbn)
        // "and a cover present": require a real cover id (we resolve covers by id).
        .filter((e) => coverIdOf(e))
      if (pool.length) {
        pool.sort(
          (a, b) =>
            (hasNamedPublisher(b) ? 1 : 0) - (hasNamedPublisher(a) ? 1 : 0) || // named publisher
            editionYear(b) - editionYear(a), // then more recent
        )
        const coverId = coverIdOf(pool[0])
        if (coverId) return `${COVERS}/id/${coverId}-L.jpg?default=false`
        const isbn = isbn13Of(pool[0]) // belt-and-suspenders ISBN fallback
        if (isbn) return `${COVERS}/isbn/${isbn}-L.jpg?default=false`
      }
    }
  } catch {
    // Network hiccup — fall through to the work default.
  }

  // (c) work-level default cover → (d) null.
  return fallbackWorkCover
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
 *
 * The kept record per group is the canonical one: a record WITH a cover beats one
 * without (so a coverless duplicate can't win and leave a placeholder where a real
 * cover exists), then highest edition count.
 */
function dedupeWorks(results: BookSearchResult[]): BookSearchResult[] {
  // True if `r` is a better canonical than the current pick `cur`.
  const better = (r: BookSearchResult, cur: BookSearchResult): boolean => {
    const rc = r.coverUrl ? 1 : 0, cc = cur.coverUrl ? 1 : 0
    if (rc !== cc) return rc > cc
    return (r.editionCount ?? 0) > (cur.editionCount ?? 0)
  }
  const pickCanonical = (
    rows: BookSearchResult[],
    keyOf: (r: BookSearchResult) => string,
  ): BookSearchResult[] => {
    const canonical = new Map<string, BookSearchResult>()
    for (const r of rows) {
      const k = keyOf(r)
      const cur = canonical.get(k)
      if (!cur || better(r, cur)) canonical.set(k, r)
    }
    const keep = new Set(canonical.values())
    return rows.filter((r) => keep.has(r))
  }

  // 1. Work key primary (title+author only when a key is missing).
  const byWork = pickCanonical(
    results,
    (r) => r.openLibraryId || `t:${normKey(r.title)}|${normKey(r.author)}`,
  )
  // 2. Normalized title+author across distinct work records.
  return pickCanonical(byWork, (r) => `${normKey(r.title)}|${normKey(r.author)}`)
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
 *   2. then most query words in the title (RELEVANCE — this leads, so an unrelated
 *      book that happens to have a cover can't outrank a relevant one);
 *   3. then a cover present (tiebreak among equally-relevant results — surfaces a
 *      real designed cover over a coverless obscure edition, and keeps the quiet
 *      no-cover placeholders below the covered results);
 *   4. then query words matched in the author (real-author tiebreak);
 *   5. then edition count (canonical work for a translated classic has far more
 *      editions than an adaptation — breaks ties between same-title works);
 *   6. then Open Library's original order (stable).
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
      hasCover: book.coverUrl ? 1 : 0,
      authorMatches: words.filter((w) => authorLower.includes(w)).length,
      originalIndex,
    }
  })

  scored.sort(
    (a, b) =>
      a.demote - b.demote ||                       // junk titles last
      b.titleMatches - a.titleMatches ||          // relevance: most title words
      b.hasCover - a.hasCover ||                  // covered above coverless (tiebreak)
      b.authorMatches - a.authorMatches ||        // real-author tiebreak
      (b.book.editionCount ?? 0) - (a.book.editionCount ?? 0) || // canonical work
      a.originalIndex - b.originalIndex            // stable
  )

  return scored.map((s) => s.book)
}
