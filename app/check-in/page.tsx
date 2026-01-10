"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appendToLocalStorageCsv } from "@/lib/localStorageCsv";
import { EVENT_HEADERS } from "@/lib/pnmConstants";

const CHECKIN_BACKUP_KEY = "checkInCsvBackup";
const CHECKIN_BACKUP_HEADERS = ["timestamp", "eventType", "idNumber"];

type KioskMode = "event-selection" | "scanning";

export default function CheckIn() {
  const router = useRouter();
  const idNumberInputRef = useRef<HTMLInputElement>(null);

  const [kioskMode, setKioskMode] = useState<KioskMode>("event-selection");
  const [idNumber, setIdNumber] = useState("");
  const [eventType, setEventType] = useState(EVENT_HEADERS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkedInName, setCheckedInName] = useState<string>("");

  // Auto-focus on ID number input for barcode scanning when in scanning mode
  useEffect(() => {
    if (kioskMode === "scanning") {
      idNumberInputRef.current?.focus();
    }
  }, [kioskMode]);

  // Auto-submit when Enter is pressed (barcode scanners send Enter after scanning)
  const handleIdNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && idNumber.trim() && !isLoading && kioskMode === "scanning") {
      e.preventDefault();
      handleCheckIn();
    }
  };

  const handleEventConfirm = () => {
    setKioskMode("scanning");
  };

  const handleCheckIn = async () => {
    const trimmedIdNumber = idNumber.trim();
    if (!trimmedIdNumber) {
      return;
    }

    setIsLoading(true);

    const sanitizedIdNumber = trimmedIdNumber.slice(0, 10);
    appendToLocalStorageCsv(CHECKIN_BACKUP_KEY, CHECKIN_BACKUP_HEADERS, [
      new Date().toISOString(),
      eventType,
      sanitizedIdNumber,
    ]);

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
          idNumber: sanitizedIdNumber,
          eventType: eventType,
          password: password,
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        setCheckedInName(data.name || "");
        setShowSuccess(true);
        setIdNumber("");
        // Auto-return to scanning after 2 seconds
        setTimeout(() => {
          setShowSuccess(false);
          setCheckedInName("");
          setTimeout(() => {
            idNumberInputRef.current?.focus();
          }, 100);
        }, 2000);
      } else {
        // Show error, but keep in scanning mode
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
    if (kioskMode === "scanning") {
      handleCheckIn();
    }
  };

  const handleReset = () => {
    setKioskMode("event-selection");
    setIdNumber("");
    setShowSuccess(false);
    setCheckedInName("");
  };

  // Event Selection Screen
  if (kioskMode === "event-selection") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-300 to-yellow-500/50 font-sans p-4">
        <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-4">
            Check In PNMs
          </h1>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <label htmlFor="eventType" className="text-lg font-medium">
                Pick a Rush Event:
              </label>
              <select
                id="eventType"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent"
              >
                {EVENT_HEADERS.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-4 mt-2">
              <button
                onClick={handleEventConfirm}
                className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300"
              >
                Start Scanning
              </button>
              <Link
                href="/"
                className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300 text-center"
              >
                Back
              </Link>
            </div>
            <p className="text-sm text-gray-500">
              This will setup your device as a kiosk for scanning Wiscards and checking in PNMs for the selected event.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // Scanning Screen
  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-red-300 to-yellow-500/50 font-sans p-4">
      <main className="relative bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
        <div className="mb-4">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-6">
            Welcome! Scan your Wiscard to check in.
          </h1>
          <div className="bg-red-100 border border-red-300 rounded-md p-3 mb-4">
            <p className="text-sm font-medium text-red-800">Current Rush Event:</p>
            <p className="text-lg font-semibold text-red-900">{eventType}</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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
              disabled={isLoading || showSuccess}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-form-type="other"
              className="px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
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
              disabled={isLoading || showSuccess}
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? "Checking in..." : "Check In"}
            </button>
          </div>
        </form>
      </main>
      
      {/* Loading Overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-white/90 backdrop-blur-sm border-2 border-red-500/70">
          <div className="flex flex-col items-center gap-6 px-6 text-center">
            <div className="h-24 w-24 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-4xl font-bold text-red-700">
              Processing check-in...
            </p>
            <p className="text-xl text-zinc-600">
              Please stay here—this may take a few seconds.
            </p>
          </div>
        </div>
      )}

      {/* Success Overlay */}
      {showSuccess && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-green-500/95 backdrop-blur-sm border-4 border-green-600">
          <div className="flex flex-col items-center gap-6 px-6 text-center">
            <div className="h-24 w-24 bg-green-600 rounded-full flex items-center justify-center">
              <svg
                className="h-16 w-16 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white">
              Check-in successful{checkedInName ? `, ${checkedInName}` : ""}!
            </p>
            <p className="text-xl text-green-100">
              {eventType}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

