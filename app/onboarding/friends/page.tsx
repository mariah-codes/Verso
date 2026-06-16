"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDebounce } from "@/hooks/use-debounce"
import { searchUsers, followUser, unfollowUser, type SearchResult } from "@/lib/follows"
import { completeOnboarding } from "@/lib/onboarding"
import { FriendSearchRow, FriendSearchHint } from "@/components/friends/FriendSearchRow"
import { ScreenHeading } from "@/components/shared/ScreenHeading"

export default function OnboardingFriends() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const debounced = useDebounce(query, 300)
  const [results, setResults] = useState<SearchResult[]>([])
  // The query these results belong to — lets us derive "searching" / stale-clear
  // without any synchronous setState inside the search effect.
  const [resultsFor, setResultsFor] = useState("")
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [finishing, setFinishing] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.replace("/"); return }
      setUserId(data.user.id)
    })
  }, [router])

  useEffect(() => {
    const q = debounced.trim()
    if (!q || !userId) return
    let cancelled = false
    searchUsers(q, userId).then((r) => {
      if (cancelled) return
      setResults(r)
      setResultsFor(q)
    })
    return () => { cancelled = true }
  }, [debounced, userId])

  const q = debounced.trim()
  const shown = q && resultsFor === q ? results : []
  const searching = !!q && resultsFor !== q

  async function toggleFollow(target: SearchResult) {
    if (!userId || pending.has(target.id)) return
    setPending((p) => new Set(p).add(target.id))
    const next = !target.isFollowing
    setResults((rs) => rs.map((r) => (r.id === target.id ? { ...r, isFollowing: next } : r)))
    // Reconcile the button to the real follows-table state the mutation read
    // back, so it can't drift out of sync after a re-follow.
    const { isFollowing: confirmed } = next
      ? await followUser(userId, target.id)
      : await unfollowUser(userId, target.id)
    setResults((rs) => rs.map((r) => (r.id === target.id ? { ...r, isFollowing: confirmed } : r)))
    setPending((p) => { const n = new Set(p); n.delete(target.id); return n })
  }

  async function finish() {
    if (!userId || finishing) return
    setFinishing(true)
    await completeOnboarding(userId)
    router.replace("/home")
  }

  return (
    <div className="flex-1 flex flex-col px-5 pb-8 min-h-0">
      <ScreenHeading
        title="Find your friends"
        subtitle="Verso works through people — follow a few readers whose taste you trust."
        className="pt-2 pb-5 shrink-0"
      />

      {/* Search */}
      <div className="shrink-0 flex items-center gap-2 rounded-xl border border-[rgba(31,27,22,0.07)] bg-muted/40 px-3.5 mb-3 focus-within:border-[#9C4A2F]/50">
        <Search className="size-4 text-foreground/40 shrink-0"  strokeWidth={1.75} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search a name or @handle"
          autoCapitalize="none"
          className="flex-1 bg-transparent py-3 text-base text-foreground placeholder:text-foreground/40 outline-none"
        />
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto -mx-1 px-1">
        {searching ? (
          <p className="text-sm text-foreground/40 py-6 text-center">Searching…</p>
        ) : shown.length > 0 ? (
          <div className="divide-y divide-border/50">
            {shown.map((u) => (
              <FriendSearchRow
                key={u.id}
                user={u}
                pending={pending.has(u.id)}
                onToggle={() => toggleFollow(u)}
              />
            ))}
          </div>
        ) : query.trim() ? (
          <p className="text-sm text-foreground/40 py-6 text-center">No one by that name.</p>
        ) : (
          // Before the user types — same open-book hint as the main Find Friends tab.
          <FriendSearchHint>
            Search a name or @handle to find readers you trust.
          </FriendSearchHint>
        )}
      </div>

      {/* CTA + skip */}
      <div className="shrink-0 pt-3">
        <button
          onClick={finish}
          disabled={finishing}
          className="w-full rounded-xl py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-60"
          style={{ backgroundColor: "#9C4A2F" }}
        >
          {finishing ? "Finishing…" : "Done"}
        </button>
        <button
          onClick={finish}
          disabled={finishing}
          className="mx-auto mt-3 block text-xs text-foreground/40 underline underline-offset-4"
        >
          I’ll do this later
        </button>
      </div>
    </div>
  )
}
