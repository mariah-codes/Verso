import { TabBar } from "@/components/shared/TabBar"

/**
 * Shared layout for the signed-in app: the five tabs (/home, /friends, /search,
 * /shelf, /me) plus pushed content views (/book/[id], /user/[id]) — all get the
 * bottom tab nav so no normal view is a navigational dead-end.
 * NOT applied to the landing page or auth pages (pre-auth, intentionally nav-less).
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
