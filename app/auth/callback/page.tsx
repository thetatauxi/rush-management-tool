"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import type { EmailOtpType } from "@supabase/supabase-js";
import Link from "next/link";

function CallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Verifying your invitation link...");

  useEffect(() => {
    async function handleAuth() {
      try {
        const token_hash = searchParams.get("token_hash");
        const type = searchParams.get("type") as EmailOtpType | null;
        const next = searchParams.get("next") || "/setup-profile";
        const code = searchParams.get("code");

        // 1. If PKCE token_hash flow (invite, recovery, signup, etc.)
        if (token_hash && type) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash,
            type,
          });

          if (verifyError) {
            console.error("verifyOtp error:", verifyError);
            setError(verifyError.message);
            return;
          }

          setStatus("Verified! Redirecting...");
          router.replace(next);
          return;
        }

        // 2. If PKCE authorization code flow
        if (code) {
          const { error: codeError } = await supabase.auth.exchangeCodeForSession(code);
          if (codeError) {
            console.error("exchangeCodeForSession error:", codeError);
            setError(codeError.message);
            return;
          }

          setStatus("Verified! Redirecting...");
          router.replace(next);
          return;
        }

        // 3. Fallback: Check if session is already established or in URL hash
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (session) {
          router.replace(next);
        } else {
          // If no token, code, or session found
          setError("No valid authentication token found. The link may have expired or already been used.");
        }
      } catch (err: unknown) {
        console.error("Callback unexpected error:", err);
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    }

    handleAuth();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full max-w-md border border-zinc-200 shadow-sm text-center">
        <h1 className="text-2xl font-mono font-bold underline decoration-red-300 mb-4">
          Theta Tau Rush
        </h1>

        {error ? (
          <div className="flex flex-col gap-4">
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm text-left">
              <p className="font-semibold mb-1">Verification Failed</p>
              <p>{error}</p>
            </div>
            <p className="text-xs text-gray-500 text-left">
              If your invite link expired, please ask the Rush Chair or Regent to resend your invite.
            </p>
            <Link
              href="/login"
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 text-sm font-medium"
            >
              Go to Login
            </Link>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="w-8 h-8 border-4 border-red-700 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-gray-700 font-medium">{status}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center font-sans">
          <div className="text-xl font-medium text-gray-600">Loading...</div>
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
