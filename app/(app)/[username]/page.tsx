"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"
import { ChevronLeft } from "lucide-react"
import { fetchProfileByUsername } from "@/lib/profile"
import { UserProfileView } from "@/components/profile/UserProfileView"

/**
 * Canonical, shareable profile route: /[username] (e.g. joinverso.io/maria).
 *
 * Sits at the (app) root, so every literal sibling route — /home, /friends,
 * /search, /shelf, /me, /book, /user — wins over this dynamic segment (Next
 * resolves static before dynamic), and reserved handles can't be claimed anyway.
 * Resolves the handle → user id (case-insensitive), then renders the shared
 * UserProfileView; an unknown handle shows a clean not-found state.
 */
export default function UsernameProfilePage() {
  const { username } = useParams<{ username: string }>()
  const [targetId, setTargetId] = useState<string | null>(null)
  const [state, setState] = useState<"loading" | "found" | "notfound">("loading")

  useEffect(() => {
    let cancelled = false
    setState("loading")
    fetchProfileByUsername(username).then((profile) => {
      if (cancelled) return
      if (profile) {
        setTargetId(profile.id)
        setState("found")
      } else {
        setState("notfound")
      }
    })
    return () => { cancelled = true }
  }, [username])

  if (state === "notfound" || (state === "found" && !targetId)) {
    return <UserNotFound username={username} />
  }

  if (state === "loading" || !targetId) {
    return <ResolveLoading />
  }

  return <UserProfileView targetId={targetId} />
}

// ── States ──────────────────────────────────────────────────────────────────

function UserNotFound({ username }: { username: string }) {
  const router = useRouter()
  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>
      <div className="flex flex-col items-center justify-center gap-2 px-6 pt-24 text-center">
        <h1
          className="text-2xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          No one here
        </h1>
        <p className="text-sm text-foreground/50 leading-relaxed max-w-xs">
          We couldn’t find a reader at{" "}
          <span className="font-medium text-foreground/70">@{username}</span>.
          The handle may have changed, or the link’s off.
        </p>
        <Link
          href="/home"
          className="mt-3 text-sm font-medium underline underline-offset-4"
          style={{ color: "#9C4A2F" }}
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}

function ResolveLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="px-3 py-3">
        <div className="flex items-center gap-1 text-foreground/30">
          <ChevronLeft className="size-5" />
          <span className="text-sm">Back</span>
        </div>
      </div>
      <div className="px-6 pt-4 pb-6 flex flex-col items-center gap-3">
        <div className="size-20 rounded-full bg-muted animate-pulse" />
        <div className="h-7 w-40 rounded-lg bg-muted animate-pulse" />
        <div className="h-4 w-24 rounded bg-muted animate-pulse" />
      </div>
    </div>
  )
}
