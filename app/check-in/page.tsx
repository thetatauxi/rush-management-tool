"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const EVENT_HEADERS = [ // needs to match the backend EXACTLY
    "Event 1: Meet & Greet",
    "Event 2: Speaker Series",
    "Event 3: Facility Tour",
    "Event 4: Social Mixer",
    "Event 5: Professional Workshop"
  ];

export default function CheckIn() {
  const router = useRouter();
  const idNumberInputRef = useRef<HTMLInputElement>(null);

  const [idNumber, setIdNumber] = useState("");
  const [eventType, setEventType] = useState(EVENT_HEADERS[0]);
  const [isLoading, setIsLoading] = useState(false);

  // Auto-focus on ID number input for barcode scanning
  useEffect(() => {
    idNumberInputRef.current?.focus();
  }, []);

  // Auto-submit when Enter is pressed (barcode scanners send Enter after scanning)
  const handleIdNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && idNumber.trim() && !isLoading) {
      e.preventDefault();
      handleCheckIn();
    }
  };

  const handleCheckIn = async () => {
    if (!idNumber.trim()) {
      toast.error("Please enter an ID number");
      return;
    }

    setIsLoading(true);

    try {
      const password = localStorage.getItem("password");
      if (!password) {
        router.push("/login");
        return;
      }

      const response = await fetch("/api/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "check-in",
          idNumber: idNumber.trim().slice(0, 10),
          eventType: eventType,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        toast.success("Check-in successful!");
        setIdNumber("");
        // Refocus on ID input for next scan
        setTimeout(() => {
          idNumberInputRef.current?.focus();
        }, 100);
      } else {
        toast.error(data.error || "Failed to check in");
      }
    } catch (err) {
      console.error("Check-in error:", err);
      toast.error("Failed to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleCheckIn();
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-300 to-yellow-500/50 font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-4">
          Check In PNMs
        </h1>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="eventType" className="text-lg font-medium">
              Event Type:
            </label>
            <select
              id="eventType"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
              required
            >
              {EVENT_HEADERS.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="idNumber" className="text-lg font-medium">
              ID Number (Scan Barcode):
            </label>
            <input
              ref={idNumberInputRef}
              type="text"
              id="idNumber"
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              onKeyDown={handleIdNumberKeyDown}
              disabled={isLoading}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent text-lg disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="Scan or enter ID number"
              required
              autoFocus
            />
            <p className="text-sm text-gray-500">
              Scan barcode or manually enter ID number. Student IDs are 10 digits long, however Wiscards often add an 11th digit. Nothing after the 10th digit will be sent.
            </p>
          </div>

          <div className="flex gap-4 mt-4">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Checking in..." : "Check In"}
            </button>
            <Link
              href="/"
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300 text-center"
            >
              Back
            </Link>
          </div>
        </form>
      </main>
    </div>
  );
}

