"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { getWeeklyPicks, type EnrichedPick } from "@/lib/weekly-picks-data"
import { getFeed, type FeedEvent } from "@/lib/feed"
import { WeeklyPicksSection } from "@/components/home/WeeklyPicksSection"
import { FeedSection } from "@/components/home/FeedSection"

export default function HomePage() {
  const [userId, setUserId] = useState<string | null>(null)
  const [picks, setPicks] = useState<EnrichedPick[]>([])
  const [picksLoading, setPicksLoading] = useState(true)
  const [feed, setFeed] = useState<FeedEvent[]>([])
  const [feedLoading, setFeedLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) { setPicksLoading(false); setFeedLoading(false) }
        return
      }
      if (!cancelled) setUserId(user.id)
      // Both sections fetch on load, independently — the feed doesn't wait on
      // the (potentially compute-heavy) weekly-picks query.
      getWeeklyPicks(user.id).then((result) => {
        if (cancelled) return
        setPicks(result)
        setPicksLoading(false)
      })
      getFeed(user.id).then((result) => {
        if (cancelled) return
        setFeed(result)
        setFeedLoading(false)
      })
    }
    load()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="min-h-screen bg-background pb-8">
      <WeeklyPicksSection picks={picks} loading={picksLoading} />
      <FeedSection events={feed} loading={feedLoading} userId={userId} />
    </div>
  )
}
