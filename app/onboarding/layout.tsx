"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { OnboardingDots } from "@/components/onboarding/OnboardingDots"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

const STEP_BY_PATH: Record<string, number> = {
  "/onboarding/profile": 1,
  "/onboarding/covers": 2,
  "/onboarding/rank": 3,
  "/onboarding/friends": 4,
}

/**
 * Gate + chrome for the onboarding flow. Renders /onboarding/* only when the
 * signed-in user has onboarded_at = null; a signed-out user → "/", an already
 * onboarded user → "/home". The step-dot indicator persists across all steps
 * (this layout stays mounted across client navigations between them).
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function guard() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/"); return }
      const { data } = await db.from("users").select("onboarded_at").eq("id", user.id).single()
      if (cancelled) return
      if (data?.onboarded_at) { router.replace("/home"); return }
      setReady(true)
    }
    guard()
    return () => { cancelled = true }
  }, [router])

  const step = STEP_BY_PATH[pathname] ?? 1

  if (!ready) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="shrink-0 px-5 pt-safe pt-5 pb-3">
        <OnboardingDots step={step} />
      </header>
      <main className="flex-1 flex flex-col min-h-0">{children}</main>
    </div>
  )
}
