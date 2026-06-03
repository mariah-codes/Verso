import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import type { Database } from "./database.types"

/**
 * Creates a Supabase client that reads/writes session cookies.
 * Use this in Route Handlers and Server Components — never in Client Components.
 * Client Components should import `supabase` from `@/lib/supabase` instead.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll is called from Server Components where cookies are read-only.
            // Route Handlers and Middleware can set cookies without error.
          }
        },
      },
    }
  )
}
