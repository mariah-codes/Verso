// ── Usernames — rules, validation, availability, generation ───────────────────
// Pure rules + a DB availability check + a generator following the fallback
// ladder. Shared so the future edit/settings UI reuses the exact same rules.
//
// ⚠️ DUPLICATED LOGIC — KEEP IN SYNC.
// The username rules + generation ladder exist in TWO places on purpose:
//   • SQL: public.generate_username() in the signup migration, run by the
//     handle_new_user trigger (user rows are born there, and username is NOT NULL,
//     so the handle must be assigned atomically at insert).
//   • TS: this module — the canonical app-layer implementation for the future
//     edit/settings UI and availability checks.
// They cannot share code across the SQL/JS boundary. If you change ANY rule here
// (length, allowed chars, the first → first+last → +N ladder, the default seed),
// make the identical change in supabase/migrations/*_add_usernames.sql, or signup
// and the edit UI will silently disagree.

import { supabase } from "./supabase"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

// ── Rules (named constants) ───────────────────────────────────────────────────

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 20
/** Lowercase letters + digits only, must start with a letter, 3–20 chars. */
export const USERNAME_REGEX = /^[a-z][a-z0-9]{2,19}$/
/** Seed used when a name cleans down to nothing usable. */
export const USERNAME_DEFAULT_SEED = "reader"

/**
 * Handles no one may claim — top-level app routes (so a username can never shadow
 * /search etc.) plus common system/brand words. Static routes already win over
 * the /[username] dynamic route in Next, but this is defense-in-depth and also
 * stops auto-generation from emitting one.
 *
 * ⚠️ Mirrored in SQL (public.username_reserved). Keep the two lists in sync.
 */
export const RESERVED_USERNAMES = new Set<string>([
  // current + planned routes
  "home", "friends", "search", "shelf", "me", "book", "user", "settings",
  "onboarding", "auth", "signin", "signup", "login", "logout", "register",
  // system / generic
  "admin", "api", "app", "www", "root", "about", "help", "support", "contact",
  "terms", "privacy", "legal", "status", "blog", "explore", "feed", "discover",
  "notifications", "messages", "profile", "account", "new", "edit", "static",
  "public", "assets", "favicon", "robots", "sitemap", "null", "undefined",
  // brand
  "verso", "official", "team", "staff",
])

export interface UsernameValidation {
  ok: boolean
  /** Human-readable reason when ok === false. */
  error?: string
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a candidate username against the rules. Strict: input must already be
 * lowercase (uppercase counts as a disallowed character) — the edit UI should
 * lowercase before calling, matching how the generator produces handles.
 */
export function validateUsername(input: string): UsernameValidation {
  if (input.length < USERNAME_MIN_LENGTH)
    return { ok: false, error: `Username must be at least ${USERNAME_MIN_LENGTH} characters.` }
  if (input.length > USERNAME_MAX_LENGTH)
    return { ok: false, error: `Username must be ${USERNAME_MAX_LENGTH} characters or fewer.` }
  if (!/^[a-z]/.test(input))
    return { ok: false, error: "Username must start with a letter." }
  if (!/^[a-z0-9]+$/.test(input))
    return { ok: false, error: "Username can only contain lowercase letters and numbers." }
  if (!USERNAME_REGEX.test(input))
    return { ok: false, error: "Invalid username." }
  if (RESERVED_USERNAMES.has(input))
    return { ok: false, error: "That username isn’t available." }
  return { ok: true }
}

// ── Availability ──────────────────────────────────────────────────────────────

/**
 * Case-insensitive availability check against the DB. Returns true if no user
 * already holds the handle. (The UNIQUE index on lower(username) is the real
 * guarantee at write time; this is the friendly pre-check.)
 */
export async function isUsernameAvailable(username: string): Promise<boolean> {
  const handle = username.toLowerCase()
  const { data, error } = await db
    .from("users")
    .select("id")
    .ilike("username", handle) // no % / _ in valid handles → case-insensitive equality
    .limit(1)
    .maybeSingle()

  if (error) {
    console.error("[username] availability check:", error.message)
    return false // fail closed — don't claim a handle is free if we couldn't check
  }
  return !data
}

// ── Generation ────────────────────────────────────────────────────────────────

/** Clean a name fragment to the allowed alphabet: lowercase, drop disallowed
 *  characters, then drop any leading non-letters so it starts with a–z. */
function clean(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/^[^a-z]+/, "")
}

/**
 * The ordered candidate ladder (pure, no DB):
 *   1. first name alone           ("Maria Hamwi" → "maria")          — preferred
 *   2. first + last               ("maria" taken → "mariahamwi")
 *   3. first+last + n (2,3,…)      ("mariahamwi" taken → "mariahamwi2", …)
 * Mononyms (no last name) skip rung 2, so the ladder is first → first+n
 * ("maria" → "maria2" → …). Numbers are only ever appended to the first+last
 * form (or the bare first for mononyms) — never to produce "maria2" when a last
 * name exists. Every yielded value satisfies the rules (3–20, starts with a
 * letter); short/empty names fall back to USERNAME_DEFAULT_SEED.
 */
export function* usernameCandidates(firstName: string, lastName?: string): Generator<string> {
  const f = clean(firstName)
  const l = clean(lastName ?? "")

  const combined = f + l // first+last (or just first if no last)
  // Numbering base must be long enough that base+digit reaches the 3-char min.
  const base = (combined.length >= 2 ? combined : USERNAME_DEFAULT_SEED).slice(0, USERNAME_MAX_LENGTH)

  // 1. first name alone — only when it's a valid length on its own
  if (f.length >= USERNAME_MIN_LENGTH) yield f.slice(0, USERNAME_MAX_LENGTH)

  // 2. first + last — only when a last name exists and it differs from rung 1
  if (l && base.length >= USERNAME_MIN_LENGTH && base !== f) yield base

  // 3. numbered: base + n, trimming the base so the total stays within the max
  for (let n = 2; ; n++) {
    const suffix = String(n)
    yield base.slice(0, USERNAME_MAX_LENGTH - suffix.length) + suffix
  }
}

/**
 * Generate an available username via the ladder. Returns the first candidate that
 * isn't already taken.
 *
 * Race-safety: this is a best-effort pre-check — the DB's UNIQUE(lower(username))
 * index is the real guarantee. A caller that writes the row should catch a unique
 * violation and call generateUsername again (the now-committed collision will be
 * seen and the ladder advances). Capped so it always terminates.
 */
export async function generateUsername(firstName: string, lastName?: string): Promise<string> {
  let tried = 0
  for (const candidate of usernameCandidates(firstName, lastName)) {
    if (await isUsernameAvailable(candidate)) return candidate
    if (++tried >= 1000) return candidate // safety valve — effectively unreachable
  }
  // Generator is infinite; loop always returns above.
  return USERNAME_DEFAULT_SEED
}
