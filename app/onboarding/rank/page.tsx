"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image"
import { BookOpen, Library } from "lucide-react"
import { supabase } from "@/lib/supabase"
import {
  getNextComparison,
  insertAtPosition,
  estimatedComparisons,
  compareFinishedOrder,
  SCORE_DISPLAY_THRESHOLD,
  type Tier,
  type RankedBook,
  type ComparisonRecord,
} from "@/lib/ranking"
import { ONBOARDING_BOOKS, onboardingCoverUrl, SELECTION_KEY, type OnboardingBook } from "@/lib/onboarding-books"
import { ensureFinishedBook, persistOnboardingPlacement } from "@/lib/onboarding"
import { runSeedIfNeeded } from "@/lib/ranking-data"
import { ScoreDisplay } from "@/components/shared/ScoreDisplay"
import { TierPrompt } from "@/components/ranking/TierPrompt"
import { PairwiseCompare } from "@/components/ranking/PairwiseCompare"

const TIERS: Tier[] = ["loved", "liked", "fine"]

type Phase = "loading" | "tier" | "battle" | "done"
interface PlanItem { book: OnboardingBook; tier: Tier }
interface BattleView { newCover: string | null; newTitle: string; pivotCover: string | null; pivotTitle: string }

/** Build a RankedBook (sans rankPosition) for the in-memory tier list. */
function toRanked(book: OnboardingBook, bookId: string): Omit<RankedBook, "rankPosition"> {
  return { bookId, title: book.title, coverUrl: onboardingCoverUrl(book.coverId, "L"), score: null }
}

/** Read back the frozen scores for a set of books (after seeding) so the
 *  celebration shows exactly what the shelf shows. Returns bookId → score. */
async function fetchScores(userId: string, bookIds: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>()
  if (bookIds.length === 0) return map
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any)
    .from("user_books")
    .select("book_id, score")
    .eq("user_id", userId)
    .in("book_id", bookIds)
  for (const row of (data ?? []) as { book_id: string; score: number | null }[]) {
    map.set(row.book_id, row.score ?? null)
  }
  return map
}

