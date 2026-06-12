"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { TabBar } from "@/components/shared/TabBar"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Shared layout for the signed-in app: the five tabs (/home, /friends, /search,
 * /shelf, /me) plus pushed content views (/book/[id], /user/[id]) — all get the
 * bottom tab nav so no normal view is a navigational dead-end.
 * NOT applied to the landing page or auth pages (pre-auth, intentionally nav-less).
 *
 * Onboarding gate: a signed-out visitor → "/", and a signed-in user who never
 * finished onboarding (onboarded_at IS NULL) → /onboarding/profile. This is the
 * single chokepoint that catches an abandoned-onboarding account no matter how
 * it reached an app route — a fresh password sign-in, an OAuth callback, a
 * refresh, or a deep link. Without it, sign-in pushes straight to /home and the
 * half-onboarded user is never sent back. Mirrors the (inverse) guard in
 * app/onboarding/layout.tsx, which bounces already-onboarded users to /home.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function guard() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/"); return }
      const { data } = await db.from("users").select("onboarded_at").eq("id", user.id).single()
      if (cancelled) return
      if (!data?.onboarded_at) { router.replace("/onboarding/profile"); return }
      setReady(true)
    }
    guard()
    return () => { cancelled = true }
  }, [router])

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <>
      {/* Bottom clearance: when the keyboard is CLOSED, clear the fixed tab bar
          (~64px) plus the home-bar safe area. When OPEN, --keyboard-inset (set
          from visualViewport by TabBar) wins, giving the page room to scroll
          bottom content — the comment composer — above the keyboard. max() means
          the keyboard inset replaces (not stacks on) the safe area, so they
          never double-count. */}
      <div
        style={{
          paddingBottom:
            "max(calc(5rem + env(safe-area-inset-bottom)), var(--keyboard-inset, 0px))",
        }}
      >
        {children}
      </div>
      <TabBar />
    </>
  )
}
