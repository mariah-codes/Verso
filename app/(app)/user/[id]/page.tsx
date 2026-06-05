"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Image from "next/image"
import { useParams, useRouter } from "next/navigation"
import { BookMarked, BookOpen, ChevronLeft, Trophy } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { fetchProfile, fetchShelf, type UserProfile, type ShelfBook } from "@/lib/profile"
import { followUser, isFollowing, unfollowUser } from "@/lib/follows"
import { ShelfBookCard, ShelfBookCardSkeleton } from "@/components/book/ShelfBookCard"

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageData {
  profile: UserProfile
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  finished: ShelfBook[]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function UserProfilePage() {
  const { id: targetId } = useParams<{ id: string }>()
  const router = useRouter()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [data, setData]                   = useState<PageData | null>(null)
  const [loading, setLoading]             = useState(true)
  const [notFound, setNotFound]           = useState(false)
  const [following, setFollowing]         = useState(false)
  const [followPending, setFollowPending] = useState(false)

  const load = useCallback(async () => {
    // Auth + all four shelf queries in parallel
    const [authResult, profile, reading, wantToRead, finished] = await Promise.all([
      supabase.auth.getUser(),
      fetchProfile(targetId),
      fetchShelf(targetId, "reading", 3),
      fetchShelf(targetId, "want_to_read", 5),
      fetchShelf(targetId, "finished"),
    ])

    const uid = authResult.data.user?.id ?? null
    setCurrentUserId(uid)

    if (!profile) {
      setNotFound(true)
      setLoading(false)
      return
    }

    setData({ profile, reading, wantToRead, finished })

    // Follow status — needs uid, runs after the main batch
    if (uid && uid !== targetId) {
      const status = await isFollowing(uid, targetId)
      setFollowing(status)
    }

    setLoading(false)
  }, [targetId])

  useEffect(() => { load() }, [load])

  async function handleFollow() {
    if (!currentUserId || followPending) return
    setFollowPending(true)
    setFollowing(true)                           // optimistic
    const { error } = await followUser(currentUserId, targetId)
    if (error) setFollowing(false)               // revert on failure
    setFollowPending(false)
  }

  async function handleUnfollow() {
    if (!currentUserId || followPending) return
    setFollowPending(true)
    setFollowing(false)                          // optimistic
    const { error } = await unfollowUser(currentUserId, targetId)
    if (error) setFollowing(true)                // revert on failure
    setFollowPending(false)
  }

  // ── Loading / not-found states ───────────────────────────────────────────

  if (loading) return <PageSkeleton onBack={() => router.back()} />

  if (notFound || !data) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-foreground/40">Profile not found.</p>
        <button
          onClick={() => router.back()}
          className="text-sm underline underline-offset-2 text-foreground/50"
        >
          Go back
        </button>
      </div>
    )
  }

  const { profile, reading, wantToRead, finished } = data

  const initials = profile.displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  const showFollowControl = !!currentUserId && currentUserId !== targetId

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">

      {/* ── Back ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm px-3 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-3">

        {/* Avatar */}
        <div className="size-20 rounded-full overflow-hidden bg-muted ring-2 ring-border shrink-0">
          {profile.photoUrl ? (
            <Image
              src={profile.photoUrl}
              alt={profile.displayName}
              width={80}
              height={80}
              className="object-cover size-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="size-full flex items-center justify-center bg-[#9C4A2F]/10">
              <span
                className="text-2xl font-medium text-[#9C4A2F]"
                style={{ fontFamily: "var(--font-serif)" }}
              >
                {initials}
              </span>
            </div>
          )}
        </div>

        {/* Name */}
        <h1
          className="text-2xl text-foreground text-center"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {profile.displayName}
        </h1>

        {/* Taste signature placeholder — same copy as /me */}
        <p className="text-sm text-foreground/45 italic text-center max-w-xs leading-relaxed">
          Taste signature coming soon.
        </p>

        {/* Match + follow control */}
        {showFollowControl && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/40 font-sans tabular-nums">
              Match: —
            </span>
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

      {/* ── Shelf sections ────────────────────────────────────────────────── */}
      <div className="space-y-8 px-5 pb-8">

        <Section
          icon={<BookOpen className="size-4" />}
          title="Currently reading"
          count={reading.length}
        >
          {reading.length === 0 ? (
            <EmptyState>Nothing on the nightstand right now.</EmptyState>
          ) : (
            <HorizontalScroll>
              {reading.map((book) => (
                <ShelfBookCard
                  key={book.userBookId}
                  book={book}
                  className="w-[110px]"
                  sizes="110px"
                />
              ))}
            </HorizontalScroll>
          )}
        </Section>

        <Section
          icon={<BookMarked className="size-4" />}
          title="Want to read"
          count={wantToRead.length}
        >
          {wantToRead.length === 0 ? (
            <EmptyState>No books on the reading list.</EmptyState>
          ) : (
            <HorizontalScroll>
              {wantToRead.map((book) => (
                <ShelfBookCard
                  key={book.userBookId}
                  book={book}
                  className="w-[110px]"
                  sizes="110px"
                />
              ))}
            </HorizontalScroll>
          )}
        </Section>

        <Section
          icon={<Trophy className="size-4" />}
          title="Finished"
          count={finished.length}
        >
          {finished.length === 0 ? (
            <EmptyState>No finished books yet.</EmptyState>
          ) : (
            <div className="grid grid-cols-3 gap-x-3 gap-y-6">
              {finished.map((book) => (
                <ShelfBookCard
                  key={book.userBookId}
                  book={book}
                  sizes="(max-width: 640px) 30vw, 130px"
                />
              ))}
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

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

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-foreground/40">{icon}</span>
        <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/60 font-sans">
          {title}
        </h2>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs text-foreground/35 font-sans tabular-nums">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1"
      style={{ scrollbarWidth: "none" }}
    >
      {children}
    </div>
  )
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-foreground/40 leading-relaxed py-2">{children}</p>
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
        <button onClick={onBack} className="flex items-center gap-1 text-foreground/50">
          <ChevronLeft className="size-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>
      <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-muted animate-pulse" />
        <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-52 rounded bg-muted animate-pulse" />
        <div className="h-7 w-36 rounded-full bg-muted animate-pulse" />
      </div>
      <div className="space-y-8 px-5">
        {["Currently reading", "Want to read", "Finished"].map((label) => (
          <div key={label}>
            <div className="h-3 w-28 rounded bg-muted animate-pulse mb-4" />
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => (
                <ShelfBookCardSkeleton key={i} className="w-[110px]" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
