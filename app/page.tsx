"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Home() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userFirstName, setUserFirstName] = useState("Brother");
  const [userRole, setUserRole] = useState("Member");

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, first_name, last_name")
          .eq("id", session.user.id)
          .maybeSingle();

        if (profile) {
          setUserFirstName(profile.first_name || "Brother");
          setUserRole(profile.role || "Member");
        }
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
      <div className="w-full md:w-1/2 flex flex-col gap-6 relative z-10">
        {/* Top Block: Title and Subtitle */}
        <header className="bg-zinc-50 rounded-lg p-6 shadow-sm border border-zinc-200">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300">
            Xi Rush Management Tool
          </h1>
          <p className="text-lg mt-3 text-gray-700">
            Track PNM attendance and manage voting for deliberations.
          </p>
        </header>

        {/* Main Action Block */}
        <main className="bg-zinc-50 rounded-lg p-6 shadow-sm border border-zinc-200">
          {/* User Info / Greeting */}
          <div className="text-zinc-800 font-medium text-lg border-b border-zinc-200 pb-4 mb-5">
            Hi, <span className="font-bold text-red-700">{userFirstName}</span>. Your role is <span className="font-bold underline decoration-zinc-400 capitalize">{userRole}</span>.
          </div>

          <div className="grid grid-cols-2 gap-4 mx-auto">
            <Link
              href={"/check-in"}
              className="text-center bg-red-700 text-white px-4 py-2.5 rounded-md hover:bg-red-800 transition-all duration-300 font-medium shadow-sm"
            >
              Check In PNMs
            </Link>
            <Link
              href={"/ingest"}
              className="text-center bg-red-700 text-white px-4 py-2.5 rounded-md hover:bg-red-800 transition-all duration-300 font-medium shadow-sm"
            >
              Add PNMs
            </Link>
          </div>

          <div className="mt-5 flex flex-col gap-3">
            <Link
              href={"/vote"}
              className="block text-center bg-red-700 text-white px-4 py-3 rounded-md hover:bg-red-950 transition-all duration-300 font-bold text-lg shadow-md hover:shadow-lg hover:-translate-y-0.5"
            >
              Go to Voting Dashboard
            </Link>
            <Link
              href={"/search-pnm"}
              className="block text-center bg-zinc-800 text-white px-4 py-2.5 rounded-md hover:bg-zinc-900 transition-all duration-300 font-semibold shadow-sm text-base hover:-translate-y-0.5"
            >
              Search PNM
            </Link>
            <Link
              href={"/quick-feedback"}
              className="block text-center bg-zinc-200 text-zinc-850 border border-zinc-300/80 px-4 py-2.5 rounded-md hover:bg-zinc-300 transition-all duration-300 font-semibold shadow-sm text-base"
            >
              Leave Feedback
            </Link>
            <Link
              href={"/reset"}
              className="block text-center border border-gray-300 text-gray-600 px-4 py-2 rounded-md hover:bg-gray-100 transition-all duration-300 mt-2 text-sm font-medium"
            >
              Log Out / Clear Session
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}

