import { useState, useEffect } from "react"

/**
 * Returns a debounced copy of `value` that only updates after `delay` ms of
 * inactivity. Use this to avoid firing a search on every keystroke.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])

  return debouncedValue
}
