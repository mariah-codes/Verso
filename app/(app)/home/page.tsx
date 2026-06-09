"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getWeeklyPicks, type EnrichedPick } from "@/lib/weekly-picks-data"
import { WeeklyPicksSection } from "@/components/home/WeeklyPicksSection"

export default function HomePage() {
  const [picks, setPicks] = useState<EnrichedPick[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }
      const result = await getWeeklyPicks(user.id)
      if (!cancelled) {
        setPicks(result)
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-background pb-8">
      <WeeklyPicksSection picks={picks} loading={loading} />

      {/* ── Feed (next pass) ───────────────────────────────────────────────── */}
      <section className="px-5 pt-10">
        <h2
          className="text-xs font-semibold tracking-widest uppercase text-foreground/40 font-sans mb-3"
        >
          From your circle
        </h2>
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-foreground/40">Friend activity is coming soon.</p>
        </div>
      </section>
    </div>
  )
}
