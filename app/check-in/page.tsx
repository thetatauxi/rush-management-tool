"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appendToLocalStorageCsv } from "@/lib/localStorageCsv";
import { EVENT_HEADERS } from "@/lib/pnmConstants";
import { supabase } from "@/lib/supabaseClient";

const CHECKIN_BACKUP_KEY = "checkInCsvBackup";
const CHECKIN_BACKUP_HEADERS = ["timestamp", "eventType", "idNumber"];

type KioskMode = "event-selection" | "scanning";

export default function CheckIn() {
  const router = useRouter();
  const idNumberInputRef = useRef<HTMLInputElement>(null);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [kioskMode, setKioskMode] = useState<KioskMode>("event-selection");
  const [idNumber, setIdNumber] = useState("");
  const [eventType, setEventType] = useState(EVENT_HEADERS[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [checkedInName, setCheckedInName] = useState<string>("");
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [checkedInCount, setCheckedInCount] = useState<number | null>(null);
  const [isLoadingCount, setIsLoadingCount] = useState(false);

  // Check Supabase authentication
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

  // Auto-focus on ID number input for barcode scanning when in scanning mode
  useEffect(() => {
    if (!checkingAuth && kioskMode === "scanning") {
      idNumberInputRef.current?.focus();
    }
  }, [kioskMode, checkingAuth]);

  // Auto-submit when Enter is pressed (barcode scanners send Enter after scanning)
  const handleIdNumberKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && idNumber.trim() && !isLoading && kioskMode === "scanning") {
      e.preventDefault();
      handleCheckIn();
    }
  };

  // Fetch checked-in count for the selected event
  const fetchCheckedInCount = useCallback(async (selectedEvent: string) => {
    try {
      setIsLoadingCount(true);
      const eventIndex = EVENT_HEADERS.indexOf(selectedEvent);
      if (eventIndex === -1) return;
      const eventKey = `event_${eventIndex + 1}`;

      const { count, error } = await supabase
        .from("pnms")
        .select("*", { count: "exact", head: true })
        .eq(eventKey, true);

      if (error) {
        const { data: rows, error: selectError } = await supabase
          .from("pnms")
          .select("student_id")
          .eq(eventKey, true);
        if (!selectError && rows) {
          setCheckedInCount(rows.length);
        }
      } else {
        setCheckedInCount(count ?? 0);
      }
    } catch (err) {
      console.error("Error fetching checked-in count:", err);
    } finally {
      setIsLoadingCount(false);
    }
  }, []);

  // Fetch count on load, when event changes, and subscribe to real-time updates
  useEffect(() => {
    if (checkingAuth) return;
    fetchCheckedInCount(eventType);

    const channel = supabase
      .channel("checkin-pnm-counter")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pnms" },
        () => {
          fetchCheckedInCount(eventType);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkingAuth, eventType, fetchCheckedInCount]);

  const handleEventConfirm = () => {
    fetchCheckedInCount(eventType);
    setKioskMode("scanning");
  };

  const handleCheckIn = async () => {
    const trimmedIdNumber = idNumber.trim();
    if (!trimmedIdNumber) {
      return;
    }

    setIsLoading(true);
    setShowError(false);
    setErrorMessage("");

    const sanitizedIdNumber = trimmedIdNumber.slice(0, 10);
    appendToLocalStorageCsv(CHECKIN_BACKUP_KEY, CHECKIN_BACKUP_HEADERS, [
      new Date().toISOString(),
      eventType,
      sanitizedIdNumber,
    ]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
        return;
      }

      // 1. Find the PNM by Student ID
      const { data: pnm, error: queryError } = await supabase
        .from("pnms")
        .select("full_name")
        .eq("student_id", sanitizedIdNumber)
        .maybeSingle();

      if (queryError) {
        throw new Error(`Lookup Error: ${queryError.message}`);
      }

      if (!pnm) {
        // PNM not found - trigger error path
        const message = "Student ID not found. Please register at Add PNMs first.";
        setErrorMessage(message);
        setShowError(true);
        setIdNumber("");
        setTimeout(() => {
          setShowError(false);
          setErrorMessage("");
          setTimeout(() => {
            idNumberInputRef.current?.focus();
          }, 100);
        }, 2500);
        return;
      }

      // 2. Map current selected eventType to correct column (event_1 ... event_6)
      const eventIndex = EVENT_HEADERS.indexOf(eventType);
      const eventKey = `event_${eventIndex + 1}`;

      // 3. Mark event attendance as true
      const { error: updateError } = await supabase
        .from("pnms")
        .update({ [eventKey]: true })
        .eq("student_id", sanitizedIdNumber);

      if (updateError) {
        throw new Error(`Update Attendance Error: ${updateError.message}`);
      }

      // Check-in succeeded
      setCheckedInName(pnm.full_name);
      setShowSuccess(true);
      setIdNumber("");
      setCheckedInCount((prev) => (prev !== null ? prev + 1 : 1));
      fetchCheckedInCount(eventType);
      // Auto-return to scanning after 2 seconds
      setTimeout(() => {
        setShowSuccess(false);
        setCheckedInName("");
        setTimeout(() => {
          idNumberInputRef.current?.focus();
        }, 100);
      }, 2000);
    } catch (err) {
      console.error("Check-in error:", err);
      toast.error("Failed to connect to server. Please try again.");
      setErrorMessage("Failed to connect to server. Please try again.");
      setShowError(true);
      setIdNumber("");
      setTimeout(() => {
        setShowError(false);
        setErrorMessage("");
        setTimeout(() => {
          idNumberInputRef.current?.focus();
        }, 100);
      }, 2500);
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

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  // Event Selection Screen
  if (kioskMode === "event-selection") {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans p-4">
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
              <p className="text-xs text-zinc-500 mt-1">
                Currently checked in:{" "}
                <span className="font-semibold text-zinc-700">
                  {checkedInCount !== null ? `${checkedInCount} PNMs` : "Loading..."}
                </span>
              </p>
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
    <div className="flex min-h-screen items-center justify-center font-sans p-4">
      <main className="relative bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
        <div className="mb-4">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-6">
            Welcome! Scan your Wiscard to check in.
          </h1>
          <div className="bg-red-100 border border-red-300 rounded-md p-3.5 mb-4 grid grid-cols-2 divide-x divide-red-300">
            <div className="pr-3 flex flex-col justify-center">
              <div className="flex items-center justify-between gap-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-red-800/90">
                  Current Rush Event:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setIdNumber("");
                    setKioskMode("event-selection");
                  }}
                  className="text-[11px] text-red-700 hover:text-red-900 font-semibold underline cursor-pointer"
                  title="Change rush event"
                >
                  Change
                </button>
              </div>
              <p className="text-base sm:text-lg font-bold text-red-950 mt-0.5 leading-snug">
                {eventType}
              </p>
            </div>
            <div className="pl-4 flex flex-col justify-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-800/90">
                Total Checked In:
              </p>
              <p className="text-base sm:text-lg font-bold text-red-950 mt-0.5 leading-snug flex items-baseline gap-1.5">
                {isLoadingCount && checkedInCount === null ? (
                  <span className="text-sm font-medium text-red-700 animate-pulse">Loading...</span>
                ) : (
                  <>
                    <span className="text-2xl font-black font-mono text-red-950 leading-none">
                      {checkedInCount ?? 0}
                    </span>
                    <span className="text-xs font-bold text-red-800">
                      {checkedInCount === 1 ? "PNM" : "PNMs"}
                    </span>
                  </>
                )}
              </p>
            </div>
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
              className="bg-red-700 text-white px-4 py-2 rounded-md hover:bg-red-800 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer font-medium"
            >
              {isLoading ? "Checking in..." : "Check In"}
            </button>
            <button
              type="button"
              onClick={() => {
                setIdNumber("");
                setKioskMode("event-selection");
              }}
              disabled={isLoading || showSuccess}
              className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300 text-center font-medium cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Back
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

      {/* Error Overlay */}
      {showError && (
        <div className="absolute inset-0 flex flex-col items-center justify-center rounded-lg bg-red-500/95 backdrop-blur-sm border-4 border-red-600">
          <div className="flex flex-col items-center gap-6 px-6 text-center">
            <div className="h-24 w-24 bg-red-600 rounded-full flex items-center justify-center">
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <p className="text-4xl font-bold text-white">
              Check-in error
            </p>
            <p className="text-xl text-red-100">
              {errorMessage}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

