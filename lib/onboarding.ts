// ── Onboarding — data + persistence ───────────────────────────────────────────
// The 50-book curated grid, cover URLs, and the writes that turn onboarding
// selections into real finished+ranked user_books rows. The ranking MATH is
// reused from lib/ranking.ts; persistence reuses persistRankingResult /
// runSeedIfNeeded from lib/ranking-data.ts (do not fork either).

import { supabase } from "./supabase"
import { persistRankingResult, runSeedIfNeeded } from "./ranking-data"
import { onboardingCoverUrl, type OnboardingBook } from "./onboarding-books"
import type { Tier, ComparisonRecord } from "./ranking"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Persistence ────────────────────────────────────────────────────────────────

/**
 * Ensure the curated book exists in `books` and that the user has a FINISHED
 * user_books row for it (no tier/rank yet). Upserts on the REAL Open Library work
 * key (book.olid) — the same key the Search flow uses — so a grid book and a
 * Search-added book resolve to ONE books row (taste-match / picks join on book_id).
 * Returns the ids needed to rank it.
 */
export async function ensureFinishedBook(
  userId: string,
  book: OnboardingBook,
): Promise<{ bookId: string; userBookId: string } | null> {
  const olid = book.olid

  const { error: upsertErr } = await db.from("books").upsert(
    {
      open_library_id: olid,
      title: book.title,
      author: book.author,
      cover_url: onboardingCoverUrl(book.coverId, "L") ?? "",
      published_year: null,
    },
    { onConflict: "open_library_id", ignoreDuplicates: true },
  )
  if (upsertErr) {
    console.error("[onboarding] books upsert:", upsertErr.message)
    return null
  }

  const { data: bookRow } = await db
    .from("books")
    .select("id")
    .eq("open_library_id", olid)
    .single()
  if (!bookRow) return null

  const { data: ub, error: ubErr } = await db
    .from("user_books")
    .upsert(
      {
        user_id: userId,
        book_id: bookRow.id,
        status: "finished",
        visibility: "visible",
        was_started: true,
        finished_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    )
    .select("id")
    .single()
  if (ubErr || !ub) {
    console.error("[onboarding] user_books upsert:", ubErr?.message)
    return null
  }

  return { bookId: bookRow.id, userBookId: ub.id }
}

/**
 * Persist one fully-placed book: set its tier + rank_position (score stays null
 * during onboarding — completeOnboarding() seeds at threshold), shift the tier,
 * and record the decisive comparisons. Thin wrapper over persistRankingResult so
 * the math/persistence is never forked.
 */
export async function persistOnboardingPlacement(params: {
  userId: string
  bookId: string
  userBookId: string
  tier: Tier
  /** 0-based insertion index within the tier. */
  insertAt: number
  tierWasEmpty: boolean
  comparisons: ComparisonRecord[]
}): Promise<{ error: string | null }> {
  return persistRankingResult({
    userId: params.userId,
    newBookId: params.bookId,
    newUserBookId: params.userBookId,
    tier: params.tier,
    newRankPosition: params.insertAt + 1,
    tierWasEmpty: params.tierWasEmpty,
    sessionComparisons: params.comparisons,
    newBookScore: null,        // scores are assigned once, at threshold, below
    isSeedCrossing: false,
    seedScoreMap: new Map(),
    allFinishedForSeed: null,
  })
}

/**
 * Finish onboarding: assign frozen scores if the user crossed the display
 * threshold (runSeedIfNeeded is a no-op below it), then stamp onboarded_at.
 */
export async function completeOnboarding(userId: string): Promise<{ error: string | null }> {
  await runSeedIfNeeded(userId)
  return markOnboarded(userId)
}

/** Stamp onboarded_at = now() — also used when a user skips out of a step. */
export async function markOnboarded(userId: string): Promise<{ error: string | null }> {
  const { error } = await db
    .from("users")
    .update({ onboarded_at: new Date().toISOString() })
    .eq("id", userId)
  return { error: error?.message ?? null }
}

// ── Step 1: profile ────────────────────────────────────────────────────────────

/** Upload a profile photo to the avatars bucket under the user's own folder
 *  (RLS-scoped). Overwrites any prior avatar; returns a cache-busted public URL. */
export async function uploadAvatar(
  userId: string,
  file: File,
): Promise<{ url: string | null; error: string | null }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase()
  const path = `${userId}/avatar.${ext}`
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type })
  if (error) return { url: null, error: error.message }
  const { data } = supabase.storage.from("avatars").getPublicUrl(path)
  return { url: `${data.publicUrl}?t=${Date.now()}`, error: null }
}

/** Save the profile step's fields onto the user's row (display_name required;
 *  photo only written when provided). Username is stored lowercased. */
export async function saveOnboardingProfile(
  userId: string,
  p: { displayName: string; username: string; photoUrl: string | null },
): Promise<{ error: string | null }> {
  const patch: Record<string, unknown> = {
    display_name: p.displayName.trim(),
    username: p.username.trim().toLowerCase(),
  }
  if (p.photoUrl) patch.photo_url = p.photoUrl
  const { error } = await db.from("users").update(patch).eq("id", userId)
  return { error: error?.message ?? null }
}
