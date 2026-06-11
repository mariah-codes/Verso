"use client"

import { useEffect, useState } from "react"

/**
 * Soft-keyboard state for standalone-PWA layout fixes.
 *
 * - `inputFocused`: any text field (input / textarea / contenteditable) is
 *   focused. Used to hide the fixed bottom nav while typing — in a standalone
 *   PWA a position:fixed bottom element otherwise floats above the keyboard.
 * - `keyboardInset`: px the on-screen keyboard overlaps the layout viewport
 *   bottom, derived from window.visualViewport. CSS/dvh units do NOT react to
 *   the keyboard in a standalone PWA, so this is the only reliable source.
 *   0 when the keyboard is closed (or visualViewport is unavailable).
 */
export function useKeyboard() {
  const [inputFocused, setInputFocused] = useState(false)
  const [keyboardInset, setKeyboardInset] = useState(0)
  // Installed PWA (standalone display mode). Lets callers hide the nav the
  // instant a field is focused on iOS without affecting a desktop browser tab,
  // where focusing a comment box shouldn't make the tab bar vanish. Lazy init
  // (not effect setState); the nav is never hidden at mount, so no hydration
  // mismatch even though the server renders this false.
  const [standalone] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches,
  )

  useEffect(() => {
    const isField = (el: EventTarget | null): boolean =>
      el instanceof HTMLElement &&
      (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)

    const onFocusIn = (e: FocusEvent) => {
      if (isField(e.target)) setInputFocused(true)
    }
    const onFocusOut = () => {
      // Defer: focus hopping between two fields fires focusout→focusin, and we
      // don't want to flash the nav back on between them. Re-check what's focused.
      requestAnimationFrame(() => setInputFocused(isField(document.activeElement)))
    }

    document.addEventListener("focusin", onFocusIn)
    document.addEventListener("focusout", onFocusOut)

    const vv = window.visualViewport
    const updateInset = () => {
      if (!vv) return
      // Layout viewport bottom minus the visible viewport bottom = keyboard overlap.
      setKeyboardInset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop))
    }
    vv?.addEventListener("resize", updateInset)
    vv?.addEventListener("scroll", updateInset)
    updateInset()

    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      vv?.removeEventListener("resize", updateInset)
      vv?.removeEventListener("scroll", updateInset)
    }
  }, [])

  return { inputFocused, keyboardInset, standalone }
}
