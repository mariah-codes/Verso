"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Pencil, LogOut } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { markAsFinished } from "@/lib/books"
import { runSeedIfNeeded } from "@/lib/ranking-data"
import { fetchAllShelves, type UserProfile, type ShelfBook } from "@/lib/profile"
import { ShelfBookCardSkeleton } from "@/components/book/ShelfBookCard"
import { ProfileBody } from "@/components/profile/ProfileBody"
import { RankingFlow, type NewBookInfo } from "@/components/ranking/RankingFlow"

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageData {
  profile: UserProfile | null
  reading: ShelfBook[]
  wantToRead: ShelfBook[]
  finished: ShelfBook[]
  dnf: ShelfBook[]
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MePage() {
  const router = useRouter()
  const [data, setData]           = useState<PageData | null>(null)
  const [loading, setLoading]     = useState(true)
  const [userId, setUserId]       = useState<string | null>(null)
  const [rankingBook, setRankingBook] = useState<NewBookInfo | null>(null)
  const [markingId, setMarkingId] = useState<string | null>(null) // userBookId being marked

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/")
  }

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setUserId(user.id)
    // Self-healing: backfill any missing scores before we read the shelves,
    // so the finished section renders with scores already in place.
    await runSeedIfNeeded(user.id)
    const result = await fetchAllShelves(user.id)
    setData(result)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function handleMarkFinished(book: ShelfBook) {
    setMarkingId(book.userBookId)
    const { error } = await markAsFinished(book.userBookId)
    setMarkingId(null)
    if (error) { console.error(error); return }
    // Optimistically remove from reading list, then open ranking
    setData((prev) => prev
      ? { ...prev, reading: prev.reading.filter((b) => b.userBookId !== book.userBookId) }
      : prev
    )
    setRankingBook({
      bookId:     book.bookId,
      userBookId: book.userBookId,
      title:      book.title,
      coverUrl:   book.coverUrl,
    })
  }

  if (loading) return <ProfileSkeleton />

  const { profile, reading, wantToRead, finished, dnf } = data ?? {
    profile: null, reading: [], wantToRead: [], finished: [], dnf: [],
  }

  const initials = profile?.displayName
    ? profile.displayName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "?"

  return (
    <>
      <div className="min-h-screen bg-background pb-16">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="relative px-6 pt-12 pb-6 flex flex-col items-center gap-3">
          {/* Edit + logout — top-right */}
          <div className="absolute top-10 right-5 flex items-center gap-1">
            <Link
              href="/settings"
              aria-label="Edit profile"
              className="p-2 rounded-full text-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="size-[18px]" />
            </Link>
            <button
              onClick={handleLogout}
              aria-label="Log out"
              className="p-2 rounded-full text-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>

          <div className="size-20 rounded-full overflow-hidden bg-muted ring-2 ring-border shrink-0">
            {profile?.photoUrl ? (
              <Image src={profile.photoUrl} alt={profile.displayName} width={80} height={80} className="object-cover size-full" />
            ) : (
              <div className="size-full flex items-center justify-center bg-[#9C4A2F]/10">
                <span className="text-2xl font-medium text-[#9C4A2F]" style={{ fontFamily: "var(--font-serif)" }}>
                  {initials}
                </span>
              </div>
            )}
          </div>

          <h1 className="text-2xl text-foreground text-center" style={{ fontFamily: "var(--font-serif)" }}>
            {profile?.displayName ?? "Reader"}
          </h1>
          <p className="text-sm text-foreground/45 italic text-center max-w-xs leading-relaxed">
            Your reading taste signature will appear here once you’ve rated a few books.
          </p>
        </div>

        {/* ── Sections (shared with friend profile) ─────────────────────────── */}
        <ProfileBody
          reading={reading}
          wantToRead={wantToRead}
          finished={finished}
          dnf={dnf}
          shelfBasePath="/shelf"
          isOwn
          renderReadingExtra={(book) => (
            <button
              onClick={() => handleMarkFinished(book)}
              disabled={markingId === book.userBookId}
              className="text-sm font-medium underline underline-offset-2 px-0.5 text-left disabled:opacity-40 transition-opacity"
              style={{ color: "#9C4A2F" }}
            >
              {markingId === book.userBookId ? "Saving…" : "Mark finished"}
            </button>
          )}
        />
      </div>

      {/* ── Ranking flow ────────────────────────────────────────────────── */}
      {rankingBook && userId && (
        <RankingFlow
          book={rankingBook}
          userId={userId}
          onClose={() => setRankingBook(null)}
          onComplete={() => {
            setRankingBook(null)
            load() // refresh shelf after ranking
          }}
        />
      )}
    </>
  )
}

// ── Skeleton ────────────────────────────────────────────────────────────────

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="flex flex-col items-center gap-3 px-6 pt-12 pb-6">
        <div className="size-20 rounded-full bg-muted animate-pulse" />
        <div className="h-6 w-36 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-56 rounded bg-muted animate-pulse" />
      </div>
      <div className="space-y-8 px-5">
        {["Top 3", "Currently reading", "Want to read"].map((label) => (
          <div key={label}>
            <div className="h-3 w-28 rounded bg-muted animate-pulse mb-4" />
            <div className="grid grid-cols-3 gap-x-3 gap-y-6">
              {[1, 2, 3].map((i) => <ShelfBookCardSkeleton key={i} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
