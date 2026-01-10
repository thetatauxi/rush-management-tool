"use client";

import Link from "next/link";
import { redirect } from "next/navigation";
import { useEffect } from "react";

export default function Home() {
  useEffect(() => {
    const password = window.localStorage.getItem("password");
    if (!password) {
      redirect("/login");
    }
  }, []);
  return (
    <div className="relative flex min-h-screen items-center justify-center font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 relative z-10">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300">
          Xi Rush Management Tool
        </h1>
        <p className="text-lg mt-4">
          Track PNM attendance and generate summaries for deliberations.
        </p>
        <div className="grid grid-cols-2 gap-4 mx-auto mt-4">
          <Link
            href={"/check-in"}
            className="text-center bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300"
          >
            Check In PNMs
          </Link>
          <Link
            href={"/ingest"}
            className="text-center bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300"
          >
            Add PNMs
          </Link>
          <Link
            href={"/summary"}
            className="text-center bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 col-span-2"
          >
            Generate PNM Summary
          </Link>
        </div>
      </main>
    </div>
  );
}
