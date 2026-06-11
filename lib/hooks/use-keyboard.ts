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
  // Touch-primary device (phone/tablet) — i.e. one with a soft keyboard. This,
  // not "standalone", is the reliable signal: `display-mode: standalone` is
  // flaky on iOS, and the keyboard inset can read 0 in a standalone PWA (the
  // viewport doesn't always shrink). A coarse pointer lets callers hide the nav
  // the instant a field is focused on a phone, while never touching desktop
  // (fine pointer), where focusing a comment box shouldn't vanish the tab bar.
  // Lazy init (not effect setState); the nav is never hidden at mount, so the
  // server-rendered `false` can't cause a hydration mismatch.
  const [coarsePointer] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches,
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
    let raf = 0
    const updateInset = () => {
      if (!vv) return
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() =>
        // Keyboard height = layout viewport − visible viewport. Deliberately NOT
        // minus offsetTop: offsetTop fluctuates during a scroll gesture, which
        // would thrash this value (and the layout) mid-scroll. The keyboard's
        // height only changes when it opens/closes, so listen to 'resize' ONLY,
        // never 'scroll'.
        setKeyboardInset(Math.max(0, window.innerHeight - vv.height)),
      )
    }
    vv?.addEventListener("resize", updateInset)
    updateInset()

    return () => {
      document.removeEventListener("focusin", onFocusIn)
      document.removeEventListener("focusout", onFocusOut)
      vv?.removeEventListener("resize", updateInset)
      cancelAnimationFrame(raf)
    }
  }, [])

  return { inputFocused, keyboardInset, coarsePointer }
}
