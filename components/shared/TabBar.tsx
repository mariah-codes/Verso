"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home, Users, Search, LibraryBig, User } from "lucide-react"

const TABS = [
  { href: "/home",    label: "Home",    Icon: Home       },
  { href: "/friends", label: "Friends", Icon: Users      },
  { href: "/search",  label: "Search",  Icon: Search     },
  { href: "/shelf",   label: "Shelf",   Icon: LibraryBig },
  { href: "/me",      label: "You",     Icon: User       },
] as const

export function TabBar() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 z-40 bg-background/95 backdrop-blur-sm border-t border-border"
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
                className="text-[10px] font-medium tracking-wide"
                style={{ color: active ? "#9C4A2F" : "color-mix(in srgb, var(--foreground) 35%, transparent)" }}
              >
                {label}
              </span>
            </Link>
          )
        })}
      </div>
      {/* iOS home-indicator safe area */}
      <div className="h-safe-area-inset-bottom" />
    </nav>
  )
}
