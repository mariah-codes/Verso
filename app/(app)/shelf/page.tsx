"use client"

import { Suspense, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { ShelfView } from "@/components/profile/ShelfView"

/** The Shelf tab — a shortcut to the current user's own shelf view. */
export default function ShelfPage() {
  const [userId, setUserId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null))
  }, [])

  if (!userId) return <ShelfLoading />

  return (
    <Suspense fallback={<ShelfLoading />}>
      <ShelfView userId={userId} isOwn />
    </Suspense>
  )
}

function ShelfLoading() {
  return (
    <div className="min-h-screen bg-background px-5 pt-4">
      <div className="h-7 w-32 rounded-lg bg-muted animate-pulse" />
      <div className="mt-3 h-8 w-48 rounded-xl bg-muted animate-pulse" />
      <div className="mt-5 grid grid-cols-3 gap-x-3 gap-y-6">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-2">
            <div className="w-full aspect-[2/3] rounded-lg bg-muted animate-pulse" />
            <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  )
}
