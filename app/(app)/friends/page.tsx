"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { BookOpen, Search, UserPlus, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDebounce } from "@/hooks/use-debounce"
import {
  followUser,
  unfollowUser,
  getFollowing,
  getReadingTitle,
  searchUsers,
  type FollowingUser,
  type SearchResult,
} from "@/lib/follows"
import { getTasteMatches } from "@/lib/taste-match-data"
import type { TasteMatchResult } from "@/lib/taste-match"

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FriendsPage() {
  const [userId, setUserId]             = useState<string | null>(null)
  const [query, setQuery]               = useState("")
  const debouncedQuery                  = useDebounce(query, 300)

  // Search
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching]         = useState(false)

  // Following list
  const [following, setFollowing]           = useState<FollowingUser[]>([])
  const [followingLoading, setFollowingLoading] = useState(true)

  // Taste-match scores, keyed by followed user id. Computed on demand (no cache
  // table in V1) and recomputed whenever the set of followed ids changes.
  const [matches, setMatches]               = useState<Map<string, TasteMatchResult>>(new Map())
  const [matchesLoading, setMatchesLoading] = useState(true)

  // Per-user optimistic lock — prevents double-taps
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())

  const inputRef = useRef<HTMLInputElement>(null)

  // ── Init ──────────────────────────────────────────────────────────────────

  const loadFollowing = useCallback(async (uid: string) => {
    const result = await getFollowing(uid)
    setFollowing(result)
    setFollowingLoading(false)
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      setUserId(uid)
      loadFollowing(uid)
    })
  }, [loadFollowing])

  // ── Search ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!userId || !debouncedQuery.trim()) {
      setSearchResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    searchUsers(debouncedQuery, userId).then((results) => {
      setSearchResults(results)
      setSearching(false)
    })
  }, [debouncedQuery, userId])

  // ── Taste-match scores ──────────────────────────────────────────────────────
  // Recompute whenever the set of followed ids changes (follow/unfollow). One
  // batched query covers every friend — getTasteMatches never fans out per-user.
  // Keyed on the sorted id string so reordering alone doesn't refetch.
  const followingKey = following.map((u) => u.id).sort().join(",")

  useEffect(() => {
    if (!userId) return
    const ids = followingKey ? followingKey.split(",") : []
    if (ids.length === 0) {
      setMatches(new Map())
      setMatchesLoading(false)
      return
    }
    let cancelled = false
    setMatchesLoading(true)
    getTasteMatches(ids).then((result) => {
      if (cancelled) return
      setMatches(result)
      setMatchesLoading(false)
    })
    return () => { cancelled = true }
  }, [userId, followingKey])

  // ── Follow / Unfollow ─────────────────────────────────────────────────────

  async function handleFollow(target: SearchResult) {
    if (!userId || pendingIds.has(target.id)) return
    setPendingIds((s) => new Set(s).add(target.id))

    // Optimistic: flip button + prepend to following list immediately
    setSearchResults((prev) =>
      prev.map((u) => (u.id === target.id ? { ...u, isFollowing: true } : u)),
    )
    const optimisticEntry: FollowingUser = {
      id: target.id,
      displayName: target.displayName,
      photoUrl: target.photoUrl,
      currentlyReading: null,
    }
    setFollowing((prev) => [optimisticEntry, ...prev])

    // `confirmed` is read back from the follows table — trust it over `error`
    // alone so a silent no-op (row never landed) reverts too.
    const { isFollowing: confirmed, error } = await followUser(userId, target.id)

    if (error || !confirmed) {
      // Revert both
      setSearchResults((prev) =>
        prev.map((u) => (u.id === target.id ? { ...u, isFollowing: false } : u)),
      )
      setFollowing((prev) => prev.filter((u) => u.id !== target.id))
    } else {
      // Backfill the currently-reading title we couldn't know at optimistic-insert
      // time. Row is already visible; this just fills in the book line beneath the
      // name without a full reload or any visible flicker.
      getReadingTitle(target.id).then((title) => {
        setFollowing((prev) =>
          prev.map((u) => (u.id === target.id ? { ...u, currentlyReading: title } : u)),
        )
      })
    }

    setPendingIds((s) => { const n = new Set(s); n.delete(target.id); return n })
  }

  async function handleUnfollow(targetId: string) {
    if (!userId || pendingIds.has(targetId)) return
    setPendingIds((s) => new Set(s).add(targetId))

    // Optimistic: drop from following + flip any matching search result.
    // (Dropping from `following` also un-filters them back into search results.)
    setFollowing((prev) => prev.filter((u) => u.id !== targetId))
    setSearchResults((prev) =>
      prev.map((u) => (u.id === targetId ? { ...u, isFollowing: false } : u)),
    )

    // If the row is still there afterwards (`confirmed` true) the unfollow
    // didn't take — restore the entry so the UI matches the table.
    const { isFollowing: confirmed, error } = await unfollowUser(userId, targetId)

    if (error || confirmed) {
      // Revert — reload the following list to restore the dropped entry
      setSearchResults((prev) =>
        prev.map((u) => (u.id === targetId ? { ...u, isFollowing: true } : u)),
      )
      loadFollowing(userId)
    }

    setPendingIds((s) => { const n = new Set(s); n.delete(targetId); return n })
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const isQuerying  = !!query.trim()

  // The search section is for finding NEW people — exclude anyone already in the
  // following list. Driven by `following` (the single source of truth), so the
  // moment you tap Follow they leave search and appear below, no refresh needed.
  const followingIds   = new Set(following.map((u) => u.id))
  const newPeople      = searchResults.filter((u) => !followingIds.has(u.id))

  // Two distinct empty cases so we can show appropriate copy
  const genuinelyEmpty     = isQuerying && !searching && searchResults.length === 0
  const allAlreadyFollowed = isQuerying && !searching && searchResults.length > 0 && newPeople.length === 0
  const showResults        = isQuerying && !searching && newPeople.length > 0

  // Following list sorted by taste-match descending. Below-threshold rows (no
  // score) sink to the bottom; among them the original newest-follow-first order
  // is preserved (Array.sort is stable). While matches are still loading every
  // score is null, so the list keeps its natural order until results arrive.
  const sortedFollowing = [...following].sort((a, b) => {
    const sa = matches.get(a.id)?.score ?? null
    const sb = matches.get(b.id)?.score ?? null
    if (sa === null && sb === null) return 0
    if (sa === null) return 1
    if (sb === null) return -1
    return sb - sa
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background pb-20">

      {/* ── Sticky search bar ──────────────────────────────────────────────── */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm border-b border-border px-4 py-3">
        <div className="relative flex items-center">
          <Search className="absolute left-3 size-4 text-foreground/40 pointer-events-none"  strokeWidth={1.75} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find people by name…"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            className={[
              "w-full h-10 rounded-xl border border-input bg-muted/50",
              "pl-9 pr-9 text-sm text-foreground placeholder:text-foreground/40",
              "outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 transition-all",
            ].join(" ")}
          />
          {query && (
            <button
              onClick={() => { setQuery(""); inputRef.current?.focus() }}
              aria-label="Clear search"
              className="absolute right-3 text-foreground/40 hover:text-foreground transition-colors"
            >
              <X className="size-4"  strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      <div className="px-4 py-5">

        {/* ── Search mode ──────────────────────────────────────────────────── */}
        {isQuerying && (
          <section>
            {searching && (
              <div className="flex justify-center pt-10">
                <Spinner />
              </div>
            )}

            {genuinelyEmpty && (
              <div className="flex flex-col items-center pt-12 gap-2 text-center">
                <p
                  className="text-base text-foreground/60"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  No one found
                </p>
                <p className="text-sm text-foreground/40">Try a different name.</p>
              </div>
            )}

            {allAlreadyFollowed && (
              <div className="pt-12 text-center">
                <p className="text-sm text-foreground/40">
                  Already following everyone by this name.
                </p>
              </div>
            )}

            {showResults && (
              <>
                <SectionLabel>People</SectionLabel>
                <ul className="mt-3 space-y-0.5">
                  {newPeople.map((user) => (
                    <li key={user.id}>
                      <SearchUserRow
                        user={user}
                        pending={pendingIds.has(user.id)}
                        onFollow={() => handleFollow(user)}
                      />
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {/* ── Following list ──────────────────────────────────────────────────
            Always mounted — even while searching — so optimistic follow/unfollow
            updates are visible in the same view without a refresh. When a search
            is active it sits below the results, separated by a divider. */}
        <section className={isQuerying ? "mt-8 pt-6 border-t border-border" : ""}>
          <SectionLabel>Following</SectionLabel>

          {followingLoading ? (
            <ul className="mt-3 space-y-0.5">
              {[1, 2, 3].map((i) => <li key={i}><UserRowSkeleton /></li>)}
            </ul>
          ) : following.length === 0 ? (
            <div className="mt-5 py-6 text-center">
              <p className="text-sm text-foreground/40 leading-relaxed">
                Find people whose taste you trust.
              </p>
            </div>
          ) : (
            <ul className="mt-3 space-y-0.5">
              {sortedFollowing.map((user) => (
                <li key={user.id}>
                  <FollowingUserRow
                    user={user}
                    pending={pendingIds.has(user.id)}
                    match={matches.get(user.id) ?? null}
                    matchLoading={matchesLoading}
                    onUnfollow={() => handleUnfollow(user.id)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-medium tracking-widest uppercase text-foreground/60 font-sans">
      {children}
    </h2>
  )
}

function UserAvatar({
  photoUrl,
  displayName,
}: {
  photoUrl: string | null
  displayName: string
}) {
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="size-10 rounded-full overflow-hidden bg-[#9C4A2F]/10 shrink-0 flex items-center justify-center">
      {photoUrl ? (
        <Image
          src={photoUrl}
          alt=""
          width={40}
          height={40}
          className="object-cover size-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <span
          className="text-sm font-medium text-[#9C4A2F]"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {initials}
        </span>
      )}
    </div>
  )
}

function SearchUserRow({
  user,
  pending,
  onFollow,
}: {
  user: SearchResult
  pending: boolean
  onFollow: () => void
}) {
  // Only un-followed people reach this row — followed users are filtered out of
  // search and live in the Following list below. So this is always a "Follow".
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <UserAvatar photoUrl={user.photoUrl} displayName={user.displayName} />
      <span className="flex-1 text-sm font-medium text-foreground truncate min-w-0">
        {user.displayName}
      </span>
      <button
        onClick={onFollow}
        disabled={pending}
        className={[
          "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
          "text-white hover:opacity-90 transition-all active:scale-[0.97]",
          "disabled:opacity-50 shrink-0",
        ].join(" ")}
        style={{ backgroundColor: "#9C4A2F" }}
      >
        {pending ? <SmallSpinner /> : <><UserPlus className="size-3.5"  strokeWidth={1.75} />Follow</>}
      </button>
    </div>
  )
}

function FollowingUserRow({
  user,
  pending,
  match,
  matchLoading,
  onUnfollow,
}: {
  user: FollowingUser
  pending: boolean
  match: TasteMatchResult | null
  matchLoading: boolean
  onUnfollow: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)

  // Reset to "Following" when the user taps anywhere outside the pill.
  // setTimeout(0) defers listener attachment so the tap that opened
  // confirmation doesn't immediately re-close it via bubbling.
  useEffect(() => {
    if (!confirming) return
    function onOutsideClick(e: MouseEvent) {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) {
        setConfirming(false)
      }
    }
    const id = setTimeout(() => document.addEventListener("click", onOutsideClick), 0)
    return () => { clearTimeout(id); document.removeEventListener("click", onOutsideClick) }
  }, [confirming])

  function handlePillClick() {
    if (confirming) {
      setConfirming(false)
      onUnfollow()          // parent handles optimistic removal + revert on error
    } else {
      setConfirming(true)   // first tap: enter confirmation state
    }
  }

  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      {/* Left side taps → friend profile. Pill stays outside the link. */}
      <Link href={`/user/${user.id}`} className="flex items-center gap-3 flex-1 min-w-0">
        <UserAvatar photoUrl={user.photoUrl} displayName={user.displayName} />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {user.displayName}
          </p>
          {user.currentlyReading && (
            <p className="flex items-center gap-1 text-xs text-foreground/40 mt-0.5 min-w-0">
              <BookOpen className="size-3 shrink-0"  strokeWidth={1.75} />
              <span className="truncate">{user.currentlyReading}</span>
            </p>
          )}
        </div>
      </Link>

      {/* Right side — match label + pill on one line */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Taste-match: "Match 87%" when scored, "—" below threshold (full
            "Not enough overlap yet" copy lives on the friend profile), "…" while
            computing. */}
        <span
          className="text-xs text-foreground/40 font-sans tabular-nums"
          title={
            !matchLoading && match !== null && match.score === null
              ? "Not enough overlap yet"
              : undefined
          }
        >
          {matchLoading || match === null
            ? "…"
            : match.score === null
              ? "—"
              : `Match ${match.score}%`}
        </span>

        {/* Two-tap unfollow pill */}
        <button
          ref={pillRef}
          onClick={handlePillClick}
          disabled={pending}
          aria-label={
            confirming
              ? `Confirm unfollow ${user.displayName}`
              : `Following ${user.displayName}`
          }
          className={[
            "rounded-full border px-2.5 py-0.5 text-xs font-sans",
            "transition-colors disabled:opacity-40",
            confirming
              ? "border-[#9C4A2F] text-[#9C4A2F]"
              : "border-foreground/20 text-foreground/40 hover:border-foreground/35",
          ].join(" ")}
        >
          {pending ? <SmallSpinner /> : confirming ? "Unfollow" : "Following"}
        </button>
      </div>
    </div>
  )
}

function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2.5 px-1">
      <div className="size-10 rounded-full bg-muted animate-pulse shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-36 rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}

function Spinner() {
  return (
    <svg className="size-6 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="#9C4A2F" strokeWidth="2.5" strokeOpacity="0.2" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="#9C4A2F" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}

function SmallSpinner() {
  return (
    <svg className="size-3.5 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.3" />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  )
}
