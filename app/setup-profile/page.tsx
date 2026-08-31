"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { toast } from "sonner";

export default function SetupProfile() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    async function loadUserData() {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !session) {
          router.push("/login");
          return;
        }

        setUserEmail(session.user.email || "");
        setUserId(session.user.id);

        // Fetch existing profile if available
        const { data: profile } = await supabase
          .from("profiles")
          .select("first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile) {
          if (profile.first_name) setFirstName(profile.first_name);
          if (profile.last_name) setLastName(profile.last_name);
        } else if (session.user.user_metadata) {
          if (session.user.user_metadata.first_name) setFirstName(session.user.user_metadata.first_name);
          if (session.user.user_metadata.last_name) setLastName(session.user.user_metadata.last_name);
        }
      } catch (err) {
        console.error("Error loading user session:", err);
        setError("Failed to load user profile session.");
      } finally {
        setLoading(false);
      }
    }

    loadUserData();
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter both your first and last name.");
      return;
    }

    if (!password) {
      setError("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!userId) {
      setError("No authenticated user found. Please re-open your invite link.");
      return;
    }

    setSaving(true);

    try {
      // 1. Update Auth Password & user_metadata in Supabase Auth
      const { error: authError } = await supabase.auth.updateUser({
        password: password,
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
        },
      });

      if (authError) {
        throw authError;
      }

      // 2. Check existing profile role if any
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const currentRole = existingProfile?.role || "Brother";

      // 3. Upsert into public.profiles
      const { error: profileError } = await supabase
        .from("profiles")
        .upsert({
          id: userId,
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          role: currentRole,
          updated_at: new Date().toISOString(),
        });

      if (profileError) {
        console.warn("Could not save to profiles table:", profileError.message);
      }

      toast.success("Profile & password set successfully! Redirecting...");
      setTimeout(() => {
        router.push("/vote");
      }, 1000);
    } catch (err: unknown) {
      console.error("Setup profile error:", err);
      setError(err instanceof Error ? err.message : "Failed to set up profile. Please try again.");
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading profile setup...</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center font-sans gap-4 p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-md border border-zinc-200 shadow-sm">
        <h1 className="text-3xl font-mono font-bold underline decoration-red-300 mb-2">
          Setup Profile
        </h1>
        <p className="text-sm text-gray-600 mb-6">
          Welcome to the Theta Tau Rush Tool! Set your name and password to complete your account setup.
        </p>

        {userEmail && (
          <div className="mb-4 p-3 bg-zinc-100 rounded-md border border-zinc-200 text-sm">
            <span className="text-gray-500 block text-xs font-semibold uppercase tracking-wider mb-0.5">
              Account Email
            </span>
            <span className="font-medium text-gray-800">{userEmail}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor="firstName" className="text-sm font-medium text-gray-700">
                First Name
              </label>
              <input
                type="text"
                id="firstName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900 text-sm"
                placeholder="John"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor="lastName" className="text-sm font-medium text-gray-700">
                Last Name
              </label>
              <input
                type="text"
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900 text-sm"
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-medium text-gray-700">
              Create Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900 text-sm"
              placeholder="At least 6 characters"
              required
              minLength={6}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900 text-sm"
              placeholder="Re-enter password"
              required
              minLength={6}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 mt-1">{error}</p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="mt-2 bg-red-700 text-white px-4 py-2.5 rounded-md hover:bg-red-800 transition-all duration-300 font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? "Saving Account..." : "Complete Setup & Go to Dashboard"}
          </button>
        </form>
      </main>
    </div>
  );
}
