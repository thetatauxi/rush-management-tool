"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function Login() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "checkPassword",
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        // Save password to localStorage
        localStorage.setItem("password", password);
        // Redirect to the dashboard
        router.push("/");
      } else {
        setError(data.error || "Invalid password");
      }
    } catch (err) {
      console.error("Login error:", err);
      setError("Failed to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-300 to-yellow-500/50 font-sans">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-4">
          Login
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-lg font-medium">
              Password:
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
              placeholder="Enter password"
              required
            />
            <p className="text-sm text-gray-500">Hint: To reset the password, edit the password in the Google Sheet.</p>
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
    </div>
  );
}

