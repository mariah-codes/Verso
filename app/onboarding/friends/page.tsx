"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Search } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar } from "@/components/shared/Avatar"
import { useDebounce } from "@/hooks/use-debounce"
import { searchUsers, followUser, unfollowUser, type SearchResult } from "@/lib/follows"
import { completeOnboarding } from "@/lib/onboarding"

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
      <div className="pt-2 pb-5 shrink-0">
        <h1 className="text-3xl text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Find your friends
        </h1>
        <p className="text-sm text-foreground/55 mt-2">
          Verso works through people — follow a few readers whose taste you trust.
        </p>
      </div>

      {/* Search */}
      <div className="shrink-0 flex items-center gap-2 rounded-xl border border-[rgba(31,27,22,0.07)] bg-muted/40 px-3.5 mb-3 focus-within:border-[#9C4A2F]/50">
        <Search className="size-4 text-foreground/40 shrink-0"  strokeWidth={1.75} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name"
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
              <div key={u.id} className="flex items-center gap-3 py-2.5">
                <Avatar displayName={u.displayName} photoUrl={u.photoUrl} size={40} initialsClassName="text-sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{u.displayName}</p>
                </div>
                <button
                  onClick={() => toggleFollow(u)}
                  disabled={pending.has(u.id)}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                    u.isFollowing
                      ? "border border-foreground/20 text-foreground/55"
                      : "text-white"
                  }`}
                  style={u.isFollowing ? undefined : { backgroundColor: "#9C4A2F" }}
                >
                  {u.isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
        ) : query.trim() ? (
          <p className="text-sm text-foreground/40 py-6 text-center">No one by that name.</p>
        ) : null}
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
