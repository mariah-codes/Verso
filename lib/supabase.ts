import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables.\n" +
      "Make sure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set in .env.local"
  );
}

// createBrowserClient (from @supabase/ssr) stores the PKCE code_verifier in
// cookies rather than localStorage. This is essential: the server-side
// createServerClient in lib/supabase-server.ts reads cookies, so both sides
// share the same verifier and exchangeCodeForSession succeeds in the callback.
//
// Plain createClient (@supabase/supabase-js) uses localStorage, which the
// server can never see — causing the "Multiple GoTrueClient instances" warning
// and silent failures in /auth/callback.
export const supabase = createBrowserClient<Database>(supabaseUrl, supabaseAnonKey);
