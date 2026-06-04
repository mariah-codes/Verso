"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Pencil, LogOut, BookOpen, BookMarked, Trophy, Ban } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { markAsFinished } from "@/lib/books"
import { runSeedIfNeeded } from "@/lib/ranking-data"
import { fetchAllShelves, type UserProfile, type ShelfBook } from "@/lib/profile"
import { ShelfBookCard, ShelfBookCardSkeleton } from "@/components/book/ShelfBookCard"
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
            Your reading taste signature will appear here once you've rated a few books.
          </p>
        </div>

        <div className="space-y-8 px-5">
          {/* ── Currently Reading ─────────────────────────────────────── */}
          <Section icon={<BookOpen className="size-4" />} title="Currently reading" count={reading.length}>
            {reading.length === 0 ? (
              <EmptyState message="Nothing on the nightstand yet — search a book to add one." href="/search" linkLabel="Search books" />
            ) : (
              <HorizontalScroll>
                {reading.map((book) => (
                  <div key={book.userBookId} className="flex flex-col gap-2 shrink-0">
                    <ShelfBookCard book={book} className="w-[110px]" sizes="110px" />
                    <button
                      onClick={() => handleMarkFinished(book)}
                      disabled={markingId === book.userBookId}
                      className="text-[10px] font-medium underline underline-offset-2 px-0.5 text-left disabled:opacity-40 transition-opacity"
                      style={{ color: "#9C4A2F" }}
                    >
                      {markingId === book.userBookId ? "Saving…" : "Mark finished"}
                    </button>
                  </div>
                ))}
              </HorizontalScroll>
            )}
          </Section>

          {/* ── Want to Read ──────────────────────────────────────────── */}
          <Section icon={<BookMarked className="size-4" />} title="Want to read" count={wantToRead.length}>
            {wantToRead.length === 0 ? (
              <EmptyState message="Your reading list is empty — add books you're curious about." href="/search" linkLabel="Browse books" />
            ) : (
              <HorizontalScroll>
                {wantToRead.map((book) => (
                  <ShelfBookCard key={book.userBookId} book={book} className="w-[110px]" sizes="110px" />
                ))}
              </HorizontalScroll>
            )}
          </Section>

          {/* ── Finished ──────────────────────────────────────────────── */}
          <Section icon={<Trophy className="size-4" />} title="Finished" count={finished.length}>
            {finished.length === 0 ? (
              <EmptyState message="No finished books yet. Mark a book as read to see it here." href="/search" linkLabel="Find your first book" />
            ) : (
              <div className="grid grid-cols-3 gap-x-3 gap-y-6">
                {finished.map((book) => (
                  <ShelfBookCard key={book.userBookId} book={book} sizes="(max-width: 640px) 30vw, 130px" />
                ))}
              </div>
            )}
          </Section>

          {/* ── Milestones placeholder (Day 14) ──────────────────────── */}
          <Section icon={<span className="text-sm">✦</span>} title="Milestones">
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center space-y-1">
              <p className="text-sm text-foreground/40 font-sans">Milestones coming soon</p>
              <p className="text-xs text-foreground/30">Reading streaks, first book, 10-book club…</p>
            </div>
          </Section>

          {/* ── DNF placeholder (Day 9) ───────────────────────────────── */}
          <Section icon={<Ban className="size-4" />} title="Did not finish" count={dnf.length > 0 ? dnf.length : undefined}>
            <div className="rounded-xl border border-dashed border-border px-4 py-5 text-center space-y-1">
              <p className="text-sm text-foreground/40 font-sans">DNF shelf coming on Day 9</p>
              {dnf.length > 0 && (
                <p className="text-xs text-foreground/30">{dnf.length} book{dnf.length !== 1 ? "s" : ""} set aside</p>
              )}
            </div>
          </Section>
        </div>
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

// ── Sub-components ────────────────────────────────────────────────────────────

function Section({ icon, title, count, children }: {
  icon: React.ReactNode
  title: string
  count?: number
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-foreground/40">{icon}</span>
        <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/60 font-sans">{title}</h2>
        {count !== undefined && count > 0 && (
          <span className="ml-auto text-xs text-foreground/35 font-sans tabular-nums">{count}</span>
        )}
      </div>
      {children}
    </section>
  )
}

function HorizontalScroll({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 overflow-x-auto -mx-5 px-5 pb-1" style={{ scrollbarWidth: "none" }}>
      {children}
    </div>
  )
}

function EmptyState({ message, href, linkLabel }: { message: string; href: string; linkLabel: string }) {
  return (
    <div className="flex flex-col items-start gap-2 py-2">
      <p className="text-sm text-foreground/40 leading-relaxed">{message}</p>
      <Link href={href} className="text-xs font-medium underline underline-offset-2" style={{ color: "#9C4A2F" }}>
        {linkLabel} →
      </Link>
    </div>
  )
}

function ProfileSkeleton() {
  return (
    <div className="min-h-screen bg-background pb-16">
      <div className="flex flex-col items-center gap-3 px-6 pt-12 pb-6">
        <div className="size-20 rounded-full bg-muted animate-pulse" />
        <div className="h-6 w-36 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-56 rounded bg-muted animate-pulse" />
      </div>
      <div className="space-y-8 px-5">
        {["Currently reading", "Want to read", "Finished"].map((label) => (
          <div key={label}>
            <div className="h-3 w-28 rounded bg-muted animate-pulse mb-4" />
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => <ShelfBookCardSkeleton key={i} className="w-[110px]" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
