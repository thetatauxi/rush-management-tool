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
};

type VoteType = "yes" | "no" | "abstain" | null;

export default function VoteDashboard() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pnms, setPnms] = useState<PNM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Role & Operations States
  const [isRushChair, setIsRushChair] = useState(false);
  const [isRegent, setIsRegent] = useState(false);
  const [votingRound, setVotingRound] = useState(1);
  const [isLive, setIsLive] = useState(false);
  const [appComLive, setAppComLive] = useState(false);
  const [pnmOrder, setPnmOrder] = useState<string[] | null>(null);
  const [selectedRegentRound, setSelectedRegentRound] = useState(1);
  const [userId, setUserId] = useState<string | null>(null);

  // Details Modal States
  const [selectedPnmForDetails, setSelectedPnmForDetails] = useState<PNM | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedValues, setEditedValues] = useState<Partial<PNM>>({});

  // Feedback Submitter & Feed Panel States
  const [userFullName, setUserFullName] = useState("");
  const [userFirstName, setUserFirstName] = useState("");
  const [userRole, setUserRole] = useState("");
  const [hasViewFeedbackPrivilege, setHasViewFeedbackPrivilege] = useState(false);
  const [isViewingFeedback, setIsViewingFeedback] = useState(false);
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false);
  const [feedbackList, setFeedbackList] = useState<any[]>([]);
  const [newFeedbackType, setNewFeedbackType] = useState<"Positive" | "Negative" | "Other" | "Veto">("Positive");
  const [newFeedbackComment, setNewFeedbackComment] = useState("");

  // Database votes state
  const [votes, setVotes] = useState<Record<string, VoteType>>({});
  const [roundCounts, setRoundCounts] = useState<Record<string, { positive: number; abstain: number; negative: number }>>({});

  // Verify auth session
  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/login");
      } else {
        setUserId(session.user.id);
        setCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router]);

  // Load PNMs and User Profile from Supabase
  useEffect(() => {
    if (checkingAuth) return;

    async function fetchPnmsAndRole() {
      try {
        // 1. Fetch current user role & profile details
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, first_name, last_name")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile) {
            const role = profile.role?.toLowerCase() || "";
            setIsRushChair(role === "rush chair" || role === "regent" || role === "vice regent" || role === "vr" || role === "admin");
            setIsRegent(role === "regent" || role === "vice regent" || role === "vr" || role === "admin");
            setHasViewFeedbackPrivilege(
              role === "regent" ||
              role === "vice regent" ||
              role === "vr" ||
              role === "rush chair" ||
              role === "admin"
            );

            const first = profile.first_name || "";
            const last = profile.last_name || "";
            setUserFullName(`${first} ${last}`.trim() || "User");
            setUserFirstName(first || "Brother");
            setUserRole(profile.role || "Member");
          }
        }

        // 2. Fetch PNM list
        const { data, error } = await supabase
          .from("pnms")
          .select("*")
          .order("full_name", { ascending: true });

        if (error) throw error;
        setPnms(data || []);
      } catch (err) {
        console.error("Error loading data:", err);
        toast.error("Failed to load dashboard data.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPnmsAndRole();
  }, [checkingAuth]);

  // Load initial voting ops state and subscribe to real-time updates
  useEffect(() => {
    if (checkingAuth) return;

    async function fetchInitialOps() {
      try {
        const { data, error } = await supabase
          .from("voting-ops")
          .select("voting_round, is_live, pnm_order, app_com_live")
          .eq("id", 1)
          .maybeSingle();

        if (error) throw error;
        if (data) {
          setVotingRound(data.voting_round);
          setIsLive(data.is_live);
          setPnmOrder(data.pnm_order);
          setAppComLive(!!data.app_com_live);
          setSelectedRegentRound(data.voting_round);
        }
      } catch (err) {
        console.error("Error loading voting ops:", err);
      }
    }
    fetchInitialOps();

    const channel = supabase
      .channel("voting-ops-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "voting-ops" },
        (payload) => {
          const newOps = payload.new as { voting_round: number; is_live: boolean; pnm_order: string[] | null; app_com_live: boolean };
          if (newOps) {
            setVotingRound(newOps.voting_round);
            setIsLive(newOps.is_live);
            setPnmOrder(newOps.pnm_order);
            setAppComLive(!!newOps.app_com_live);
            setSelectedRegentRound(newOps.voting_round);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkingAuth]);

  // Fetch current user's votes from database whenever active round or userId changes
  useEffect(() => {
    if (!userId || !votingRound) return;

    async function fetchUserVotes() {
      try {
        const { data, error } = await supabase
          .from("member_votes")
          .select("student_id, vote_choice")
          .eq("user_id", userId)
          .eq("round_num", votingRound);

        if (error) throw error;

        const votesMap: Record<string, VoteType> = {};
        if (data) {
          data.forEach((v) => {
            votesMap[v.student_id] = v.vote_choice as VoteType;
          });
        }
        setVotes(votesMap);
      } catch (err) {
        console.error("Error fetching user votes:", err);
      }
    }

    fetchUserVotes();
  }, [userId, votingRound]);

  // Fetch and subscribe to round counts for the active round (officers only)
  useEffect(() => {
    if (!hasViewFeedbackPrivilege || !votingRound) {
      setRoundCounts({});
      return;
    }

    async function fetchRoundCounts() {
      try {
        const { data, error } = await supabase
          .from(`voting-r${votingRound}`)
          .select("id, positive, negative, abstain");

        if (error) throw error;

        const countsMap: Record<string, { positive: number; abstain: number; negative: number }> = {};
        if (data) {
          data.forEach((row) => {
            countsMap[row.id] = {
              positive: row.positive || 0,
              abstain: row.abstain || 0,
              negative: row.negative || 0,
            };
          });
        }
        setRoundCounts(countsMap);
      } catch (err) {
        console.error("Error fetching round counts:", err);
      }
    }

    fetchRoundCounts();

    const channel = supabase
      .channel(`voting-r${votingRound}-realtime`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: `voting-r${votingRound}` },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRow = payload.old as { id: string };
            if (oldRow) {
              setRoundCounts((prev) => {
                const next = { ...prev };
                delete next[oldRow.id];
                return next;
              });
            }
          } else {
            const newRow = payload.new as { id: string; positive: number; negative: number; abstain: number };
            if (newRow) {
              setRoundCounts((prev) => ({
                ...prev,
                [newRow.id]: {
                  positive: newRow.positive || 0,
                  abstain: newRow.abstain || 0,
                  negative: newRow.negative || 0,
                },
              }));
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [hasViewFeedbackPrivilege, votingRound]);

  // Filtered and Sorted PNMs list
  const filteredPnms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = pnms;

    if (query) {
      list = pnms.filter(
        (pnm) =>
          pnm.full_name.toLowerCase().includes(query) ||
          pnm.student_id.includes(query) ||
          pnm.email.toLowerCase().includes(query)
      );
    }

    // Sort by pnmOrder if defined
    if (pnmOrder && pnmOrder.length > 0) {
      const orderMap = new Map<string, number>();
      pnmOrder.forEach((id, index) => {
        orderMap.set(id, index);
      });

      return [...list].sort((a, b) => {
        const indexA = orderMap.has(a.student_id) ? orderMap.get(a.student_id)! : 999999;
        const indexB = orderMap.has(b.student_id) ? orderMap.get(b.student_id)! : 999999;
        if (indexA !== indexB) {
          return indexA - indexB;
        }
        return a.full_name.localeCompare(b.full_name);
      });
    }

    return [...list].sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [pnms, searchQuery, pnmOrder]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = pnms.length;
    const votesCount = Object.keys(votes).filter((key) => votes[key] !== null).length;
    return {
      total,
      votesCount,
    };
  }, [pnms, votes]);

  const handleSelectRound = async (round: number) => {
    try {
      const { error } = await supabase
        .from("voting-ops")
        .update({ voting_round: round, is_live: false }) // Changing round closes voting
        .eq("id", 1);
      if (error) throw error;
      setSelectedRegentRound(round);
      toast.success(`Switched to Round ${round} (Voting closed)`);
    } catch (err) {
      console.error("Error setting round:", err);
      toast.error("Failed to update round.");
    }
  };

  const handleGoLive = async () => {
    try {
      const { error } = await supabase.rpc("go_live", { p_round: selectedRegentRound });
      if (error) throw error;
      toast.success(`Round ${selectedRegentRound} is now LIVE!`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Error going live:", err);
      toast.error("Failed to start live voting round.");
    }
  };

  const handleCloseVoting = async () => {
    try {
      const { error } = await supabase
        .from("voting-ops")
        .update({ is_live: false })
        .eq("id", 1);
      if (error) throw error;
      toast.success("Voting closed.");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Error closing voting:", err);
      toast.error("Failed to close voting.");
    }
  };

  const handleToggleAppComLive = async () => {
    try {
      const { error } = await supabase
        .from("voting-ops")
        .update({ app_com_live: !appComLive })
        .eq("id", 1);
      if (error) throw error;
      toast.success(`Application comments are now ${!appComLive ? "enabled" : "disabled"} for Committee.`);
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (err) {
      console.error("Error toggling application comments status:", err);
      toast.error("Failed to toggle application comments status.");
    }
  };

  const handleVote = async (studentId: string, type: VoteType) => {
    if (!userId) {
      toast.error("User session not found.");
      return;
    }

    try {
      // 1. Quick check on database to see if round is still live
      const { data: ops, error: opsError } = await supabase
        .from("voting-ops")
        .select("is_live, voting_round")
        .eq("id", 1)
        .maybeSingle();

      if (opsError) throw opsError;

      if (!ops || !ops.is_live || ops.voting_round !== votingRound) {
        toast.error("Voting is no longer live!");
        setTimeout(() => {
          window.location.reload();
        }, 1000);
        return;
      }

      const currentVote = votes[studentId] || null;
      const targetVote = currentVote === type ? null : type;

      const { error } = await supabase.rpc("cast_vote", {
        p_student_id: studentId,
        p_user_id: userId,
        p_round_num: votingRound,
        p_vote_choice: targetVote,
      });

      if (error) throw error;

      // Update local state
      const updatedVotes = { ...votes, [studentId]: targetVote };
      setVotes(updatedVotes);

      if (targetVote === null) {
        toast.info("Vote cleared");
      } else {
        toast.success(`Vote set to ${targetVote.toUpperCase()}`);
      }
    } catch (err) {
      console.error("Error casting vote:", err);
      toast.error("Failed to cast vote.");
    }
  };

  // Details Modal Handlers
  const handleOpenDetails = (pnm: PNM) => {
    setSelectedPnmForDetails(pnm);
    setIsEditing(false);
    setIsViewingFeedback(false);
    fetchFeedbackList(pnm.student_id);
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
    if (!selectedPnmForDetails) return;
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

      // Reload feedback list
      fetchFeedbackList(selectedPnmForDetails.student_id);
    } catch (err) {
      console.error("Error submitting feedback:", err);
      toast.error("Failed to submit feedback.");
    }
  };

  const handleCloseDetails = () => {
    setSelectedPnmForDetails(null);
    setIsEditing(false);
    setIsViewingFeedback(false);
  };

  const startEditing = () => {
    if (selectedPnmForDetails) {
      setEditedValues({ ...selectedPnmForDetails });
      setIsEditing(true);
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedPnmForDetails) return;

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
        };

      const { error } = await supabase
        .from("pnms")
        .update(updatePayload)
        .eq("student_id", selectedPnmForDetails.student_id);

      if (error) throw error;

      // Update local state arrays to reflect changes
      const updatedPnm = { ...selectedPnmForDetails, ...editedValues } as PNM;
      setPnms(pnms.map((p) => (p.student_id === selectedPnmForDetails.student_id ? updatedPnm : p)));
      setSelectedPnmForDetails(updatedPnm);
      setIsEditing(false);
      toast.success("PNM details saved successfully!");
    } catch (err) {
      console.error("Error saving changes:", err);
      toast.error("Failed to save changes. Please check permissions.");
    }
  };

  const isRushCommitteeOnly = userRole.toLowerCase() === "rush committee" && !isRushChair;
  const canEdit = isRushChair || (userRole.toLowerCase() === "rush committee" && appComLive);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans p-6 text-gray-900">
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-100/90 backdrop-blur-sm p-6 rounded-xl border border-zinc-200/50 shadow-sm">
        <div>
          <h1 className="text-4xl font-mono font-bold underline decoration-red-400">
            Xi Rush Deliberation & Voting
          </h1>
          <p className="text-zinc-600 mt-1">
            Review PNM attendance, profiles, and cast your votes.
          </p>
        </div>
        <Link
          href="/"
          className="bg-zinc-200 text-zinc-850 border border-zinc-300/80 px-4 py-2 rounded-md hover:bg-zinc-300 transition-all duration-300 font-medium"
        >
          Back to Dashboard
        </Link>
      </header>

      {/* Stats Cards Section */}
      <section className="max-w-7xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Block: Voting Round / Regent Control */}
        {isRushChair ? (
          <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
            <div className="flex justify-between items-center mb-1">
              <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">Voting Control</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${isLive ? "bg-green-100 text-green-800 border border-green-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                {isLive ? `R${votingRound} LIVE` : `R${votingRound} CLOSED`}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              <div className="flex gap-2 items-center w-full">
                <span className="text-xs font-medium text-zinc-500">Round:</span>
                {[1, 2, 3, 4].map((r) => (
                  <button
                    key={r}
                    onClick={() => handleSelectRound(r)}
                    className={`w-8 h-8 rounded text-sm font-semibold transition-all ${selectedRegentRound === r
                      ? "bg-red-700 text-white shadow-sm font-bold scale-105"
                      : "bg-zinc-100 border border-zinc-300 text-zinc-700 hover:bg-zinc-200"
                      }`}
                  >
                    {r}
                  </button>
                ))}
                <button
                  onClick={handleToggleAppComLive}
                  className={`ml-auto px-2 py-1 rounded text-[10px] font-bold uppercase transition-all shadow-xs ${appComLive
                    ? "bg-purple-700 hover:bg-purple-800 text-white"
                    : "bg-zinc-100 border border-zinc-300 text-zinc-650 hover:bg-zinc-200"
                    }`}
                >
                  App Com: {appComLive ? "LIVE" : "OFF"}
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGoLive}
                  disabled={isLive && votingRound === selectedRegentRound}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold text-white transition-all ${isLive && votingRound === selectedRegentRound
                    ? "bg-green-400 cursor-not-allowed opacity-50"
                    : "bg-green-700 hover:bg-green-800 shadow-sm"
                    }`}
                >
                  Go Live
                </button>
                <button
                  onClick={handleCloseVoting}
                  disabled={!isLive}
                  className={`flex-1 py-1.5 px-3 rounded text-xs font-bold text-white transition-all ${!isLive
                    ? "bg-zinc-300 cursor-not-allowed text-zinc-500"
                    : "bg-zinc-700 hover:bg-zinc-800 shadow-sm"
                    }`}
                >
                  Close Voting
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
            <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">Voting Round</span>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-3xl font-bold font-mono text-zinc-800">Round {votingRound}</span>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded ${isLive ? "bg-green-100 text-green-800 border border-green-200" : "bg-zinc-100 text-zinc-600 border border-zinc-200"}`}>
                {isLive ? "LIVE" : "CLOSED"}
              </span>
            </div>
          </div>
        )}

        {/* Middle Block: Total PNMs Registered */}
        <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
          <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">Total PNMs Registered</span>
          <span className="text-3xl font-bold font-mono text-zinc-800 mt-2">{stats.total}</span>
        </div>

        {/* Right Block: My Votes Cast */}
        <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
          <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">My Votes Cast</span>
          <span className="text-3xl font-bold font-mono text-zinc-800 mt-2">
            {stats.votesCount} <span className="text-lg text-zinc-400">/ {stats.total}</span>
          </span>
        </div>
      </section>

      {/* Closed Voting Banner */}
      {!isLive && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-zinc-200 border border-zinc-300 text-zinc-700 rounded-lg text-center font-semibold text-sm shadow-sm flex items-center justify-center gap-2">
          Voting is currently closed. Cast votes are locked.
        </div>
      )}

      {/* User Info & Search Input Row */}
      <section className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-100/90 backdrop-blur-sm p-4 rounded-xl border border-zinc-200/50 shadow-sm text-zinc-900">
        {/* Left Side: Greeting & Role */}
        <div className="text-zinc-800 font-medium text-lg px-2">
          Hi, <span className="font-bold text-red-700">{userFirstName}</span>! Your role is <span className="font-bold underline decoration-zinc-400 capitalize">{userRole}</span>.
        </div>

        {/* Right Side: Search bar (1/3 width) */}
        <div className="w-full md:w-1/3 relative">
          <input
            type="text"
            placeholder="Search PNM by name, email, or Student ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 bg-white border border-zinc-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-700 text-zinc-800 placeholder-zinc-400 shadow-sm text-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 text-xs font-semibold"
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {/* PNM Grid List */}
      <main className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-12 w-12 border-4 border-red-700 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-600 font-medium">Loading PNM database...</p>
          </div>
        ) : filteredPnms.length === 0 ? (
          <div className="text-center py-20 bg-white border border-zinc-200 rounded-lg shadow-sm">
            <p className="text-zinc-500 text-lg font-medium">No PNMs found matching your search.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPnms.map((pnm) => {
              const vote = votes[pnm.student_id] || null;

              return (
                <div
                  key={pnm.student_id}
                  className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden flex hover:shadow-md transition-shadow duration-300 h-44"
                >
                  {/* Left Side: Large Photo covering full left aspect */}
                  <div className="relative w-1/3 bg-zinc-200 flex-shrink-0 flex items-center justify-center border-r border-zinc-200">
                    {pnm.headshot_url ? (
                      <img
                        src={pnm.headshot_url}
                        alt={`${pnm.full_name} Headshot`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        className="w-12 h-12 text-zinc-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Right Side: Details, 6 Dots, details button, ballot buttons */}
                  <div className="w-2/3 p-4 flex flex-col justify-between min-w-0">
                    <div>
                      <h3 className="font-bold text-lg text-zinc-900 truncate leading-tight" title={pnm.full_name}>
                        {pnm.full_name}
                      </h3>
                      <p className="text-zinc-500 text-xs font-mono truncate mb-2" title={pnm.email}>
                        {pnm.email}
                      </p>

                      {/* 6 Attendance Dots */}
                      <div className="flex items-center gap-2 my-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider select-none leading-none">
                          Attendance:
                        </span>
                        <div className="flex gap-1">
                          {[pnm.event_1, pnm.event_2, pnm.event_3, pnm.event_4, pnm.event_5, pnm.event_6].map((attended, i) => (
                            <span
                              key={i}
                              className={`w-3.5 h-3.5 rounded-full border shadow-sm ${attended
                                ? "bg-green-500 border-green-600"
                                : "bg-red-500 border-red-600"
                                }`}
                              title={`${EVENT_HEADERS[i]}: ${attended ? "Attended" : "Absent"}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Vote Counts (Officers only) */}
                      {hasViewFeedbackPrivilege && (
                        <div className="flex gap-8 text-[18px] font-bold mt-2.5 font-mono select-none leading-none">
                          <span className="text-green-700">Y: {roundCounts[pnm.student_id]?.positive ?? 0}</span>
                          <span className="text-zinc-500">A: {roundCounts[pnm.student_id]?.abstain ?? 0}</span>
                          <span className="text-red-700">N: {roundCounts[pnm.student_id]?.negative ?? 0}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions and Ballot */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
                      <button
                        onClick={() => handleOpenDetails(pnm)}
                        className="px-3 py-1 bg-zinc-100 border border-zinc-300 rounded text-xs font-semibold text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950 transition-colors"
                      >
                        Details
                      </button>

                      {/* Ballot action icons */}
                      <div className="flex gap-2">
                        {/* Yes (Green check) */}
                        <button
                          onClick={() => handleVote(pnm.student_id, "yes")}
                          disabled={!isLive}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                            } ${vote === "yes"
                              ? "bg-green-600 text-white shadow-md scale-105"
                              : "bg-zinc-100 border border-zinc-300 text-green-700 hover:bg-green-50"
                            }`}
                          title={isLive ? "Vote Yes" : "Voting is closed"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>

                        {/* Abstain (Grey circle slash) */}
                        <button
                          onClick={() => handleVote(pnm.student_id, "abstain")}
                          disabled={!isLive}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                            } ${vote === "abstain"
                              ? "bg-zinc-500 text-white shadow-md scale-105"
                              : "bg-zinc-100 border border-zinc-300 text-zinc-600 hover:bg-zinc-200"
                            }`}
                          title={isLive ? "Vote Abstain" : "Voting is closed"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                            <circle cx="12" cy="12" r="10" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93l14.14 14.14" />
                          </svg>
                        </button>

                        {/* No (Red X) */}
                        <button
                          onClick={() => handleVote(pnm.student_id, "no")}
                          disabled={!isLive}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                            } ${vote === "no"
                              ? "bg-red-600 text-white shadow-md scale-105"
                              : "bg-zinc-100 border border-zinc-300 text-red-700 hover:bg-red-50"
                            }`}
                          title={isLive ? "Vote No" : "Voting is closed"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Details Modal */}
      {selectedPnmForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="flex gap-4 max-w-7xl w-full h-[90vh] items-stretch justify-center">
            {/* Left Section: Details Card */}
            <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 flex-1 flex flex-col overflow-hidden">

              {/* Modal Header */}
              <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-mono font-bold tracking-wide">PNM DETAILS & DELIBERATION</h2>
                <button
                  onClick={handleCloseDetails}
                  className="text-zinc-400 hover:text-white font-bold text-2xl transition-colors leading-none"
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

                  {/* Photo */}
                  <div className="relative aspect-[3/4] w-full bg-zinc-100 rounded-lg border border-zinc-300 overflow-hidden flex items-center justify-center">
                    {selectedPnmForDetails.headshot_url ? (
                      <img
                        src={selectedPnmForDetails.headshot_url}
                        alt={`${selectedPnmForDetails.full_name} Headshot`}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg
                        className="w-16 h-16 text-zinc-300"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    )}
                  </div>

                  {/* 6 Attendance Dots underneath headshot */}
                  <div className="flex justify-center gap-2 py-2 border-y border-zinc-200">
                    {[
                      selectedPnmForDetails.event_1,
                      selectedPnmForDetails.event_2,
                      selectedPnmForDetails.event_3,
                      selectedPnmForDetails.event_4,
                      selectedPnmForDetails.event_5,
                      selectedPnmForDetails.event_6,
                    ].map((attended, i) => (
                      <span
                        key={i}
                        className={`w-4 h-4 rounded-full border shadow-sm ${attended ? "bg-green-500 border-green-600" : "bg-red-500 border-red-600"
                          }`}
                        title={EVENT_HEADERS[i]}
                      />
                    ))}
                  </div>

                  {/* Major, Year, Absence */}
                  <div className="mt-2 bg-zinc-50 p-3 rounded-lg border border-zinc-200 flex flex-col gap-3">
                    <div>
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Major / Year</span>
                      {isEditing && !isRushCommitteeOnly ? (
                        <div className="flex flex-col gap-1.5">
                          <input
                            type="text"
                            value={editedValues.major || ""}
                            onChange={(e) => setEditedValues({ ...editedValues, major: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                            placeholder="Computer Engineering"
                          />
                          <select
                            value={editedValues.year || "Freshman"}
                            onChange={(e) => setEditedValues({ ...editedValues, year: e.target.value })}
                            className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                          >
                            <option value="Freshman">Freshman</option>
                            <option value="Sophomore">Sophomore</option>
                            <option value="Junior">Junior</option>
                            <option value="Senior">Senior</option>
                          </select>
                        </div>
                      ) : (
                        <p className="font-semibold text-zinc-800 text-sm">
                          {selectedPnmForDetails.major || "Undeclared"} — {selectedPnmForDetails.year || "N/A"}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Absence Form (#)</span>
                      {isEditing && !isRushCommitteeOnly ? (
                        <input
                          type="number"
                          value={editedValues.absence_form_num ?? 0}
                          onChange={(e) => setEditedValues({ ...editedValues, absence_form_num: parseInt(e.target.value) || 0 })}
                          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                        />
                      ) : (
                        <p className="font-semibold text-zinc-800 text-sm">
                          {selectedPnmForDetails.absence_form_num ?? 0}
                        </p>
                      )}
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Reason for Absence</span>
                      {isEditing && !isRushCommitteeOnly ? (
                        <textarea
                          value={editedValues.absence_reason || ""}
                          onChange={(e) => setEditedValues({ ...editedValues, absence_reason: e.target.value })}
                          className="w-full text-sm border border-zinc-300 rounded px-2 py-1 h-20 bg-white text-zinc-900 focus:outline-none focus:ring-1 focus:ring-red-700"
                          placeholder="Reason details..."
                        />
                      ) : (
                        <p className="text-zinc-700 text-sm italic leading-relaxed whitespace-pre-line">
                          {selectedPnmForDetails.absence_reason || "None specified"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Middle Section: Feedback Form (Top) and Application Comment (Bottom) */}
                <div className="md:col-span-2 border-r border-zinc-200 px-6 flex flex-col justify-between gap-6">

                  {/* Feedback Form: Quantity and Comments */}
                  <div className="flex-1 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-3 border-b border-zinc-100 pb-1 flex-shrink-0">
                      <h4 className="text-lg font-bold text-zinc-800">
                        Feedback Notes
                      </h4>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setIsSubmittingFeedback(true)}
                          className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-semibold shadow-sm transition-all"
                        >
                          Submit Feedback
                        </button>
                        {hasViewFeedbackPrivilege && (
                          <button
                            onClick={() => setIsViewingFeedback(!isViewingFeedback)}
                            className={`px-2.5 py-1 text-white rounded text-xs font-semibold shadow-sm transition-all ${isViewingFeedback ? "bg-zinc-800 hover:bg-zinc-900" : "bg-zinc-700 hover:bg-zinc-800"
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
                        {feedbackList.filter(fb => fb.feedback_type === "Positive" && fb.is_approved === 1).map(fb => (
                          <div key={fb.id} className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-green-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs">
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
                        {feedbackList.filter(fb => fb.feedback_type === "Negative" && fb.is_approved === 1).map(fb => (
                          <div key={fb.id} className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-red-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs">
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
                        {feedbackList.filter(fb => fb.feedback_type === "Other" && fb.is_approved === 1).map(fb => (
                          <div key={fb.id} className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-zinc-400 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs">
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
                        {feedbackList.filter(fb => fb.feedback_type === "Veto" && fb.is_approved === 1).map(fb => (
                          <div key={fb.id} className="text-xs text-zinc-600 bg-zinc-50 border-l-2 border-purple-500 pl-2 py-1.5 mt-1 rounded-r leading-relaxed whitespace-pre-line shadow-xs">
                            {fb.comment}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Application Comment (Bottom) */}
                  <div className="border-t border-zinc-200 pt-4">
                    <h4 className="text-lg font-bold text-zinc-800 mb-2">
                      Application Comment: <span className="text-sm text-zinc-400 font-normal">(Best 3 Things)</span>
                    </h4>
                    {isEditing ? (
                      <textarea
                        value={editedValues.application_comments || ""}
                        onChange={(e) => setEditedValues({ ...editedValues, application_comments: e.target.value })}
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
                  <h4 className="text-lg font-bold text-zinc-800 border-b border-zinc-100 pb-1">
                    Interview Notes:
                  </h4>

                  <div>
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Names of Interviewers</span>
                    {isEditing && !isRushCommitteeOnly ? (
                      <input
                        type="text"
                        value={editedValues.interviewer_names || ""}
                        onChange={(e) => setEditedValues({ ...editedValues, interviewer_names: e.target.value })}
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
                    <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block mb-1">Comments</span>
                    <div className="flex-1 overflow-y-auto pr-1">
                      {isEditing && !isRushCommitteeOnly ? (
                        <textarea
                          value={editedValues.interview_notes || ""}
                          onChange={(e) => setEditedValues({ ...editedValues, interview_notes: e.target.value })}
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

              {/* Modal Footer Controls */}
              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center flex-shrink-0">
                <div>
                  {canEdit && (
                    <>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={handleSaveChanges}
                            className="bg-green-700 text-white px-5 py-2 rounded font-semibold hover:bg-green-800 transition-colors shadow-sm"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={startEditing}
                          className="bg-red-700 text-white px-5 py-2 rounded font-semibold hover:bg-red-800 transition-colors shadow-sm"
                        >
                          Edit
                        </button>
                      )}
                    </>
                  )}
                </div>
                <button
                  onClick={handleCloseDetails}
                  className="bg-zinc-300 text-zinc-700 px-4 py-2 rounded font-semibold hover:bg-zinc-400 transition-colors"
                >
                  Close
                </button>
              </div>

            </div>

            {/* Right Section: View Comments Feed Panel */}
            {isViewingFeedback && (
              <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 w-80 md:w-96 flex flex-col overflow-hidden h-full flex-shrink-0 animate-in slide-in-from-right duration-300 text-zinc-950">
                {/* Header */}
                <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
                  <h3 className="text-md font-mono font-bold tracking-wide">FEEDBACK FEED</h3>
                  <button
                    onClick={() => setIsViewingFeedback(false)}
                    className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none"
                  >
                    &times;
                  </button>
                </div>
                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
                  {feedbackList.length === 0 ? (
                    <div className="text-center py-10 text-zinc-400 font-medium">
                      No feedback submitted yet.
                    </div>
                  ) : (
                    feedbackList.map((fb) => (
                      <div key={fb.id} className="border-b border-zinc-100 pb-3 last:border-b-0 flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span className={`px-2 py-0.5 rounded text-xs font-bold text-white uppercase tracking-wider ${fb.feedback_type === "Positive" ? "bg-green-600" :
                            fb.feedback_type === "Negative" ? "bg-red-600" :
                              fb.feedback_type === "Other" ? "bg-zinc-500" :
                                "bg-purple-600"
                            }`}>
                            {fb.feedback_type}
                          </span>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-500 hover:text-green-700 select-none">
                              <input
                                type="checkbox"
                                checked={fb.is_approved === 1}
                                onChange={() => handleToggleApproval(fb.id, fb.is_approved, 1)}
                                className="rounded border-zinc-300 text-green-600 focus:ring-green-500 h-3.5 w-3.5"
                              />
                              <span className={fb.is_approved === 1 ? "text-green-700 font-semibold" : ""}>Approve</span>
                            </label>
                            <label className="flex items-center gap-1 cursor-pointer text-[11px] text-zinc-500 hover:text-red-700 select-none">
                              <input
                                type="checkbox"
                                checked={fb.is_approved === -1}
                                onChange={() => handleToggleApproval(fb.id, fb.is_approved, -1)}
                                className="rounded border-zinc-300 text-red-600 focus:ring-red-500 h-3.5 w-3.5"
                              />
                              <span className={fb.is_approved === -1 ? "text-red-700 font-semibold" : ""}>Decline</span>
                            </label>
                          </div>
                        </div>
                        <span className="text-xs font-semibold text-zinc-400">
                          Submitted by {fb.submitter_name}
                          {fb.quick && <span className="text-red-500 font-bold ml-0.5" title="Quick Feedback">*</span>}
                        </span>
                        <p className="text-sm text-zinc-800 whitespace-pre-line leading-relaxed bg-zinc-50 p-2.5 rounded border border-zinc-100 mt-0.5">
                          {fb.comment}
                        </p>
                      </div>
                    ))
                  )}
                </div>
                {/* Footer */}
                <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-end flex-shrink-0">
                  <button
                    onClick={() => setIsViewingFeedback(false)}
                    className="bg-zinc-300 text-zinc-700 px-4 py-2 rounded text-xs font-bold hover:bg-zinc-400 transition-colors"
                  >
                    Close Feedback
                  </button>
                </div>
              </div>
            )}

            {/* Submit Feedback Modal Overlay */}
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
                      className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="p-6 flex flex-col gap-4">
                    <div>
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">PNM Name</span>
                      <p className="text-lg font-bold text-zinc-900 mt-0.5">{selectedPnmForDetails.full_name}</p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Feedback Type</span>
                      <div className="grid grid-cols-2 gap-2">
                        {(["Positive", "Negative", "Other", "Veto"] as const).map((t) => {
                          const active = newFeedbackType === t;
                          return (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setNewFeedbackType(t)}
                              className={`py-2 px-3 rounded text-sm font-semibold border transition-all ${active
                                ? t === "Positive" ? "bg-green-600 border-green-600 text-white shadow-sm" :
                                  t === "Negative" ? "bg-red-600 border-red-600 text-white shadow-sm" :
                                    t === "Other" ? "bg-zinc-600 border-zinc-600 text-white shadow-sm" :
                                      "bg-purple-600 border-purple-600 text-white shadow-sm"
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
                      className="bg-white border border-zinc-300 text-zinc-700 px-4 py-2 rounded text-xs font-bold hover:bg-zinc-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="bg-red-700 text-white px-5 py-2 rounded text-xs font-bold hover:bg-red-800 transition-colors shadow-sm"
                    >
                      Submit Feedback as {userFullName}
                    </button>
                  </div>
                </form>
              </div>
            )}

          </div>
        </div>
      )}
    </div>
  );
}
