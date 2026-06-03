"use client"

import { useState, useEffect } from "react"
import { searchBooks, type BookSearchResult } from "@/lib/open-library"
import { useDebounce } from "./use-debounce"

interface UseBookSearchReturn {
  query: string
  setQuery: (q: string) => void
  results: BookSearchResult[]
  isLoading: boolean
  error: string | null
}

/**
 * Manages Open Library search state.
 * Debounces the query by 300 ms before firing a network request.
 */
export function useBookSearch(): UseBookSearchReturn {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<BookSearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const debouncedQuery = useDebounce(query, 300)

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([])
      setError(null)
      return
    }

    let cancelled = false

    async function run() {
      setIsLoading(true)
      setError(null)
      try {
        const data = await searchBooks(debouncedQuery)
        if (!cancelled) setResults(data)
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Search failed")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    run()

    // If the query changes before the fetch resolves, discard the stale result
    return () => {
      cancelled = true
    }
  }, [debouncedQuery])

  return { query, setQuery, results, isLoading, error }
}
