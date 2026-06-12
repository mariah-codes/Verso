"use client"

import { useState } from "react"
import Link from "next/link"
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

const forgotSchema = z.object({
  email: z.email("Enter a valid email address"),
})

type ForgotValues = z.infer<typeof forgotSchema>

// ── Component ─────────────────────────────────────────────────────────────────

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null)
  const [emailSent, setEmailSent] = useState(false)
  const [resendState, setResendState] = useState<"idle" | "sending" | "sent">("idle")

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  })

  const isSubmitting = form.formState.isSubmitting

  // The recovery link lands on /auth/callback, which exchanges the code for a
  // (recovery) session and forwards to /reset-password where the new password
  // is set. Same callback the OAuth/sign-up flows use — origin-based so it works
  // in dev and at https://joinverso.io (both allow-listed in Supabase Auth).
  function redirectTo() {
    return `${window.location.origin}/auth/callback?next=/reset-password`
  }

  async function onSubmit(values: ForgotValues) {
    setServerError(null)
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: redirectTo(),
    })
    if (error) {
      setServerError(error.message)
      return
    }
    setEmailSent(true)
  }

  async function resend() {
    if (resendState === "sending") return
    setResendState("sending")
    const { error } = await supabase.auth.resetPasswordForEmail(form.getValues("email"), {
      redirectTo: redirectTo(),
    })
    if (error) {
      setServerError(error.message)
      setResendState("idle")
      return
    }
    setResendState("sent")
  }

  // ── Email-sent confirmation state ────────────────────────────────────────────

  if (emailSent) {
    return (
      <div className="text-center space-y-4 py-8">
        <h1
          className="text-3xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Check your email
        </h1>
        <p className="text-sm text-foreground/60 leading-relaxed">
          We sent a password reset link to{" "}
          <span className="font-medium text-foreground">
            {form.getValues("email")}
          </span>
          . Click it to choose a new password.
        </p>

        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            type="button"
            onClick={resend}
            disabled={resendState === "sending"}
            className="text-sm text-foreground/50 underline underline-offset-4 hover:text-foreground/70 transition-colors disabled:opacity-50"
          >
            {resendState === "sending"
              ? "Resending…"
              : resendState === "sent"
                ? "Email resent"
                : "Resend email"}
          </button>
          <Link
            href="/sign-in"
            className="text-sm text-foreground/50 underline underline-offset-4 hover:text-foreground/70 transition-colors"
          >
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1
          className="text-4xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Reset password
        </h1>
        <p className="text-sm text-foreground/60">
          Enter your email and we&apos;ll send a reset link.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Email</FormLabel>
                <FormControl>
                  <Input type="email" placeholder="ada@example.com" {...field} />
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
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      </Form>

      {/* Footer */}
      <p className="text-center text-sm text-foreground/60 font-sans">
        Remembered it?{" "}
        <Link
          href="/sign-in"
          className="font-medium underline underline-offset-4"
          style={{ color: "#9C4A2F" }}
        >
          Sign in
        </Link>
      </p>
    </div>
  )
}
