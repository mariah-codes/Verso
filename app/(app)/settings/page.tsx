"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronLeft, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { useDebounce } from "@/hooks/use-debounce"
import { validateUsername, isUsernameAvailable } from "@/lib/username"
import { updateProfile, deleteAccountData } from "@/lib/account"
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
  DrawerClose,
} from "@/components/ui/drawer"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type UsernameState = "idle" | "checking" | "ok" | "error"

export default function SettingsPage() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [isEmailUser, setIsEmailUser] = useState(false)

  // ── Account: name + username (saved together, like onboarding) ──────────────
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [savedName, setSavedName] = useState("")
  const [savedUsername, setSavedUsername] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileMsg, setProfileMsg] = useState<string | null>(null)
  const [availResult, setAvailResult] = useState<{ handle: string; free: boolean } | null>(null)
  const debouncedUsername = useDebounce(username, 350)

  // ── Email ────────────────────────────────────────────────────────────────
  const [currentEmail, setCurrentEmail] = useState("")
  const [newEmail, setNewEmail] = useState("")
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)

  // ── Password ─────────────────────────────────────────────────────────────
  const [newPassword, setNewPassword] = useState("")
  const [pwSaving, setPwSaving] = useState(false)
  const [pwMsg, setPwMsg] = useState<string | null>(null)
  const [pwError, setPwError] = useState<string | null>(null)

  // ── Danger zone ────────────────────────────────────────────────────────────
  const [signingOut, setSigningOut] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // ── Load current account ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/sign-in"); return }
      setUserId(user.id)
      setCurrentEmail(user.email ?? "")
      // Email-signup users can change their password; OAuth users authenticate
      // through their provider, so the password section is hidden for them.
      const providers: string[] =
        user.app_metadata?.providers ??
        (user.app_metadata?.provider ? [user.app_metadata.provider] : [])
      setIsEmailUser(providers.includes("email"))

      const { data } = await db
        .from("users")
        .select("display_name, username")
        .eq("id", user.id)
        .single()
      const name = data?.display_name ?? ""
      const handle = data?.username ?? ""
      setDisplayName(name)
      setUsername(handle)
      setSavedName(name)
      setSavedUsername(handle)
      setLoading(false)
    }
    load()
  }, [router])

  // ── Username availability (debounced, format-valid) ─────────────────────────
  useEffect(() => {
    const handle = debouncedUsername.trim().toLowerCase()
    if (!handle || !validateUsername(handle).ok) return
    let cancelled = false
    isUsernameAvailable(handle, userId ?? undefined).then((free) => {
      if (!cancelled) setAvailResult({ handle, free })
    })
    return () => { cancelled = true }
  }, [debouncedUsername, userId])

  // Derived username status — same ladder as the onboarding profile step.
  const handle = username.trim().toLowerCase()
  const format = handle ? validateUsername(handle) : null
  const unchangedHandle = handle === savedUsername
  let usernameState: UsernameState = "idle"
  let usernameError: string | null = null
  if (!handle || unchangedHandle) {
    usernameState = "idle"
  } else if (format && !format.ok) {
    usernameState = "error"
    usernameError = format.error ?? "Invalid username."
  } else if (availResult && availResult.handle === handle) {
    usernameState = availResult.free ? "ok" : "error"
    usernameError = availResult.free ? null : "That username’s taken."
  } else {
    usernameState = "checking"
  }

  const nameChanged = displayName.trim() !== savedName
  const handleChanged = handle !== savedUsername
  const usernameOkToSave = !handleChanged || usernameState === "ok"
  const canSaveProfile =
    !!displayName.trim() &&
    (nameChanged || handleChanged) &&
    usernameOkToSave &&
    !savingProfile

  async function handleSaveProfile() {
    if (!userId || !canSaveProfile) return
    setSavingProfile(true)
    setProfileMsg(null)
    const { error } = await updateProfile(userId, { displayName, username })
    setSavingProfile(false)
    if (error) { setProfileMsg(error); return }
    setSavedName(displayName.trim())
    setSavedUsername(handle)
    setProfileMsg("Saved")
  }

  async function handleChangeEmail() {
    const next = newEmail.trim()
    if (!next || emailSaving) return
    setEmailSaving(true)
    setEmailMsg(null)
    setEmailError(null)
    const { error } = await supabase.auth.updateUser({ email: next })
    setEmailSaving(false)
    if (error) { setEmailError(error.message); return }
    setEmailMsg(`Confirmation sent to ${next}. Click the link to finish the change.`)
    setNewEmail("")
  }

  async function handleChangePassword() {
    if (newPassword.length < 8 || pwSaving) return
    setPwSaving(true)
    setPwMsg(null)
    setPwError(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) { setPwError(error.message); return }
    setNewPassword("")
    setPwMsg("Password updated.")
  }

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    router.push("/sign-in")
  }

  async function handleDeleteAccount() {
    if (!userId) return
    setDeleting(true)
    // Best-effort client-side wipe: clears the user's shelf (user_books). Full
    // account removal needs a server action — see lib/account.ts.
    await deleteAccountData(userId)
    await supabase.auth.signOut()
    router.push("/sign-in")
  }

  if (loading) {
    return <div className="min-h-screen bg-background" />
  }

  return (
    <div className="min-h-screen bg-background pb-16">
      {/* ── Back ────────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/90 backdrop-blur-sm px-3 py-3">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-foreground/50 hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-5" />
          <span className="text-sm">Back</span>
        </button>
      </div>

      <div className="px-5">
        <h1 className="text-3xl text-foreground leading-tight mb-10" style={{ fontFamily: "var(--font-serif)" }}>
          Settings
        </h1>

        {/* ── ACCOUNT ──────────────────────────────────────────────────────── */}
        <SectionLabel>Account</SectionLabel>
        <div className="mt-5 space-y-5">
          {/* Display name */}
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => { setDisplayName(e.target.value); setProfileMsg(null) }}
              maxLength={50}
              placeholder="Your name"
              className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground placeholder:text-foreground/30 outline-none focus:border-[#9C4A2F]/50"
            />
          </Field>

          {/* Username */}
          <Field label="Username">
            <div className="flex items-center rounded-xl border border-border bg-muted/40 px-4 focus-within:border-[#9C4A2F]/50">
              <span className="text-base text-foreground/40">@</span>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))
                  setProfileMsg(null)
                }}
                maxLength={20}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="flex-1 bg-transparent px-1 py-3 text-base text-foreground outline-none"
              />
              {usernameState === "checking" && <Loader2 className="size-4 text-foreground/30 animate-spin" />}
              {usernameState === "ok" && <span className="text-[#9C4A2F] text-sm">✓</span>}
            </div>
            {usernameState === "error" && (
              <span className="block mt-1.5 text-[12px] text-destructive">{usernameError}</span>
            )}
          </Field>

          <div>
            <button
              onClick={handleSaveProfile}
              disabled={!canSaveProfile}
              className="w-full rounded-xl py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "#9C4A2F" }}
            >
              {savingProfile ? "Saving…" : "Save"}
            </button>
            {profileMsg && (
              <span className="block mt-2 text-sm text-foreground/55">{profileMsg}</span>
            )}
          </div>

          {/* Email */}
          <Field label="Email">
            <p className="text-sm text-foreground/55 mb-2">
              Current: <span className="text-foreground/80">{currentEmail}</span>
            </p>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => { setNewEmail(e.target.value); setEmailMsg(null); setEmailError(null) }}
              placeholder="New email address"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground placeholder:text-foreground/30 outline-none focus:border-[#9C4A2F]/50"
            />
            <button
              onClick={handleChangeEmail}
              disabled={!newEmail.trim() || emailSaving}
              className="w-full mt-3 rounded-xl py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-40"
              style={{ backgroundColor: "#9C4A2F" }}
            >
              {emailSaving ? "Sending…" : "Change email"}
            </button>
            {emailMsg && <span className="block mt-2 text-sm text-foreground/55">{emailMsg}</span>}
            {emailError && <span className="block mt-2 text-sm text-destructive">{emailError}</span>}
          </Field>

          {/* Password — email-signup users only */}
          {isEmailUser && (
            <Field label="Password">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setPwMsg(null); setPwError(null) }}
                placeholder="New password (8+ characters)"
                className="w-full rounded-xl border border-border bg-muted/40 px-4 py-3 text-base text-foreground placeholder:text-foreground/30 outline-none focus:border-[#9C4A2F]/50"
              />
              <button
                onClick={handleChangePassword}
                disabled={newPassword.length < 8 || pwSaving}
                className="w-full mt-3 rounded-xl py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-40"
                style={{ backgroundColor: "#9C4A2F" }}
              >
                {pwSaving ? "Updating…" : "Update password"}
              </button>
              {pwMsg && <span className="block mt-2 text-sm text-foreground/55">{pwMsg}</span>}
              {pwError && <span className="block mt-2 text-sm text-destructive">{pwError}</span>}
            </Field>
          )}
        </div>

        {/* ── DANGER ZONE ──────────────────────────────────────────────────── */}
        <div className="mt-14">
          <SectionLabel>Danger zone</SectionLabel>
          <div className="mt-5 space-y-3">
            <button
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full rounded-xl border border-border bg-muted/40 py-3.5 text-base font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>

            <button
              onClick={() => setConfirmDelete(true)}
              className="w-full rounded-xl py-3.5 text-base font-medium bg-destructive/10 text-destructive hover:bg-destructive/15 transition-colors"
            >
              Delete account
            </button>
          </div>
        </div>
      </div>

      {/* ── Delete confirm sheet ─────────────────────────────────────────────── */}
      <Drawer open={confirmDelete} onOpenChange={(o) => { if (!deleting) setConfirmDelete(o) }}>
        <DrawerContent className="bg-background pb-[calc(env(safe-area-inset-bottom)+2.5rem)]">
          <DrawerHeader className="text-left px-5 pt-6 pb-0 gap-1.5">
            <DrawerTitle
              className="text-left text-base font-medium text-foreground"
              style={{ fontFamily: "var(--font-sans)" }}
            >
              Delete account
            </DrawerTitle>
            <DrawerDescription className="text-left text-foreground/50">
              This will permanently delete your account and all your data. This cannot be undone.
            </DrawerDescription>
          </DrawerHeader>

          <div className="px-5 pt-6 pb-2">
            <button
              onClick={handleDeleteAccount}
              disabled={deleting}
              className="w-full rounded-xl py-3.5 text-base font-medium text-white bg-destructive hover:bg-destructive/90 transition-colors disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete my account"}
            </button>
          </div>

          <DrawerFooter className="px-5 pt-3 pb-2">
            <DrawerClose asChild>
              <button
                disabled={deleting}
                className="mx-auto text-sm text-foreground/40 hover:text-foreground/60 underline underline-offset-4 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-widest uppercase text-foreground/55 font-sans">
      {children}
    </h2>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-xs font-medium text-foreground/55 mb-1.5 block">{label}</span>
      {children}
    </div>
  )
}
