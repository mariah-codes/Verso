"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
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

const signInSchema = z.object({
  email: z.email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
})

type SignInValues = z.infer<typeof signInSchema>

// ── Page shell — wraps form in Suspense so useSearchParams is safe ────────────
// Next.js requires any component that calls useSearchParams() to be inside a
// Suspense boundary; otherwise the whole page bails out of static generation.

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  )
}

// ── Inner form component ──────────────────────────────────────────────────────

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const oauthError = searchParams.get("error")
  const [serverError, setServerError] = useState<string | null>(null)

  const form = useForm<SignInValues>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: "", password: "" },
  })

  const isSubmitting = form.formState.isSubmitting

  async function onSubmit(values: SignInValues) {
    setServerError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    })

    if (error) {
      // Surface a friendlier message for the most common case
      setServerError(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message
      )
      return
    }

    router.push("/home")
  }

  async function signInWithGoogle() {
    setServerError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/home`,
      },
    })
    if (error) setServerError(error.message)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <h1
          className="text-4xl text-foreground"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          Verso
        </h1>
        <p className="text-sm text-foreground/60">
          Welcome back
        </p>
      </div>

      {/* OAuth error banner (redirected back from failed callback) */}
      {oauthError && (
        <p className="text-sm text-destructive text-center bg-destructive/5 rounded-lg py-2 px-3">
          Something went wrong with Google sign-in. Please try again.
        </p>
      )}

      {/* Google OAuth */}
      <Button
        variant="outline"
        className="w-full h-10 gap-2 font-sans text-sm"
        onClick={signInWithGoogle}
        disabled={isSubmitting}
      >
        <GoogleIcon />
        Continue with Google
      </Button>

      {/* Divider */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border" />
        <span className="text-xs text-foreground/40 font-sans uppercase tracking-widest">
          or
        </span>
        <div className="flex-1 h-px bg-border" />
      </div>

      {/* Email / password form */}
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

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between">
                  <FormLabel>Password</FormLabel>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-foreground/40 font-sans underline underline-offset-4 hover:text-foreground/60 transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
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
            {isSubmitting ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </Form>

      {/* Footer */}
      <p className="text-center text-sm text-foreground/60 font-sans">
        Don&apos;t have an account?{" "}
        <Link
          href="/sign-up"
          className="font-medium text-foreground/70 underline underline-offset-4"
        >
          Create one
        </Link>
      </p>
    </div>
  )
}

// ── Google SVG icon ───────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
