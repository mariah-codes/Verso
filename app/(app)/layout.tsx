import { TabBar } from "@/components/shared/TabBar"

/**
 * Shared layout for the four main app tabs: /home, /friends, /search, /me.
 * NOT applied to the landing page, auth pages, onboarding, or /book/[id].
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* pb-20 ensures content isn't hidden behind the fixed 64px tab bar */}
      <div className="pb-20">{children}</div>
      <TabBar />
    </>
  )
}
