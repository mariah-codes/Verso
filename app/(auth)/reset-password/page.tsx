"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod/v4"

import { supabase } from "@/lib/supabase"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

// ── Validation schema ─────────────────────────────────────────────────────────

const resetSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords don't match",
    path: ["confirm"],
  })

type ResetValues = z.infer<typeof resetSchema>

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Password-reset landing page. The recovery email link goes through
 * /auth/callback, which exchanges the one-time code for a (recovery) session and
 * forwards here. So by the time this renders the user is authenticated just
 * enough to call updateUser({ password }). If there's no session (link expired,
 * opened in a different browser, or visited directly), we show a dead-end notice
 * with a path back to request a fresh link rather than a broken form.
 */
export default function ResetPasswordPage() {
  const router = useRouter()
  const [sessionState, setSessionState] = useState<"checking" | "ready" | "invalid">("checking")
  const [serverError, setServerError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  })

  const isSubmitting = form.formState.isSubmitting

  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return
      setSessionState(data.user ? "ready" : "invalid")
    })
    return () => { cancelled = true }
  }, [])

  async function onSubmit(values: ResetValues) {
    setServerError(null)
    const { error } = await supabase.auth.updateUser({ password: values.password })
    if (error) {
      setServerError(error.message)
      return
    }
    setDone(true)
  }

  // ── No valid recovery session ────────────────────────────────────────────────

  if (sessionState === "invalid") {
    return (
      <div className="text-center space-y-4 py-8">
        <h1
          className="text-3xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Link expired
        </h1>
        <p className="text-sm text-foreground/60 leading-relaxed">
          This password reset link is invalid or has expired. Request a new one
          to continue.
        </p>
        <div className="flex flex-col items-center gap-2 pt-2">
          <Link
            href="/forgot-password"
            className="text-sm text-foreground/55 underline underline-offset-4 hover:text-foreground/70 transition-colors"
          >
            Send a new link
          </Link>
          <Link
            href="/sign-in"
            className="text-sm text-foreground/55 underline underline-offset-4 hover:text-foreground/70 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // ── Success ──────────────────────────────────────────────────────────────────

  if (done) {
    return (
      <div className="text-center space-y-5 py-8">
        <h1
          className="text-3xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Password updated
        </h1>
        <p className="text-sm text-foreground/60 leading-relaxed">
          You&apos;re all set. Head back in to continue.
        </p>
        <Button
          onClick={() => router.push("/home")}
          className="w-full h-10 font-sans text-sm text-white"
          style={{ backgroundColor: "#9C4A2F" }}
        >
          Continue
        </Button>
      </div>
    )
  }

  // ── Checking session ─────────────────────────────────────────────────────────

  if (sessionState === "checking") {
    return <div className="py-8" />
  }

  // ── Set-new-password form ────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      <div className="text-center space-y-1">
        <h1
          className="text-4xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          New password
        </h1>
        <p className="text-sm text-foreground/60">
          Choose a new password for your account.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>New password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="8+ characters" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="confirm"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Confirm password</FormLabel>
                <FormControl>
                  <Input type="password" placeholder="••••••••" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {serverError && (
            <p className="text-sm text-destructive text-center">{serverError}</p>
          )}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-10 font-sans text-sm text-white"
            style={{ backgroundColor: "#9C4A2F" }}
          >
            {isSubmitting ? "Updating…" : "Update password"}
          </Button>
        </form>
      </Form>
    </div>
  )
}
