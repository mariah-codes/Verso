"use client"

import { Bookmark, BookX } from "lucide-react"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"

interface StopReadingSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Save for later → want_to_read (keeps the was_started flag). */
  onSaveForLater: () => void
  /** Did not finish → dnf (private, kept out of recs). */
  onDnf: () => void
  /** A status update is in flight — disables both rows. */
  pending: boolean
}

/**
 * Bottom sheet shown when stopping a currently-reading book. Two neutral,
 * equal-weight options — "DNF without shame", so nothing here reads as an
 * error/alert: no terracotta, no warning copy. Swipe-down or tap-outside
 * dismisses (handled by the Drawer primitive).
 */
export function StopReadingSheet({
  open,
  onOpenChange,
  onSaveForLater,
  onDnf,
  pending,
}: StopReadingSheetProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      {/* bg-background = warm cream, matching every other surface in the app.
          Generous bottom padding (plus safe-area inset) lifts Cancel clear of
          the floating bottom-left nav/dev button so nothing overlaps. */}
      <DrawerContent className="bg-background pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
        {/* Extra breathing room below the grab handle before the title block */}
        <DrawerHeader className="text-left px-5 pt-6 pb-0 gap-1.5">
          {/* Inline fontFamily forces sans — DrawerTitle's `font-heading` maps to
              --font-serif and would otherwise win on specificity. */}
          <DrawerTitle
            className="text-left text-base font-medium text-foreground"
            style={{ fontFamily: "var(--font-sans)" }}
          >
            Stop reading this?
          </DrawerTitle>
          <DrawerDescription className="text-left text-foreground/55">
            You can pick it back up anytime.
          </DrawerDescription>
        </DrawerHeader>

        {/* pt-6 separates the title block from the first option row */}
        <div className="px-5 pt-6 pb-2 space-y-2.5">
          <OptionRow
            Icon={Bookmark}
            title="Save for later"
            subtitle="Back on your want-to-read shelf"
            onClick={onSaveForLater}
            disabled={pending}
          />
          <OptionRow
            Icon={BookX}
            title="Did not finish"
            subtitle="Private · kept out of recs"
            onClick={onDnf}
            disabled={pending}
          />
        </div>

        {/* pt-5 lifts Cancel away from the option rows */}
        <DrawerFooter className="px-5 pt-5 pb-2">
          <DrawerClose asChild>
            <button
              disabled={pending}
              className="mx-auto text-sm text-foreground/40 hover:text-foreground/60 underline underline-offset-4 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function OptionRow({
  Icon,
  title,
  subtitle,
  onClick,
  disabled,
}: {
  Icon: React.ElementType
  title: string
  subtitle: string
  onClick: () => void
  disabled: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "flex items-center gap-3.5 w-full rounded-xl px-4 py-3.5 text-left",
        "border border-border bg-foreground/[0.04] hover:bg-foreground/[0.07] transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
      ].join(" ")}
    >
      <Icon className="size-5 shrink-0 text-foreground/55" strokeWidth={1.75} />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-foreground/70 leading-snug">
          {title}
        </span>
        <span className="block text-xs text-foreground/40 leading-snug mt-0.5">
          {subtitle}
        </span>
      </span>
    </button>
  )
}
