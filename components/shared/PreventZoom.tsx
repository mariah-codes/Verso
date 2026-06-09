"use client"

import { useEffect } from "react"

/**
 * Prevents pinch-to-zoom in iOS Safari via event listeners.
 * The meta-tag approach (`user-scalable=no`) and CSS (`touch-action: pan-x pan-y`)
 * are insufficient on iOS 10+ — Safari ignores them for accessibility. Blocking
 * multi-touch events directly is the only reliable fix.
 *
 * What is blocked: touches.length > 1 (two-finger pinch), gesturestart/change.
 * What is NOT blocked: single-finger scroll (both vertical and horizontal).
 * The horizontal weekly-picks strip works normally — it's a single-finger swipe.
 *
 * Renders nothing (null). Mounted once in the root layout body.
 */
export function PreventZoom() {
  useEffect(() => {
    const preventZoom = (e: TouchEvent) => {
      if (e.touches.length > 1) e.preventDefault()
    }
    const preventGesture = (e: Event) => {
      e.preventDefault()
    }
    document.addEventListener("touchstart",    preventZoom,    { passive: false })
    document.addEventListener("touchmove",     preventZoom,    { passive: false })
    document.addEventListener("gesturestart",  preventGesture, { passive: false })
    document.addEventListener("gesturechange", preventGesture, { passive: false })
    return () => {
      document.removeEventListener("touchstart",    preventZoom)
      document.removeEventListener("touchmove",     preventZoom)
      document.removeEventListener("gesturestart",  preventGesture)
      document.removeEventListener("gesturechange", preventGesture)
    }
  }, [])
  return null
}
