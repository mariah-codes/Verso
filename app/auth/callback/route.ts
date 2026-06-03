import { NextResponse } from "next/server"
import { createSupabaseServerClient } from "@/lib/supabase-server"

/**
 * OAuth callback handler.
 *
 * Supabase redirects here after Google (or any provider) authenticates the user.
 * We exchange the one-time `code` for a real session, then redirect the user onward.
 *
 * The `next` query param controls where to send the user after auth:
 *   - Sign-up flow passes ?next=/onboarding/profile
 *   - Sign-in flow passes ?next=/home  (or nothing — /home is the default)
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/home"

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Something went wrong — send back to sign-in with an error flag
  return NextResponse.redirect(`${origin}/sign-in?error=oauth_failed`)
}