export default function OnboardingRank() {
  const router = useRouter()

  // Cross-render engine internals (refs — never trigger renders directly).
  const userIdRef = useRef<string>("")
  const assignRef = useRef<Map<string, Tier>>(new Map())
  const planRef = useRef<PlanItem[]>([])
  const planIdxRef = useRef(0)
  const placedRef = useRef<Record<Tier, RankedBook[]>>({ loved: [], liked: [], fine: [] })
  const curRef = useRef<{ item: PlanItem; bookId: string; userBookId: string; lo: number; hi: number; comparisons: ComparisonRecord[] } | null>(null)
  const compDoneRef = useRef(0)
  const estRef = useRef(1)

  // Render state.
  const [phase, setPhase] = useState<Phase>("loading")
  const [queue, setQueue] = useState<OnboardingBook[]>([])
  const [sweepIdx, setSweepIdx] = useState(0)
  const [battle, setBattle] = useState<BattleView | null>(null)
  const [done, setDone] = useState<{ count: number; top3: RankedBook[] }>({ count: 0, top3: [] })
  const [confirmLater, setConfirmLater] = useState(false)

  // ── Load the queue from the covers step ─────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/"); return }
      userIdRef.current = user.id
      let ids: string[] = []
      try { ids = JSON.parse(sessionStorage.getItem(SELECTION_KEY) || "[]") } catch { ids = [] }
      const queue = ids.map((id) => ONBOARDING_BOOKS.find((b) => b.id === id)).filter(Boolean) as OnboardingBook[]
      if (queue.length === 0) { router.replace("/onboarding/friends"); return }
      setQueue(queue)
      setPhase("tier")
    }
    load()
  }, [router])

  // ── Tier sweep ──────────────────────────────────────────────────────────────
  function pickTier(tier: Tier) {
    assignRef.current.set(queue[sweepIdx].id, tier)
    if (sweepIdx + 1 < queue.length) setSweepIdx((i) => i + 1)
    else startBattles()
  }

  function buildPlan(): PlanItem[] {
    const plan: PlanItem[] = []
    for (const tier of TIERS) {
      for (const b of queue) {
        if (assignRef.current.get(b.id) === tier) plan.push({ book: b, tier })
      }
    }
    return plan
  }

  function startBattles() {
    const plan = buildPlan()
    planRef.current = plan
    planIdxRef.current = 0
    placedRef.current = { loved: [], liked: [], fine: [] }
    // Estimate total comparisons: per tier, inserting books 2..n costs ~log each.
    const sizes: Record<Tier, number> = { loved: 0, liked: 0, fine: 0 }
    for (const p of plan) sizes[p.tier]++
    let est = 0
    for (const t of TIERS) for (let k = 1; k < sizes[t]; k++) est += estimatedComparisons(k)
    estRef.current = Math.max(1, est)
    compDoneRef.current = 0
    setPhase("battle")
    placeNext()
  }

  // ── Battle stream ───────────────────────────────────────────────────────────
  async function placeNext() {
    const plan = planRef.current
    while (planIdxRef.current < plan.length) {
      const item = plan[planIdxRef.current]
      const ids = await ensureFinishedBook(userIdRef.current, item.book)
      if (!ids) { planIdxRef.current++; continue }
      const tierArr = placedRef.current[item.tier]
      if (tierArr.length === 0) {
        // First book in its tier — auto-place at #1, no battle.
        await persistOnboardingPlacement({ userId: userIdRef.current, bookId: ids.bookId, userBookId: ids.userBookId, tier: item.tier, insertAt: 0, tierWasEmpty: true, comparisons: [] })
        placedRef.current[item.tier] = insertAtPosition(tierArr, toRanked(item.book, ids.bookId), 0)
        planIdxRef.current++
        continue
      }
      curRef.current = { item, bookId: ids.bookId, userBookId: ids.userBookId, lo: 0, hi: tierArr.length, comparisons: [] }
      showBattle()
      return
    }
    void finishBattles()
  }

  function showBattle() {
    const cur = curRef.current!
    const step = getNextComparison(placedRef.current[cur.item.tier], cur.lo, cur.hi)
    if (step.done) { void finalize(cur, cur.lo); return }
    setBattle({
      newCover: onboardingCoverUrl(cur.item.book.coverId, "L"),
      newTitle: cur.item.book.title,
      pivotCover: step.pivot.coverUrl,
      pivotTitle: step.pivot.title,
    })
    preloadAhead()
  }

  /** Warm the browser cache with the next few books' covers so each new battle
   *  paints instantly — no visible load-in between pairs. */
  function preloadAhead() {
    if (typeof window === "undefined") return
    const plan = planRef.current
    for (let i = planIdxRef.current + 1; i <= planIdxRef.current + 3 && i < plan.length; i++) {
      const url = onboardingCoverUrl(plan[i].book.coverId, "L")
      if (url) { const img = new window.Image(); img.src = url }
    }
  }

  async function onPick(choice: "new" | "existing" | "tie") {
    const cur = curRef.current
    if (!cur) return
    const tierArr = placedRef.current[cur.item.tier]
    const step = getNextComparison(tierArr, cur.lo, cur.hi)
    if (step.done) return
    const { pivotIndex, pivot } = step

    compDoneRef.current++

    if (choice === "tie") {
      // Tie rule: place immediately below the pivot, no comparison recorded.
      await finalize(cur, pivotIndex + 1)
      return
    }

    cur.comparisons.push({
      bookAId: pivot.bookId,
      bookBId: cur.bookId,
      winnerId: choice === "new" ? cur.bookId : pivot.bookId,
      tier: cur.item.tier,
    })
    const nextLo = choice === "new" ? cur.lo : pivotIndex + 1
    const nextHi = choice === "new" ? pivotIndex : cur.hi
    const next = getNextComparison(tierArr, nextLo, nextHi)
    if (next.done) { await finalize(cur, nextLo); return }
    cur.lo = nextLo
    cur.hi = nextHi
    showBattle()
  }

  async function finalize(cur: NonNullable<typeof curRef.current>, insertAt: number) {
    await persistOnboardingPlacement({ userId: userIdRef.current, bookId: cur.bookId, userBookId: cur.userBookId, tier: cur.item.tier, insertAt, tierWasEmpty: false, comparisons: cur.comparisons })
    placedRef.current[cur.item.tier] = insertAtPosition(placedRef.current[cur.item.tier], toRanked(cur.item.book, cur.bookId), insertAt)
    curRef.current = null
    planIdxRef.current++
    placeNext()
  }

  async function finishBattles() {
    const all = [...placedRef.current.loved, ...placedRef.current.liked, ...placedRef.current.fine]
    if (all.length === 0) { router.push("/onboarding/friends"); return }
    const sorted = [...all].sort((a, b) =>
      compareFinishedOrder(
        { tier: tierOf(a), rankPosition: a.rankPosition },
        { tier: tierOf(b), rankPosition: b.rankPosition },
      ),
    )
    setBattle(null)
    const top3 = sorted.slice(0, 3)

    // Seed frozen scores now (idempotent; a no-op below the threshold) so the
    // celebration shows the SAME scores the shelf will. completeOnboarding()
    // re-runs runSeedIfNeeded later as a no-op.
    await runSeedIfNeeded(userIdRef.current)
    const scoreById = await fetchScores(userIdRef.current, top3.map((b) => b.bookId))
    const top3Scored = top3.map((b) => ({ ...b, score: scoreById.get(b.bookId) ?? null }))

    setDone({ count: all.length, top3: top3Scored })
    setPhase("done")
  }

  // Which tier a placed RankedBook belongs to (lookup by identity in placedRef).
  function tierOf(b: RankedBook): Tier {
    for (const t of TIERS) if (placedRef.current[t].includes(b)) return t
    return "fine"
  }

  // ── Escapes ─────────────────────────────────────────────────────────────────
  /** During battles: coarsely place every remaining book at the bottom of its
   *  tier (queue order, no comparisons), then go to the celebration beat. */
  async function finishUp() {
    setBattle(null)
    if (curRef.current) {
      const cur = curRef.current
      const len = placedRef.current[cur.item.tier].length
      await persistOnboardingPlacement({ userId: userIdRef.current, bookId: cur.bookId, userBookId: cur.userBookId, tier: cur.item.tier, insertAt: len, tierWasEmpty: len === 0, comparisons: cur.comparisons })
      placedRef.current[cur.item.tier] = insertAtPosition(placedRef.current[cur.item.tier], toRanked(cur.item.book, cur.bookId), len)
      curRef.current = null
      planIdxRef.current++
    }
    const plan = planRef.current
    while (planIdxRef.current < plan.length) {
      const item = plan[planIdxRef.current]
      const ids = await ensureFinishedBook(userIdRef.current, item.book)
      if (ids) {
        const len = placedRef.current[item.tier].length
        await persistOnboardingPlacement({ userId: userIdRef.current, bookId: ids.bookId, userBookId: ids.userBookId, tier: item.tier, insertAt: len, tierWasEmpty: len === 0, comparisons: [] })
        placedRef.current[item.tier] = insertAtPosition(placedRef.current[item.tier], toRanked(item.book, ids.bookId), len)
      }
      planIdxRef.current++
    }
    void finishBattles()
  }

  /** During tier sweep: place already-tiered books (bottom of tier), discard the
   *  rest. Confirmed via the overlay. */
  async function finishLaterConfirmed() {
    setConfirmLater(false)
    setPhase("battle")
    setBattle(null)
    placedRef.current = { loved: [], liked: [], fine: [] }
    for (const tier of TIERS) {
      for (const b of queue) {
        if (assignRef.current.get(b.id) !== tier) continue
        const ids = await ensureFinishedBook(userIdRef.current, b)
        if (!ids) continue
        const len = placedRef.current[tier].length
        await persistOnboardingPlacement({ userId: userIdRef.current, bookId: ids.bookId, userBookId: ids.userBookId, tier, insertAt: len, tierWasEmpty: len === 0, comparisons: [] })
        placedRef.current[tier] = insertAtPosition(placedRef.current[tier], toRanked(b, ids.bookId), len)
      }
    }
    void finishBattles()
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  if (phase === "loading") return null

  if (phase === "tier") {
    const book = queue[sweepIdx]
    return (
      // Onboarding shell: sweep counter (top) + shared TierPrompt (the canonical
      // cover / kicker / title / tier cards) + "Finish later" escape (bottom).
      <div className="flex-1 flex flex-col min-h-0">
        <p className="shrink-0 pt-2 text-center text-xs font-medium text-foreground/40 tracking-wide">
          Book {sweepIdx + 1} of {queue.length}
        </p>
        <div className="flex-1 overflow-y-auto">
          <TierPrompt
            bookTitle={book.title}
            coverUrl={onboardingCoverUrl(book.coverId, "L")}
            onSelect={pickTier}
          />
        </div>
        <div className="shrink-0 pt-1 pb-6 flex justify-center">
          <button onClick={() => setConfirmLater(true)} className="text-xs text-foreground/40 underline underline-offset-4">
            Finish later
          </button>
        </div>
        {confirmLater && (
          <ConfirmOverlay
            title="Finish ranking later?"
            body="Books you haven’t tiered yet won’t be saved — you can add them from Search anytime."
            confirmLabel="That’s fine"
            onConfirm={finishLaterConfirmed}
            onCancel={() => setConfirmLater(false)}
          />
        )}
      </div>
    )
  }

  if (phase === "battle") {
    return (
      // Onboarding shell: shared PairwiseCompare (covers / "vs" / kicker / tie),
      // no in-app progress dots, plus the "finish up" escape pinned at the bottom.
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto">
          {battle && (
            <PairwiseCompare
              newBook={{ title: battle.newTitle, coverUrl: battle.newCover }}
              existingBook={{ title: battle.pivotTitle, coverUrl: battle.pivotCover }}
              onChoice={(c) => void onPick(c)}
            />
          )}
        </div>
        <div className="shrink-0 pt-1 pb-6 flex justify-center">
          <button onClick={finishUp} className="text-xs text-foreground/40 underline underline-offset-4">
            Good enough — finish up
          </button>
        </div>
      </div>
    )
  }

  // DONE
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
      <Library className="size-9 mb-4" style={{ color: "#9C4A2F" }} strokeWidth={1.75} />
      <h2 className="text-3xl text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>Your shelf is ranked</h2>
      <p className="text-sm text-foreground/55 mt-2 mb-8">{done.count} {done.count === 1 ? "book" : "books"}, in your order.</p>

      <div className="flex items-end justify-center gap-3 mb-10">
        {done.top3.map((b, i) => {
          // At/above the 10-book threshold scores are frozen — lead with the
          // score (ScoreDisplay, the app's single score treatment) and demote the
          // rank to a quiet sans label. Below it, no scores exist yet: rank only.
          const showScore = done.count >= SCORE_DISPLAY_THRESHOLD && b.score !== null
          return (
            <div key={b.bookId} className="flex flex-col items-center gap-2">
              <div className="relative w-[84px] aspect-[2/3] rounded-lg overflow-hidden shadow-md bg-muted">
                {b.coverUrl
                  ? <Image src={b.coverUrl} alt="" fill sizes="84px" className="object-cover" unoptimized />
                  : <span className="absolute inset-0 flex items-center justify-center"><BookOpen className="size-5 text-muted-foreground opacity-40"  strokeWidth={1.75} /></span>}
              </div>
              {showScore ? (
                <div className="flex flex-col items-center">
                  <ScoreDisplay score={b.score!} className="text-lg leading-none" />
                  <span className="text-[11px] text-foreground/40 font-sans mt-0.5">#{i + 1}</span>
                </div>
              ) : (
                <span className="text-base" style={{ color: "#9C4A2F", fontFamily: "var(--font-serif)", fontWeight: 500 }}>#{i + 1}</span>
              )}
            </div>
          )
        })}
      </div>

      <button
        onClick={() => router.push("/onboarding/friends")}
        className="w-full max-w-xs rounded-xl py-3.5 text-base font-medium text-white"
        style={{ backgroundColor: "#9C4A2F" }}
      >
        Find your friends
      </button>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────────

function ConfirmOverlay({ title, body, confirmLabel, onConfirm, onCancel }: {
  title: string; body: string; confirmLabel: string; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-background p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-medium text-foreground" style={{ fontFamily: "var(--font-sans)" }}>{title}</h3>
        <p className="text-sm text-foreground/55 mt-1.5">{body}</p>
        <div className="mt-5 flex flex-col gap-2">
          <button onClick={onConfirm} className="w-full rounded-xl py-3 text-sm font-medium text-white" style={{ backgroundColor: "#9C4A2F" }}>{confirmLabel}</button>
          <button onClick={onCancel} className="w-full rounded-xl py-3 text-sm text-foreground/55">Keep going</button>
        </div>
      </div>
    </div>
  )
}
