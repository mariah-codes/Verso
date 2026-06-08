"use client"

import { useEffect, useRef, useState } from "react"
import {
  Bookmark,
  BookOpen,
  BookX,
  Check,
  Trash2,
  AlertCircle,
  type LucideIcon,
} from "lucide-react"
import type { BookStatus } from "@/lib/books"

// ── Types ─────────────────────────────────────────────────────────────────────

export type ToastVariant = "status" | "removed" | "dnf" | "error"

export interface ToastPayload {
  variant: ToastVariant
  /** For "status" toasts: the BookStatus that was applied. */
  status?: BookStatus
  /** Book title — shown on the second line for status/removed/dnf toasts. */
  bookTitle?: string
  /** For "error" toasts: the message to display. */
  message?: string
}

// ── Config ────────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<
  BookStatus,
  { Icon: LucideIcon; label: string }
> = {
  want_to_read: { Icon: Bookmark,  label: "Saved to Want to read"       },
  reading:      { Icon: BookOpen,  label: "Moved to Currently reading"  },
  finished:     { Icon: Check,     label: "Marked as Finished"          },
  dnf:          { Icon: BookX,     label: "Moved to Did not finish"     },
}

const TERRACOTTA = "#D9744A"
const BRICK      = "#A8321A"

const AUTO_DISMISS_MS = 2800

// ── Component ─────────────────────────────────────────────────────────────────

interface ToastProps {
  payload: ToastPayload | null
  onDismiss: () => void
}

/**
 * Warm-dark toast notification. Single source of truth for all toast UI.
 * Always left-aligned:
 *   [icon]  action label (muted cream)
 *           book title   (cream, if present)
 *
 * Callers control visibility by passing a payload (show) or null (hide).
 * The component handles its own auto-dismiss timer via onDismiss.
 */
export function Toast({ payload, onDismiss }: ToastProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (payload) {
      setVisible(true)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        setVisible(false)
        // Small delay so fade-out finishes before payload clears
        setTimeout(onDismiss, 300)
      }, AUTO_DISMISS_MS)
    } else {
      setVisible(false)
    }
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [payload, onDismiss])

  if (!payload) return null

  // Resolve content
  let Icon: LucideIcon
  let label: string
  let iconColor: string
  let bookTitle: string | undefined

  if (payload.variant === "error") {
    Icon      = AlertCircle
    label     = payload.message ?? "Something went wrong"
    iconColor = BRICK
  } else if (payload.variant === "removed") {
    Icon      = Trash2
    label     = "Removed from shelf"
    iconColor = TERRACOTTA
    bookTitle = payload.bookTitle
  } else if (payload.variant === "dnf") {
    Icon      = BookX
    label     = "Did not finish"
    iconColor = TERRACOTTA
    bookTitle = payload.bookTitle
  } else {
    // "status"
    const cfg = STATUS_CONFIG[payload.status ?? "want_to_read"]
    Icon      = cfg.Icon
    label     = cfg.label
    iconColor = TERRACOTTA
    bookTitle = payload.bookTitle
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-6 inset-x-4 z-50 flex justify-center pointer-events-none"
    >
      <div
        className="flex items-start gap-3 w-full max-w-sm pointer-events-auto transition-all duration-300 ease-out"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? "translateY(0)" : "translateY(6px)",
          backgroundColor: "#1F1B16",
          borderRadius: "14px",
          padding: "14px 18px",
          boxShadow: "0 6px 22px rgba(31,27,22,0.14)",
        }}
      >
        {/* Icon */}
        <Icon
          className="mt-px shrink-0"
          style={{ width: 19, height: 19, color: iconColor }}
          strokeWidth={1.75}
        />

        {/* Text */}
        <div className="min-w-0">
          <p
            className="leading-snug"
            style={{ fontSize: 12, color: "#B7AE9F" }}
          >
            {label}
          </p>
          {bookTitle && (
            <p
              className="leading-snug truncate"
              style={{ fontSize: 14, fontWeight: 500, color: "#FAF8F4", marginTop: 1 }}
            >
              {bookTitle}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * Convenience hook — returns `[payload, show, dismiss]`.
 * `show(payload)` fires a toast; `dismiss()` clears it.
 */
export function useToast() {
  const [payload, setPayload] = useState<ToastPayload | null>(null)

  function show(p: ToastPayload) {
    setPayload(p)
  }

  function dismiss() {
    setPayload(null)
  }

  return [payload, show, dismiss] as const
}
