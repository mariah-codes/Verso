"use client"

import { Suspense, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { ShelfView } from "@/components/profile/ShelfView"

/**
 * A friend's full shelf, reached via "see all" on their profile. Same ShelfView
 * component as the own-shelf tab, just parameterised by the route's user id.
 * If you land on your own id here, it renders as your own shelf (no back-arrow
 * name header), keeping the component's two modes consistent.
 */
export default function UserShelfPage() {
  const { id: targetId } = useParams<{ id: string }>()
  const [isOwn, setIsOwn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setIsOwn(data.user?.id === targetId)
    })
  }, [targetId])

  // Wait until we know whether this is the viewer's own shelf, so the header
  // doesn't flip from friend-mode to own-mode after mount.
  if (isOwn === null) return <ShelfLoading />

  return (
    <Suspense fallback={<ShelfLoading />}>
      <ShelfView userId={targetId} isOwn={isOwn} />
    </Suspense>
  )
}

function ShelfLoading() {
  return (
    <div className="min-h-screen bg-background px-5 pt-4">
      <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
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
