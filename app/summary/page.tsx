"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Fuse from "fuse.js";

type PNM = {
  name: string;
  id: string;
};

type ProcessingStep =
  | "idle"
  | "fetching"
  | "generating"
  | "downloading"
  | "done";

const STEP_LABELS: Record<ProcessingStep, string> = {
  idle: "",
  fetching: "Fetching PNM record...",
  generating: "Generating image...",
  downloading: "Downloading...",
  done: "Complete!",
};

export default function Summary() {
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  // PNM list state
  const [pnms, setPnms] = useState<PNM[]>([]);
  const [isLoadingList, setIsLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Processing state
  const [processingStep, setProcessingStep] = useState<ProcessingStep>("idle");
  const [selectedPNM, setSelectedPNM] = useState<PNM | null>(null);

  // Fuse.js instance for fuzzy search
  const fuse = useMemo(() => {
    return new Fuse(pnms, {
      keys: ["name"],
      threshold: 0.3,
      includeScore: true,
    });
  }, [pnms]);

  // Filtered results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const results = fuse.search(searchQuery).slice(0, 8);
    return results.map((r) => r.item);
  }, [fuse, searchQuery]);

  // Fetch PNM list on mount
  useEffect(() => {
    const password = localStorage.getItem("password");
    if (!password) {
      router.push("/login");
      return;
    }

    async function fetchPnms() {
      try {
        const response = await fetch("/api/proxy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            action: "fetchAllNames",
            password: password,
          }),
        });

        const data = await response.json();

        if (data.ok && data.names) {
          // Transform { name: id } object to array
          const pnmList = Object.entries(data.names).map(([name, id]) => ({
            name,
            id: id as string,
          }));
          setPnms(pnmList);
        } else {
          setListError(data.error || "Failed to load PNM list");
        }
      } catch (err) {
        console.error("Failed to fetch PNMs:", err);
        setListError("Failed to connect to server");
      } finally {
        setIsLoadingList(false);
      }
    }

    fetchPnms();
  }, [router]);

  // Handle keyboard navigation in dropdown
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || searchResults.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < searchResults.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (searchResults[selectedIndex]) {
        handleSelectPNM(searchResults[selectedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  };

  // Handle PNM selection
  const handleSelectPNM = async (pnm: PNM) => {
    setSelectedPNM(pnm);
    setSearchQuery("");
    setShowDropdown(false);
    setProcessingStep("fetching");

    try {
      // Step 1: Fetch full record
      const password = localStorage.getItem("password");
      if (!password) {
        router.push("/login");
        return;
      }

      const recordResponse = await fetch("/api/proxy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "fetchById",
          idNumber: pnm.id,
          password: password,
        }),
      });

      const recordData = await recordResponse.json();

      if (!recordData.ok) {
        throw new Error(recordData.error || "Failed to fetch PNM record");
      }

      setProcessingStep("generating");

      // Step 2: Generate image
      const imageResponse = await fetch("/api/generate-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ record: recordData.record }),
      });

      if (!imageResponse.ok) {
        throw new Error("Failed to generate image");
      }

      setProcessingStep("downloading");

      // Step 3: Download
      const blob = await imageResponse.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${pnm.name.replace(/\s+/g, "_")}_summary.png`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);

      setProcessingStep("done");
      toast.success(`Downloaded summary for ${pnm.name}`);

      // Reset after short delay
      setTimeout(() => {
        setProcessingStep("idle");
        setSelectedPNM(null);
        searchInputRef.current?.focus();
      }, 1500);
    } catch (err) {
      console.error("Processing error:", err);
      toast.error(err instanceof Error ? err.message : "An error occurred");
      setProcessingStep("idle");
      setSelectedPNM(null);
    }
  };

  // Reset selected index when search results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [searchResults]);

  // Loading state
  if (isLoadingList) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans p-4">
        <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-6">
            PNM Summary
          </h1>
          <div className="flex flex-col items-center gap-4 py-8">
            <div className="h-12 w-12 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-600">Loading PNM list...</p>
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (listError) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans p-4">
        <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
          <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-6">
            PNM Summary
          </h1>
          <div className="bg-red-100 border border-red-300 rounded-md p-4 mb-4">
            <p className="text-red-800">{listError}</p>
          </div>
          <Link
            href="/"
            className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300"
          >
            Back
          </Link>
        </main>
      </div>
    );
  }

  const isProcessing = processingStep !== "idle" && processingStep !== "done";

  return (
    <div className="flex min-h-screen items-center justify-center font-sans p-4">
      <main className="bg-zinc-50 rounded-lg p-6 w-full md:w-1/2 max-w-2xl">
        <h1 className="text-4xl font-mono font-bold underline decoration-red-300 mb-2">
          PNM Summary
        </h1>
        <p className="text-gray-600 mb-6">
          Search for a PNM to generate their attendance summary image.
        </p>

        {/* Search Input */}
        <div className="relative mb-6">
          <label htmlFor="search" className="text-lg font-medium block mb-2">
            Search by Name:
          </label>
          <input
            ref={searchInputRef}
            type="text"
            id="search"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setShowDropdown(true);
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => setShowDropdown(false), 150);
            }}
            onKeyDown={handleKeyDown}
            disabled={isProcessing}
            autoComplete="off"
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-700 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            placeholder="Start typing a name..."
          />

          {/* Dropdown */}
          {showDropdown && searchResults.length > 0 && !isProcessing && (
            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
              {searchResults.map((pnm, index) => (
                <button
                  key={pnm.id}
                  type="button"
                  className={`w-full text-left px-4 py-2 hover:bg-red-50 transition-colors ${
                    index === selectedIndex ? "bg-red-100" : ""
                  }`}
                  onMouseDown={() => handleSelectPNM(pnm)}
                  onMouseEnter={() => setSelectedIndex(index)}
                >
                  <span className="font-medium">{pnm.name}</span>
                  <span className="text-gray-500 text-sm ml-2">
                    ({pnm.id})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* No results message */}
          {showDropdown &&
            searchQuery.trim() &&
            searchResults.length === 0 &&
            !isProcessing && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-4 text-gray-500 text-center">
                No PNMs found matching &quot;{searchQuery}&quot;
              </div>
            )}
        </div>

        {/* Status Bar */}
        {(isProcessing || processingStep === "done") && selectedPNM && (
          <div className="bg-gray-100 rounded-lg p-4 mb-6">
            <p className="font-medium mb-3">
              Processing:{" "}
              <span className="text-red-700">{selectedPNM.name}</span>
            </p>
            <div className="space-y-2">
              <StatusStep
                label="Fetching PNM record"
                status={getStepStatus("fetching", processingStep)}
              />
              <StatusStep
                label="Generating image"
                status={getStepStatus("generating", processingStep)}
              />
              <StatusStep
                label="Downloading"
                status={getStepStatus("downloading", processingStep)}
              />
            </div>
          </div>
        )}

        {/* PNM count */}
        {processingStep === "idle" && (
          <p className="text-sm text-gray-500 mb-8">
            {pnms.length} PNMs loaded
          </p>
        )}

        {/* Back button */}
        <Link
          href="/"
          className="bg-gray-300 text-gray-800 px-4 py-2 rounded-md hover:bg-gray-400 transition-all duration-300"
        >
          Back
        </Link>
      </main>
    </div>
  );
}

// Helper to determine step status
function getStepStatus(
  step: ProcessingStep,
  currentStep: ProcessingStep,
): "pending" | "active" | "complete" {
  const order: ProcessingStep[] = [
    "fetching",
    "generating",
    "downloading",
    "done",
  ];
  const stepIndex = order.indexOf(step);
  const currentIndex = order.indexOf(currentStep);

  if (currentStep === "done") return "complete";
  if (stepIndex < currentIndex) return "complete";
  if (stepIndex === currentIndex) return "active";
  return "pending";
}

// Status step component
function StatusStep({
  label,
  status,
}: {
  label: string;
  status: "pending" | "active" | "complete";
}) {
  return (
    <div className="flex items-center gap-3">
      {status === "complete" && (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg
            className="w-3 h-3 text-white"
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
      )}
      {status === "active" && (
        <div className="w-5 h-5 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      )}
      {status === "pending" && (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
      )}
      <span
        className={`text-sm ${
          status === "active"
            ? "text-red-700 font-medium"
            : status === "complete"
              ? "text-green-700"
              : "text-gray-400"
        }`}
      >
        {label}
        {status === "active" && "..."}
      </span>
    </div>
  );
}
