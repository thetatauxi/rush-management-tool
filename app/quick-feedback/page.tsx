"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

type PNM = {
  student_id: string;
  full_name: string;
  headshot_url: string | null;
};

export default function QuickFeedback() {
  const [pnms, setPnms] = useState<PNM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPnm, setSelectedPnm] = useState<PNM | null>(null);

  // Form states
  const [feedbackType, setFeedbackType] = useState<"Positive" | "Negative" | "Other" | "Veto">("Positive");
  const [comment, setComment] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Load PNMs on mount
  useEffect(() => {
    async function fetchPnms() {
      try {
        const { data, error } = await supabase
          .from("pnms")
          .select("student_id, full_name, headshot_url")
          .order("full_name", { ascending: true });

        if (error) throw error;
        setPnms(data || []);
      } catch (err) {
        console.error("Error loading PNMs:", err);
        toast.error("Failed to load potential new members list.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchPnms();
  }, []);

  // Filter list as user types in search bar
  const recommendations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return pnms.filter((p) => p.full_name.toLowerCase().includes(query));
  }, [pnms, searchQuery]);

  const handleSelectPnm = (pnm: PNM) => {
    setSelectedPnm(pnm);
    setSearchQuery(pnm.full_name);
  };

  const handleClearSelection = () => {
    setSelectedPnm(null);
    setSearchQuery("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPnm) {
      toast.error("Please select a potential new member first.");
      return;
    }
    if (!comment.trim()) {
      toast.error("Please enter a comment.");
      return;
    }
    if (!submitterName.trim()) {
      toast.error("Please enter your name.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("pnm_feedback")
        .insert({
          student_id: selectedPnm.student_id,
          submitter_name: submitterName.trim(),
          feedback_type: feedbackType,
          comment: comment.trim(),
          is_approved: 0,
          quick: true,
        });

      if (error) throw error;

      toast.success("Feedback submitted successfully! Pending approval.");
      // Reset form fields
      setComment("");
      setSubmitterName("");
      setFeedbackType("Positive");
      setSelectedPnm(null);
      setSearchQuery("");
    } catch (err) {
      console.error("Error submitting feedback:", err);
      toast.error("Failed to submit feedback. Check database connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center font-sans p-4">
      <div className="bg-zinc-100/90 backdrop-blur-md p-8 rounded-2xl border border-zinc-200/50 shadow-xl max-w-lg w-full text-zinc-950 flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-mono font-bold underline decoration-red-400">
            Quick Feedback
          </h1>
          <p className="text-zinc-500 text-sm mt-1">
            Submit feedback anonymously to deliberation chairs.
          </p>
        </div>

        {/* Loading State */}
        {isLoading ? (
          <div className="flex justify-center items-center py-10">
            <div className="h-8 w-8 border-4 border-red-750 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Search Input Box */}
            <div className="relative">
              <label className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-1.5 block">
                Find Potential New Member
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (selectedPnm && e.target.value !== selectedPnm.full_name) {
                      setSelectedPnm(null);
                    }
                  }}
                  placeholder="Type name to search..."
                  className="w-full px-4 py-3 bg-white border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-700 text-zinc-800 placeholder-zinc-400 shadow-sm text-sm"
                />
                {selectedPnm && (
                  <button
                    onClick={handleClearSelection}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400 hover:text-zinc-700 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown */}
              {!selectedPnm && recommendations.length > 0 && (
                <ul className="absolute z-50 left-0 right-0 mt-2 bg-white border border-zinc-200 rounded-xl shadow-lg max-h-48 overflow-y-auto divide-y divide-zinc-100">
                  {recommendations.map((pnm) => (
                    <li key={pnm.student_id}>
                      <button
                        onClick={() => handleSelectPnm(pnm)}
                        className="w-full text-left px-4 py-2.5 hover:bg-zinc-50 text-sm text-zinc-850 font-medium transition-colors flex items-center gap-3"
                      >
                        {pnm.headshot_url ? (
                          <img
                            src={pnm.headshot_url}
                            alt={pnm.full_name}
                            className="w-7 h-7 rounded-full object-cover border border-zinc-200 flex-shrink-0"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-full bg-zinc-200 border border-zinc-305 text-zinc-650 text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                            {pnm.full_name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                        )}
                        <span>{pnm.full_name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Selected PNM Feedback Form Tile */}
            {selectedPnm && (
              <form
                onSubmit={handleSubmit}
                className="flex flex-col gap-4 bg-white p-5 rounded-xl border border-zinc-200 shadow-xs animate-in fade-in slide-in-from-bottom-2 duration-300 text-zinc-900"
              >
                {/* PNM info header */}
                <div className="flex items-center gap-4 border-b border-zinc-100 pb-3">
                  {selectedPnm.headshot_url ? (
                    <img
                      src={selectedPnm.headshot_url}
                      alt={selectedPnm.full_name}
                      className="w-14 h-14 rounded-lg object-cover border border-zinc-200 shadow-xs flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-lg bg-zinc-100 border border-zinc-305 text-zinc-700 text-md font-bold flex items-center justify-center flex-shrink-0">
                      {selectedPnm.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </div>
                  )}
                  <div>
                    <h2 className="text-lg font-bold text-zinc-900 leading-tight">
                      {selectedPnm.full_name}
                    </h2>
                    <span className="text-xs text-zinc-400 font-mono">
                      ID: {selectedPnm.student_id}
                    </span>
                  </div>
                </div>

                {/* Feedback Types selection buttons */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block">
                    Feedback Category
                  </span>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(["Positive", "Negative", "Other", "Veto"] as const).map((type) => {
                      const isActive = feedbackType === type;
                      const activeColors =
                        type === "Positive"
                          ? "bg-green-600 border-green-700 hover:bg-green-700"
                          : type === "Negative"
                          ? "bg-red-600 border-red-700 hover:bg-red-700"
                          : type === "Other"
                          ? "bg-zinc-500 border-zinc-600 hover:bg-zinc-600"
                          : "bg-purple-600 border-purple-700 hover:bg-purple-700";

                      const inactiveColors =
                        type === "Positive"
                          ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100/50"
                          : type === "Negative"
                          ? "bg-red-50 border-red-200 text-red-700 hover:bg-red-100/50"
                          : type === "Other"
                          ? "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100/50"
                          : "bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100/50";

                      return (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setFeedbackType(type)}
                          className={`py-1.5 rounded-lg border text-xs font-bold transition-all shadow-xs leading-none ${
                            isActive ? `text-white ${activeColors} scale-102` : inactiveColors
                          }`}
                        >
                          {type}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Comments box */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="comment"
                    className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block"
                  >
                    Comment
                  </label>
                  <textarea
                    id="comment"
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Enter your comments here..."
                    className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg h-24 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-750 placeholder-zinc-350"
                    required
                  />
                </div>

                {/* Submitter Name box */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="submitterName"
                    className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider block"
                  >
                    Submitter Name
                  </label>
                  <input
                    id="submitterName"
                    type="text"
                    value={submitterName}
                    onChange={(e) => setSubmitterName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 text-sm border border-zinc-300 rounded-lg bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-750 placeholder-zinc-350"
                    required
                  />
                </div>

                {/* Submit button */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 bg-red-700 hover:bg-red-800 text-white rounded-lg font-bold text-sm transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed hover:shadow-xs mt-1"
                >
                  {isSubmitting ? "Submitting..." : "Submit Feedback"}
                </button>
              </form>
            )}
          </>
        )}

        {/* Back Link */}
        <div className="text-center">
          <Link
            href="/login"
            className="text-xs font-semibold text-zinc-450 hover:text-zinc-650 transition-colors"
          >
            &larr; Back to Login
          </Link>
        </div>
      </div>
    </div>
  );
}
