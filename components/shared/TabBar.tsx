"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect } from "react"
import { Home, Users, Search, LibraryBig, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { useKeyboard } from "@/lib/hooks/use-keyboard"

const TABS = [
  { href: "/home",    label: "Home",    Icon: Home       },
  { href: "/friends", label: "Friends", Icon: Users      },
  { href: "/search",  label: "Search",  Icon: Search     },
  { href: "/shelf",   label: "Shelf",   Icon: LibraryBig },
  { href: "/me",      label: "You",     Icon: User       },
] as const

export function TabBar() {
  const pathname = usePathname()
  const { inputFocused, keyboardInset, standalone } = useKeyboard()

  // Hide while typing in the installed PWA (immediate, no float flash) or once a
  // keyboard actually overlaps (covers mobile browser tabs); never on desktop.
  const hideNav = inputFocused && (standalone || keyboardInset > 0)

  // Publish the keyboard overlap app-wide so bottom content (e.g. the comment
  // composer) can clear it via CSS — see app/(app)/layout.tsx.
  useEffect(() => {
    document.documentElement.style.setProperty("--keyboard-inset", `${keyboardInset}px`)
  }, [keyboardInset])

  return (
    <nav
      className={cn(
        "fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border",
        // Hide entirely while typing: in a standalone PWA a fixed bottom nav
        // otherwise floats above the keyboard. display:none also removes its
        // safe-area padding, so it can't double-count with the keyboard.
        hideNav && "hidden",
      )}
      // Real home-bar inset when shown (needs viewport-fit=cover; see app/layout).
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Main navigation"
    >
      <div className="flex">
        {TABS.map(({ href, label, Icon }) => {
          const active = pathname === href || pathname.startsWith(href + "/")
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex-1 flex flex-col items-center gap-1 py-2.5 transition-opacity active:opacity-60"
            >
              <Icon
                className="size-[22px]"
                strokeWidth={1.75}
                style={{ color: active ? "#9C4A2F" : "color-mix(in srgb, var(--foreground) 35%, transparent)" }}
              />
              <span
                className="text-xs font-medium tracking-wide"
                style={{ color: active ? "#9C4A2F" : "color-mix(in srgb, var(--foreground) 35%, transparent)" }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
