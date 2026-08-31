"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const router = useRouter();
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      let email = usernameOrEmail.trim();
      if (!email.includes("@")) {
        email = `${email}@wisc.edu`;
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setError(authError.message);
      } else if (data.session) {
        // Redirect to the dashboard
        router.push("/");
      } else {
        setError("Invalid username or password");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen items-center justify-center font-sans gap-4 p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-4">
          Login
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="usernameOrEmail" className="text-lg font-medium">
              Username or Email:
            </label>
            <input
              type="text"
              id="usernameOrEmail"
              value={usernameOrEmail}
              onChange={(e) => setUsernameOrEmail(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900"
              placeholder="Enter username or email"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-lg font-medium">
              Password:
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-gray-900"
              placeholder="Enter password"
              required
            />
            {error && (
              <p className="text-sm text-red-600 mt-2">{error}</p>
            )}
          </div>
          <div className="flex gap-4">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </main>
      <Link
        href="/quick-feedback"
        className="bg-zinc-200 text-zinc-850 border border-zinc-300/80 px-6 py-2.5 rounded-lg hover:bg-zinc-300 transition-all duration-300 font-semibold shadow-sm hover:shadow-md text-sm text-center w-full md:w-1/2"
      >
        Quick Feedback
      </Link>
    </div>
  );
}

