"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function ResetPassword() {
  const router = useRouter();
  const [cleared, setCleared] = useState(false);

  const handleClear = () => {
    localStorage.removeItem("password");
    setCleared(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center font-sans">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-md">
        <h1 className="text-3xl font-mono font-bold underline decoration-red-300 mb-6">
          Reset Password
        </h1>

        {!cleared ? (
          <div className="flex flex-col gap-4">
            <p className="text-gray-700">
              This will clear your saved session. You&apos;ll need to enter the password again on login.
            </p>
            <p className="text-sm text-gray-500">
              Need a new password? Contact your chapter admin to update it in the Google Sheet.
            </p>
            <div className="flex gap-3 mt-2">
              <button
                onClick={handleClear}
                className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300"
              >
                Clear Session
              </button>
              <Link
                href="/login"
                className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 transition-all duration-300"
              >
                Back to Login
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 text-green-700">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="font-medium">Session cleared</span>
            </div>
            <p className="text-gray-600 text-sm">
              Your saved password has been removed.
            </p>
            <Link
              href="/login"
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 text-center mt-2"
            >
              Back to Login
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
