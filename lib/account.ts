// ── Account settings — data logic for the /settings page ──────────────────────
// Pure Supabase interactions, no React. Email/password changes go straight
// through supabase.auth.updateUser in the page (they're single SDK calls on the
// auth user, not table writes); this module covers the public.users profile
// write and the best-effort account-data wipe.

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

/**
 * Update the signed-in user's profile row (display name + username). Same write
 * the onboarding profile step makes (saveOnboardingProfile) — username is
 * lowercased/trimmed to match the UNIQUE(lower(username)) index. Validation and
 * availability are the caller's responsibility (the page reuses the shared
 * username rules); this just persists.
 */
export async function updateProfile(
  userId: string,
  p: { displayName: string; username: string },
): Promise<{ error: string | null }> {
  const { error } = await db
    .from("users")
    .update({
      display_name: p.displayName.trim(),
      username: p.username.trim().toLowerCase(),
    })
    .eq("id", userId)
  return { error: error?.message ?? null }
}

/**
 * Best-effort account-data wipe for "Delete account".
 *
 * ⚠️ This does NOT fully delete the account. Removing the auth.users row — which
 * cascades to public.users and every owned table (user_books, follows,
 * comparisons, reactions, comments, weekly_picks all REFERENCE users ON DELETE
 * CASCADE) — requires the service-role key (supabase.auth.admin.deleteUser) or a
 * SECURITY DEFINER RPC, neither of which is safe to expose client-side. There is
 * also no DELETE RLS policy on public.users, so the client can't even remove its
 * own profile row.
 *
 * What the client CAN do under RLS: delete its own user_books rows (owner DELETE
 * policy). So we clear the shelf — the bulk of personal reading data — then the
 * caller signs the user out. A server action (Edge Function / RPC with the
 * service role) is still required to purge the auth user and remaining rows; see
 * the flag in the page and the summary.
 */
export async function deleteAccountData(
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await db.from("user_books").delete().eq("user_id", userId)
  return { error: error?.message ?? null }
}
