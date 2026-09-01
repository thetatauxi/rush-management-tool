"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";
import { EVENT_HEADERS } from "@/lib/pnmConstants";

type PNM = {
  student_id: string;
  full_name: string;
  email: string;
  headshot_url: string | null;
  event_1: boolean;
  event_2: boolean;
  event_3: boolean;
  event_4: boolean;
  event_5: boolean;
  event_6: boolean;
  created_at: string;
  major: string | null;
  year: string | null;
  absence_form_num: number | null;
  absence_reason: string | null;
  positive_votes: number | null;
  positive_note: string | null;
  negative_votes: number | null;
  negative_note: string | null;
  abstain_votes: number | null;
  other_note: string | null;
  veto_votes: number | null;
  veto_note: string | null;
  application_comments: string | null;
  interviewer_names: string | null;
  interview_notes: string | null;
  review_code?: string | null;
};

type ReviewSplitItem = {
  code: string;
  reviewerIndex: number;
  pnmCount: number;
  studentIds: string[];
};

type FeedbackItem = {
  id: number;
  student_id: string;
  submitter_name: string;
  feedback_type: "Positive" | "Negative" | "Other" | "Veto";
  comment: string;
  is_approved: number;
  quick: boolean;
  created_at?: string;
};

export default function SearchPnmPage() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pnms, setPnms] = useState<PNM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // User Profile & Role States
  const [userFullName, setUserFullName] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userRole, setUserRole] = useState("Member");
  const [isRushChair, setIsRushChair] = useState(false);
  const [hasViewFeedbackPrivilege, setHasViewFeedbackPrivilege] = useState(false);
  const [appCommitteeEnabled, setAppCommitteeEnabled] = useState(false);

  // Split Search for Rush Committee States
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [reviewerCountInput, setReviewerCountInput] = useState("10");
  const [isGeneratingSplit, setIsGeneratingSplit] = useState(false);
  const [activeSplitCodes, setActiveSplitCodes] = useState<ReviewSplitItem[]>([]);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Details Modal States
  const [selectedPnmForDetails, setSelectedPnmForDetails] = useState<PNM | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<PNM>>({});

  // Feedback Drawer & Submission States
  const [isViewingFeedback, setIsViewingFeedback] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackList, setFeedbackList] = useState<FeedbackItem[]>([]);
  const [newFeedbackType, setNewFeedbackType] = useState<"Positive" | "Negative" | "Other" | "Veto">("Positive");
  const [newFeedbackComment, setNewFeedbackComment] = useState("");

  // Auth verification
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

  // Load PNMs, user role, voting ops settings, and existing review splits
  useEffect(() => {
    if (checkingAuth) return;

    async function fetchData() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, first_name, last_name")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile) {
            const role = profile.role?.toLowerCase() || "";
            const isOfficer =
              role === "rush chair" ||
              role === "regent" ||
              role === "vice regent" ||
              role === "vr" ||
              role === "admin";

            setIsRushChair(isOfficer);
            setHasViewFeedbackPrivilege(isOfficer);

            const first = profile.first_name || "";
            const last = profile.last_name || "";
            setUserFullName(`${first} ${last}`.trim() || "Brother");
            setUserFirstName(first || "Brother");
            setUserRole(profile.role || "Member");
          }
        }

        // Fetch ops for app_committee_enabled
        const { data: opsData } = await supabase
          .from("voting-ops")
          .select("app_committee_enabled")
          .eq("id", 1)
          .maybeSingle();

        if (opsData) {
          setAppCommitteeEnabled(!!opsData.app_committee_enabled);
        }

        // Fetch all PNMs ordered alphabetically
        const { data, error } = await supabase
          .from("pnms")
          .select("*")
          .order("full_name", { ascending: true });

        if (error) throw error;
        const pnmList: PNM[] = data || [];
        setPnms(pnmList);

        // Fetch existing review splits if available
        try {
          const { data: splitRows } = await supabase
            .from("pnm_review_splits")
            .select("*")
            .order("reviewer_index", { ascending: true });

          if (splitRows && splitRows.length > 0) {
            const map: Record<string, { code: string; reviewerIndex: number; studentIds: string[] }> = {};
            splitRows.forEach((r: any) => {
              if (!map[r.code]) {
                map[r.code] = {
                  code: r.code,
                  reviewerIndex: r.reviewer_index,
                  studentIds: [],
                };
              }
              map[r.code].studentIds.push(r.student_id);
            });

            const items: ReviewSplitItem[] = Object.values(map)
              .sort((a, b) => a.reviewerIndex - b.reviewerIndex)
              .map((v) => ({
                code: v.code,
                reviewerIndex: v.reviewerIndex,
                pnmCount: v.studentIds.length,
                studentIds: v.studentIds,
              }));
            setActiveSplitCodes(items);
          } else {
            // Group by review_code column from pnms
            const codeMap: Record<string, string[]> = {};
            pnmList.forEach((p) => {
              if (p.review_code) {
                if (!codeMap[p.review_code]) codeMap[p.review_code] = [];
                codeMap[p.review_code].push(p.student_id);
              }
            });
            if (Object.keys(codeMap).length > 0) {
              const items: ReviewSplitItem[] = Object.entries(codeMap).map(([code, ids], idx) => ({
                code,
                reviewerIndex: idx + 1,
                pnmCount: ids.length,
                studentIds: ids,
              }));
              setActiveSplitCodes(items);
            }
          }
        } catch (splitErr) {
          console.warn("Notice: Review splits table check:", splitErr);
        }
      } catch (err) {
        console.error("Error loading PNM data:", err);
        toast.error("Failed to load PNM directory.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [checkingAuth]);

  // Check if current search query matches a review split hex code
  const activeSplitMatch = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) return null;
    const clean = raw.replace(/^#/, "").toUpperCase();

    const fromList = activeSplitCodes.find((s) => s.code.toUpperCase() === clean);
    if (fromList) return fromList;

    const count = pnms.filter((p) => p.review_code && p.review_code.toUpperCase() === clean).length;
    if (count > 0) {
      return {
        code: clean,
        reviewerIndex: 0,
        pnmCount: count,
        studentIds: [],
      };
    }
    return null;
  }, [searchQuery, activeSplitCodes, pnms]);

  // Multi-field search filtering & hex code review split filtering (sorted alphabetically)
  const filteredPnms = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) {
      return [...pnms].sort((a, b) => a.full_name.localeCompare(b.full_name));
    }

    const clean = raw.replace(/^#/, "").toUpperCase();

    // If query matches a review split hex code, filter strictly to assigned PNMs
    const isSplitCodeMatch = pnms.some(
      (p) => p.review_code && p.review_code.toUpperCase() === clean
    );

    if (isSplitCodeMatch) {
      return pnms
        .filter((p) => p.review_code && p.review_code.toUpperCase() === clean)
        .sort((a, b) => a.full_name.localeCompare(b.full_name));
    }

    // Standard multi-field search
    const terms = raw.toLowerCase().split(/\s+/).filter(Boolean);
    const list = pnms.filter((pnm) => {
      const searchableFields = [
        pnm.full_name,
        pnm.email,
        pnm.student_id,
        pnm.major || "",
        pnm.year || "",
        pnm.interviewer_names || "",
        pnm.review_code || "",
      ]
        .join(" ")
        .toLowerCase();

      return terms.every((term) => searchableFields.includes(term));
    });

    return list.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [pnms, searchQuery]);

  // Handle generating equal and random PNM review splits
  const handleGenerateSplits = async () => {
    const numReviewers = parseInt(reviewerCountInput.trim(), 10);
    if (isNaN(numReviewers) || numReviewers <= 0) {
      toast.error("Please enter a valid number of reviewers (at least 1).");
      return;
    }

    if (pnms.length === 0) {
      toast.error("No PNMs available to split.");
      return;
    }

    setIsGeneratingSplit(true);
    try {
      let splitResults: ReviewSplitItem[] = [];

      // 1. Try calling the PostgreSQL stored procedure
      const { data: rpcData, error: rpcError } = await supabase.rpc("split_pnm_reviews", {
        p_num_reviewers: numReviewers,
      });

      if (!rpcError && rpcData && Array.isArray(rpcData) && rpcData.length > 0) {
        splitResults = rpcData.map((r: any) => ({
          code: r.code,
          reviewerIndex: r.reviewer_index,
          pnmCount: r.pnm_count,
          studentIds: r.student_ids || [],
        }));
      } else {
        // Fallback: Client-side Fisher-Yates random shuffle & assignment
        const shuffled = [...pnms];
        for (let i = shuffled.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        const codesSet = new Set<string>();
        while (codesSet.size < numReviewers) {
          const hex = Math.floor(Math.random() * 0xffffff)
            .toString(16)
            .padStart(6, "0")
            .toUpperCase();
          codesSet.add(hex);
        }
        const hexCodes = Array.from(codesSet);

        const base = Math.floor(shuffled.length / numReviewers);
        const rem = shuffled.length % numReviewers;
        let offset = 0;

        splitResults = [];
        for (let i = 0; i < numReviewers; i++) {
          const count = base + (i < rem ? 1 : 0);
          if (count <= 0) continue;
          const slice = shuffled.slice(offset, offset + count);
          offset += count;
          splitResults.push({
            code: hexCodes[i],
            reviewerIndex: i + 1,
            pnmCount: slice.length,
            studentIds: slice.map((p) => p.student_id),
          });
        }

        // Persist to database
        try {
          for (const split of splitResults) {
            await supabase
              .from("pnms")
              .update({ review_code: split.code })
              .in("student_id", split.studentIds);
          }
          await supabase.from("pnm_review_splits").delete().neq("id", 0);
          const splitRows = splitResults.flatMap((s) =>
            s.studentIds.map((sid) => ({
              code: s.code,
              student_id: sid,
              reviewer_index: s.reviewerIndex,
              total_reviewers: numReviewers,
            }))
          );
          await supabase.from("pnm_review_splits").insert(splitRows);
        } catch (dbErr) {
          console.warn("DB update for review splits:", dbErr);
        }
      }

      // Update in-memory PNMs
      const idToCode: Record<string, string> = {};
      splitResults.forEach((s) => {
        s.studentIds.forEach((sid) => {
          idToCode[sid] = s.code;
        });
      });

      setPnms((prev) =>
        prev.map((p) => ({
          ...p,
          review_code: idToCode[p.student_id] || null,
        }))
      );

      setActiveSplitCodes(splitResults);
      toast.success(
        `Generated ${splitResults.length} unique hex codes for ${pnms.length} PNMs!`
      );
    } catch (err: any) {
      console.error("Error generating review splits:", err);
      toast.error(err?.message || "Failed to generate splits.");
    } finally {
      setIsGeneratingSplit(false);
    }
  };

  // Copy all generated hex codes separated by newline for 1-click spreadsheet paste
  const handleCopyAllCodes = () => {
    if (activeSplitCodes.length === 0) return;
    const text = activeSplitCodes.map((s) => s.code).join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true);
    toast.success(
      `Copied ${activeSplitCodes.length} codes to clipboard! Paste directly into your spreadsheet.`
    );
    setTimeout(() => setCopiedAll(false), 2500);
  };

  // Copy a single hex code
  const handleCopySingleCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    toast.success(`Copied code #${code}`);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Details Modal Handlers
  const handleOpenDetails = (pnm: PNM) => {
    setSelectedPnmForDetails(pnm);
    setIsEditing(false);
    setIsViewingFeedback(false);
    fetchFeedbackList(pnm.student_id);
  };

  const handleCloseDetails = () => {
    setSelectedPnmForDetails(null);
    setIsEditing(false);
    setIsViewingFeedback(false);
  };

  const fetchFeedbackList = async (studentId: string) => {
    try {
      const { data, error } = await supabase
        .from("pnm_feedback")
        .select("*")
        .eq("student_id", studentId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setFeedbackList(data || []);
    } catch (err) {
      console.error("Error loading feedback list:", err);
    }
  };

  const handleToggleApproval = async (feedbackId: number, currentApproval: number, targetValue: number) => {
    const newValue = currentApproval === targetValue ? 0 : targetValue;
    try {
      const { error } = await supabase
        .from("pnm_feedback")
        .update({ is_approved: newValue })
        .eq("id", feedbackId);

      if (error) throw error;

      setFeedbackList((prev) =>
        prev.map((fb) => (fb.id === feedbackId ? { ...fb, is_approved: newValue } : fb))
      );
    } catch (err) {
      console.error("Error toggling approval status:", err);
      toast.error("Failed to update status.");
    }
  };

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPnmForDetails?.student_id) return;

    if (!newFeedbackComment.trim()) {
      toast.error("Please enter a comment.");
      return;
    }

    try {
      const { error } = await supabase
        .from("pnm_feedback")
        .insert({
          student_id: selectedPnmForDetails.student_id,
          submitter_name: userFullName || "Anonymous",
          feedback_type: newFeedbackType,
          comment: newFeedbackComment.trim(),
          is_approved: 0,
          quick: false,
        });

      if (error) throw error;

      toast.success("Feedback submitted successfully!");
      setIsSubmittingFeedback(false);
      setNewFeedbackComment("");
      setNewFeedbackType("Positive");

      fetchFeedbackList(selectedPnmForDetails.student_id);
    } catch (err) {
      console.error("Error submitting feedback:", err);
      toast.error("Failed to submit feedback.");
    }
  };

  const startEditing = (pnm: PNM) => {
    setEditedValues({ ...pnm });
    setIsEditing(true);
  };

  const handleSaveChanges = async (targetPnm: PNM) => {
    try {
      const updatePayload = isRushCommitteeOnly
        ? { application_comments: editedValues.application_comments }
        : {
          full_name: editedValues.full_name,
          major: editedValues.major,
          year: editedValues.year,
          absence_form_num: editedValues.absence_form_num,
          absence_reason: editedValues.absence_reason,
          positive_note: editedValues.positive_note,
          negative_note: editedValues.negative_note,
          other_note: editedValues.other_note,
          veto_note: editedValues.veto_note,
          application_comments: editedValues.application_comments,
          interviewer_names: editedValues.interviewer_names,
          interview_notes: editedValues.interview_notes,
          event_1: editedValues.event_1,
          event_2: editedValues.event_2,
          event_3: editedValues.event_3,
          event_4: editedValues.event_4,
          event_5: editedValues.event_5,
          event_6: editedValues.event_6,
        };

      const { error } = await supabase
        .from("pnms")
        .update(updatePayload)
        .eq("student_id", targetPnm.student_id);

      if (error) throw error;

      const updatedPnm = { ...targetPnm, ...editedValues } as PNM;
      setPnms(pnms.map((p) => (p.student_id === targetPnm.student_id ? updatedPnm : p)));
      if (selectedPnmForDetails) setSelectedPnmForDetails(updatedPnm);
      setIsEditing(false);
      toast.success("Candidate details saved successfully!");
    } catch (err) {
      console.error("Error saving changes:", err);
      toast.error("Failed to save changes. Please check permissions.");
    }
  };

  const isRushCommitteeOnly = userRole.toLowerCase() === "rush committee" && !isRushChair;
  const canEdit = isRushChair || (userRole.toLowerCase() === "rush committee" && appCommitteeEnabled);

  const canSplitSearch = isRushChair;

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans p-4 md:p-6 text-gray-900">
      {/* Top Header */}
      <header className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-100/90 backdrop-blur-sm p-6 rounded-xl border border-zinc-200/50 shadow-sm">
        <div>
          <h1 className="text-3xl md:text-4xl font-mono font-bold underline decoration-red-400">
            Xi Rush PNM Directory
          </h1>
          <p className="text-zinc-600 mt-1 text-sm md:text-base">
            Search candidates, inspect deliberation details, submit feedback, and view attendance.
          </p>
        </div>
        <Link
          href="/"
          className="bg-zinc-200 text-zinc-850 border border-zinc-300/80 px-4 py-2 rounded-md hover:bg-zinc-300 transition-all duration-300 font-medium text-sm md:text-base shadow-xs"
        >
          Back to Dashboard
        </Link>
      </header>

      {/* Centered Search Bar & Results Counter Section */}
      <section className="max-w-7xl mx-auto mb-8">
        <div className="bg-white/95 backdrop-blur-md rounded-xl p-4 md:p-5 border border-zinc-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="hidden md:block w-36 text-xs text-zinc-400 font-semibold uppercase tracking-wider">
            Directory Search
          </div>

          {/* Search Bar (Centered) */}
          <div className="relative flex-1 w-full max-w-2xl mx-auto">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-zinc-400">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, student ID, major, year, or paste reviewer hex code..."
              className="w-full pl-10 pr-10 py-3 bg-zinc-50 border border-zinc-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-red-700 text-zinc-900 placeholder-zinc-400 text-sm font-medium shadow-inner transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-zinc-400 hover:text-zinc-700 transition-colors cursor-pointer"
                title="Clear search"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Result Count & Split Search (Right Side) */}
          <div className="flex items-center justify-end gap-3 w-full md:w-auto">
            <div className="bg-zinc-100 text-zinc-800 border border-zinc-200/80 px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono shadow-2xs whitespace-nowrap">
              <span className="text-red-700 font-extrabold text-sm mr-1">{filteredPnms.length}</span>
              {filteredPnms.length === 1 ? "PNM" : "PNMs"} Found
            </div>

            {canSplitSearch && (
              <button
                onClick={() => setShowSplitModal(true)}
                className="bg-zinc-900 hover:bg-zinc-800 text-white border border-zinc-700 px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono shadow-sm transition-all hover:scale-105 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                title="Split PNMs equally and randomly among reviewers"
              >
                <svg className="w-3.5 h-3.5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Split Search
              </button>
            )}
          </div>
        </div>

        {/* Active Split Filter Banner */}
        {activeSplitMatch && (
          <div className="mt-3 bg-red-50/90 border border-red-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 text-xs font-mono text-red-950 animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-red-600 animate-pulse" />
              <span>
                Active Reviewer Split:{" "}
                <strong className="bg-red-200/80 text-red-950 px-1.5 py-0.5 rounded font-bold">
                  #{activeSplitMatch.code}
                </strong>
              </span>
              <span className="text-zinc-600 font-sans">
                &bull; Showing <strong>{filteredPnms.length}</strong> randomly assigned candidate{filteredPnms.length === 1 ? "" : "s"}
              </span>
            </div>
            <button
              onClick={() => setSearchQuery("")}
              className="bg-white hover:bg-red-100 text-red-700 border border-red-300 px-2.5 py-1 rounded text-xs font-bold font-sans transition-colors cursor-pointer"
            >
              Clear Split Filter
            </button>
          </div>
        )}
      </section>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex justify-center items-center py-24">
            <div className="text-lg font-medium text-zinc-500 animate-pulse">Loading candidate directory...</div>
          </div>
        ) : filteredPnms.length === 0 ? (
          <div className="bg-white/80 backdrop-blur-sm rounded-xl p-12 text-center border border-zinc-200 shadow-sm">
            <div className="w-16 h-16 mx-auto mb-4 text-zinc-300 flex items-center justify-center rounded-full bg-zinc-100">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.5"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-zinc-800">No candidates match your search</h3>
            <p className="text-sm text-zinc-500 mt-1">
              Try searching with a different name, email, student ID, major, or clear the search query.
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="mt-4 px-4 py-2 bg-red-700 text-white text-xs font-semibold rounded-lg hover:bg-red-800 transition-colors shadow-sm cursor-pointer"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          /* Grid View (5 per row on desktop) */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-5">
            {filteredPnms.map((pnm) => (
              <div
                key={pnm.student_id}
                onClick={() => handleOpenDetails(pnm)}
                className="group bg-white rounded-xl border border-zinc-200/90 shadow-xs hover:shadow-xl hover:border-red-400/80 transition-all duration-200 flex flex-col overflow-hidden cursor-pointer hover:-translate-y-1 select-none"
              >
                {/* PNM Headshot */}
                <div className="relative aspect-[3/4] w-full bg-zinc-100 flex items-center justify-center overflow-hidden border-b border-zinc-200/80">
                  {pnm.headshot_url ? (
                    <img
                      src={pnm.headshot_url}
                      alt={`${pnm.full_name} Headshot`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-zinc-300 group-hover:text-zinc-400 transition-colors">
                      <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    </div>
                  )}

                  {/* Hover Overlay Prompt */}
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center">
                    <span className="bg-white/90 text-zinc-900 text-xs font-bold px-3 py-1.5 rounded-full shadow-md backdrop-blur-xs">
                      View Details
                    </span>
                  </div>
                </div>

                {/* PNM Details Below Headshot */}
                <div className="p-3 flex flex-col justify-between flex-1 bg-white">
                  <div>
                    <h3
                      className="font-bold text-sm text-zinc-950 truncate leading-tight group-hover:text-red-700 transition-colors"
                      title={pnm.full_name}
                    >
                      {pnm.full_name}
                    </h3>
                    <p
                      className="text-zinc-500 text-xs font-medium truncate mt-0.5"
                      title={`${pnm.major || "Undeclared"} — ${pnm.year || "N/A"}`}
                    >
                      {pnm.major || "Undeclared"} • {pnm.year || "N/A"}
                    </p>
                  </div>

                  {/* Attendance Dots */}
                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-zinc-100">
                    <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider">
                      Events
                    </span>
                    <div className="flex gap-1">
                      {[
                        pnm.event_1,
                        pnm.event_2,
                        pnm.event_3,
                        pnm.event_4,
                        pnm.event_5,
                        pnm.event_6,
                      ].map((attended, i) => (
                        <span
                          key={i}
                          className={`w-2.5 h-2.5 rounded-full border shadow-2xs ${attended
                            ? "bg-green-500 border-green-600"
                            : "bg-red-500 border-red-600"
                            }`}
                          title={`${EVENT_HEADERS[i]}: ${attended ? "Attended" : "Absent"}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ========================================================================= */}
      {/* DETAILS POPUP MODAL (IDENTICAL TO VOTING DASHBOARD MODAL)                 */}
      {/* ========================================================================= */}
      {selectedPnmForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="flex gap-4 max-w-7xl w-full h-[90vh] items-stretch justify-center">
            <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 flex-1 flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-mono font-bold tracking-wide">PNM DETAILS & DELIBERATION</h2>
                <button
                  onClick={handleCloseDetails}
                  className="text-zinc-400 hover:text-white font-bold text-2xl transition-colors leading-none cursor-pointer"
                >
                  &times;
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-4 gap-6 text-zinc-900">
                {/* Left Column: Name, Photo, Dots, Major/Yr, Absence */}
                <div className="md:col-span-1 border-r border-zinc-200 pr-6 flex flex-col gap-4">
                  <div className="border-b border-zinc-200 pb-3">
                    {isEditing && !isRushCommitteeOnly ? (
                      <input
                        type="text"
                        value={editedValues.full_name || ""}
                        onChange={(e) => setEditedValues({ ...editedValues, full_name: e.target.value })}
                        className="w-full text-2xl font-bold border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-700"
                      />
                    ) : (
                      <h2 className="text-3xl font-bold tracking-tight text-zinc-950 truncate">
                        {selectedPnmForDetails.full_name}
                      </h2>
                    )}
                  </div>

                  <div className="relative aspect-[3/4] w-full bg-zinc-100 rounded-lg border border-zinc-300 overflow-hidden flex items-center justify-center">
                    {selectedPnmForDetails.headshot_url ? (
                      <img
                        src={selectedPnmForDetails.headshot_url}
                        alt={`${selectedPnmForDetails.full_name} Headshot`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-16 h-16 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    )}
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-200">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                      Major / Year
                    </span>
                    {isEditing && !isRushCommitteeOnly ? (
                      <div className="flex flex-col gap-1.5">
                        <input
                          type="text"
                          value={editedValues.major || ""}
                          onChange={(e) => setEditedValues({ ...editedValues, major: e.target.value })}
                          className="w-full text-xs border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                          placeholder="Computer Engineering"
                        />
                        <select
                          value={editedValues.year || "Freshman"}
                          onChange={(e) => setEditedValues({ ...editedValues, year: e.target.value })}
                          className="w-full text-xs border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                        >
                          <option value="Freshman">Freshman</option>
                          <option value="Sophomore">Sophomore</option>
                          <option value="Junior">Junior</option>
                          <option value="Senior">Senior</option>
                        </select>
                      </div>
                    ) : (
                      <p
                        className="font-bold text-zinc-800 text-xs truncate"
                        title={`${selectedPnmForDetails.major || "Undeclared"} — ${selectedPnmForDetails.year || "N/A"}`}
                      >
                        {selectedPnmForDetails.major || "Undeclared"} — {selectedPnmForDetails.year || "N/A"}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2.5 p-3 bg-zinc-50 rounded-lg border border-zinc-200">
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Event Attendance
                        </span>
                        {isEditing && !isRushCommitteeOnly && (
                          <span className="text-[9px] text-zinc-400 font-semibold italic">Click to toggle</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 mt-0.5">
                        {(["event_1", "event_2", "event_3", "event_4", "event_5", "event_6"] as const).map((key, i) => {
                          const isEditingEvents = isEditing && !isRushCommitteeOnly;
                          const isAttended = isEditingEvents ? !!editedValues[key] : !!selectedPnmForDetails[key];
                          const eventName = EVENT_HEADERS[i] || `Event ${i + 1}`;

                          return (
                            <div
                              key={key}
                              className={`flex items-center justify-between py-1 px-2 rounded border text-xs shadow-2xs transition-colors ${isEditingEvents
                                ? "bg-white border-zinc-300 hover:border-zinc-400 cursor-pointer select-none"
                                : "bg-white border-zinc-200/80"
                                }`}
                              onClick={() => {
                                if (isEditingEvents) {
                                  setEditedValues((prev) => ({
                                    ...prev,
                                    [key]: !isAttended,
                                  }));
                                }
                              }}
                            >
                              <span className="font-medium text-zinc-700 truncate pr-2" title={eventName}>
                                {eventName}
                              </span>
                              <span
                                className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 shadow-xs ${isAttended
                                  ? "bg-green-500 border-green-600"
                                  : "bg-red-500 border-red-600"
                                  }`}
                                title={isAttended ? "Attended" : "Absent"}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="border-t border-zinc-200 pt-2.5 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">
                          Absence Form (#)
                        </span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <input
                            type="number"
                            value={editedValues.absence_form_num ?? 0}
                            onChange={(e) =>
                              setEditedValues({
                                ...editedValues,
                                absence_form_num: parseInt(e.target.value) || 0,
                              })
                            }
                            className="w-16 text-xs text-right border border-zinc-300 rounded px-1.5 py-0.5 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                          />
                        ) : (
                          <span className="font-mono font-bold text-zinc-800 text-xs px-2 py-0.5 bg-white border border-zinc-200 rounded">
                            {selectedPnmForDetails.absence_form_num ?? 0}
                          </span>
                        )}
                      </div>

                      <div>
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block mb-1">
                          Reason for Absence
                        </span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <textarea
                            value={editedValues.absence_reason || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, absence_reason: e.target.value })}
                            className="w-full text-xs border border-zinc-300 rounded px-2 py-1 h-14 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Reason details..."
                          />
                        ) : (
                          <p className="text-zinc-700 text-xs italic leading-relaxed whitespace-pre-line bg-white p-2 rounded border border-zinc-200/80">
                            {selectedPnmForDetails.absence_reason || "None specified"}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 flex items-center justify-between text-[11px] text-zinc-600 gap-2">
                    <div className="truncate min-w-0 flex-1">
                      <span className="font-semibold text-zinc-400 block text-[9px] uppercase tracking-wider">
                        Email
                      </span>
                      <span
                        className="font-mono text-zinc-700 truncate block text-xs"
                        title={selectedPnmForDetails.email}
                      >
                        {selectedPnmForDetails.email}
                      </span>
                    </div>
                    <div className="h-6 w-px bg-zinc-200 flex-shrink-0" />
                    <div className="text-right flex-shrink-0">
                      <span className="font-semibold text-zinc-400 block text-[9px] uppercase tracking-wider">
                        Student ID
                      </span>
                      <span className="font-mono text-zinc-700 font-bold block text-xs">
                        {selectedPnmForDetails.student_id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Middle Column: Feedback Notes & Application Comments */}
                <div className="md:col-span-2 border-r border-zinc-200 px-6 flex flex-col justify-between gap-6">
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-3 border-b border-zinc-100 pb-1 flex-shrink-0">
                      <h4 className="text-lg font-bold text-zinc-800">Feedback Notes</h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsSubmittingFeedback(true)}
                          className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer"
                        >
                          Submit Feedback
                        </button>
                        {hasViewFeedbackPrivilege && (
                          <button
                            onClick={() => setIsViewingFeedback(!isViewingFeedback)}
                            className={`px-2.5 py-1 text-white rounded text-xs font-semibold shadow-sm transition-all cursor-pointer ${isViewingFeedback ? "bg-zinc-800 hover:bg-zinc-900" : "bg-zinc-700 hover:bg-zinc-800"
                              }`}
                          >
                            {isViewingFeedback ? "Hide Feedback" : "View Feedback"}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                      {/* Positive */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-green-700 uppercase block">Positive Note</span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <textarea
                            value={editedValues.positive_note || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, positive_note: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-14 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Positive comment..."
                          />
                        ) : (
                          <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed min-h-[1.5rem]">
                            {selectedPnmForDetails.positive_note || "—"}
                          </p>
                        )}
                        {feedbackList
                          .filter((fb) => fb.feedback_type === "Positive" && fb.is_approved === 1)
                          .map((fb) => (
                            <div
                              key={fb.id}
                              className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-green-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs"
                            >
                              {fb.comment}
                            </div>
                          ))}
                      </div>

                      {/* Negative */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-red-700 uppercase block">Negative Note</span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <textarea
                            value={editedValues.negative_note || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, negative_note: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-14 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Negative comment..."
                          />
                        ) : (
                          <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed min-h-[1.5rem]">
                            {selectedPnmForDetails.negative_note || "—"}
                          </p>
                        )}
                        {feedbackList
                          .filter((fb) => fb.feedback_type === "Negative" && fb.is_approved === 1)
                          .map((fb) => (
                            <div
                              key={fb.id}
                              className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-red-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs"
                            >
                              {fb.comment}
                            </div>
                          ))}
                      </div>

                      {/* Other */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-zinc-700 uppercase block">Other Note</span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <textarea
                            value={editedValues.other_note || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, other_note: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-14 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Other comments..."
                          />
                        ) : (
                          <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed min-h-[1.5rem]">
                            {selectedPnmForDetails.other_note || "—"}
                          </p>
                        )}
                        {feedbackList
                          .filter((fb) => fb.feedback_type === "Other" && fb.is_approved === 1)
                          .map((fb) => (
                            <div
                              key={fb.id}
                              className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-zinc-400 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs"
                            >
                              {fb.comment}
                            </div>
                          ))}
                      </div>

                      {/* Veto */}
                      <div className="flex flex-col gap-1">
                        <span className="text-xs font-semibold text-purple-700 uppercase block">Veto Note</span>
                        {isEditing && !isRushCommitteeOnly ? (
                          <textarea
                            value={editedValues.veto_note || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, veto_note: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-14 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Veto comments..."
                          />
                        ) : (
                          <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed min-h-[1.5rem]">
                            {selectedPnmForDetails.veto_note || "—"}
                          </p>
                        )}
                        {feedbackList
                          .filter((fb) => fb.feedback_type === "Veto" && fb.is_approved === 1)
                          .map((fb) => (
                            <div
                              key={fb.id}
                              className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-purple-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs"
                            >
                              {fb.comment}
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-zinc-200 pt-4">
                    <h4 className="text-lg font-bold text-zinc-800 mb-2">
                      Application Comment: <span className="text-sm text-zinc-400 font-normal">(Best 3 Things)</span>
                    </h4>
                    {isEditing ? (
                      <textarea
                        value={editedValues.application_comments || ""}
                        onChange={(e) =>
                          setEditedValues({
                            ...editedValues,
                            application_comments: e.target.value,
                          })
                        }
                        className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-20 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                        placeholder="- Detail 1&#10;- Detail 2&#10;- Detail 3"
                      />
                    ) : (
                      <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">
                        {selectedPnmForDetails.application_comments || "No comments entered."}
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Column: Interviewers and Interview Notes */}
                <div className="md:col-span-1 pl-6 flex flex-col gap-4">
                  <h4 className="text-lg font-bold text-zinc-800 border-b border-zinc-100 pb-1">Interview Notes:</h4>

                  <div>
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                      Names of Interviewers
                    </span>
                    {isEditing && !isRushCommitteeOnly ? (
                      <input
                        type="text"
                        value={editedValues.interviewer_names || ""}
                        onChange={(e) =>
                          setEditedValues({
                            ...editedValues,
                            interviewer_names: e.target.value,
                          })
                        }
                        className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                        placeholder="e.g. John, Jane"
                      />
                    ) : (
                      <p className="font-semibold text-zinc-800 text-sm mt-1">
                        {selectedPnmForDetails.interviewer_names || "None listed"}
                      </p>
                    )}
                  </div>

                  <div className="flex-1 flex flex-col min-h-0">
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">
                      Comments
                    </span>
                    <div className="flex-1 overflow-y-auto pr-1">
                      {isEditing && !isRushCommitteeOnly ? (
                        <textarea
                          value={editedValues.interview_notes || ""}
                          onChange={(e) =>
                            setEditedValues({
                              ...editedValues,
                              interview_notes: e.target.value,
                            })
                          }
                          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-44 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                          placeholder="Interview notes..."
                        />
                      ) : (
                        <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">
                          {selectedPnmForDetails.interview_notes || "No interview notes available."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center flex-shrink-0">
                <div>
                  {canEdit && (
                    <>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveChanges(selectedPnmForDetails)}
                            className="bg-green-700 text-white px-5 py-2 rounded font-semibold hover:bg-green-800 transition-colors shadow-sm cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-100 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(selectedPnmForDetails)}
                          className="bg-red-700 text-white px-5 py-2 rounded font-semibold hover:bg-red-800 transition-colors shadow-sm cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={handleCloseDetails}
                  className="bg-zinc-300 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-400 transition-colors cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FEEDBACK FEED DRAWER (FOR OFFICERS)                                       */}
      {/* ========================================================================= */}
      {isViewingFeedback && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 md:w-96 bg-white shadow-2xl border-l border-zinc-200 flex flex-col animate-in slide-in-from-right duration-300 text-zinc-950">
          <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
            <h3 className="text-md font-mono font-bold tracking-wide">FEEDBACK FEED</h3>
            <button
              onClick={() => setIsViewingFeedback(false)}
              className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
            {feedbackList.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 font-medium">No feedback submitted yet.</div>
            ) : (
              feedbackList.map((fb) => (
                <div key={fb.id} className="border-b border-zinc-100 pb-3 last:border-b-0 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-bold text-white uppercase tracking-wider ${fb.feedback_type === "Positive"
                        ? "bg-green-600"
                        : fb.feedback_type === "Negative"
                          ? "bg-red-600"
                          : fb.feedback_type === "Other"
                            ? "bg-zinc-500"
                            : "bg-purple-600"
                        }`}
                    >
                      {fb.feedback_type}
                    </span>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-500 hover:text-green-700 select-none">
                        <input
                          type="checkbox"
                          checked={fb.is_approved === 1}
                          onChange={() => handleToggleApproval(fb.id, fb.is_approved, 1)}
                          className="rounded border-zinc-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className={fb.is_approved === 1 ? "text-green-700 font-semibold" : ""}>Approve</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-500 hover:text-red-700 select-none">
                        <input
                          type="checkbox"
                          checked={fb.is_approved === -1}
                          onChange={() => handleToggleApproval(fb.id, fb.is_approved, -1)}
                          className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5 cursor-pointer"
                        />
                        <span className={fb.is_approved === -1 ? "text-red-700 font-semibold" : ""}>Decline</span>
                      </label>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-zinc-400">
                    Submitted by {fb.submitter_name}
                    {fb.quick && (
                      <span className="text-red-500 font-bold ml-0.5" title="Quick Feedback">
                        *
                      </span>
                    )}
                  </span>
                  <p className="text-sm text-zinc-800 whitespace-pre-line leading-relaxed bg-zinc-50 p-2.5 rounded border border-zinc-100 mt-0.5">
                    {fb.comment}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end flex-shrink-0">
            <button
              onClick={() => setIsViewingFeedback(false)}
              className="bg-zinc-300 text-zinc-700 px-4 py-2 rounded text-xs font-bold hover:bg-zinc-400 transition-colors cursor-pointer"
            >
              Close Feedback
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SUBMIT FEEDBACK MODAL OVERLAY                                             */}
      {/* ========================================================================= */}
      {isSubmittingFeedback && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex justify-center items-center z-[60] p-4 text-zinc-950">
          <form
            onSubmit={handleSubmitFeedback}
            className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col"
          >
            <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
              <h3 className="text-md font-mono font-bold tracking-wide">SUBMIT FEEDBACK</h3>
              <button
                type="button"
                onClick={() => setIsSubmittingFeedback(false)}
                className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Candidate Name
                </span>
                <p className="text-lg font-bold text-zinc-900 mt-0.5">
                  {selectedPnmForDetails?.full_name}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Feedback Type
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(["Positive", "Negative", "Other", "Veto"] as const).map((t) => {
                    const active = newFeedbackType === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setNewFeedbackType(t)}
                        className={`py-2 px-3 rounded text-sm font-semibold border transition-all cursor-pointer ${active
                          ? t === "Positive"
                            ? "bg-green-600 border-green-600 text-white shadow-sm"
                            : t === "Negative"
                              ? "bg-red-600 border-red-600 text-white shadow-sm"
                              : t === "Other"
                                ? "bg-zinc-600 border-zinc-600 text-white shadow-sm"
                                : "bg-purple-600 border-purple-600 text-white shadow-sm"
                          : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-50"
                          }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Comments</label>
                <textarea
                  required
                  rows={4}
                  value={newFeedbackComment}
                  onChange={(e) => setNewFeedbackComment(e.target.value)}
                  placeholder="Provide detailed deliberation comments..."
                  className="w-full border border-zinc-300 rounded p-2.5 text-sm bg-white text-zinc-950 focus:outline-none focus:ring-2 focus:ring-red-700"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center flex-shrink-0">
              <button
                type="button"
                onClick={() => setIsSubmittingFeedback(false)}
                className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2 rounded text-xs font-bold hover:bg-zinc-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="bg-red-700 text-white px-5 py-2 rounded text-xs font-bold hover:bg-red-800 transition-colors shadow-sm cursor-pointer"
              >
                Submit Feedback as {userFullName}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SPLIT SEARCH MODAL (FOR RUSH COMMITTEE)                                   */}
      {/* ========================================================================= */}
      {showSplitModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 text-zinc-950">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-mono font-bold tracking-wide flex items-center gap-2">
                  <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  SPLIT SEARCH &amp; REVIEW GENERATOR
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Divide {pnms.length} PNMs equally and randomly among reviewers
                </p>
              </div>
              <button
                onClick={() => setShowSplitModal(false)}
                className="text-zinc-400 hover:text-white font-bold text-2xl leading-none cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6">
              {/* Setup Input */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4.5 flex flex-col gap-2">
                <label className="block text-xs font-mono font-bold text-zinc-700 uppercase tracking-wider">
                  Enter # of Reviewers
                </label>
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <div className="relative flex-1">
                    <input
                      type="number"
                      min="1"
                      max={pnms.length || 100}
                      value={reviewerCountInput}
                      onChange={(e) => setReviewerCountInput(e.target.value)}
                      placeholder="e.g. 10"
                      className="w-full h-11 text-base font-mono font-bold border border-zinc-300 rounded-lg pl-3.5 pr-24 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-700"
                    />
                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs font-mono text-zinc-400 font-semibold pointer-events-none select-none">
                      Reviewers
                    </span>
                  </div>

                  <button
                    onClick={handleGenerateSplits}
                    disabled={isGeneratingSplit || pnms.length === 0}
                    className="w-full sm:w-auto h-11 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider px-5 rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    {isGeneratingSplit ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Splitting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 00-3.7-3.7 48.678 48.678 0 00-7.324 0 4.006 4.006 0 00-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3l-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 003.7 3.7 48.656 48.656 0 007.324 0 4.006 4.006 0 003.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3l-3 3" />
                        </svg>
                        {activeSplitCodes.length > 0 ? "Re-Shuffle & Split" : "Generate Split Codes"}
                      </>
                    )}
                  </button>
                </div>

                <p className="text-[11px] text-zinc-500 font-medium">
                  {parseInt(reviewerCountInput, 10) > 0 && pnms.length > 0
                    ? `~${Math.floor(pnms.length / parseInt(reviewerCountInput, 10))}${
                        pnms.length % parseInt(reviewerCountInput, 10) !== 0
                          ? `-${Math.ceil(pnms.length / parseInt(reviewerCountInput, 10))}`
                          : ""
                      } PNMs per reviewer. No duplicates or omissions.`
                    : `Total directory pool: ${pnms.length} candidates.`}
                </p>
              </div>

              {/* Active / Generated Codes List */}
              {activeSplitCodes.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {/* Action Bar with Spreadsheet Copy */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-zinc-900 text-white p-3.5 rounded-xl">
                    <div>
                      <div className="font-mono font-bold text-xs flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span>{activeSplitCodes.length} Reviewer Codes Generated</span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {pnms.length} candidates partitioned equally
                      </p>
                    </div>

                    <button
                      onClick={handleCopyAllCodes}
                      className="bg-green-600 hover:bg-green-700 text-white font-bold font-mono text-xs px-4 py-2 rounded-lg shadow-sm transition-all hover:scale-105 flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                      title="Copy all hex codes to clipboard (1 per line for spreadsheet pasting)"
                    >
                      {copiedAll ? (
                        <>
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          Copied to Clipboard!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          Copy All Codes (Spreadsheet Ready)
                        </>
                      )}
                    </button>
                  </div>

                  {/* Instruction Tip */}
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-[11px] text-amber-900 leading-relaxed font-sans">
                    💡 <strong>Spreadsheet Ready:</strong> Click <em>&quot;Copy All Codes (Spreadsheet Ready)&quot;</em> and paste (Ctrl+V / Cmd+V) into your Google Sheet or Excel column (each code will populate its own row). Reviewers can paste their assigned code into the search bar to inspect their assigned candidate partition.
                  </div>

                  {/* Grid / List of Reviewer Codes */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[340px] overflow-y-auto pr-1">
                    {activeSplitCodes.map((item, idx) => (
                      <div
                        key={item.code}
                        className="bg-zinc-50 hover:bg-zinc-100/80 border border-zinc-200 rounded-xl p-3 flex items-center justify-between gap-3 transition-colors shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-xs font-mono font-bold text-zinc-400 w-6 flex-shrink-0">
                            #{idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-extrabold text-sm text-zinc-950 tracking-wider">
                                #{item.code}
                              </span>
                              <span className="text-[10px] font-mono font-bold bg-zinc-200/80 text-zinc-700 px-1.5 py-0.5 rounded">
                                {item.pnmCount} PNMs
                              </span>
                            </div>
                            <span className="text-[10px] text-zinc-500 font-sans truncate block">
                              Reviewer {idx + 1} Assignment
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button
                            onClick={() => handleCopySingleCode(item.code)}
                            className="bg-white hover:bg-zinc-200 text-zinc-700 border border-zinc-300 p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                            title={`Copy code #${item.code}`}
                          >
                            {copiedCode === item.code ? (
                              <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setSearchQuery(item.code);
                              setShowSplitModal(false);
                            }}
                            className="bg-zinc-900 hover:bg-zinc-800 text-white px-2.5 py-1.5 rounded-lg text-[11px] font-mono font-bold transition-colors cursor-pointer"
                            title="Filter directory with this reviewer code"
                          >
                            Search
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-10 bg-zinc-50 rounded-xl border border-dashed border-zinc-200 text-zinc-500 text-xs">
                  No reviewer split codes generated yet. Enter the number of reviewers above and click &quot;Generate Split Codes&quot;.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <button
                onClick={() => setShowSplitModal(false)}
                className="bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
