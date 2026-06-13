"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { fetchFriendShelves, type UserProfile, type ShelfBook } from "@/lib/profile"
import { followUser, isFollowing, unfollowUser } from "@/lib/follows"
import { getTasteMatch } from "@/lib/taste-match-data"
import type { TasteMatchResult } from "@/lib/taste-match"
import { ProfileBody } from "@/components/profile/ProfileBody"
import { ProfileIdentity } from "@/components/profile/ProfileIdentity"
import { ShelfBookCardSkeleton } from "@/components/book/ShelfBookCard"

// ── Types ─────────────────────────────────────────────────────────────────────

interface ViewData {
  profile: UserProfile
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  finished: ShelfBook[]
}

/**
 * Another user's profile, parameterised by their user id. Rendered by both
 * /user/[id] (internal id links) and /[username] (the canonical shareable URL,
 * which resolves the handle → id first). Own-id renders the public self-view
 * (no follow control, no DNF) — /me is the owner dashboard.
 */
export function UserProfileView({ targetId }: { targetId: string }) {
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [data, setData]                   = useState<ViewData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [notFound, setNotFound]           = useState(false)
  const [following, setFollowing]         = useState(false)
  const [followPending, setFollowPending] = useState(false)
  const [match, setMatch]                 = useState<TasteMatchResult | null>(null)
  const [matchLoading, setMatchLoading]   = useState(false)

  const load = useCallback(async () => {
    const [authResult, shelves] = await Promise.all([
      supabase.auth.getUser(),
      fetchFriendShelves(targetId),   // never fetches DNF — owner-only
    ])

    const uid = authResult.data.user?.id ?? null
    setCurrentUserId(uid)

    if (!shelves.profile) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setData({
      profile: shelves.profile,
      reading: shelves.reading,
      wantToRead: shelves.wantToRead,
      finished: shelves.finished,
    })

    if (uid && uid !== targetId) {
      const status = await isFollowing(uid, targetId)
      setFollowing(status)
    }

    setLoading(false)

    // Taste match — on demand, only for other users, after the page is interactive.
    if (uid && uid !== targetId) {
      setMatchLoading(true)
      const result = await getTasteMatch(targetId)
      setMatch(result)
      setMatchLoading(false)
    }
  }, [targetId])

  useEffect(() => { load() }, [load])

  async function handleFollow() {
    if (!currentUserId || followPending) return
    setFollowPending(true)
    setFollowing(true)                           // optimistic
    // Settle on the real follows-table state the mutation confirmed, so the
    // pill can't stick on "Following" after a re-follow that didn't persist.
    const { isFollowing: confirmed } = await followUser(currentUserId, targetId)
    setFollowing(confirmed)
    setFollowPending(false)
  }

  async function handleUnfollow() {
    if (!currentUserId || followPending) return
    setFollowPending(true)
    setFollowing(false)                          // optimistic
    const { isFollowing: confirmed } = await unfollowUser(currentUserId, targetId)
    setFollowing(confirmed)
    setFollowPending(false)
  }

  // ── Loading / not-found ────────────────────────────────────────────────────

  if (loading) return <PageSkeleton onBack={() => router.back()} />

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-foreground/40">Profile not found.</p>
        <button
          onClick={() => router.back()}
          className="text-sm underline underline-offset-2 text-foreground/55"
        >
          Go back
        </button>
      </div>
    )
  }

  const { profile, reading, wantToRead, finished } = data

  const showFollowControl = !!currentUserId && currentUserId !== targetId

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm px-3 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-foreground/55 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-5"  strokeWidth={1.75} />
          <span className="text-sm">Back</span>
        </button>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-3">

        <ProfileIdentity
          displayName={profile.displayName}
          username={profile.username}
          photoUrl={profile.photoUrl}
        />

        {/* Taste signature placeholder — same copy as /me */}
        <p className="text-sm text-foreground/40 italic text-center max-w-xs leading-relaxed">
          Taste signature coming soon.
        </p>

        {/* Match + follow control */}
        {showFollowControl && (
          <div className="flex items-center gap-3">
            <MatchLabel loading={matchLoading} match={match} />
            {following ? (
              <FollowingPill onUnfollow={handleUnfollow} pending={followPending} />
            ) : (
              <button
                onClick={handleFollow}
                disabled={followPending}
                className={[
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5",
                  "text-xs font-medium text-white",
                  "hover:opacity-90 transition-all active:scale-[0.97] disabled:opacity-50",
                ].join(" ")}
                style={{ backgroundColor: "#9C4A2F" }}
              >
                {followPending ? <SmallSpinner /> : "Follow"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Sections (shared with own profile; no DNF, no edit) ───────────── */}
      <div className="pb-8">
        <ProfileBody
          reading={reading}
          wantToRead={wantToRead}
          finished={finished}
          dnf={[]}
          shelfBasePath={`/user/${targetId}/shelf`}
          isOwn={false}
        />
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

/**
 * Taste-match label shown next to the follow control.
 *   loading            → "Match …"
 *   scored             → "Match 87%"
 *   below threshold    → "Not enough overlap yet"
 */
function MatchLabel({
  loading,
  match,
}: {
  loading: boolean
  match: TasteMatchResult | null
}) {
  let text: string
  if (loading || match === null) {
    text = "Match …"
  } else if (match.score === null) {
    text = "Not enough overlap yet"
  } else {
    text = `Match ${match.score}%`
  }

  return (
    <span className="text-sm text-foreground/40 font-sans tabular-nums">
      {text}
    </span>
  )
}

/**
 * Two-tap "Following" pill — same interaction model as the Friends tab.
 * First tap enters confirmation (label turns terracotta "Unfollow").
 * Second tap executes the unfollow. Tap outside resets to "Following".
 */
function FollowingPill({ onUnfollow, pending }: { onUnfollow: () => void; pending: boolean }) {
  const [confirming, setConfirming] = useState(false)
  const pillRef = useRef<HTMLButtonElement>(null)

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

  function handleClick() {
    if (confirming) {
      setConfirming(false)
      onUnfollow()
    } else {
      setConfirming(true)
    }
  }

  return (
    <button
      ref={pillRef}
      onClick={handleClick}
      disabled={pending}
      className={[
        "rounded-full border px-3 py-1 text-xs font-sans",
        "transition-colors disabled:opacity-40",
        confirming
          ? "border-[#9C4A2F] text-[#9C4A2F]"
          : "border-foreground/20 text-foreground/40 hover:border-foreground/35",
      ].join(" ")}
    >
      {pending ? <SmallSpinner /> : confirming ? "Unfollow" : "Following"}
    </button>
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

function PageSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 py-3">
        <button onClick={onBack} className="flex items-center gap-1 text-foreground/55">
          <ChevronLeft className="size-5"  strokeWidth={1.75} />
          <span className="text-sm">Back</span>
        </button>
      </div>
      <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-muted animate-pulse" />
        <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
        <div className="h-4 w-52 rounded bg-muted animate-pulse" />
        <div className="h-7 w-36 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="space-y-8 px-5">
        {["Top 3", "Currently reading", "Want to read"].map((label) => (
          <div key={label}>
            <div className="h-3 w-28 rounded bg-muted animate-pulse mb-4" />
            <div className="grid grid-cols-3 gap-x-3 gap-y-6">
              {[1, 2, 3].map((i) => (
                <ShelfBookCardSkeleton key={i} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
