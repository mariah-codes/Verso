"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, Loader2 } from "lucide-react"
import { supabase } from "@/lib/supabase"
import { Avatar } from "@/components/shared/Avatar"
import { useDebounce } from "@/hooks/use-debounce"
import {
  validateUsername,
  isUsernameAvailable,
  generateUsername,
} from "@/lib/username"
import { saveOnboardingProfile, uploadAvatar } from "@/lib/onboarding"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any

type UsernameState = "idle" | "checking" | "ok" | "error"

export default function OnboardingProfile() {
  const router = useRouter()

  const [userId, setUserId] = useState<string | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [username, setUsername] = useState("")
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)

  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Availability is set only in the async check's callback; format validity is
  // derived during render — so no synchronous setState lives in an effect.
  const [availResult, setAvailResult] = useState<{ handle: string; free: boolean } | null>(null)

  const fileRef = useRef<HTMLInputElement>(null)
  const debouncedUsername = useDebounce(username, 350)

  // ── Load existing user row (display_name from the signup trigger; username
  //    is auto-generated if the row doesn't have one yet). ────────────────────
  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.replace("/"); return }
      setUserId(user.id)
      const { data } = await db
        .from("users")
        .select("display_name, username, photo_url")
        .eq("id", user.id)
        .single()
      const name = data?.display_name ?? ""
      setDisplayName(name)
      setPhotoUrl(data?.photo_url ?? null)
      if (data?.username) {
        setUsername(data.username)
      } else {
        const [first, ...rest] = name.trim().split(/\s+/)
        const handle = await generateUsername(first || "reader", rest.join(" ") || undefined)
        setUsername(handle)
      }
      setLoading(false)
    }
    load()
  }, [router])

  // ── Check availability when the (debounced, format-valid) handle changes ───
  useEffect(() => {
    const handle = debouncedUsername.trim().toLowerCase()
    if (!handle || !validateUsername(handle).ok) return
    let cancelled = false
    // Exclude our own row so the handle we were assigned doesn't read as taken.
    isUsernameAvailable(handle, userId ?? undefined).then((free) => {
      if (!cancelled) setAvailResult({ handle, free })
    })
    return () => { cancelled = true }
  }, [debouncedUsername, userId])

  // Derived username status (no effect state): format → availability → checking.
  const handle = username.trim().toLowerCase()
  const format = handle ? validateUsername(handle) : null
  let usernameState: UsernameState = "idle"
  let usernameError: string | null = null
  if (!handle) {
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

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !userId) return
    setUploading(true)
    const { url, error } = await uploadAvatar(userId, file)
    setUploading(false)
    if (!error && url) setPhotoUrl(url)
  }

  const canContinue =
    !!displayName.trim() && usernameState === "ok" && !saving

  async function handleContinue() {
    if (!userId || !canContinue) return
    setSaving(true)
    const { error } = await saveOnboardingProfile(userId, {
      displayName,
      username,
      photoUrl,
    })
    if (error) { setSaving(false); return }
    router.push("/onboarding/covers")
  }

  if (loading) return null

  return (
    <div className="flex-1 flex flex-col px-5 pb-8">
      <div className="pt-2 pb-7">
        <h1 className="text-3xl text-foreground leading-tight" style={{ fontFamily: "var(--font-serif)" }}>
          Set up your profile
        </h1>
        <p className="text-sm text-foreground/55 mt-2">This is how friends will find you.</p>
      </div>

      {/* Photo (optional) */}
      <div className="flex justify-center mb-8">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="relative"
          aria-label="Add a profile photo"
        >
          <Avatar displayName={displayName || "?"} photoUrl={photoUrl} size={96} initialsClassName="text-3xl" />
          <span
            className="absolute bottom-0 right-0 size-8 rounded-full flex items-center justify-center ring-4 ring-background"
            style={{ backgroundColor: "#9C4A2F" }}
          >
            {uploading
              ? <Loader2 className="size-4 text-white animate-spin"  strokeWidth={1.75} />
              : <Camera className="size-4 text-white" />}
          </span>
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handlePhoto} />
      </div>

      {/* Display name (required) */}
      <label className="block mb-5">
        <span className="text-xs font-medium text-foreground/55 mb-1.5 block">Display name</span>
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          placeholder="Your name"
          className="w-full rounded-xl border border-[rgba(31,27,22,0.07)] bg-muted/40 px-4 py-3 text-base text-foreground placeholder:text-foreground/40 outline-none focus:border-[#9C4A2F]/50"
        />
      </label>

      {/* Username (editable) */}
      <label className="block">
        <span className="text-xs font-medium text-foreground/55 mb-1.5 block">Username</span>
        <div className="flex items-center rounded-xl border border-[rgba(31,27,22,0.07)] bg-muted/40 px-4 focus-within:border-[#9C4A2F]/50">
          <span className="text-base text-foreground/40">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ""))}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent px-1 py-3 text-base text-foreground outline-none"
          />
          {usernameState === "checking" && <Loader2 className="size-4 text-foreground/40 animate-spin"  strokeWidth={1.75} />}
          {usernameState === "ok" && <span className="text-[#9C4A2F] text-sm">✓</span>}
        </div>
        <span className="block min-h-[18px] mt-1.5 text-[12px] text-[#A8321A]">
          {usernameState === "error" ? usernameError : ""}
        </span>
      </label>

      <div className="flex-1" />

      <button
        onClick={handleContinue}
        disabled={!canContinue}
        className="w-full rounded-xl py-3.5 text-base font-medium text-white transition-opacity disabled:opacity-40"
        style={{ backgroundColor: "#9C4A2F" }}
      >
        {saving ? "Saving…" : "Continue"}
      </button>
    </div>
  )
}
