"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
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
  application?: boolean;
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
type CandidateStatus = "pending" | "in_contest" | "approved" | "denied";

export default function VoteDashboard() {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [pnms, setPnms] = useState<PNM[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Role & Operations States
  const [isAdmin, setIsAdmin] = useState(false);
  const [isRushChair, setIsRushChair] = useState(false);
  const [isRushCommittee, setIsRushCommittee] = useState(false);
  const [votingSection, setVotingSection] = useState<number>(1); // 1: Invite Voting, 2: Bid Voting
  const [votingRound, setVotingRound] = useState<number>(1);
  const [selectedRegentSection, setSelectedRegentSection] = useState<number>(1);
  const [selectedRegentRound, setSelectedRegentRound] = useState<number>(1);
  const [userId, setUserId] = useState<string | null>(null);

  // Clean Status Architecture
  const [roundStatus, setRoundStatus] = useState<"idle" | "in_progress" | "completed">("idle");
  const [votingStatus, setVotingStatus] = useState<"closed" | "open" | "closing">("closed");
  const [inviteQuota, setInviteQuota] = useState<number | null>(null);
  const [bidQuota, setBidQuota] = useState<number | null>(null);
  const [voterThreshold, setVoterThreshold] = useState<number>(1);
  const [inviteBidListShown, setInviteBidListShown] = useState(false);
  const [activePnmId, setActivePnmId] = useState<string | null>(null);
  const [pnmOrder, setPnmOrder] = useState<string[] | null>(null);
  const [closingEndsAt, setClosingEndsAt] = useState<string | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);
  const [appCommitteeEnabled, setAppCommitteeEnabled] = useState(false);
  const isClosingRef = useRef(false);

  // Setup Modal States
  const [showSetupModal, setShowSetupModal] = useState(false);
  const [setupModalSection, setSetupModalSection] = useState<1 | 2>(1);
  const [setupModalStep, setSetupModalStep] = useState<1 | 2>(1);
  const [setupQuotaInput, setSetupQuotaInput] = useState("");
  const [setupVoterThresholdInput, setSetupVoterThresholdInput] = useState("50");
  const [isProcessingSetup, setIsProcessingSetup] = useState(false);

  // Approved / Denied & Summary Modals
  const [showApprovedDeniedModal, setShowApprovedDeniedModal] = useState(false);
  const [showInvitesBidsModal, setShowInvitesBidsModal] = useState(false);
  const [modalSection, setModalSection] = useState<number>(1);
  const [modalRound, setModalRound] = useState<number>(1);
  const [modalRoundCounts, setModalRoundCounts] = useState<
    Record<string, { positive: number; abstain: number; negative: number; status: CandidateStatus; is_overridden?: boolean }>
  >({});
  const [isLoadingModalRound, setIsLoadingModalRound] = useState(false);
  const [modalSearchQuery, setModalSearchQuery] = useState("");

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
  const [pendingFeedbackPnmIds, setPendingFeedbackPnmIds] = useState<Set<string>>(new Set());
  const [newFeedbackType, setNewFeedbackType] = useState<"Positive" | "Negative" | "Other" | "Veto">("Positive");
  const [newFeedbackComment, setNewFeedbackComment] = useState("");

  // Database votes state & round statuses
  const [votes, setVotes] = useState<Record<string, VoteType>>({});
  const [roundCounts, setRoundCounts] = useState<
    Record<string, { positive: number; abstain: number; negative: number; status: CandidateStatus; is_overridden?: boolean }>
  >({});
  const [allCandidateStatuses, setAllCandidateStatuses] = useState<Record<string, CandidateStatus>>({});

  // Dynamic Voting Thresholds
  const [thresholdsMap, setThresholdsMap] = useState<
    Record<
      string,
      {
        min_yn_deny: number;
        min_yn_approve: number;
        max_at_approve: number;
        fill_quota_spots: boolean;
        description: string;
      }
    >
  >({});

  // Derived Helpers
  const isPresentationRound = (votingSection === 1 && votingRound === 2) || votingSection === 2;
  const isAbstainAvailable = (votingSection === 1 && votingRound === 1) || (votingSection === 2 && votingRound === 1);
  const roundActive = roundStatus === "in_progress";
  const isVotingOpen = votingStatus === "open";
  const isVotingClosing = votingStatus === "closing";
  const isLive = isVotingOpen || isVotingClosing;
  const appComLive = appCommitteeEnabled;
  const inviteSetupCompleted = inviteQuota !== null && inviteQuota > 0;
  const bidSetupCompleted = bidQuota !== null && bidQuota > 0;
  const inviteTargetCount = inviteQuota;
  const bidTargetCount = bidQuota;

  const normalizedUserRole = userRole.toLowerCase().trim();
  const isStrictAdmin =
    isAdmin ||
    normalizedUserRole === "regent" ||
    normalizedUserRole === "vice regent" ||
    normalizedUserRole === "vr" ||
    normalizedUserRole === "website chair" ||
    normalizedUserRole === "admin";
  const isRegent = isStrictAdmin;
  const isStrictRegent = isStrictAdmin;

  const currentThresholdDescription =
    thresholdsMap[`s${votingSection}-r${votingRound}`]?.description ||
    (votingSection === 1 && votingRound === 1
      ? "Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)"
      : votingSection === 1 && votingRound === 2
        ? "Denied: Y/N < 65% | Approved: Fill remaining invite quota spots with top Y/N% (>= 65%)"
        : votingSection === 2 && votingRound === 1
          ? "Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)"
          : votingSection === 2 && votingRound === 2
            ? "Denied: Y/N < 65% | Approved: Y/N > 80% | In Contest: 65% <= Y/N <= 80%"
            : "Denied: Y/N < 75% | Approved: Fill remaining bid quota spots with top Y/N% (>= 75%)");

  // Current round table name
  const currentTableName = `voting-s${votingSection}-r${votingRound}`;

  // Fetch dynamic voting thresholds
  useEffect(() => {
    async function fetchThresholds() {
      try {
        const { data } = await supabase.from("voting-thresholds").select("*");
        if (data) {
          const map: any = {};
          data.forEach((t) => {
            map[t.id] = t;
          });
          setThresholdsMap(map);
        }
      } catch (err) {
        console.error("Error loading voting thresholds:", err);
      }
    }
    fetchThresholds();
  }, []);

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
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role, first_name, last_name")
            .eq("id", session.user.id)
            .maybeSingle();

          if (profile) {
            const role = (profile.role || "").toLowerCase().trim();
            const isAdminRole =
              role === "regent" ||
              role === "vice regent" ||
              role === "vr" ||
              role === "website chair" ||
              role === "admin";
            const isRushChairRole = role === "rush chair";
            const isRushCommitteeRole = role === "rush committee";

            setIsAdmin(isAdminRole);
            setIsRushChair(isRushChairRole);
            setIsRushCommittee(isRushCommitteeRole);
            setHasViewFeedbackPrivilege(isAdminRole || isRushChairRole);

            const first = profile.first_name || "";
            const last = profile.last_name || "";
            setUserFullName(`${first} ${last}`.trim() || "User");
            setUserFirstName(first || "Brother");
            setUserRole(profile.role || "Member");
          }
        }

        const { data, error } = await supabase
          .from("pnms")
          .select("*")
          .order("full_name", { ascending: true });

        if (error) throw error;
        // Candidates with application === false should not appear in any voting at all
        const eligiblePnms = ((data || []) as PNM[]).filter((p) => p.application !== false);
        setPnms(eligiblePnms);
      } catch (err) {
        console.error("Error loading data:", err);
        toast.error("Failed to load dashboard data.");
      } finally {
        setIsLoading(false);
      }
    }

    fetchPnmsAndRole();
  }, [checkingAuth]);

  // Load and refresh pending feedback IDs (for rush chairs and admin)
  const fetchPendingFeedback = async () => {
    try {
      const { data, error } = await supabase
        .from("pnm_feedback")
        .select("student_id")
        .eq("is_approved", 0);

      if (!error && data) {
        const idSet = new Set<string>(data.map((f: { student_id: string }) => f.student_id));
        setPendingFeedbackPnmIds(idSet);
      }
    } catch (err) {
      console.error("Error loading pending feedback:", err);
    }
  };

  useEffect(() => {
    if (checkingAuth || !hasViewFeedbackPrivilege) return;

    fetchPendingFeedback();

    const channel = supabase
      .channel("pnm-feedback-changes-vote")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pnm_feedback" },
        () => {
          fetchPendingFeedback();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkingAuth, hasViewFeedbackPrivilege]);

  // Load initial voting ops state and subscribe to real-time updates
  useEffect(() => {
    if (checkingAuth) return;

    async function fetchInitialOps() {
      try {
        const { data, error } = await supabase
          .from("voting-ops")
          .select("*")
          .eq("id", 1)
          .maybeSingle();

        if (error) {
          console.error("Error loading voting ops:", error.message || error.details || error);
          return;
        }
        if (data) {
          const sec = data.section || 1;
          const rnd = data.round || 1;
          setVotingSection(sec);
          setVotingRound(rnd);
          setSelectedRegentSection(sec);
          setSelectedRegentRound(rnd);
          setInviteQuota(data.invite_quota ?? null);
          setBidQuota(data.bid_quota ?? null);
          setVoterThreshold(data.voter_threshold && data.voter_threshold > 0 ? data.voter_threshold : 1);
          setInviteBidListShown(Boolean(data.invite_bid_list_shown));
          setRoundStatus((data.round_status || "idle") as "idle" | "in_progress" | "completed");
          setVotingStatus((data.voting_status || "closed") as "closed" | "open" | "closing");
          setActivePnmId(data.active_pnm_id ?? null);
          setPnmOrder(data.pnm_order ?? null);
          setClosingEndsAt(data.closing_ends_at ?? null);
          setAppCommitteeEnabled(!!data.app_committee_enabled);
        }
      } catch (err: any) {
        console.error("Error loading voting ops:", err?.message || err?.details || err);
      }
    }
    fetchInitialOps();

    const channel = supabase
      .channel("voting-ops-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "voting-ops" },
        (payload) => {
          const newOps = payload.new as {
            section?: number;
            round?: number;
            invite_quota?: number | null;
            bid_quota?: number | null;
            voter_threshold?: number | null;
            invite_bid_list_shown?: boolean;
            round_status?: "idle" | "in_progress" | "completed";
            voting_status?: "closed" | "open" | "closing";
            active_pnm_id?: string | null;
            pnm_order?: string[] | null;
            closing_ends_at?: string | null;
            app_committee_enabled?: boolean;
          };
          if (newOps) {
            if (newOps.section !== undefined) {
              setVotingSection(newOps.section);
              setSelectedRegentSection(newOps.section);
            }
            if (newOps.round !== undefined) {
              setVotingRound(newOps.round);
              setSelectedRegentRound(newOps.round);
            }
            if (newOps.invite_quota !== undefined) setInviteQuota(newOps.invite_quota);
            if (newOps.bid_quota !== undefined) setBidQuota(newOps.bid_quota);
            if (newOps.voter_threshold !== undefined && newOps.voter_threshold !== null) {
              setVoterThreshold(newOps.voter_threshold > 0 ? newOps.voter_threshold : 1);
            }
            if (newOps.invite_bid_list_shown !== undefined) {
              setInviteBidListShown(!!newOps.invite_bid_list_shown);
            }
            if (newOps.round_status !== undefined) setRoundStatus(newOps.round_status);
            if (newOps.voting_status !== undefined) setVotingStatus(newOps.voting_status);
            if (newOps.active_pnm_id !== undefined) setActivePnmId(newOps.active_pnm_id);
            if (newOps.pnm_order !== undefined) setPnmOrder(newOps.pnm_order);
            if (newOps.closing_ends_at !== undefined) setClosingEndsAt(newOps.closing_ends_at);
            if (newOps.app_committee_enabled !== undefined) setAppCommitteeEnabled(!!newOps.app_committee_enabled);
          }
        }
      )
      .subscribe();

    const pollOpsInterval = setInterval(() => {
      fetchInitialOps();
    }, 1200);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollOpsInterval);
    };
  }, [checkingAuth]);

  // Fetch current user's votes from database whenever active section, round, or userId changes
  useEffect(() => {
    if (!userId || !votingSection || !votingRound) return;

    async function fetchUserVotes() {
      try {
        const { data, error } = await supabase
          .from("member_votes")
          .select("student_id, vote_choice")
          .eq("user_id", userId)
          .eq("section_num", votingSection)
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
  }, [userId, votingSection, votingRound]);

  // Fetch and subscribe to round counts and candidate statuses for the active round
  const fetchRoundCounts = useCallback(async () => {
    if (!votingSection || !votingRound) {
      setRoundCounts({});
      return;
    }

    try {
      let { data, error } = await supabase
        .from(currentTableName)
        .select("id, positive, negative, abstain, status, is_overridden");

      if (error && error.message?.includes("is_overridden")) {
        const fallback = await supabase
          .from(currentTableName)
          .select("id, positive, negative, abstain, status");
        data = fallback.data as any;
        error = fallback.error;
      }

      if (error) {
        console.warn(`Could not load ${currentTableName}:`, error.message);
        return;
      }

      const countsMap: Record<
        string,
        { positive: number; abstain: number; negative: number; status: CandidateStatus; is_overridden?: boolean }
      > = {};

      if (data) {
        data.forEach((row: any) => {
          const st = (row.status || "in_contest") as CandidateStatus;
          countsMap[row.id] = {
            positive: row.positive || 0,
            abstain: row.abstain || 0,
            negative: row.negative || 0,
            status: st,
            is_overridden: Boolean(row.is_overridden),
          };
        });
      }
      setRoundCounts(countsMap);

      // Fetch section-wide candidate statuses for Approved/Denied list
      const sectionTables =
        votingSection === 1
          ? ["voting-s1-r1", "voting-s1-r2"]
          : ["voting-s2-r1", "voting-s2-r2", "voting-s2-r3"];

      const sectionStatusMap: Record<string, CandidateStatus> = {};
      for (const tbl of sectionTables) {
        const { data: tblData } = await supabase.from(tbl).select("id, status");
        if (tblData) {
          tblData.forEach((r) => {
            if (r.status === "approved" || r.status === "denied") {
              sectionStatusMap[r.id] = r.status as CandidateStatus;
            } else if (!sectionStatusMap[r.id]) {
              sectionStatusMap[r.id] = (r.status || "in_contest") as CandidateStatus;
            }
          });
        }
      }
      setAllCandidateStatuses(sectionStatusMap);
    } catch (err) {
      console.error("Error fetching round counts:", err);
    }
  }, [votingSection, votingRound, currentTableName]);

  // Fetch candidate counts for any selected round in the "Show Approved / Denied" modal
  const fetchModalRoundCounts = useCallback(async (sec: number, rnd: number) => {
    if (sec === votingSection && rnd === votingRound) {
      setModalRoundCounts(roundCounts);
      return;
    }
    setIsLoadingModalRound(true);
    try {
      const tbl = `voting-s${sec}-r${rnd}`;
      let { data, error } = await supabase
        .from(tbl)
        .select("id, positive, negative, abstain, status, is_overridden");

      if (error && error.message?.includes("is_overridden")) {
        const fallback = await supabase
          .from(tbl)
          .select("id, positive, negative, abstain, status");
        data = fallback.data as any;
        error = fallback.error;
      }

      if (error) {
        console.warn(`Could not load ${tbl}:`, error.message);
        return;
      }

      const countsMap: Record<
        string,
        { positive: number; abstain: number; negative: number; status: CandidateStatus; is_overridden?: boolean }
      > = {};

      if (data) {
        data.forEach((row: any) => {
          const st = (row.status || "in_contest") as CandidateStatus;
          countsMap[row.id] = {
            positive: row.positive || 0,
            abstain: row.abstain || 0,
            negative: row.negative || 0,
            status: st,
            is_overridden: Boolean(row.is_overridden),
          };
        });
      }
      setModalRoundCounts(countsMap);
    } catch (err) {
      console.error("Error fetching modal round counts:", err);
    } finally {
      setIsLoadingModalRound(false);
    }
  }, [votingSection, votingRound, roundCounts]);

  const handleOpenApprovedDeniedModal = () => {
    setModalSection(votingSection);
    setModalRound(votingRound);
    setModalSearchQuery("");
    setModalRoundCounts(roundCounts);
    setShowApprovedDeniedModal(true);
  };

  const handleSelectModalRound = (sec: number, rnd: number) => {
    setModalSection(sec);
    setModalRound(rnd);
    fetchModalRoundCounts(sec, rnd);
  };

  // Regent & Vice Regent Manual Force Status (Overrides automated thresholds)
  const handleForceStatus = async (
    studentId: string,
    newStatus: CandidateStatus,
    targetSec = modalSection,
    targetRnd = modalRound
  ) => {
    if (!isStrictAdmin) {
      toast.error("Only Admins (Regent, Vice Regent, Website Chair) can force candidate statuses.");
      return;
    }

    const pnmObj = pnms.find((p) => p.student_id === studentId);
    const candidateName = pnmObj ? pnmObj.full_name : studentId;
    const targetTable = `voting-s${targetSec}-r${targetRnd}`;

    // Optimistic local state updates for instant zero-latency UI response
    const updateRecord = (prev: Record<string, any>) => ({
      ...prev,
      [studentId]: {
        ...(prev[studentId] || { positive: 0, abstain: 0, negative: 0 }),
        status: newStatus,
        is_overridden: true,
      },
    });

    setModalRoundCounts(updateRecord);
    if (targetSec === votingSection && targetRnd === votingRound) {
      setRoundCounts(updateRecord);
    }
    setAllCandidateStatuses((prev) => ({
      ...prev,
      [studentId]: newStatus,
    }));

    try {
      // 1. Try dedicated stored procedure
      const { error: rpcErr } = await supabase.rpc("override_candidate_status", {
        p_section: targetSec,
        p_round: targetRnd,
        p_student_id: studentId,
        p_status: newStatus,
      });

      if (rpcErr) {
        // Fallback: Direct table update
        let { error: updateErr } = await supabase
          .from(targetTable)
          .update({
            status: newStatus,
            is_overridden: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", studentId);

        if (updateErr && updateErr.message?.includes("is_overridden")) {
          const fallbackRes = await supabase
            .from(targetTable)
            .update({
              status: newStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", studentId);
          updateErr = fallbackRes.error;
        }

        if (updateErr) throw updateErr;

        // If candidate moved to in_contest in S1 R1, ensure row exists in S1 R2
        if (targetSec === 1 && targetRnd === 1 && newStatus === "in_contest") {
          await supabase
            .from("voting-s1-r2")
            .insert({
              id: studentId,
              positive: 0,
              negative: 0,
              abstain: 0,
              status: "in_contest",
              is_overridden: false,
            })
            .select("id");
        }
      }

      const statusLabel =
        newStatus === "approved"
          ? "Approved"
          : newStatus === "denied"
            ? "Denied"
            : "In Contest";

      toast.success(`${candidateName} forced to ${statusLabel}!`);

      if (targetSec === votingSection && targetRnd === votingRound) {
        fetchRoundCounts();
      }
    } catch (err: any) {
      console.error("Error updating candidate status:", err);
      toast.error(err?.message || "Failed to update candidate status.");
      if (targetSec === votingSection && targetRnd === votingRound) {
        fetchRoundCounts();
      } else {
        fetchModalRoundCounts(targetSec, targetRnd);
      }
    }
  };

  useEffect(() => {
    if (!votingSection || !votingRound) return;

    fetchRoundCounts();

    const channelName = `${currentTableName}-realtime-${Date.now()}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: currentTableName },
        () => {
          fetchRoundCounts();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "member_votes" },
        () => {
          fetchRoundCounts();
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      fetchRoundCounts();
    }, 1500);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(pollInterval);
    };
  }, [votingSection, votingRound, currentTableName, fetchRoundCounts]);

  // Filtered and Sorted PNMs list
  // Note: For presentation rounds (S1 R2, S2 R1, S2 R2, S2 R3), only candidates who are "in contest"
  // Filtered and Sorted PNMs list
  // For any round after S1 R1, only candidates who advanced to this round appear for voting.
  const filteredPnms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    let list = pnms.filter((p) => p.application !== false);

    if (votingSection > 1 || votingRound > 1) {
      list = list.filter((p) => Boolean(roundCounts[p.student_id]));
    }

    if (query === "*" || query.startsWith("*")) {
      const rest = query.replace(/^\*/, "").trim();
      list = list.filter((p) => {
        if (hasViewFeedbackPrivilege && !pendingFeedbackPnmIds.has(p.student_id)) {
          return false;
        }
        if (!rest) return true;
        return (
          p.full_name.toLowerCase().includes(rest) ||
          p.student_id.includes(rest) ||
          p.email.toLowerCase().includes(rest)
        );
      });
    } else if (query) {
      list = list.filter(
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
  }, [pnms, searchQuery, pnmOrder, votingSection, votingRound, roundCounts, pendingFeedbackPnmIds, hasViewFeedbackPrivilege]);

  // Approved & Denied & In Contest candidate lists for the CURRENT active round evaluation
  const approvedPnms = useMemo(() => {
    return pnms.filter((p) => {
      const st = roundCounts[p.student_id]?.status;
      return st === "approved";
    });
  }, [pnms, roundCounts]);

  const deniedPnms = useMemo(() => {
    return pnms.filter((p) => {
      const st = roundCounts[p.student_id]?.status;
      return st === "denied";
    });
  }, [pnms, roundCounts]);

  const inContestPnms = useMemo(() => {
    return pnms.filter((p) => {
      const rec = roundCounts[p.student_id];
      if (!rec) return false;
      return rec.status === "in_contest" || (!rec.status && rec.status !== "approved" && rec.status !== "denied");
    });
  }, [pnms, roundCounts]);

  // All Approved candidates across all evaluated rounds in the active section (for Invites/Bids modal)
  const sectionApprovedPnms = useMemo(() => {
    return pnms.filter((p) => {
      return allCandidateStatuses[p.student_id] === "approved";
    });
  }, [pnms, allCandidateStatuses]);

  // Modal active counts and lists for the selected round in "Show Approved / Denied"
  const modalActiveCounts = useMemo(() => {
    if (modalSection === votingSection && modalRound === votingRound) {
      return roundCounts;
    }
    return modalRoundCounts;
  }, [modalSection, modalRound, votingSection, votingRound, roundCounts, modalRoundCounts]);

  const modalDeniedPnms = useMemo(() => {
    const query = modalSearchQuery.trim().toLowerCase();
    return pnms.filter((p) => {
      const rec = modalActiveCounts[p.student_id];
      if (!rec) return false;
      if (rec.status !== "denied") return false;
      if (query === "*" || query.startsWith("*")) {
        const rest = query.replace(/^\*/, "").trim();
        if (hasViewFeedbackPrivilege && !pendingFeedbackPnmIds.has(p.student_id)) {
          return false;
        }
        if (!rest) return true;
        return (
          p.full_name.toLowerCase().includes(rest) ||
          p.student_id.toLowerCase().includes(rest) ||
          (p.email && p.email.toLowerCase().includes(rest))
        );
      }
      if (!query) return true;
      return (
        p.full_name.toLowerCase().includes(query) ||
        p.student_id.toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query))
      );
    });
  }, [pnms, modalActiveCounts, modalSearchQuery, pendingFeedbackPnmIds, hasViewFeedbackPrivilege]);

  const modalInContestPnms = useMemo(() => {
    const query = modalSearchQuery.trim().toLowerCase();
    return pnms.filter((p) => {
      const rec = modalActiveCounts[p.student_id];
      if (!rec) return false;
      const st = rec.status;
      const isInContest = st === "in_contest" || (!st && st !== "approved" && st !== "denied");
      if (!isInContest) return false;
      if (query === "*" || query.startsWith("*")) {
        const rest = query.replace(/^\*/, "").trim();
        if (hasViewFeedbackPrivilege && !pendingFeedbackPnmIds.has(p.student_id)) {
          return false;
        }
        if (!rest) return true;
        return (
          p.full_name.toLowerCase().includes(rest) ||
          p.student_id.toLowerCase().includes(rest) ||
          (p.email && p.email.toLowerCase().includes(rest))
        );
      }
      if (!query) return true;
      return (
        p.full_name.toLowerCase().includes(query) ||
        p.student_id.toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query))
      );
    });
  }, [pnms, modalActiveCounts, modalSearchQuery, pendingFeedbackPnmIds, hasViewFeedbackPrivilege]);

  const modalApprovedPnms = useMemo(() => {
    const query = modalSearchQuery.trim().toLowerCase();
    return pnms.filter((p) => {
      const rec = modalActiveCounts[p.student_id];
      if (!rec) return false;
      if (rec.status !== "approved") return false;
      if (query === "*" || query.startsWith("*")) {
        const rest = query.replace(/^\*/, "").trim();
        if (hasViewFeedbackPrivilege && !pendingFeedbackPnmIds.has(p.student_id)) {
          return false;
        }
        if (!rest) return true;
        return (
          p.full_name.toLowerCase().includes(rest) ||
          p.student_id.toLowerCase().includes(rest) ||
          (p.email && p.email.toLowerCase().includes(rest))
        );
      }
      if (!query) return true;
      return (
        p.full_name.toLowerCase().includes(query) ||
        p.student_id.toLowerCase().includes(query) ||
        (p.email && p.email.toLowerCase().includes(query))
      );
    });
  }, [pnms, modalActiveCounts, modalSearchQuery, pendingFeedbackPnmIds, hasViewFeedbackPrivilege]);

  const modalThresholdDescription = useMemo(() => {
    const key = `s${modalSection}-r${modalRound}`;
    if (thresholdsMap[key]?.description) {
      return thresholdsMap[key].description;
    }
    if (modalSection === 1 && modalRound === 1) {
      return "Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)";
    }
    if (modalSection === 1 && modalRound === 2) {
      return "Denied: Y/N < 65% | Approved: Fill remaining invite quota spots with top Y/N% (>= 65%)";
    }
    if (modalSection === 2 && modalRound === 1) {
      return "Denied: Y/N < 60% | Approved: Y/N > 85% & A/T < 50% | In Contest: 60% <= Y/N <= 85% or (A/T >= 50% & Y/N > 85%)";
    }
    if (modalSection === 2 && modalRound === 2) {
      return "Denied: Y/N < 65% | Approved: Y/N > 80% | In Contest: 65% <= Y/N <= 80%";
    }
    return "Denied: Y/N < 75% | Approved: Fill remaining bid quota spots with top Y/N% (>= 75%)";
  }, [modalSection, modalRound, thresholdsMap]);

  // Active PNM for Presentation Mode
  const activePnm = useMemo(() => {
    if (!filteredPnms || filteredPnms.length === 0) return null;
    if (activePnmId) {
      const found = filteredPnms.find((p) => p.student_id === activePnmId);
      if (found) return found;
    }
    return filteredPnms[0] || null;
  }, [filteredPnms, activePnmId]);

  const activeIndex = useMemo(() => {
    if (!activePnm || !filteredPnms) return 0;
    const idx = filteredPnms.findIndex((p) => p.student_id === activePnm.student_id);
    return idx >= 0 ? idx : 0;
  }, [filteredPnms, activePnm]);

  const activeUserVote = activePnm ? (votes[activePnm.student_id] || null) : null;
  const activeCounts = activePnm ? roundCounts[activePnm.student_id] : null;
  const activePosVotes = activeCounts?.positive ?? 0;
  const activeAbstVotes = activeCounts?.abstain ?? 0;
  const activeNegVotes = activeCounts?.negative ?? 0;
  const activeTotalVotes = activePosVotes + (isAbstainAvailable ? activeAbstVotes : 0) + activeNegVotes;

  const pnmsVotedOnCount = useMemo(() => {
    const minVotes = voterThreshold && voterThreshold > 0 ? voterThreshold : 1;
    return filteredPnms.filter((p) => {
      const c = roundCounts[p.student_id];
      return c && ((c.positive || 0) + (c.abstain || 0) + (c.negative || 0) >= minVotes);
    }).length;
  }, [filteredPnms, roundCounts, voterThreshold]);

  // Fetch feedback when active PNM changes in presentation mode
  useEffect(() => {
    if (isPresentationRound && activePnm) {
      fetchFeedbackList(activePnm.student_id);
      setIsEditing(false);
      setEditedValues({ ...activePnm });
    }
  }, [isPresentationRound, activePnm?.student_id]);

  // Display the countdown locally, but let the database decide when it has elapsed.
  useEffect(() => {
    if (!closingEndsAt) {
      setCountdownSeconds(null);
      isClosingRef.current = false;
      return;
    }

    let cancelled = false;

    const updateTimer = async () => {
      const endMs = new Date(closingEndsAt).getTime();
      if (Number.isNaN(endMs)) {
        console.error("Invalid closing_ends_at timestamp:", closingEndsAt);
        setCountdownSeconds(null);
        return;
      }

      const nowMs = Date.now();
      const diffSeconds = Math.ceil((endMs - nowMs) / 1000);

      if (diffSeconds <= 0) {
        setCountdownSeconds(0);

        if (!isClosingRef.current) {
          isClosingRef.current = true;
          try {
            const { data: didClose, error } = await supabase.rpc("finish_voting_countdown", {
              p_section: votingSection,
              p_round: votingRound,
            });
            if (error) throw error;

            // A fast client clock can reach zero before the database clock. In that
            // case didClose is false and the interval safely retries.
            if (didClose && !cancelled) {
              setClosingEndsAt(null);
              setVotingStatus("closed");
              setRoundStatus("completed");
              toast.info("Voting closed and round thresholds evaluated.");
              fetchRoundCounts();
            }
          } catch (err) {
            console.error("Error finalizing voting countdown:", err);
          } finally {
            isClosingRef.current = false;
          }
        }
      } else {
        setCountdownSeconds(diffSeconds);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 250);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [closingEndsAt, votingSection, votingRound, fetchRoundCounts]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = pnms.length;
    const votesCount = Object.keys(votes).filter((key) => votes[key] !== null).length;
    return {
      total,
      votesCount,
    };
  }, [pnms, votes]);

  // Regent Controls: Switch Round
  const handleSelectSectionRound = async (section: number, round: number) => {
    try {
      // Auto-evaluate current/previous round so status is evaluated before moving
      await supabase.rpc("evaluate_round_thresholds", {
        p_section: votingSection,
        p_round: votingRound,
      });

      const { error } = await supabase.rpc("switch_round", {
        p_section: section,
        p_round: round,
      });

      if (error) throw error;
      setSelectedRegentSection(section);
      setSelectedRegentRound(round);
      toast.success(`Switched to Section ${section === 1 ? "Invite" : "Bid"} - Round ${round}`);
      await fetchRoundCounts();
    } catch (err: any) {
      console.error("Error setting section/round:", err);
      toast.error(err?.message || "Failed to update round.");
    }
  };

  // Regent Controls: Start Round (Presentation / Grid)
  const handleStartRound = async () => {
    try {
      const { error } = await supabase.rpc("start_round", {
        p_section: selectedRegentSection,
        p_round: selectedRegentRound,
      });
      if (error) throw error;
      toast.success(
        `Section ${selectedRegentSection === 1 ? "Invite" : "Bid"} Round ${selectedRegentRound} has started!`
      );
      fetchRoundCounts();
    } catch (err) {
      console.error("Error starting round:", err);
      toast.error("Failed to start round.");
    }
  };

  // Regent Controls: Evaluate Candidate Thresholds (Live in current moment)
  const handleEvaluateRound = async () => {
    try {
      const { error } = await supabase.rpc("evaluate_round_thresholds", {
        p_section: votingSection,
        p_round: votingRound,
      });
      if (error) {
        console.error("Error evaluating round thresholds (RPC):", error.message, error.details, error.hint);
        throw error;
      }
      toast.success(
        `Thresholds evaluated for Section ${votingSection === 1 ? "Invite" : "Bid"} Round ${votingRound}!`
      );
      await fetchRoundCounts();
    } catch (err: any) {
      console.error("Error evaluating round thresholds:", err?.message || err);
      toast.error(err?.message || "Failed to evaluate round thresholds. Please run migration script.");
    }
  };

  // Regent Controls: Go Live (Grid Mode)
  const handleGoLive = async () => {
    await handleStartRound();
  };

  // Regent Controls: Close Voting (Grid Mode)
  const handleCloseVoting = async () => {
    try {
      const { error } = await supabase.rpc("close_voting");
      if (error) throw error;
      toast.success("Voting closed.");
      fetchRoundCounts();
    } catch (err) {
      console.error("Error closing voting:", err);
      toast.error("Failed to close voting.");
    }
  };

  // Regent Controls: 5-second closing countdown
  const handleInitiateClosingCountdown = async () => {
    try {
      const { data: deadline, error } = await supabase.rpc("begin_voting_countdown");
      if (error) throw error;
      if (!deadline) throw new Error("Voting is not currently open for an active round.");

      setClosingEndsAt(deadline);
      setVotingStatus("closing");
      toast.warning("5-second closing countdown started!");
    } catch (err) {
      console.error("Error initiating closing countdown:", err);
      toast.error("Failed to start closing countdown.");
    }
  };

  // Presentation Mode: Change Active PNM
  const handleSelectPresentationPnm = async (studentId: string) => {
    try {
      setActivePnmId(studentId);
      const { error } = await supabase.rpc("select_candidate", {
        p_student_id: studentId,
      });

      if (error) throw error;
    } catch (err) {
      console.error("Error changing active candidate:", err);
      toast.error("Failed to change active candidate.");
    }
  };

  const handleNextPnm = async () => {
    if (activeIndex < filteredPnms.length - 1) {
      const nextCandidate = filteredPnms[activeIndex + 1];
      await handleSelectPresentationPnm(nextCandidate.student_id);
    }
  };

  const handlePrevPnm = async () => {
    if (activeIndex > 0) {
      const prevCandidate = filteredPnms[activeIndex - 1];
      await handleSelectPresentationPnm(prevCandidate.student_id);
    }
  };

  const handleToggleAppComLive = async () => {
    try {
      const { error } = await supabase.rpc("toggle_app_committee");
      if (error) throw error;
      toast.success(`Application comments are now ${!appCommitteeEnabled ? "enabled" : "disabled"} for Committee.`);
    } catch (err) {
      console.error("Error toggling application comments status:", err);
      toast.error("Failed to toggle application comments status.");
    }
  };

  const handleToggleInviteBidListShown = async () => {
    const nextVal = !inviteBidListShown;
    setInviteBidListShown(nextVal);
    try {
      const { error } = await supabase.rpc("toggle_invite_bid_list");
      if (error) {
        await supabase
          .from("voting-ops")
          .update({ invite_bid_list_shown: nextVal })
          .eq("id", 1);
      }
      toast.success(`Invite/Bid list is now ${nextVal ? "shown" : "hidden"} to members.`);
    } catch (err) {
      console.error("Error toggling invite/bid list visibility:", err);
      toast.error("Failed to toggle invite/bid list visibility.");
    }
  };

  // Quota & Section Setup Handlers (Admin: Regent, Vice Regent, Website Chair)
  const handleOpenSetupModal = (section: 1 | 2) => {
    setSetupModalSection(section);
    setSetupModalStep(1);
    setSetupQuotaInput(
      section === 1
        ? (inviteQuota ? String(inviteQuota) : "")
        : (bidQuota ? String(bidQuota) : "")
    );
    setSetupVoterThresholdInput(
      voterThreshold && voterThreshold > 0 ? String(voterThreshold) : "50"
    );
    setShowSetupModal(true);
  };

  const handleSetupStep1Confirm = () => {
    const quotaNum = parseInt(setupQuotaInput.trim(), 10);
    if (isNaN(quotaNum) || quotaNum <= 0) {
      toast.error(`Please enter a valid positive number for ${setupModalSection === 1 ? "invites" : "bids"}.`);
      return;
    }
    const thresholdNum = parseInt(setupVoterThresholdInput.trim(), 10);
    if (isNaN(thresholdNum) || thresholdNum <= 0) {
      toast.error("Please enter a valid positive number for the voter threshold.");
      return;
    }
    setSetupModalStep(2);
  };

  const handleSetupStep2Proceed = async () => {
    const quotaNum = parseInt(setupQuotaInput.trim(), 10);
    const thresholdNum = parseInt(setupVoterThresholdInput.trim(), 10);
    if (isNaN(quotaNum) || quotaNum <= 0 || isNaN(thresholdNum) || thresholdNum <= 0) return;

    setIsProcessingSetup(true);
    try {
      // First attempt with 3 arguments (including p_voter_threshold)
      const { error } = await supabase.rpc("setup_section", {
        p_section: setupModalSection,
        p_quota: quotaNum,
        p_voter_threshold: thresholdNum,
      });

      if (error) {
        // Fallback if RPC signature hasn't been migrated yet on remote database
        console.warn("RPC setup_section with 3 args failed, falling back to 2 args and direct update:", error);
        const { error: fallbackError } = await supabase.rpc("setup_section", {
          p_section: setupModalSection,
          p_quota: quotaNum,
        });
        if (fallbackError) throw fallbackError;
        await supabase
          .from("voting-ops")
          .update({ voter_threshold: thresholdNum })
          .eq("id", 1);
      }

      setVoterThreshold(thresholdNum);
      if (setupModalSection === 1) {
        setInviteQuota(quotaNum);
      } else {
        setBidQuota(quotaNum);
      }

      setVotingSection(setupModalSection);
      setVotingRound(1);
      setSelectedRegentSection(setupModalSection);
      setSelectedRegentRound(1);
      setRoundStatus("idle");
      setVotingStatus("closed");
      setVotes({});

      toast.success(
        `${setupModalSection === 1 ? "Invite" : "Bid"} Voting Setup Complete! Target: ${quotaNum}, Voter Threshold: ${thresholdNum}`
      );
      setShowSetupModal(false);
      fetchRoundCounts();
    } catch (err) {
      console.error("Error running section setup:", err);
      toast.error("Failed to complete section setup. Please check SQL setup.");
    } finally {
      setIsProcessingSetup(false);
    }
  };

  // Cast Vote Handler
  const handleVote = async (studentId: string, type: VoteType) => {
    if (!userId) {
      toast.error("User session not found.");
      return;
    }

    try {
      const { data: ops, error: opsError } = await supabase
        .from("voting-ops")
        .select("section, round, round_status, voting_status, active_pnm_id")
        .eq("id", 1)
        .maybeSingle();

      if (opsError) throw opsError;

      const dbSec = ops?.section ?? 1;
      const dbRnd = ops?.round ?? 1;
      const dbRoundStatus = ops?.round_status ?? "idle";
      const dbVotingStatus = ops?.voting_status ?? "closed";

      if (dbRoundStatus !== "in_progress" || (dbVotingStatus !== "open" && dbVotingStatus !== "closing") || dbSec !== votingSection || dbRnd !== votingRound) {
        toast.error("Voting is not currently open for this round.");
        return;
      }

      const currentVote = votes[studentId] || null;
      const targetVote = currentVote === type ? null : type;

      const { error } = await supabase.rpc("cast_vote", {
        p_student_id: String(studentId),
        p_user_id: String(userId),
        p_section_num: Number(votingSection),
        p_round_num: Number(votingRound),
        p_vote_choice: targetVote,
      });

      if (error) {
        console.error("RPC cast_vote error:", error);
        throw error;
      }

      const updatedVotes = { ...votes, [studentId]: targetVote };
      setVotes(updatedVotes);

      fetchRoundCounts();

      if (targetVote === null) {
        toast.info("Vote cleared");
      } else {
        toast.success("Vote submitted");
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; details?: string; hint?: string };
      console.error("Error casting vote:", err);
      toast.error(errorObj?.message || errorObj?.details || "Failed to cast vote. Please run updated SQL.");
    }
  };

  // Details Modal Handlers (Grid Mode)
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
      fetchPendingFeedback();
    } catch (err) {
      console.error("Error toggling approval status:", err);
      toast.error("Failed to update status.");
    }
  };

  const handleDeleteFeedback = async (feedbackId: number) => {
    if (!confirm("Are you sure you want to delete this feedback?")) {
      return;
    }
    try {
      const { error } = await supabase
        .from("pnm_feedback")
        .delete()
        .eq("id", feedbackId);

      if (error) throw error;

      setFeedbackList((prev) => prev.filter((fb) => fb.id !== feedbackId));
      toast.success("Feedback deleted successfully.");
      fetchPendingFeedback();
    } catch (err) {
      console.error("Error deleting feedback:", err);
      toast.error("Failed to delete feedback.");
    }
  };

  // Filter feedback for drawer: full list for rush chairs/admins, own feedback only for regular members
  const visibleFeedbackList = useMemo(() => {
    if (hasViewFeedbackPrivilege) {
      return feedbackList;
    }
    const currentName = userFullName.trim().toLowerCase();
    return feedbackList.filter(
      (fb) => fb.submitter_name && fb.submitter_name.trim().toLowerCase() === currentName
    );
  }, [feedbackList, hasViewFeedbackPrivilege, userFullName]);

  const handleSubmitFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetStudentId = isPresentationRound ? activePnm?.student_id : selectedPnmForDetails?.student_id;
    if (!targetStudentId) return;

    if (!newFeedbackComment.trim()) {
      toast.error("Please enter a comment.");
      return;
    }

    try {
      const { error } = await supabase
        .from("pnm_feedback")
        .insert({
          student_id: targetStudentId,
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

      fetchFeedbackList(targetStudentId);
      fetchPendingFeedback();
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

  const isRushCommitteeOnly = (isRushCommittee || normalizedUserRole === "rush committee") && !isStrictAdmin && !isRushChair && normalizedUserRole !== "rush chair";
  const canEdit = isStrictAdmin || isRushChair || normalizedUserRole === "rush chair" || ((isRushCommittee || normalizedUserRole === "rush committee") && appComLive);

  if (checkingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center font-sans">
        <div className="text-xl font-medium text-gray-600">Loading session...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent font-sans p-6 text-gray-900">
      {/* 5-Second Countdown Notification Banner */}
      {countdownSeconds !== null && countdownSeconds >= 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-11/12 max-w-xl animate-bounce">
          <div className="bg-amber-600 text-white px-6 py-3.5 rounded-2xl shadow-2xl border-2 border-amber-300 flex items-center justify-between gap-4 backdrop-blur-md">
            <div className="flex items-center gap-3">
              <span className="flex h-4 w-4 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-white"></span>
              </span>
              <span className="font-bold text-sm md:text-base tracking-wide">
                FINAL CALL: Voting closes in{" "}
                <span className="font-mono text-xl font-extrabold underline">{countdownSeconds}s</span>
              </span>
            </div>
            <span className="text-xs uppercase font-semibold bg-amber-800/80 px-2.5 py-1 rounded-full">
              Cast your vote now
            </span>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-zinc-100/90 backdrop-blur-sm p-6 rounded-xl border border-zinc-200/50 shadow-sm">
        <div>
          <h1 className="text-4xl font-mono font-bold underline decoration-red-400">
            Xi Rush Deliberation & Voting
          </h1>
          <p className="text-zinc-600 mt-1">
            Section {votingSection}: {votingSection === 1 ? "Invite Voting" : "Bid Voting"} — Round {votingRound}
          </p>
        </div>
        <Link
          href="/"
          className="bg-zinc-200 text-zinc-850 border border-zinc-300/80 px-4 py-2 rounded-md hover:bg-zinc-300 transition-all duration-300 font-medium"
        >
          Back to Dashboard
        </Link>
      </header>

      {/* Stats Cards & Control Section */}
      <section className="max-w-7xl mx-auto mb-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Block: Voting Round / Regent Control */}
        {isRegent ? (
          <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between gap-4">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">Voting Control Panel</span>
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded ${isLive
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
              >
                {isLive
                  ? isPresentationRound
                    ? roundActive
                      ? isLive
                        ? `S${votingSection} R${votingRound} VOTING LIVE`
                        : `S${votingSection} R${votingRound} IN PROGRESS`
                      : `S${votingSection} R${votingRound} CLOSED`
                    : `S${votingSection} R${votingRound} LIVE`
                  : `S${votingSection} R${votingRound} CLOSED`}
              </span>
            </div>

            {/* Two Setup Buttons and Round Selectors */}
            <div className="grid grid-cols-2 gap-3">
              {/* Section 1: Invite Voting Setup */}
              <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
                <button
                  onClick={() => handleOpenSetupModal(1)}
                  disabled={roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)}
                  className={`w-full py-1.5 px-2 rounded text-xs font-bold transition-all shadow-xs ${roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                    ? "opacity-50 cursor-not-allowed bg-zinc-400 text-white"
                    : inviteSetupCompleted
                      ? "bg-zinc-800 hover:bg-zinc-900 text-white"
                      : "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                    }`}
                  title={
                    roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                      ? "End current round before configuring setup"
                      : "Invite Voting Setup"
                  }
                >
                  {inviteSetupCompleted
                    ? `Invite Setup (${inviteTargetCount || "?"})`
                    : "Invite Voting Setup"}
                </button>
                <div className="flex items-center justify-center gap-2">
                  {[1, 2].map((r) => {
                    const isSelected = selectedRegentSection === 1 && selectedRegentRound === r;
                    const isDisabled =
                      !inviteSetupCompleted ||
                      roundActive ||
                      isLive ||
                      (countdownSeconds !== null && countdownSeconds > 0);
                    return (
                      <button
                        key={r}
                        onClick={() => handleSelectSectionRound(1, r)}
                        disabled={isDisabled}
                        title={
                          roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                            ? "End current round before switching rounds"
                            : !inviteSetupCompleted
                              ? "Complete Invite Voting Setup first"
                              : `Select Round ${r}`
                        }
                        className={`flex-1 h-7 rounded text-xs font-bold transition-all ${isDisabled
                          ? "bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-200"
                          : isSelected
                            ? "bg-red-700 text-white shadow-sm font-bold scale-105"
                            : "bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                          }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Bid Voting Setup */}
              <div className="flex flex-col gap-2 p-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
                <button
                  onClick={() => handleOpenSetupModal(2)}
                  disabled={roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)}
                  className={`w-full py-1.5 px-2 rounded text-xs font-bold transition-all shadow-xs ${roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                    ? "opacity-50 cursor-not-allowed bg-zinc-400 text-white"
                    : bidSetupCompleted
                      ? "bg-zinc-800 hover:bg-zinc-900 text-white"
                      : "bg-amber-600 hover:bg-amber-700 text-white animate-pulse"
                    }`}
                  title={
                    roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                      ? "End current round before configuring setup"
                      : "Bid Voting Setup"
                  }
                >
                  {bidTargetCount
                    ? `Bid Setup (${bidTargetCount})`
                    : "Bid Voting Setup"}
                </button>
                <div className="flex items-center justify-center gap-1.5">
                  {[1, 2, 3].map((r) => {
                    const isSelected = selectedRegentSection === 2 && selectedRegentRound === r;
                    const isDisabled =
                      !bidSetupCompleted ||
                      roundActive ||
                      isLive ||
                      (countdownSeconds !== null && countdownSeconds > 0);
                    return (
                      <button
                        key={r}
                        onClick={() => handleSelectSectionRound(2, r)}
                        disabled={isDisabled}
                        title={
                          roundActive || isLive || (countdownSeconds !== null && countdownSeconds > 0)
                            ? "End current round before switching rounds"
                            : !bidSetupCompleted
                              ? "Complete Bid Voting Setup first"
                              : `Select Round ${r}`
                        }
                        className={`flex-1 h-7 rounded text-xs font-bold transition-all ${isDisabled
                          ? "bg-zinc-200 text-zinc-400 cursor-not-allowed border border-zinc-200"
                          : isSelected
                            ? "bg-red-700 text-white shadow-sm font-bold scale-105"
                            : "bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 cursor-pointer"
                          }`}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* App Committee Toggle & Invite/Bid List Visibility Controls */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleAppComLive}
                    className={`px-3 py-1 rounded text-[11px] font-bold uppercase transition-all shadow-xs cursor-pointer ${appComLive
                      ? "bg-purple-700 hover:bg-purple-800 text-white"
                      : "bg-zinc-100 border border-zinc-300 text-zinc-650 hover:bg-zinc-200"
                      }`}
                  >
                    App Com: {appComLive ? "LIVE" : "OFF"}
                  </button>
                  <button
                    onClick={handleToggleInviteBidListShown}
                    className={`px-3 py-1 rounded text-[11px] font-bold uppercase transition-all shadow-xs cursor-pointer ${inviteBidListShown
                      ? "bg-emerald-700 hover:bg-purple-800 text-white"
                      : "bg-zinc-100 border border-zinc-300 text-zinc-650 hover:bg-zinc-200"
                      }`}
                    title={inviteBidListShown ? "Click to hide list from members" : "Click to show list to members"}
                  >
                    Invite/Bid List: {inviteBidListShown ? "SHOWN" : "HIDDEN"}
                  </button>
                </div>
                <span className="text-[11px] font-medium text-zinc-500">
                  {isPresentationRound ? "Presentation" : "Grid Voting"}
                </span>
              </div>

              {/* Start Round / Evaluate / Countdown Controls (All Rounds) */}
              <div>
                {!roundActive ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartRound}
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold text-white bg-green-700 hover:bg-green-800 transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      Start Round (S{selectedRegentSection} R{selectedRegentRound})
                    </button>
                    <button
                      onClick={handleEvaluateRound}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Evaluate thresholds in the current moment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Evaluate
                    </button>
                  </div>
                ) : countdownSeconds !== null && countdownSeconds > 0 ? (
                  <div className="flex gap-2">
                    <button
                      disabled
                      className="flex-1 py-2 px-3 rounded-lg text-xs font-bold text-white bg-amber-600 opacity-90 cursor-not-allowed flex items-center justify-center gap-2 animate-pulse"
                    >
                      Closing in {countdownSeconds}s...
                    </button>
                    <button
                      onClick={handleEvaluateRound}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Evaluate thresholds in the current moment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Evaluate
                    </button>
                  </div>
                ) : isLive ? (
                  <div className="flex gap-2">
                    <button
                      onClick={handleInitiateClosingCountdown}
                      className="flex-1 py-2 px-2.5 rounded-lg text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Starts 5-second countdown to close voting"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                      </svg>
                      Close (5s Timer)
                    </button>
                    <button
                      onClick={handleEvaluateRound}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Evaluate thresholds in the current moment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Evaluate
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={handleStartRound}
                      className="flex-1 py-2 px-2.5 rounded-lg text-xs font-bold text-white bg-green-700 hover:bg-green-800 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title={`Start Section ${selectedRegentSection} Round ${selectedRegentRound}`}
                    >
                      Start Round (S{selectedRegentSection} R{selectedRegentRound})
                    </button>
                    <button
                      onClick={handleEvaluateRound}
                      className="py-2 px-3 rounded-lg text-xs font-bold text-white bg-blue-700 hover:bg-blue-800 transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Evaluate thresholds in the current moment"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Evaluate
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
            <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">Voting Status</span>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-2xl font-bold font-mono text-zinc-800">
                {votingSection === 1 ? "Invite" : "Bid"} R{votingRound}
              </span>
              <span
                className={`px-2 py-0.5 text-xs font-semibold rounded ${isLive
                  ? "bg-green-100 text-green-800 border border-green-200"
                  : roundActive
                    ? "bg-amber-100 text-amber-800 border border-amber-200"
                    : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
              >
                {isLive ? "VOTING LIVE" : roundActive ? "ROUND IN PROGRESS" : "CLOSED"}
              </span>
              {isPresentationRound && (
                <span className="px-2 py-0.5 text-xs font-bold rounded bg-purple-100 text-purple-800 border border-purple-200">
                  PRESENTATION
                </span>
              )}
            </div>
          </div>
        )}

        {/* Middle Block: Active Candidates */}
        <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
          <div className="flex justify-between items-center">
            <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">
              {isPresentationRound ? "Candidates in Contest" : "Total PNMs Registered"}
            </span>
            <span className="text-xs font-mono font-bold text-zinc-500">
              Approved: {approvedPnms.length} | Denied: {deniedPnms.length}
            </span>
          </div>
          <span className="text-3xl font-bold font-mono text-zinc-800 mt-2">
            {filteredPnms.length}
            {isPresentationRound && (
              <span className="text-base font-normal text-zinc-400 ml-2">/ {stats.total} total</span>
            )}
          </span>
        </div>

        {/* Right Block: My Votes Cast & PNMs Voted On */}
        <div className="bg-white rounded-lg p-5 border border-zinc-200 shadow-sm flex flex-col justify-between min-h-[120px]">
          {isStrictAdmin || isRushChair ? (
            <div className="flex flex-col justify-between h-full gap-3">
              <div>
                <span className="text-zinc-500 font-semibold text-xs uppercase tracking-wider block">My Votes Cast</span>
                <span className="text-2xl font-bold font-mono text-zinc-800">
                  {stats.votesCount} <span className="text-sm font-normal text-zinc-400">/ {filteredPnms.length}</span>
                </span>
              </div>
              <div className="border-t border-zinc-100 pt-2 flex items-baseline justify-between">
                <div>
                  <span className="text-zinc-500 font-semibold text-xs uppercase tracking-wider block">PNM&apos;s voted on</span>
                  <span className="text-2xl font-bold font-mono text-red-700">
                    {pnmsVotedOnCount} <span className="text-sm font-normal text-zinc-400">/ {filteredPnms.length}</span>
                  </span>
                </div>
                {voterThreshold && voterThreshold > 1 && (
                  <span
                    className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-mono font-medium"
                    title={`Voter threshold: ${voterThreshold} votes required per candidate`}
                  >
                    {voterThreshold} req.
                  </span>
                )}
              </div>
            </div>
          ) : (
            <>
              <span className="text-zinc-500 font-semibold text-sm uppercase tracking-wider">My Votes Cast</span>
              <span className="text-3xl font-bold font-mono text-zinc-800 mt-2">
                {stats.votesCount} <span className="text-lg text-zinc-400">/ {filteredPnms.length}</span>
              </span>
            </>
          )}
        </div>
      </section>

      {/* Closed Voting Banner */}
      {!isLive && (
        <div className="max-w-7xl mx-auto mb-6 p-4 bg-zinc-200 border border-zinc-300 text-zinc-700 rounded-lg text-center font-semibold text-sm shadow-sm flex items-center justify-center gap-2">
          {roundActive
            ? "Round is active. Voting will open when candidate presentation begins."
            : "Voting is currently closed. Cast votes are locked."}
        </div>
      )}

      {/* User Info Bar & Action Controls */}
      <section className="max-w-7xl mx-auto mb-6 flex flex-col md:flex-row justify-between items-center gap-4 bg-zinc-100/90 backdrop-blur-sm p-4 rounded-xl border border-zinc-200/50 shadow-sm text-zinc-900">
        {/* Left: Greeting */}
        <div className="text-zinc-800 font-medium text-lg px-2">
          Hi, <span className="font-bold text-red-700">{userFirstName}</span>! Your role is{" "}
          <span className="font-bold underline decoration-zinc-400 capitalize">{userRole}</span>.
        </div>

        {/* Middle: Show Approved/Denied Pop-up Button (Only for Regent and Vice Regent) */}
        {isStrictRegent ? (
          <div className="flex items-center gap-3">
            <button
              onClick={handleOpenApprovedDeniedModal}
              className="bg-zinc-800 hover:bg-zinc-900 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            >
              <span className="w-2 h-2 rounded-full bg-green-400" />
              Show Approved / Denied
              <span className="w-2 h-2 rounded-full bg-red-400" />
            </button>
          </div>
        ) : <div />}

        {/* Right: Show Invites / Show Bids Button */}
        <div className="flex items-center">
          <button
            onClick={() => {
              if (isStrictAdmin || inviteBidListShown) {
                setShowInvitesBidsModal(true);
              } else {
                toast.error("Invite/Bid list is currently hidden by officers.");
              }
            }}
            disabled={!isStrictAdmin && !inviteBidListShown}
            className={`font-bold text-xs uppercase px-4 py-2 rounded-lg shadow-sm transition-all flex items-center gap-2 ${isStrictAdmin || inviteBidListShown
              ? "bg-red-700 hover:bg-red-800 text-white hover:scale-105 cursor-pointer"
              : "bg-zinc-200 text-zinc-400 border border-zinc-300 cursor-not-allowed opacity-60"
              }`}
            title={
              !isStrictAdmin && !inviteBidListShown
                ? "Invite/Bid list is currently hidden by officers"
                : `Show ${votingSection === 1 ? "Invites" : "Bids"}`
            }
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            {votingSection === 1 ? "Show Invites" : "Show Bids"}
            {!isStrictAdmin && !inviteBidListShown && (
              <span className="text-[10px] font-semibold text-zinc-400 normal-case ml-1">(Hidden)</span>
            )}
          </button>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* REGENT & VICE REGENT PRESENTATION CONTROL BAR (Presentation Rounds)        */}
      {/* ========================================================================= */}
      {isPresentationRound && isRegent && (
        <section className="max-w-7xl mx-auto mb-6 bg-zinc-900 text-white px-5 py-3.5 rounded-xl border border-zinc-800 shadow-md flex flex-wrap items-center justify-between gap-4 animate-in fade-in duration-300">
          {/* Navigation & Candidate Selector */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handlePrevPnm}
              disabled={!roundActive || activeIndex <= 0}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-zinc-700 cursor-pointer"
              title="Previous candidate"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>

            <div className="relative">
              <select
                value={activePnm?.student_id || ""}
                onChange={(e) => handleSelectPresentationPnm(e.target.value)}
                disabled={!roundActive}
                title={activePnm ? activePnm.full_name : "Select candidate to present"}
                className={`bg-zinc-800 text-white text-xs font-semibold border border-zinc-700 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-600 max-w-[220px] md:max-w-xs truncate ${!roundActive ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
                  }`}
              >
                {filteredPnms.map((p, idx) => {
                  const pCounts = roundCounts[p.student_id];
                  const minVotes = voterThreshold && voterThreshold > 0 ? voterThreshold : 1;
                  const hasBeenVotedOn = pCounts && ((pCounts.positive || 0) + (pCounts.abstain || 0) + (pCounts.negative || 0) >= minVotes);
                  return (
                    <option key={p.student_id} value={p.student_id} title={p.full_name}>
                      {idx + 1}. {p.full_name} {hasBeenVotedOn ? "✓" : ""}
                    </option>
                  );
                })}
              </select>
            </div>

            <button
              onClick={handleNextPnm}
              disabled={!roundActive || activeIndex >= filteredPnms.length - 1}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg text-xs font-bold transition-colors flex items-center gap-1 border border-zinc-700 cursor-pointer"
              title="Next candidate"
            >
              Next
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Counters & Totals */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-4 flex-wrap bg-zinc-950/70 px-4 py-1.5 rounded-lg border border-zinc-800">
              <div className="flex items-center gap-3 text-xs font-mono font-bold">
                <span className="text-green-400">Y: {activePosVotes}</span>
                {isAbstainAvailable && <span className="text-zinc-400">A: {activeAbstVotes}</span>}
                <span className="text-red-400">N: {activeNegVotes}</span>
              </div>
              <div className="h-4 w-px bg-zinc-700" />
              <div className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5">
                <span>Total Votes:</span>
                <span className="bg-amber-400/20 text-amber-300 px-2 py-0.5 rounded border border-amber-400/40 text-sm">
                  {activeTotalVotes}
                </span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MAIN CONTENT: PRESENTATION VIEW vs GRID VIEW                              */}
      {/* ========================================================================= */}
      <main className="max-w-7xl mx-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="h-12 w-12 border-4 border-red-700 border-t-transparent rounded-full animate-spin" />
            <p className="text-zinc-600 font-medium">Loading candidate database...</p>
          </div>
        ) : filteredPnms.length === 0 ? (
          <div className="text-center py-20 bg-white border border-zinc-200 rounded-lg shadow-sm">
            <p className="text-zinc-500 text-lg font-medium">
              {isPresentationRound
                ? "No candidates currently in contest for this round."
                : "No candidates found."}
            </p>
          </div>
        ) : isPresentationRound ? (
          /* ===================================================================== */
          /* PRESENTATION DETAILED VIEW                                            */
          /* ===================================================================== */
          <div>
            {activePnm && (
              <div className="bg-white rounded-xl shadow-lg border border-zinc-200 overflow-hidden flex flex-col transition-all duration-300">
                {/* Candidate Bar Header */}
                <div className="px-6 py-4 bg-zinc-900 text-white flex flex-wrap justify-between items-center gap-4">
                  <div className="flex items-center gap-3">
                    <span className="bg-red-700 text-white font-mono font-bold text-sm px-2.5 py-1 rounded-md">
                      #{activeIndex + 1} of {filteredPnms.length}
                    </span>
                    <span className="text-zinc-600 font-mono">|</span>
                    <h2 className="text-2xl font-mono font-bold tracking-wide" title={activePnm.full_name}>{activePnm.full_name}</h2>
                  </div>

                  {/* Vote buttons in the top bar in the middle between #NUM of TOT | NAME -- Y/(A)/N -- major */}
                  <div className="flex items-center gap-2">
                    {/* YES */}
                    <button
                      onClick={() => handleVote(activePnm.student_id, "yes")}
                      disabled={!isLive}
                      className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${activeUserVote === "yes"
                        ? "bg-green-600 text-white ring-2 ring-green-300 font-extrabold scale-105"
                        : "bg-zinc-800 text-zinc-300 hover:bg-green-700 hover:text-white border border-zinc-700"
                        } ${!isLive ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={isLive ? "Vote YES" : "Voting is closed"}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                      <span>YES</span>
                    </button>

                    {/* ABSTAIN */}
                    {isAbstainAvailable && (
                      <button
                        onClick={() => handleVote(activePnm.student_id, "abstain")}
                        disabled={!isLive}
                        className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${activeUserVote === "abstain"
                          ? "bg-zinc-500 text-white ring-2 ring-zinc-300 font-extrabold scale-105"
                          : "bg-zinc-800 text-zinc-300 hover:bg-zinc-600 hover:text-white border border-zinc-700"
                          } ${!isLive ? "opacity-50 cursor-not-allowed" : ""}`}
                        title={isLive ? "Vote ABSTAIN" : "Voting is closed"}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <circle cx="12" cy="12" r="10" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93l14.14 14.14" />
                        </svg>
                        <span>ABSTAIN</span>
                      </button>
                    )}

                    {/* NO */}
                    <button
                      onClick={() => handleVote(activePnm.student_id, "no")}
                      disabled={!isLive}
                      className={`px-4 py-1.5 rounded-lg font-bold text-xs transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${activeUserVote === "no"
                        ? "bg-red-600 text-white ring-2 ring-red-300 font-extrabold scale-105"
                        : "bg-zinc-800 text-zinc-300 hover:bg-red-700 hover:text-white border border-zinc-700"
                        } ${!isLive ? "opacity-50 cursor-not-allowed" : ""}`}
                      title={isLive ? "Vote NO" : "Voting is closed"}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>NO</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-zinc-300">
                      {activePnm.major || "Undeclared"} — {activePnm.year || "N/A"}
                    </span>
                    {isStrictAdmin && (
                      <div className="flex gap-3 text-sm font-bold font-mono bg-zinc-800 px-3 py-1 rounded-md border border-zinc-700">
                        <span className="text-green-400">Y: {activePosVotes}</span>
                        {isAbstainAvailable && <span className="text-zinc-400">A: {activeAbstVotes}</span>}
                        <span className="text-red-400">N: {activeNegVotes}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Candidate Details 3-Column Layout */}
                <div className="p-6 grid grid-cols-1 md:grid-cols-4 gap-6 text-zinc-900">
                  {/* Left Column: Headshot, Attendance Dots, Major/Year, Absence */}
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
                        <h2 className="text-3xl font-bold tracking-tight text-zinc-950 truncate" title={activePnm.full_name}>
                          {activePnm.full_name}
                        </h2>
                      )}
                    </div>

                    {/* Photo */}
                    <div className="relative aspect-[3/4] w-full bg-zinc-100 rounded-lg border border-zinc-300 overflow-hidden flex items-center justify-center" title={activePnm.full_name}>
                      {activePnm.headshot_url ? (
                        <img
                          src={activePnm.headshot_url}
                          alt={`${activePnm.full_name} Headshot`}
                          title={activePnm.full_name}
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

                    {/* Major / Year */}
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
                          title={`${activePnm.major || "Undeclared"} — ${activePnm.year || "N/A"}`}
                        >
                          {activePnm.major || "Undeclared"} — {activePnm.year || "N/A"}
                        </p>
                      )}
                    </div>

                    {/* Attendance List */}
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
                            const isAttended = isEditingEvents ? !!editedValues[key] : !!activePnm[key];
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

                      {/* Absence Info */}
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
                              {activePnm.absence_form_num ?? 0}
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
                              {activePnm.absence_reason || "None specified"}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Email & Student ID */}
                    <div className="bg-zinc-50 p-2.5 rounded-lg border border-zinc-200 flex items-center justify-between text-[11px] text-zinc-600 gap-2">
                      <div className="truncate min-w-0 flex-1">
                        <span className="font-semibold text-zinc-400 block text-[9px] uppercase tracking-wider">
                          Email
                        </span>
                        <span className="font-mono text-zinc-700 truncate block text-xs" title={activePnm.email}>
                          {activePnm.email}
                        </span>
                      </div>
                      <div className="h-6 w-px bg-zinc-200 flex-shrink-0" />
                      <div className="text-right flex-shrink-0">
                        <span className="font-semibold text-zinc-400 block text-[9px] uppercase tracking-wider">
                          Student ID
                        </span>
                        <span className="font-mono text-zinc-700 font-bold block text-xs">
                          {activePnm.student_id}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Middle Section: Feedback Notes & Application Comments */}
                  <div className="md:col-span-2 border-r border-zinc-200 px-6 flex flex-col min-h-0">
                    <div className="flex justify-between items-center mb-3 border-b border-zinc-100 pb-1 flex-shrink-0">
                      <h4 className="text-lg font-bold text-zinc-800">Feedback Notes</h4>
                      <div className="flex items-center gap-2">
                        {hasViewFeedbackPrivilege && pendingFeedbackPnmIds.has(activePnm.student_id) && (
                          <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 shadow-2xs">
                            <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                            <span>Unread Feedback</span>
                          </div>
                        )}
                        <button
                          onClick={() => setIsSubmittingFeedback(true)}
                          className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-semibold shadow-sm transition-all"
                        >
                          Submit Feedback
                        </button>
                        <button
                          onClick={() => setIsViewingFeedback(!isViewingFeedback)}
                          className={`px-2.5 py-1 text-white rounded text-xs font-semibold shadow-sm transition-all ${isViewingFeedback ? "bg-zinc-800 hover:bg-zinc-900" : "bg-zinc-700 hover:bg-zinc-800"
                            }`}
                        >
                          {isViewingFeedback ? "Hide Feedback" : "View Feedback"}
                        </button>
                      </div>
                    </div>

                      <div className="flex-1 overflow-y-auto space-y-4 pr-2 max-h-[380px]">
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
                              {activePnm.positive_note || "—"}
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
                              {activePnm.negative_note || "—"}
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
                              {activePnm.other_note || "—"}
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
                              {activePnm.veto_note || "—"}
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

                        {/* Application Comment */}
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
                              {activePnm.application_comments || "No comments entered."}
                            </p>
                          )}
                        </div>
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
                          {activePnm.interviewer_names || "None listed"}
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
                            {activePnm.interview_notes || "No interview notes available."}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* In-Place Editing Footer Controls */}
                {canEdit && (
                  <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center">
                    <div>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveChanges(activePnm)}
                            className="bg-green-700 text-white px-5 py-1.5 rounded-lg font-semibold text-sm hover:bg-green-800 transition-colors shadow-sm"
                          >
                            Save Changes
                          </button>
                          <button
                            onClick={() => setIsEditing(false)}
                            className="bg-white border border-zinc-300 text-zinc-700 px-4 py-1.5 rounded-lg font-semibold text-sm hover:bg-zinc-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditing(activePnm)}
                          className="bg-zinc-800 text-white px-4 py-1.5 rounded-lg font-semibold text-xs hover:bg-zinc-900 transition-colors shadow-sm"
                        >
                          Edit Details
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Candidates Grid Below Live Presentation Candidate */}
            <div className="mt-10">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-mono font-bold text-zinc-800 uppercase tracking-wider">
                  All Candidates in Contest ({filteredPnms.length})
                </h3>
                <span className="text-xs text-zinc-500 font-medium">
                  {isLive ? "Voting is live for all candidates" : "Voting is currently closed"}
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredPnms.map((pnm) => {
                  const vote = votes[pnm.student_id] || null;
                  const isCurrentActive = pnm.student_id === activePnm?.student_id;

                  return (
                    <div
                      key={pnm.student_id}
                      className={`bg-white rounded-lg border shadow-sm overflow-hidden flex hover:shadow-md transition-all duration-300 h-44 ${isCurrentActive ? "border-2 border-red-600 ring-2 ring-red-100" : "border-zinc-200"
                        }`}
                    >
                      {/* Photo */}
                      <div className="relative w-1/3 bg-zinc-200 flex-shrink-0 flex items-center justify-center border-r border-zinc-200" title={pnm.full_name}>
                        {pnm.headshot_url ? (
                          <img
                            src={pnm.headshot_url}
                            alt={`${pnm.full_name} Headshot`}
                            title={pnm.full_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <svg className="w-12 h-12 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="1.5"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        )}
                        {isCurrentActive && (
                          <span className="absolute top-1.5 left-1.5 bg-red-700 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded shadow-sm">
                            LIVE
                          </span>
                        )}
                      </div>

                      {/* Info and Ballot */}
                      <div className="w-2/3 p-4 flex flex-col justify-between min-w-0">
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <h3
                              className="font-bold text-lg text-zinc-900 truncate leading-tight cursor-pointer hover:text-red-700 transition-colors flex-1 min-w-0"
                              title={pnm.full_name}
                              onClick={() => handleSelectPresentationPnm(pnm.student_id)}
                            >
                              {pnm.full_name}
                            </h3>
                            {hasViewFeedbackPrivilege && pendingFeedbackPnmIds.has(pnm.student_id) && (
                              <span
                                className="w-2.5 h-2.5 rounded-full bg-purple-600 ring-2 ring-purple-200 flex-shrink-0"
                                title="Pending unread feedback waiting for approval"
                              />
                            )}
                          </div>
                          <p
                            className="text-zinc-600 text-xs font-semibold truncate mb-2"
                            title={`${pnm.major || "Undeclared"} — ${pnm.year || "N/A"}`}
                          >
                            {pnm.major || "Undeclared"} — {pnm.year || "N/A"}
                          </p>

                          {/* 6 Attendance Dots */}
                          <div className="flex items-center gap-2 my-1">
                            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider select-none leading-none">
                              Attendance:
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
                                  className={`w-3.5 h-3.5 rounded-full border shadow-sm ${attended
                                    ? "bg-green-500 border-green-600"
                                    : "bg-red-500 border-red-600"
                                    }`}
                                  title={`${EVENT_HEADERS[i]}: ${attended ? "Attended" : "Absent"}`}
                                />
                              ))}
                            </div>
                          </div>

                          {/* Vote Counts (Admins only) */}
                          {isStrictAdmin && (
                            <div className="flex gap-6 text-[16px] font-bold mt-2.5 font-mono select-none leading-none">
                              <span className="text-green-700">Y: {roundCounts[pnm.student_id]?.positive ?? 0}</span>
                              {isAbstainAvailable && (
                                <span className="text-zinc-500">A: {roundCounts[pnm.student_id]?.abstain ?? 0}</span>
                              )}
                              <span className="text-red-700">N: {roundCounts[pnm.student_id]?.negative ?? 0}</span>
                            </div>
                          )}
                        </div>

                        {/* Actions and Ballot */}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
                          <button
                            onClick={() => handleOpenDetails(pnm)}
                            className="px-3 py-1 bg-zinc-100 border border-zinc-300 rounded text-xs font-semibold text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950 transition-colors cursor-pointer"
                          >
                            Details
                          </button>

                          {/* Ballot Buttons */}
                          <div className="flex gap-2">
                            {/* Yes */}
                            <button
                              onClick={() => handleVote(pnm.student_id, "yes")}
                              disabled={!isLive}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                                } ${vote === "yes"
                                  ? "bg-green-600 text-white shadow-md scale-105"
                                  : "bg-zinc-100 border border-zinc-300 text-green-700 hover:bg-green-50"
                                }`}
                              title={isLive ? "Vote Yes" : "Voting is closed"}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </button>

                            {/* Abstain (Only rendered if Abstain is Available) */}
                            {isAbstainAvailable && (
                              <button
                                onClick={() => handleVote(pnm.student_id, "abstain")}
                                disabled={!isLive}
                                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                                  } ${vote === "abstain"
                                    ? "bg-zinc-500 text-white shadow-md scale-105"
                                    : "bg-zinc-100 border border-zinc-300 text-zinc-600 hover:bg-zinc-200"
                                  }`}
                                title={isLive ? "Vote Abstain" : "Voting is closed"}
                              >
                                <svg
                                  className="w-4 h-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  strokeWidth="2.5"
                                >
                                  <circle cx="12" cy="12" r="10" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93l14.14 14.14" />
                                </svg>
                              </button>
                            )}

                            {/* No */}
                            <button
                              onClick={() => handleVote(pnm.student_id, "no")}
                              disabled={!isLive}
                              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                                } ${vote === "no"
                                  ? "bg-red-600 text-white shadow-md scale-105"
                                  : "bg-zinc-100 border border-zinc-300 text-red-700 hover:bg-red-50"
                                }`}
                              title={isLive ? "Vote No" : "Voting is closed"}
                            >
                              <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                strokeWidth="3"
                              >
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
            </div>
          </div>
        ) : (
          /* ===================================================================== */
          /* STANDARD GRID VIEW (Section 1 Round 1)                                */
          /* ===================================================================== */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPnms.map((pnm) => {
              const vote = votes[pnm.student_id] || null;

              return (
                <div
                  key={pnm.student_id}
                  className="bg-white rounded-lg border border-zinc-200 shadow-sm overflow-hidden flex hover:shadow-md transition-shadow duration-300 h-44"
                >
                  {/* Photo */}
                  <div className="relative w-1/3 bg-zinc-200 flex-shrink-0 flex items-center justify-center border-r border-zinc-200" title={pnm.full_name}>
                    {pnm.headshot_url ? (
                      <img
                        src={pnm.headshot_url}
                        alt={`${pnm.full_name} Headshot`}
                        title={pnm.full_name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <svg className="w-12 h-12 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth="1.5"
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                        />
                      </svg>
                    )}
                  </div>

                  {/* Info and Ballot */}
                  <div className="w-2/3 p-4 flex flex-col justify-between min-w-0">
                    <div>
                      <div className="flex items-center justify-between gap-1.5">
                        <h3 className="font-bold text-lg text-zinc-900 truncate leading-tight flex-1 min-w-0" title={pnm.full_name}>
                          {pnm.full_name}
                        </h3>
                        {hasViewFeedbackPrivilege && pendingFeedbackPnmIds.has(pnm.student_id) && (
                          <span
                            className="w-2.5 h-2.5 rounded-full bg-purple-600 ring-2 ring-purple-200 flex-shrink-0"
                            title="Pending unread feedback waiting for approval"
                          />
                        )}
                      </div>
                      <p
                        className="text-zinc-600 text-xs font-semibold truncate mb-2"
                        title={`${pnm.major || "Undeclared"} — ${pnm.year || "N/A"}`}
                      >
                        {pnm.major || "Undeclared"} — {pnm.year || "N/A"}
                      </p>

                      {/* 6 Attendance Dots */}
                      <div className="flex items-center gap-2 my-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider select-none leading-none">
                          Attendance:
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
                              className={`w-3.5 h-3.5 rounded-full border shadow-sm ${attended
                                ? "bg-green-500 border-green-600"
                                : "bg-red-500 border-red-600"
                                }`}
                              title={`${EVENT_HEADERS[i]}: ${attended ? "Attended" : "Absent"}`}
                            />
                          ))}
                        </div>
                      </div>

                      {/* Vote Counts (Admins only) */}
                      {isStrictAdmin && (
                        <div className="flex gap-6 text-[16px] font-bold mt-2.5 font-mono select-none leading-none">
                          <span className="text-green-700">Y: {roundCounts[pnm.student_id]?.positive ?? 0}</span>
                          {isAbstainAvailable && (
                            <span className="text-zinc-500">A: {roundCounts[pnm.student_id]?.abstain ?? 0}</span>
                          )}
                          <span className="text-red-700">N: {roundCounts[pnm.student_id]?.negative ?? 0}</span>
                        </div>
                      )}
                    </div>

                    {/* Actions and Ballot */}
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-zinc-100">
                      <button
                        onClick={() => handleOpenDetails(pnm)}
                        className="px-3 py-1 bg-zinc-100 border border-zinc-300 rounded text-xs font-semibold text-zinc-700 hover:bg-zinc-200 hover:text-zinc-950 transition-colors cursor-pointer"
                      >
                        Details
                      </button>

                      {/* Ballot Buttons */}
                      <div className="flex gap-2">
                        {/* Yes */}
                        <button
                          onClick={() => handleVote(pnm.student_id, "yes")}
                          disabled={!isLive}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                            } ${vote === "yes"
                              ? "bg-green-600 text-white shadow-md scale-105"
                              : "bg-zinc-100 border border-zinc-300 text-green-700 hover:bg-green-50"
                            }`}
                          title={isLive ? "Vote Yes" : "Voting is closed"}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="3"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </button>

                        {/* Abstain (Only rendered if Abstain is Available) */}
                        {isAbstainAvailable && (
                          <button
                            onClick={() => handleVote(pnm.student_id, "abstain")}
                            disabled={!isLive}
                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                              } ${vote === "abstain"
                                ? "bg-zinc-500 text-white shadow-md scale-105"
                                : "bg-zinc-100 border border-zinc-300 text-zinc-600 hover:bg-zinc-200"
                              }`}
                            title={isLive ? "Vote Abstain" : "Voting is closed"}
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              strokeWidth="2.5"
                            >
                              <circle cx="12" cy="12" r="10" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.93 4.93l14.14 14.14" />
                            </svg>
                          </button>
                        )}

                        {/* No */}
                        <button
                          onClick={() => handleVote(pnm.student_id, "no")}
                          disabled={!isLive}
                          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 cursor-pointer ${!isLive ? "opacity-40 cursor-not-allowed" : ""
                            } ${vote === "no"
                              ? "bg-red-600 text-white shadow-md scale-105"
                              : "bg-zinc-100 border border-zinc-300 text-red-700 hover:bg-red-50"
                            }`}
                          title={isLive ? "Vote No" : "Voting is closed"}
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                            strokeWidth="3"
                          >
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
      {showSetupModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 text-zinc-950">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-md overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center">
              <h3 className="text-lg font-mono font-bold tracking-wide">
                {setupModalSection === 1 ? "Invite Voting Setup" : "Bid Voting Setup"}
              </h3>
              <button
                onClick={() => setShowSetupModal(false)}
                className="text-zinc-400 hover:text-white font-bold text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            {setupModalStep === 1 ? (
              <div className="p-6 flex flex-col gap-4">
                <div>
                  <h4 className="text-base font-bold text-zinc-900">
                    {setupModalSection === 1 ? "Invite Voting Setup" : "Bid Voting Setup"}
                  </h4>
                  <p className="text-xs text-amber-700 mt-1 font-semibold">
                    Setting these values will reset all percentage thresholds and votes for Section{" "}
                    {setupModalSection}.
                  </p>
                </div>

                {/* Quota Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                    Number of {setupModalSection === 1 ? "Invites" : "Bids"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={setupQuotaInput}
                    onChange={(e) => setSetupQuotaInput(e.target.value)}
                    placeholder="e.g. 15"
                    autoFocus
                    className="w-full text-lg font-bold border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                </div>

                {/* Voter Threshold Input */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-zinc-600 uppercase tracking-wider">
                    Voter Threshold (Required Votes per Candidate)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={setupVoterThresholdInput}
                    onChange={(e) => setSetupVoterThresholdInput(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full text-lg font-bold border border-zinc-300 rounded-lg px-3 py-2 bg-white text-zinc-900 focus:outline-none focus:ring-2 focus:ring-red-700"
                  />
                  <p className="text-[11px] text-zinc-500">
                    A candidate must receive at least this many votes (Yes + Abstain + No) to be counted towards &quot;In-Contest Voted&quot;.
                  </p>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setShowSetupModal(false)}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSetupStep1Confirm}
                    className="px-5 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg text-xs font-bold transition-colors shadow-sm"
                  >
                    Confirm
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 flex flex-col gap-4">
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col gap-2">
                  <div className="text-sm font-bold text-amber-900">
                    You have configured Section {setupModalSection}:
                  </div>
                  <ul className="text-xs text-amber-900 font-semibold list-disc list-inside space-y-1">
                    <li>
                      <span className="font-bold">{setupQuotaInput}</span> {setupModalSection === 1 ? "Invites" : "Bids"} target quota
                    </li>
                    <li>
                      <span className="font-bold">{setupVoterThresholdInput}</span> votes required per candidate to be considered &apos;voted on&apos;
                    </li>
                  </ul>
                  <p className="text-xs text-amber-800 leading-relaxed font-medium mt-1">
                    By clicking proceed, all thresholds will be recalculated and final.
                  </p>
                  <p className="text-xs text-red-700 font-bold">
                    All votes in Section {setupModalSection} will be cleared.
                  </p>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={() => setSetupModalStep(1)}
                    disabled={isProcessingSetup}
                    className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSetupStep2Proceed}
                    disabled={isProcessingSetup}
                    className="px-5 py-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors shadow-sm flex items-center gap-2"
                  >
                    {isProcessingSetup ? "Processing..." : "Proceed"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SHOW APPROVED / DENIED POP-UP MODAL (Regent & Vice Regent)                */}
      {/* ========================================================================= */}
      {showApprovedDeniedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 text-zinc-950">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-6xl max-h-[88vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Header with Title, Round Switcher Pills, Search Filter, and Close */}
            <div className="px-6 py-3.5 bg-zinc-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 flex-shrink-0 border-b border-zinc-800">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-lg font-mono font-bold tracking-wide flex items-center gap-2">
                  <span>Candidate Evaluation</span>
                  <span className="text-[11px] font-sans font-semibold px-2 py-0.5 rounded-full bg-red-900/70 text-red-200 border border-red-700/60">
                    Regent &amp; VR Overrides
                  </span>
                </h3>

                {/* Round Switcher Tabs (For All Rounds) */}
                <div className="flex items-center gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-800">
                  {[
                    { sec: 1, rnd: 1, label: "S1 R1" },
                    { sec: 1, rnd: 2, label: "S1 R2" },
                    { sec: 2, rnd: 1, label: "S2 R1" },
                    { sec: 2, rnd: 2, label: "S2 R2" },
                    { sec: 2, rnd: 3, label: "S2 R3" },
                  ].map((r) => {
                    const isSelected = modalSection === r.sec && modalRound === r.rnd;
                    const isLiveRound = votingSection === r.sec && votingRound === r.rnd;
                    return (
                      <button
                        key={`${r.sec}-${r.rnd}`}
                        type="button"
                        onClick={() => handleSelectModalRound(r.sec, r.rnd)}
                        className={`relative px-2.5 py-1 text-xs font-mono font-bold rounded transition-all cursor-pointer flex items-center gap-1.5 ${isSelected
                          ? "bg-amber-400 text-zinc-950 shadow-sm"
                          : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                          }`}
                      >
                        {isLiveRound && (
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-zinc-950" : "bg-green-400 animate-pulse"
                              }`}
                            title="Live Active Round"
                          />
                        )}
                        <span>{r.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Search filter & Close */}
              <div className="flex items-center gap-2.5">
                <div className="relative">
                  <input
                    type="text"
                    value={modalSearchQuery}
                    onChange={(e) => setModalSearchQuery(e.target.value)}
                    placeholder="Filter candidates..."
                    className="bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-400 w-44 sm:w-52 font-mono"
                  />
                  {modalSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setModalSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowApprovedDeniedModal(false)}
                  className="text-zinc-400 hover:text-white font-bold text-2xl leading-none cursor-pointer px-1"
                  title="Close Modal"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Calculation & Threshold Top Bar */}
            <div className="bg-zinc-950 text-zinc-200 px-6 py-3 border-b border-zinc-800 flex flex-col gap-2 flex-shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-zinc-900/90 p-2.5 rounded-xl border border-zinc-800">
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-400 animate-pulse" />
                  <span className="font-mono font-bold text-xs text-white uppercase tracking-wider">
                    S{modalSection} R{modalRound} Threshold Rule:
                  </span>
                </div>
                <div className="text-xs font-mono font-medium text-amber-300 bg-zinc-950 px-3 py-1 rounded-lg border border-zinc-800 leading-relaxed whitespace-normal break-words flex-1 sm:text-right">
                  {modalThresholdDescription}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between text-[11px] text-zinc-400 border-t border-zinc-800/80 pt-2 gap-2 font-mono">
                <div className="flex items-center gap-2">
                  <span className="text-zinc-300 font-bold">Manual Overrides:</span>
                  <span className="text-zinc-400 hidden sm:inline">
                    Use <strong className="text-amber-300">&larr;</strong> and <strong className="text-amber-300">&rarr;</strong> buttons on each card to force status. Overrides are locked against recalculations.
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span>
                    <strong className="text-zinc-300">Quota:</strong>{" "}
                    <span className="text-white font-bold">
                      {modalSection === 1 ? inviteTargetCount || "None" : bidTargetCount || "None"}
                    </span>
                  </span>
                  <span>
                    <strong className="text-red-400">Denied: {modalDeniedPnms.length}</strong>
                  </span>
                  <span>
                    <strong className="text-amber-400">In Contest: {modalInContestPnms.length}</strong>
                  </span>
                  <span>
                    <strong className="text-green-400">Approved: {modalApprovedPnms.length}</strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Candidates 3-Column Lists */}
            {isLoadingModalRound ? (
              <div className="flex-1 flex items-center justify-center py-20 bg-zinc-50">
                <div className="flex flex-col items-center gap-2 text-zinc-500">
                  <div className="w-8 h-8 border-3 border-zinc-300 border-t-zinc-800 rounded-full animate-spin" />
                  <span className="text-xs font-mono">Loading round evaluations...</span>
                </div>
              </div>
            ) : (
              <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-y-auto flex-1 bg-zinc-50">
                {/* Left Column: Denied (Red Theme) */}
                <div className="bg-red-50/70 border-2 border-red-200 rounded-xl p-4 flex flex-col gap-3 shadow-xs">
                  <div className="flex justify-between items-center border-b border-red-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-red-600" />
                      <h4 className="font-bold text-red-900 text-base">Denied</h4>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-red-200 text-red-900 rounded-full">
                      {modalDeniedPnms.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] pr-1">
                    {modalDeniedPnms.length === 0 ? (
                      <p className="text-xs text-red-600/80 italic py-6 text-center">
                        No candidates marked as denied.
                      </p>
                    ) : (
                      modalDeniedPnms.map((pnm) => {
                        const counts = modalActiveCounts[pnm.student_id];
                        const pos = counts?.positive ?? 0;
                        const neg = counts?.negative ?? 0;
                        const abst = counts?.abstain ?? 0;
                        const ynTotal = pos + neg;
                        const allTotal = pos + neg + abst;
                        const ynPct = ynTotal > 0 ? ((pos * 100) / ynTotal).toFixed(1) + "%" : "N/A";
                        const atPct = allTotal > 0 ? ((abst * 100) / allTotal).toFixed(1) + "%" : "0.0%";

                        return (
                          <div
                            key={pnm.student_id}
                            className="bg-white border border-red-200 rounded-lg p-2.5 flex items-center gap-2.5 shadow-xs hover:border-red-400 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-red-100 border border-red-300 overflow-hidden flex-shrink-0 flex items-center justify-center" title={pnm.full_name}>
                              {pnm.headshot_url ? (
                                <img
                                  src={pnm.headshot_url}
                                  alt={pnm.full_name}
                                  title={pnm.full_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-bold text-red-700 text-xs" title={pnm.full_name}>
                                  {pnm.full_name.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div className="truncate min-w-0 flex-1" title={pnm.full_name}>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-sm text-zinc-900 truncate block" title={pnm.full_name}>
                                  {pnm.full_name}
                                </span>
                                {counts?.is_overridden && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 flex-shrink-0 tracking-wider">
                                    FORCED
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-500 truncate block font-mono">
                                {pnm.email || "No email on file"}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 ml-auto flex-shrink-0 font-mono">
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-900 border border-red-200">
                                Y/N: {ynPct}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-500">
                                A/T: {atPct}
                              </span>
                            </div>

                            {/* Regent / VR Stacked Force Buttons */}
                            {isStrictRegent && (
                              <div className="flex flex-col gap-1 ml-1 flex-shrink-0">
                                {/* Top Button: Left Arrow (Disabled in Denied) */}
                                <button
                                  type="button"
                                  disabled
                                  className="w-6 h-5 rounded flex items-center justify-center text-zinc-300 bg-zinc-100 border border-zinc-200 opacity-40 cursor-not-allowed"
                                  title="Already in Denied (leftmost status)"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>

                                {/* Bottom Button: Right Arrow (Move to In Contest, Shift to Approve) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetStatus = e.shiftKey ? "approved" : "in_contest";
                                    handleForceStatus(pnm.student_id, targetStatus);
                                  }}
                                  className="w-6 h-5 rounded flex items-center justify-center text-amber-800 bg-amber-100 hover:bg-amber-200 active:scale-95 border border-amber-300 hover:border-amber-400 shadow-2xs transition-all cursor-pointer"
                                  title="Move Right to In Contest (Hold Shift to jump to Approved)"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Middle Column: In Contest (Amber Theme) */}
                <div className="bg-amber-50/70 border-2 border-amber-200 rounded-xl p-4 flex flex-col gap-3 shadow-xs">
                  <div className="flex justify-between items-center border-b border-amber-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-amber-500" />
                      <h4 className="font-bold text-amber-900 text-base">In Contest</h4>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full">
                      {modalInContestPnms.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] pr-1">
                    {modalInContestPnms.length === 0 ? (
                      <p className="text-xs text-amber-700/80 italic py-6 text-center">
                        No candidates currently in contest.
                      </p>
                    ) : (
                      modalInContestPnms.map((pnm) => {
                        const counts = modalActiveCounts[pnm.student_id];
                        const pos = counts?.positive ?? 0;
                        const neg = counts?.negative ?? 0;
                        const abst = counts?.abstain ?? 0;
                        const ynTotal = pos + neg;
                        const allTotal = pos + neg + abst;
                        const ynPct = ynTotal > 0 ? ((pos * 100) / ynTotal).toFixed(1) + "%" : "N/A";
                        const atPct = allTotal > 0 ? ((abst * 100) / allTotal).toFixed(1) + "%" : "0.0%";

                        return (
                          <div
                            key={pnm.student_id}
                            className="bg-white border border-amber-200 rounded-lg p-2.5 flex items-center gap-2.5 shadow-xs hover:border-amber-400 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-300 overflow-hidden flex-shrink-0 flex items-center justify-center" title={pnm.full_name}>
                              {pnm.headshot_url ? (
                                <img
                                  src={pnm.headshot_url}
                                  alt={pnm.full_name}
                                  title={pnm.full_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-bold text-amber-800 text-xs" title={pnm.full_name}>
                                  {pnm.full_name.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div className="truncate min-w-0 flex-1" title={pnm.full_name}>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-sm text-zinc-900 truncate block" title={pnm.full_name}>
                                  {pnm.full_name}
                                </span>
                                {counts?.is_overridden && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 flex-shrink-0 tracking-wider">
                                    FORCED
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-500 truncate block font-mono">
                                {pnm.email || "No email on file"}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 ml-auto flex-shrink-0 font-mono">
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-200">
                                Y/N: {ynPct}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-500">
                                A/T: {atPct}
                              </span>
                            </div>

                            {/* Regent / VR Stacked Force Buttons */}
                            {isStrictRegent && (
                              <div className="flex flex-col gap-1 ml-1 flex-shrink-0">
                                {/* Top Button: Left Arrow (Move to Denied) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleForceStatus(pnm.student_id, "denied");
                                  }}
                                  className="w-6 h-5 rounded flex items-center justify-center text-red-800 bg-red-100 hover:bg-red-200 active:scale-95 border border-red-300 hover:border-red-400 shadow-2xs transition-all cursor-pointer"
                                  title="Move Left to Denied"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>

                                {/* Bottom Button: Right Arrow (Move to Approved) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleForceStatus(pnm.student_id, "approved");
                                  }}
                                  className="w-6 h-5 rounded flex items-center justify-center text-green-800 bg-green-100 hover:bg-green-200 active:scale-95 border border-green-300 hover:border-green-400 shadow-2xs transition-all cursor-pointer"
                                  title="Move Right to Approved"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Right Column: Approved (Green Theme) */}
                <div className="bg-green-50/70 border-2 border-green-200 rounded-xl p-4 flex flex-col gap-3 shadow-xs">
                  <div className="flex justify-between items-center border-b border-green-200 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-green-600" />
                      <h4 className="font-bold text-green-900 text-base">Approved</h4>
                    </div>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 bg-green-200 text-green-900 rounded-full">
                      {modalApprovedPnms.length}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[420px] pr-1">
                    {modalApprovedPnms.length === 0 ? (
                      <p className="text-xs text-green-700/80 italic py-6 text-center">
                        No candidates marked as approved in this round.
                      </p>
                    ) : (
                      modalApprovedPnms.map((pnm) => {
                        const counts = modalActiveCounts[pnm.student_id];
                        const pos = counts?.positive ?? 0;
                        const neg = counts?.negative ?? 0;
                        const abst = counts?.abstain ?? 0;
                        const ynTotal = pos + neg;
                        const allTotal = pos + neg + abst;
                        const ynPct = ynTotal > 0 ? ((pos * 100) / ynTotal).toFixed(1) + "%" : "N/A";
                        const atPct = allTotal > 0 ? ((abst * 100) / allTotal).toFixed(1) + "%" : "0.0%";

                        return (
                          <div
                            key={pnm.student_id}
                            className="bg-white border border-green-200 rounded-lg p-2.5 flex items-center gap-2.5 shadow-xs hover:border-green-400 transition-colors"
                          >
                            <div className="w-10 h-10 rounded-full bg-green-100 border border-green-300 overflow-hidden flex-shrink-0 flex items-center justify-center" title={pnm.full_name}>
                              {pnm.headshot_url ? (
                                <img
                                  src={pnm.headshot_url}
                                  alt={pnm.full_name}
                                  title={pnm.full_name}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="font-bold text-green-700 text-xs" title={pnm.full_name}>
                                  {pnm.full_name.charAt(0)}
                                </span>
                              )}
                            </div>
                            <div className="truncate min-w-0 flex-1" title={pnm.full_name}>
                              <div className="flex items-center gap-1.5 truncate">
                                <span className="font-bold text-sm text-zinc-900 truncate block" title={pnm.full_name}>
                                  {pnm.full_name}
                                </span>
                                {counts?.is_overridden && (
                                  <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-purple-100 text-purple-800 border border-purple-200 flex-shrink-0 tracking-wider">
                                    FORCED
                                  </span>
                                )}
                              </div>
                              <span className="text-[11px] text-zinc-500 truncate block font-mono">
                                {pnm.email || "No email on file"}
                              </span>
                            </div>
                            <div className="flex flex-col items-end gap-0.5 ml-auto flex-shrink-0 font-mono">
                              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-900 border border-green-200">
                                Y/N: {ynPct}
                              </span>
                              <span className="text-[10px] font-medium text-zinc-500">
                                A/T: {atPct}
                              </span>
                            </div>

                            {/* Regent / VR Stacked Force Buttons */}
                            {isStrictRegent && (
                              <div className="flex flex-col gap-1 ml-1 flex-shrink-0">
                                {/* Top Button: Left Arrow (Move to In Contest, Shift to Deny) */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const targetStatus = e.shiftKey ? "denied" : "in_contest";
                                    handleForceStatus(pnm.student_id, targetStatus);
                                  }}
                                  className="w-6 h-5 rounded flex items-center justify-center text-amber-800 bg-amber-100 hover:bg-amber-200 active:scale-95 border border-amber-300 hover:border-amber-400 shadow-2xs transition-all cursor-pointer"
                                  title="Move Left to In Contest (Hold Shift to jump straight to Denied)"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>

                                {/* Bottom Button: Right Arrow (Disabled in Approved) */}
                                <button
                                  type="button"
                                  disabled
                                  className="w-6 h-5 rounded flex items-center justify-center text-zinc-300 bg-zinc-100 border border-zinc-200 opacity-40 cursor-not-allowed"
                                  title="Already in Approved (rightmost status)"
                                >
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="px-6 py-3.5 bg-white border-t border-zinc-200 flex justify-end">
              <button
                onClick={() => setShowApprovedDeniedModal(false)}
                className="bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SHOW INVITES / SHOW BIDS SUMMARY MODAL (FOR OFFICERS)                     */}
      {/* ========================================================================= */}
      {showInvitesBidsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex justify-center items-center z-50 p-4 text-zinc-950">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
              <div>
                <h3 className="text-lg font-mono font-bold tracking-wide">
                  {votingSection === 1 ? "Invited Candidates" : "Bid Candidates"} Summary
                </h3>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Target Quota:{" "}
                  <span className="font-bold text-white">
                    {votingSection === 1 ? inviteTargetCount || "Not set" : bidTargetCount || "Not set"}
                  </span>{" "}
                  | Total Approved in Section {votingSection}:{" "}
                  <span className="font-bold text-green-400">{sectionApprovedPnms.length}</span>
                </p>
              </div>
              <button
                onClick={() => setShowInvitesBidsModal(false)}
                className="text-zinc-400 hover:text-white font-bold text-2xl leading-none"
              >
                &times;
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-3">
              {sectionApprovedPnms.length === 0 ? (
                <div className="text-center py-12 text-zinc-500 text-sm">
                  No candidates have been approved for {votingSection === 1 ? "invites" : "bids"} yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sectionApprovedPnms.map((pnm, idx) => (
                    <div
                      key={pnm.student_id}
                      className="bg-zinc-50 border border-zinc-200 rounded-xl p-3 flex items-center gap-3 shadow-xs"
                    >
                      <span className="text-xs font-mono font-bold text-zinc-400 w-5">#{idx + 1}</span>
                      <div className="w-12 h-12 rounded-full bg-zinc-200 border border-zinc-300 overflow-hidden flex-shrink-0 flex items-center justify-center" title={pnm.full_name}>
                        {pnm.headshot_url ? (
                          <img
                            src={pnm.headshot_url}
                            alt={pnm.full_name}
                            title={pnm.full_name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <span className="font-bold text-zinc-700 text-sm" title={pnm.full_name}>{pnm.full_name.charAt(0)}</span>
                        )}
                      </div>
                      <div className="truncate min-w-0 flex-1" title={pnm.full_name}>
                        <h5 className="font-bold text-sm text-zinc-900 truncate" title={pnm.full_name}>{pnm.full_name}</h5>
                        <p className="text-xs text-zinc-500 truncate" title={pnm.major || "Undeclared"}>{pnm.major || "Undeclared"}</p>
                        <p className="text-[10px] font-mono text-zinc-400">{pnm.year || "Year Not Specified"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3.5 bg-zinc-50 border-t border-zinc-200 flex justify-end">
              <button
                onClick={() => setShowInvitesBidsModal(false)}
                className="bg-zinc-800 hover:bg-zinc-900 text-white px-5 py-1.5 rounded-lg text-xs font-bold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAILS POPUP MODAL                                                       */}
      {/* ========================================================================= */}
      {selectedPnmForDetails && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-4">
          <div className="flex gap-4 max-w-7xl w-full h-[90vh] items-stretch justify-center">
            <div className="bg-white rounded-xl shadow-2xl border border-zinc-200 flex-1 flex flex-col overflow-hidden">
              <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
                <h2 className="text-xl font-mono font-bold tracking-wide">PNM DETAILS & DELIBERATION</h2>
                <button
                  onClick={handleCloseDetails}
                  className="text-zinc-400 hover:text-white font-bold text-2xl transition-colors leading-none"
                >
                  &times;
                </button>
              </div>

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
                      <h2 className="text-3xl font-bold tracking-tight text-zinc-950 truncate" title={selectedPnmForDetails.full_name}>
                        {selectedPnmForDetails.full_name}
                      </h2>
                    )}
                  </div>

                  <div className="relative aspect-[3/4] w-full bg-zinc-100 rounded-lg border border-zinc-300 overflow-hidden flex items-center justify-center" title={selectedPnmForDetails.full_name}>
                    {selectedPnmForDetails.headshot_url ? (
                      <img
                        src={selectedPnmForDetails.headshot_url}
                        alt={`${selectedPnmForDetails.full_name} Headshot`}
                        title={selectedPnmForDetails.full_name}
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
                <div className="md:col-span-2 border-r border-zinc-200 px-6 flex flex-col min-h-0">
                  <div className="flex justify-between items-center mb-3 border-b border-zinc-100 pb-1 flex-shrink-0">
                    <h4 className="text-lg font-bold text-zinc-800">Feedback Notes</h4>
                    <div className="flex items-center gap-2">
                      {hasViewFeedbackPrivilege && pendingFeedbackPnmIds.has(selectedPnmForDetails.student_id) && (
                        <div className="flex items-center gap-1.5 bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 shadow-2xs">
                          <span className="w-2 h-2 rounded-full bg-purple-600 animate-pulse" />
                          <span>Unread Feedback</span>
                        </div>
                      )}
                      <button
                        onClick={() => setIsSubmittingFeedback(true)}
                        className="px-2.5 py-1 bg-red-700 hover:bg-red-800 text-white rounded text-xs font-semibold shadow-sm transition-all"
                      >
                        Submit Feedback
                      </button>
                      <button
                        onClick={() => setIsViewingFeedback(!isViewingFeedback)}
                        className={`px-2.5 py-1 text-white rounded text-xs font-semibold shadow-sm transition-all ${isViewingFeedback ? "bg-zinc-800 hover:bg-zinc-900" : "bg-zinc-700 hover:bg-zinc-800"
                          }`}
                      >
                        {isViewingFeedback ? "Hide Feedback" : "View Feedback"}
                      </button>
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

                      {/* Application Comment (Placed directly below feedback, moves dynamically) */}
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

              <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center flex-shrink-0">
                <div>
                  {canEdit && (
                    <>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleSaveChanges(selectedPnmForDetails)}
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
                          onClick={() => startEditing(selectedPnmForDetails)}
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
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* FEEDBACK FEED DRAWER (FOR OFFICERS & MEMBERS)                             */}
      {/* ========================================================================= */}
      {isViewingFeedback && (
        <div className="fixed inset-y-0 right-0 z-50 w-80 md:w-96 bg-white shadow-2xl border-l border-zinc-200 flex flex-col animate-in slide-in-from-right duration-300 text-zinc-950">
          <div className="px-6 py-4 bg-zinc-900 text-white flex justify-between items-center flex-shrink-0">
            <h3 className="text-md font-mono font-bold tracking-wide">
              {hasViewFeedbackPrivilege ? "FEEDBACK FEED" : "YOUR SUBMITTED FEEDBACK"}
            </h3>
            <button
              onClick={() => setIsViewingFeedback(false)}
              className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none cursor-pointer"
            >
              &times;
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 min-h-0">
            {visibleFeedbackList.length === 0 ? (
              <div className="text-center py-10 text-zinc-400 font-medium text-sm">
                {hasViewFeedbackPrivilege
                  ? "No feedback submitted yet."
                  : "You haven't submitted any feedback for this candidate yet."}
              </div>
            ) : (
              visibleFeedbackList.map((fb) => (
                <div key={fb.id} className="border-b border-zinc-100 pb-3 last:border-b-0 flex flex-col gap-1.5">
                  <div className="flex justify-between items-center gap-2">
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
                    {hasViewFeedbackPrivilege ? (
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
                    ) : (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            fb.is_approved === 1
                              ? "bg-green-100 text-green-700 border border-green-200"
                              : fb.is_approved === -1
                              ? "bg-red-100 text-red-700 border border-red-200"
                              : "bg-amber-100 text-amber-700 border border-amber-200"
                          }`}
                        >
                          {fb.is_approved === 1 ? "Approved" : fb.is_approved === -1 ? "Declined" : "Pending"}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteFeedback(fb.id)}
                          className="px-2 py-1 text-xs font-semibold text-red-600 hover:text-white border border-red-200 hover:border-red-600 hover:bg-red-600 rounded transition-colors flex items-center gap-1 cursor-pointer"
                          title="Delete your feedback"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
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
                className="text-zinc-400 hover:text-white font-bold text-xl transition-colors leading-none"
              >
                &times;
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <div>
                <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">
                  Candidate Name
                </span>
                <p className="text-lg font-bold text-zinc-900 mt-0.5" title={isPresentationRound ? activePnm?.full_name : selectedPnmForDetails?.full_name}>
                  {isPresentationRound ? activePnm?.full_name : selectedPnmForDetails?.full_name}
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
                        className={`py-2 px-3 rounded text-sm font-semibold border transition-all ${active
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
  );
}
