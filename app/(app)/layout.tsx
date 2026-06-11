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
