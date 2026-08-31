"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 relative z-10">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300">
          Xi Rush Management Tool
        </h1>
        <p className="text-lg mt-4 text-gray-700">
          Track PNM attendance and manage voting for deliberations.
        </p>
        <div className="grid grid-cols-2 gap-4 mx-auto mt-4">
          <Link
            href={"/check-in"}
            className="text-center bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 font-medium shadow-sm"
          >
            Check In PNMs
          </Link>
          <Link
            href={"/ingest"}
            className="text-center bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 font-medium shadow-sm"
          >
            Add PNMs
          </Link>
        </div>
        <div className="mt-6 pt-4 border-t border-gray-200">
          <Link
            href={"/vote"}
            className="block text-center bg-red-700 text-white px-4 py-3 rounded-md hover:bg-red-950 transition-all duration-300 font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5"
          >
            Go to Voting Dashboard
          </Link>
          <Link
            href={"/reset"}
            className="block text-center border border-gray-300 text-gray-600 px-4 py-2 rounded-md hover:bg-gray-100 transition-all duration-300 mt-4 text-sm font-medium"
          >
            Log Out / Clear Session
          </Link>
        </div>
      </main>
    </div>
  );
}
