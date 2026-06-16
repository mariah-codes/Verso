import { NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createSupabaseServerClient } from "@/lib/supabase-server"

/**
 * Auth callback handler — covers BOTH callback shapes Supabase can send here:
 *
 *  1. OAuth / PKCE  → `?code=…`            (exchangeCodeForSession)
 *  2. Email links   → `?token_hash=…&type=…` (verifyOtp) — signup confirmation,
 *     magic link, recovery, email-change. These never carry a `code`, so the
 *     old code-only handler fell through to the error branch even though the
 *     email was confirmed — which surfaced as a (wrong) Google-specific error.
 *
 * After the session is established we route by onboarding state rather than
 * trusting `next`: a brand-new account (onboarded_at IS NULL) → /onboarding/
 * profile, an existing one → /home. Password-recovery links are the exception —
 * they must land on /reset-password to set the new password.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const next = searchParams.get("next") ?? "/home"
  // Supabase can bounce back with its own error (e.g. an expired/already-used
  // confirmation link) and no credentials at all.
  const providerError = searchParams.get("error_description") ?? searchParams.get("error")

  const supabase = await createSupabaseServerClient()

  // Establish the session from whichever flow this is. Capture the real error so
  // the failure redirect can name the actual reason instead of a generic "auth".
  let ok = false
  let authError: unknown = null
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    authError = error
    ok = !error
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    authError = error
    ok = !error
  }

  if (!ok || providerError) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reason = providerError ?? (authError as any)?.message ?? (code || tokenHash ? "verify_failed" : "no_credentials")
    console.error("[auth/callback] failed:", reason)
    return NextResponse.redirect(`${origin}/sign-in?error=auth&reason=${encodeURIComponent(reason)}`)
  }

  // Password-recovery links land on the reset page regardless of onboarding.
  if (type === "recovery" || next.startsWith("/reset-password")) {
    return NextResponse.redirect(`${origin}${next}`)
  }

  // Route by onboarding state — new accounts finish onboarding first.
  let destination = "/home"
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = supabase as any
    const { data } = await db
      .from("users")
      .select("onboarded_at")
      .eq("id", user.id)
      .single()
    if (!data?.onboarded_at) destination = "/onboarding/profile"
  }

  return NextResponse.redirect(`${origin}${destination}`)
}
