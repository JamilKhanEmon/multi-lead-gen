"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchLeads,
  fetchRuns,
  cancelResearchRun,
  Lead,
  ResearchRun,
  getStoredUser,
  hasPermission, deleteLead, clearAllLeads, submitLeadFeedback, updateLeadDetails, dispatchStaggeredOutreach,
  AuthUser,
  getApiBase,
} from "@/lib/api";
import {
  Users,
  Filter,
  ArrowUpRight,
  Search,
  Phone,
  Mail,
  Globe,
  MapPin,
  Layers,
  Loader2,
  CheckCircle2,
  Compass,
  XCircle,
  FileSpreadsheet,
  FileJson,
  Zap,
  X,
  Flame,
  MessageSquare,
  Clock,
  ShieldCheck,
  Send,
} from "lucide-react";

type PipelineStage = "ALL" | "REVIEW" | "READY" | "SENT" | "HOT_DEALS" | "NO_EMAIL";

export default function LeadsPipelinePage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("ALL");
  const [activeTier, setActiveTier] = useState<string>("ALL");
  const [fitTierFilter, setFitTierFilter] = useState<string>("ALL");
  const [pipelineStage, setPipelineStage] = useState<PipelineStage>("ALL");
  const [websiteFilter, setWebsiteFilter] = useState<"ALL" | "WITH_WEBSITE" | "NO_WEBSITE">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeRunningRun, setActiveRunningRun] = useState<ResearchRun | null>(null);
  const [selectedLeads, setSelectedLeads] = useState<string[]>([]);
  const [isDispatching, setIsDispatching] = useState(false);
  const [dispatchPace, setDispatchPace] = useState<"SAFE" | "WARMUP" | "QUICK">("SAFE");
  const [showDispatchModal, setShowDispatchModal] = useState(false);
  const [dispatchResult, setDispatchResult] = useState<{
    dispatched_count: number;
    mode: string;
    message: string;
    results: Array<{ lead_id: string; company: string; email: string; status: string; note?: string }>;
  } | null>(null);

  const loadLeads = (tier?: string, runId?: string, fitTier?: string) => {
    setLoading(true);
    fetchLeads(tier, runId, undefined, undefined, fitTier)
      .then((data) => setLeads(data))
      .catch((e) => console.error("Error loading leads:", e))
      .finally(() => setLoading(false));
  };

  const toggleSelect = (id: string) => {
    setSelectedLeads(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleTriggerStaggeredOutreach = async (targetIds?: string[]) => {
    const idsToSend = targetIds && targetIds.length > 0 ? targetIds : selectedLeads;
    setIsDispatching(true);
    setShowDispatchModal(true);
    setDispatchResult(null);

    let minDelay = 45;
    let maxDelay = 90;
    if (dispatchPace === "WARMUP") {
      minDelay = 60;
      maxDelay = 120;
    } else if (dispatchPace === "QUICK") {
      minDelay = 15;
      maxDelay = 30;
    }

    try {
      const res = await dispatchStaggeredOutreach({
        lead_ids: idsToSend.length > 0 ? idsToSend : undefined,
        min_delay_sec: minDelay,
        max_delay_sec: maxDelay,
      });
      setDispatchResult(res);
      setSelectedLeads([]);
      loadLeads(activeTier, selectedRunId);
    } catch (err: any) {
      alert("Dispatch failed: " + (err.message || "Unknown error"));
      setShowDispatchModal(false);
    } finally {
      setIsDispatching(false);
    }
  };

  useEffect(() => {
    setCurrentUser(getStoredUser());

    let initialRunId = "ALL";
    let initialPipeline: PipelineStage = "ALL";

    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlRunId = params.get("run_id");
      if (urlRunId) {
        initialRunId = urlRunId;
        setSelectedRunId(urlRunId);
      }
      const urlPipeline = params.get("pipeline")?.toUpperCase();
      if (urlPipeline === "REVIEW" || urlPipeline === "NEEDS_REVIEW") {
        initialPipeline = "REVIEW";
      } else if (urlPipeline === "READY" || urlPipeline === "AUTOPILOT" || urlPipeline === "MAIL") {
        initialPipeline = "READY";
      } else if (urlPipeline === "SENT" || urlPipeline === "DISPATCHED") {
        initialPipeline = "SENT";
      } else if (urlPipeline === "HOT_DEALS" || urlPipeline === "HOT") {
        initialPipeline = "HOT_DEALS";
      } else if (urlPipeline === "NO_EMAIL") {
        initialPipeline = "NO_EMAIL";
      }
      setPipelineStage(initialPipeline);
    }

    loadLeads(activeTier, initialRunId);

    fetchRuns()
      .then((runList) => {
        setRuns(runList);
        const running = runList.find((r) => r.status === "RUNNING");
        if (running) setActiveRunningRun(running);
      })
      .catch((e) => console.debug("Error loading runs:", e));
  }, []);

  useEffect(() => {
    if (!activeRunningRun) return;

    const interval = setInterval(async () => {
      try {
        const updatedList = await fetchRuns();
        setRuns(updatedList);
        const stillRunning = updatedList.find(
          (r) => r.id === activeRunningRun.id && r.status === "RUNNING"
        );
        if (stillRunning) {
          setActiveRunningRun(stillRunning);
          loadLeads(activeTier, selectedRunId);
        } else {
          setActiveRunningRun(null);
          loadLeads(activeTier, selectedRunId);
          clearInterval(interval);
        }
      } catch (e) {
        console.debug("Poll error in leads page:", e);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRunningRun, activeTier, selectedRunId]);

  const handleRunChange = (runId: string) => {
    setSelectedRunId(runId);
    loadLeads(activeTier, runId);
  };

  const handleQuickApprove = async (leadId: string) => {
    try {
      await submitLeadFeedback(leadId, "APPROVED");
      loadLeads(activeTier, selectedRunId);
    } catch (err: any) {
      alert("Failed to approve lead: " + (err.message || "Unknown error"));
    }
  };

  const GENERIC_PLATFORMS = ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "twitter.com", "google.com"];

  const hasEmailForOutreach = (l: Lead) => {
    return Boolean(l.email && l.email.trim() && l.email_status !== "NOT_FOUND");
  };

  const isNeedsReview = (l: Lead) => {
    return (
      l.email_status === "NEEDS_REVIEW" ||
      l.outreach_status === "NEEDS_REVIEW" ||
      l.tier === "Review Needed" ||
      l.tier === "Rejected" ||
      l.is_qualified === false
    );
  };

  const isSentMail = (l: Lead) => {
    return l.outreach_status === "SENT" || l.outreach_status === "FOLLOWUP_SENT";
  };

  const isHotDeal = (l: Lead) => {
    return l.deal_status === "HOT_LEAD" || l.outreach_status === "REPLIED_HOT";
  };

  const isReadyForMail = (l: Lead) => {
    return (
      hasEmailForOutreach(l) &&
      !isNeedsReview(l) &&
      !isHotDeal(l) &&
      !isSentMail(l)
    );
  };

  const isNoEmailLead = (l: Lead) => {
    return !hasEmailForOutreach(l);
  };

  const counts = useMemo(() => {
    const total = leads.length;
    const reviewNeeded = leads.filter(isNeedsReview).length;
    const readyForMail = leads.filter(isReadyForMail).length;
    const sentMail = leads.filter(isSentMail).length;
    const hotDeals = leads.filter(isHotDeal).length;
    const noEmail = leads.filter(isNoEmailLead).length;
    return { total, reviewNeeded, readyForMail, sentMail, hotDeals, noEmail };
  }, [leads]);

  const filtered = useMemo(() => {
    return leads.filter((lead) => {
      const bizName = (lead.business_name || "").toLowerCase().trim();
      if (GENERIC_PLATFORMS.some((p) => bizName.includes(p)) || bizName === "facebook" || bizName === "instagram") {
        return false;
      }
      const cleanDomain = lead.domain && !GENERIC_PLATFORMS.some((p) => lead.domain?.toLowerCase().includes(p)) ? lead.domain : null;

      if (pipelineStage === "REVIEW" && !isNeedsReview(lead)) return false;
      if (pipelineStage === "READY" && !isReadyForMail(lead)) return false;
      if (pipelineStage === "SENT" && !isSentMail(lead)) return false;
      if (pipelineStage === "HOT_DEALS" && !isHotDeal(lead)) return false;
      if (pipelineStage === "NO_EMAIL" && hasEmailForOutreach(lead)) return false;

      if (activeTier !== "ALL" && lead.tier !== activeTier) return false;

      if (fitTierFilter !== "ALL" && (lead.fit_tier || "HOT") !== fitTierFilter) return false;

      if (selectedRunId !== "ALL" && lead.run_id !== selectedRunId) return false;

      if (websiteFilter === "WITH_WEBSITE" && !cleanDomain) return false;
      if (websiteFilter === "NO_WEBSITE" && !!cleanDomain) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = lead.business_name && lead.business_name.toLowerCase().includes(q);
        const matchGap = lead.primary_gap_summary && lead.primary_gap_summary.toLowerCase().includes(q);
        const matchEvidence = lead.why_they_need_us && lead.why_they_need_us.toLowerCase().includes(q);
        const matchSvc = lead.matched_service && lead.matched_service.toLowerCase().includes(q);
        const matchAddr = lead.address && lead.address.toLowerCase().includes(q);
        const matchPhone = lead.phone && lead.phone.toLowerCase().includes(q);
        const matchEmail = lead.email && lead.email.toLowerCase().includes(q);
        if (!matchName && !matchGap && !matchEvidence && !matchSvc && !matchAddr && !matchPhone && !matchEmail) {
          return false;
        }
      }

      return true;
    });
  }, [leads, pipelineStage, activeTier, fitTierFilter, selectedRunId, websiteFilter, searchTerm]);

  const exportToCsv = (items: Lead[], customName?: string) => {
    if (!items || items.length === 0) {
      alert("No leads available to export!");
      return;
    }

    const headers = [
      "Company Name",
      "Domain",
      "Website URL",
      "Phone Number",
      "WhatsApp Link",
      "Email Address",
      "Email Status",
      "Outreach Status",
      "Cadence Step",
      "Deal Status",
      "Primary Solvable Gap",
      "Why They Need Us (Live Evidence)",
      "What They Need",
      "Matched Service",
      "Discovery Call Script (30-Sec Opener)",
      "Fit Gate Tier",
      "Lead Score",
      "Qualification Tier",
      "Business Type",
      "Contact Person",
      "Address",
      "Google Maps URL",
      "Created Date",
      "Lead ID",
    ];

    const escapeCell = (val: any) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = items.map((l) => {
      const cleanPhone = l.phone ? l.phone.replace(/[^0-9]/g, "") : "";
      const waUrl = cleanPhone ? `https://wa.me/${cleanPhone}` : "";
      return [
        escapeCell(l.business_name || ""),
        escapeCell(l.domain || ""),
        escapeCell(l.domain ? `https://${l.domain}` : ""),
        escapeCell(l.phone || ""),
        escapeCell(waUrl),
        escapeCell(l.email || ""),
        escapeCell(l.email_status || ""),
        escapeCell(l.outreach_status || "READY_FOR_OUTREACH"),
        escapeCell(l.followup_step || 1),
        escapeCell(l.deal_status || "COLD"),
        escapeCell(l.primary_gap_summary || ""),
        escapeCell(l.why_they_need_us || l.primary_gap_summary || ""),
        escapeCell(l.what_they_need || "Modern lead capture and CRM pipeline"),
        escapeCell(l.matched_service || "Web Design & Development"),
        escapeCell(l.discovery_call_script || ""),
        escapeCell(l.fit_tier || "HOT"),
        escapeCell(l.final_score !== undefined ? Number(l.final_score).toFixed(1) : ""),
        escapeCell(l.tier || ""),
        escapeCell(l.business_type || ""),
        escapeCell(l.contact_person || ""),
        escapeCell(l.address || ""),
        escapeCell(l.google_maps_url || ""),
        escapeCell(l.created_at ? new Date(l.created_at).toLocaleString() : ""),
        escapeCell(l.id || ""),
      ];
    });

    const csvContent =
      "\ufeff" + [headers.map(escapeCell).join(","), ...rows.map((r) => r.join(","))].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", customName || `master_leads_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const exportToJson = async (items: Lead[], customName?: string) => {
    try {
      const response = await fetch(`${getApiBase()}/leads/export/json`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const dateStr = new Date().toISOString().slice(0, 10);
        link.setAttribute("href", url);
        link.setAttribute("download", customName || `leadgen_full_db_export_${dateStr}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
    } catch (e) {
      console.warn("Backend JSON export API failed, using client data fallback", e);
    }

    if (!items || items.length === 0) {
      alert("No leads available to export!");
      return;
    }
    const jsonContent = JSON.stringify(items, null, 2);
    const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute("href", url);
    link.setAttribute("download", customName || `master_leads_${dateStr}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getWhatsAppUrl = (phone?: string | null, name?: string | null) => {
    if (!phone) return null;
    const cleanPhone = phone.replace(/[^0-9]/g, "");
    if (!cleanPhone) return null;
    const text = encodeURIComponent(
      `Hello ${name || 'there'}, I am reaching out regarding your business. We noticed solvable gaps in your online visibility and would love to share a free audit.`
    );
    return `https://wa.me/${cleanPhone}?text=${text}`;
  };

  const renderOutreachBadge = (lead: Lead) => {
    if (lead.deal_status === "HOT_LEAD" || lead.outreach_status === "REPLIED_HOT") {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30">
          <Flame className="w-3 h-3 text-rose-400 fill-rose-400" /> Hot Deal / Positive Reply
        </span>
      );
    }
    if (lead.outreach_status === "FOLLOWUP_SENT") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
          <Clock className="w-2.5 h-2.5 text-cyan-400" /> Step 2: Follow-up Sent
        </span>
      );
    }
    if (lead.outreach_status === "SENT") {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
          <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" /> Step 1: Pitch Sent
        </span>
      );
    }
    if (hasEmailForOutreach(lead)) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-sky-500/15 text-sky-300 border border-sky-500/30">
          <Zap className="w-3 h-3 text-sky-400 fill-sky-400" /> Auto Cold Mail Active
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
        <Compass className="w-2.5 h-2.5 text-slate-400" /> Direct Phone Discovery
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">

      {activeRunningRun && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/80 via-slate-900 to-indigo-950/80 border border-sky-500/40 shadow-xl shadow-sky-500/10 space-y-2.5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
              <span>
                Active Discovery in Progress:{" "}
                <strong className="text-sky-300">{activeRunningRun.industry}</strong> in{" "}
                <strong className="text-emerald-300">{activeRunningRun.location}</strong>
              </span>
            </span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sky-400 font-bold bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded-full">
                {activeRunningRun.discovered_count > 0
                  ? `${Math.min(
                      99,
                      Math.round(
                        ((activeRunningRun.qualified_count + activeRunningRun.rejected_count) /
                          activeRunningRun.discovered_count) *
                          100
                      )
                    )}% Completed`
                  : "Discovering Entities..."}
              </span>
              <button
                type="button"
                onClick={async () => {
                  if (confirm("Are you sure you want to stop and cancel this research run?")) {
                    await cancelResearchRun(activeRunningRun.id);
                    setActiveRunningRun(null);
                    const updatedList = await fetchRuns();
                    setRuns(updatedList);
                  }
                }}
                className="text-[11px] font-semibold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 px-2 py-0.5 rounded-lg transition flex items-center gap-1 cursor-pointer"
              >
                <XCircle className="w-3 h-3" /> Cancel
              </button>
            </div>
          </div>
          <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800 p-0.5">
            <div
              className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-500 shadow-sm shadow-sky-500/50"
              style={{
                width: `${
                  activeRunningRun.discovered_count > 0
                    ? Math.min(
                        99,
                        Math.round(
                          ((activeRunningRun.qualified_count + activeRunningRun.rejected_count) /
                            activeRunningRun.discovered_count) *
                            100
                        )
                      )
                    : 20
                }%`,
              }}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                Master Leads CRM & Pipeline
              </h1>
              <p className="text-xs sm:text-sm text-slate-400">
                Single unified board for all discovered businesses, automated cold email outreach, 1-click WhatsApp & full dossier intelligence.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {hasPermission(currentUser, "can_export_leads", true) && leads.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => exportToCsv(filtered)}
                className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm shadow-emerald-500/10 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Export CSV ({filtered.length})</span>
              </button>
              <button
                type="button"
                onClick={() => exportToJson(filtered)}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>JSON</span>
              </button>
            </>
          )}

          <Link
            href="/autopilot"
            className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-lg shadow-sky-500/20"
          >
            <Zap className="w-3.5 h-3.5 fill-current" /> Autopilot Controller
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <button
          type="button"
          onClick={() => setPipelineStage("ALL")}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            pipelineStage === "ALL"
              ? "bg-amber-500/10 border-amber-500/40 shadow-lg ring-1 ring-amber-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>1. All Leads</span>
            <Users className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-white font-mono mt-1">{counts.total}</div>
          <div className="text-[11px] text-slate-500 mt-0.5">Discovered Catalog</div>
        </button>

        <button
          type="button"
          onClick={() => setPipelineStage("REVIEW")}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            pipelineStage === "REVIEW"
              ? "bg-amber-500/15 border-amber-500/50 shadow-lg ring-1 ring-amber-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-amber-300">
            <span>2. Needs Review</span>
            <ShieldCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-300 font-mono mt-1">{counts.reviewNeeded}</div>
          <div className="text-[11px] text-amber-400/80 mt-0.5">Human Verification</div>
        </button>

        <button
          type="button"
          onClick={() => setPipelineStage("READY")}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            pipelineStage === "READY"
              ? "bg-sky-500/10 border-sky-500/40 shadow-lg ring-1 ring-sky-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>3. Ready for Mail</span>
            <Zap className="w-4 h-4 text-sky-400 fill-sky-400" />
          </div>
          <div className="text-2xl font-extrabold text-sky-300 font-mono mt-1">{counts.readyForMail}</div>
          <div className="text-[11px] text-sky-500/80 mt-0.5">Dispatch Queue</div>
        </button>

        <button
          type="button"
          onClick={() => setPipelineStage("SENT")}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            pipelineStage === "SENT"
              ? "bg-indigo-500/10 border-indigo-500/40 shadow-lg ring-1 ring-indigo-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>4. Sent & Followup</span>
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl font-extrabold text-indigo-300 font-mono mt-1">{counts.sentMail}</div>
          <div className="text-[11px] text-indigo-400/80 mt-0.5">Outreach Tracker</div>
        </button>

        <button
          type="button"
          onClick={() => setPipelineStage("HOT_DEALS")}
          className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
            pipelineStage === "HOT_DEALS"
              ? "bg-rose-500/10 border-rose-500/40 shadow-lg ring-1 ring-rose-500/30"
              : "bg-slate-900/60 border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>5. Hot Deals CRM</span>
            <Flame className="w-4 h-4 text-rose-400 fill-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-300 font-mono mt-1">{counts.hotDeals}</div>
          <div className="text-[11px] text-rose-500/80 mt-0.5">Manual Closing</div>
        </button>
      </div>

      <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3.5">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-950/80 border border-slate-800 overflow-x-auto">
            <button
              onClick={() => setPipelineStage("ALL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                pipelineStage === "ALL"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Discovered ({counts.total})
            </button>
            <button
              onClick={() => setPipelineStage("REVIEW")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                pipelineStage === "REVIEW"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-amber-400" /> Human Review Queue ({counts.reviewNeeded})
            </button>
            <button
              onClick={() => setPipelineStage("READY")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                pipelineStage === "READY"
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Zap className="w-3.5 h-3.5 text-sky-400 fill-sky-400" /> Ready for Mail ({counts.readyForMail})
            </button>
            <button
              onClick={() => setPipelineStage("SENT")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                pipelineStage === "SENT"
                  ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Send className="w-3.5 h-3.5 text-indigo-400" /> Sent Mail Tracker ({counts.sentMail})
            </button>
            <button
              onClick={() => setPipelineStage("HOT_DEALS")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                pipelineStage === "HOT_DEALS"
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Flame className="w-3.5 h-3.5 text-rose-400 fill-rose-400" /> Hot Deals CRM ({counts.hotDeals})
            </button>
            <button
              onClick={() => setPipelineStage("NO_EMAIL")}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                pipelineStage === "NO_EMAIL"
                  ? "bg-slate-800 text-white shadow-sm font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Phone className="w-3.5 h-3.5 text-slate-400" /> Phone Only ({counts.noEmail})
            </button>
          </div>

          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Search company, gap, address, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-8 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 text-xs cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80 text-xs">
          <div className="flex items-center gap-2 flex-wrap">

            {runs.length > 0 && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
                <Layers className="w-3 h-3 text-sky-400" />
                <span className="text-slate-400">Batch:</span>
                <select
                  value={selectedRunId}
                  onChange={(e) => handleRunChange(e.target.value)}
                  className="bg-transparent text-slate-200 focus:outline-none cursor-pointer max-w-[140px] truncate"
                >
                  <option value="ALL" className="bg-slate-900 text-white">All Batches</option>
                  {runs.map((r) => (
                    <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                      {r.industry} ({r.location})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
              {["ALL", "Strong Potential", "Review Needed", "Rejected"].map((t) => (
                <button
                  key={t}
                  onClick={() => setActiveTier(t)}
                  className={`px-2 py-0.5 rounded transition cursor-pointer ${
                    activeTier === t ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {t === "ALL" ? "All Tiers" : t}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-amber-500/30 text-[11px]">
              <span className="text-[10px] text-amber-400 font-semibold px-1.5 hidden sm:inline">Fit Gate:</span>
              {[
                { id: "ALL", label: "All Fits" },
                { id: "HOT", label: "🔥 HOT" },
                { id: "WARM", label: "⚡ WARM" },
                { id: "DROPPED", label: "⛔ Filtered" },
              ].map((fg) => (
                <button
                  key={fg.id}
                  onClick={() => setFitTierFilter(fg.id)}
                  className={`px-2 py-0.5 rounded transition cursor-pointer font-medium ${
                    fitTierFilter === fg.id
                      ? fg.id === "HOT"
                        ? "bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30"
                        : fg.id === "WARM"
                        ? "bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30"
                        : "bg-slate-800 text-white font-bold"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {fg.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-[11px]">
              <button
                onClick={() => setWebsiteFilter("ALL")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  websiteFilter === "ALL" ? "bg-slate-800 text-white font-medium" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                All Sites
              </button>
              <button
                onClick={() => setWebsiteFilter("WITH_WEBSITE")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  websiteFilter === "WITH_WEBSITE" ? "bg-emerald-500/20 text-emerald-300 font-medium" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                With Website
              </button>
              <button
                onClick={() => setWebsiteFilter("NO_WEBSITE")}
                className={`px-2 py-0.5 rounded transition cursor-pointer ${
                  websiteFilter === "NO_WEBSITE" ? "bg-rose-500/20 text-rose-300 font-medium" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                No Website
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 font-mono">
            Showing <strong className="text-white">{filtered.length}</strong> of {leads.length} leads
          </div>
        </div>
      </div>

      {(pipelineStage === "READY" || selectedLeads.length > 0) && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/80 via-slate-900 to-indigo-950/80 border border-sky-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-lg shadow-sky-500/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 shrink-0">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Human-Paced Cold Outreach Dispatch</span>
                <span className="text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30 px-2 py-0.5 rounded-full font-mono">
                  Anti-Spam Guard Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedLeads.length > 0
                  ? `${selectedLeads.length} lead(s) selected for human-paced email dispatching.`
                  : `${counts.readyForMail} lead(s) in Outreach Queue ready to send with human-like delays.`}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
            <select
              value={dispatchPace}
              onChange={(e) => setDispatchPace(e.target.value as any)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-sky-500 cursor-pointer"
            >
              <option value="SAFE">🛡️ Safe Human Pace (45s - 90s Delay)</option>
              <option value="WARMUP">🔥 Warmup Pace (60s - 120s Delay)</option>
              <option value="QUICK">⚡ Quick Test Pace (15s - 30s Delay)</option>
            </select>

            {filtered.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const readyIds = filtered.filter(isReadyForMail).map((l) => l.id);
                  if (selectedLeads.length === readyIds.length) {
                    setSelectedLeads([]);
                  } else {
                    setSelectedLeads(readyIds);
                  }
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition whitespace-nowrap cursor-pointer"
              >
                {selectedLeads.length > 0 ? "Deselect All" : "Select All Ready Leads"}
              </button>
            )}

            <button
              type="button"
              onClick={() => handleTriggerStaggeredOutreach()}
              disabled={isDispatching}
              className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20 cursor-pointer whitespace-nowrap disabled:opacity-50"
            >
              <Zap className="w-4 h-4 fill-slate-950" />
              <span>
                {selectedLeads.length > 0
                  ? `Send ${selectedLeads.length} Selected Emails (Human Pace)`
                  : `Start Human-Paced Mailing (${counts.readyForMail} Ready)`}
              </span>
            </button>
          </div>
        </div>
      )}

      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
        {loading ? (
          <div className="py-20 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400">Loading master leads from CRM database...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto text-slate-400">
              <Users className="w-6 h-6" />
            </div>
            <p className="text-sm font-semibold text-slate-300">No leads found matching your criteria</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Try adjusting your pipeline stage filter, qualification tier, or search keyword.
            </p>
            <button
              onClick={() => {
                setPipelineStage("ALL");
                setActiveTier("ALL");
                setWebsiteFilter("ALL");
                setSearchTerm("");
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition cursor-pointer"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={filtered.length > 0 && selectedLeads.length === filtered.length}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedLeads(filtered.map((l) => l.id));
                        } else {
                          setSelectedLeads([]);
                        }
                      }}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-4">Business & Online Presence</th>
                  <th className="py-3 px-4">Direct Contact & 1-Click WhatsApp</th>
                  <th className="py-3 px-4">Autonomous Mail Status</th>
                  <th className="py-3 px-4">Score & Tier</th>
                  <th className="py-3 px-4">Primary Solvable Gap</th>
                  <th className="py-3 px-4 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filtered.map((lead) => {
                  const cleanDomain = lead.domain && !GENERIC_PLATFORMS.some((p) => lead.domain?.toLowerCase().includes(p)) ? lead.domain : null;
                  const waUrl = getWhatsAppUrl(lead.phone, lead.business_name);

                  return (
                    <tr
                      key={lead.id}
                      onClick={() => router.push(`/leads/${lead.id}`)}
                      className="hover:bg-slate-800/40 transition cursor-pointer group"
                    >

                      <td className="py-3.5 px-4 w-10" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedLeads.includes(lead.id)}
                          onChange={() => toggleSelect(lead.id)}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-sky-500 focus:ring-sky-500 cursor-pointer"
                        />
                      </td>

                      <td className="py-3.5 px-4 text-xs">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm group-hover:text-amber-300 transition">
                              {lead.business_name || "Candidate Business"}
                            </span>
                            {lead.business_type && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                {lead.business_type}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 text-[11px] text-slate-400">
                            {cleanDomain ? (
                              <a
                                href={`https://${cleanDomain}`}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="text-sky-400 hover:underline flex items-center gap-1 font-mono truncate max-w-[200px]"
                              >
                                <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                                <span className="truncate">{cleanDomain}</span>
                              </a>
                            ) : (
                              <span className="text-rose-400/90 flex items-center gap-1 font-mono text-[10px]">
                                <Globe className="w-3 h-3 text-rose-500/80 shrink-0" /> No Official Website
                              </span>
                            )}
                          </div>

                          {lead.address && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 line-clamp-1">
                              <MapPin className="w-3 h-3 text-slate-600 shrink-0" />
                              <span className="truncate max-w-xs">{lead.address}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1.5 pt-1">
                            {lead.google_maps_url && (
                              <a
                                href={lead.google_maps_url}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                title="Open on Google Maps"
                                className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 flex items-center gap-1"
                              >
                                <MapPin className="w-2.5 h-2.5" /> Maps
                              </a>
                            )}
                            <a
                              href={lead.google_search_url || `https://www.google.com/search?q=${encodeURIComponent(lead.business_name || '')}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Google Search"
                              className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1"
                            >
                              <Search className="w-2.5 h-2.5" /> Search
                            </a>
                            <a
                              href={`https://www.facebook.com/search/top?q=${encodeURIComponent(lead.business_name || '')}`}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              title="Facebook Search"
                              className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/20 flex items-center gap-1"
                            >
                              FB
                            </a>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <div className="space-y-1.5">

                          <div className="flex items-center gap-2">
                            {lead.phone ? (
                              <>
                                <a
                                  href={`tel:${lead.phone}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-sky-300 hover:underline font-mono flex items-center gap-1.5"
                                >
                                  <Phone className="w-3 h-3 text-sky-400 shrink-0" />
                                  <span>{lead.phone}</span>
                                </a>
                                {waUrl && (
                                  <a
                                    href={waUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    title="Open 1-Click WhatsApp Chat with Lead"
                                    className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 transition shadow-sm shadow-emerald-500/10"
                                  >
                                    <MessageSquare className="w-2.5 h-2.5 text-emerald-400" /> WhatsApp
                                  </a>
                                )}
                              </>
                            ) : (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                <Phone className="w-3 h-3 text-slate-600 shrink-0" /> No direct phone
                              </span>
                            )}
                          </div>

                          <div>
                            {lead.email ? (
                              <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                                <a
                                  href={`mailto:${lead.email}`}
                                  onClick={(e) => e.stopPropagation()}
                                  className="hover:underline flex items-center gap-1.5 truncate text-emerald-300"
                                >
                                  <Mail className="w-3 h-3 shrink-0 text-emerald-400" />
                                  <span className="truncate">{lead.email}</span>
                                </a>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                                <Mail className="w-3 h-3 text-slate-600 shrink-0" /> No email found
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <div className="space-y-1">
                          <div>{renderOutreachBadge(lead)}</div>
                          {lead.last_contacted_at ? (
                            <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-slate-500" />
                              <span>Dispatched: {new Date(lead.last_contacted_at).toLocaleDateString()}</span>
                            </div>
                          ) : hasEmailForOutreach(lead) ? (
                            <div className="text-[10px] text-sky-400/80 font-mono flex items-center gap-1">
                              <Send className="w-2.5 h-2.5 text-sky-400" />
                              <span>Ready for Next Drip Interval</span>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <span className="font-extrabold text-sm font-mono text-white">
                              {Number(lead.final_score).toFixed(1)}
                            </span>
                            <span className="text-[10px] text-slate-500">/100</span>
                          </div>
                          <div className="flex items-center gap-1 flex-wrap">
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                lead.tier === "Strong Potential"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : lead.tier === "Review Needed"
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                              }`}
                            >
                              {lead.tier}
                            </span>

                            <span
                              className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${
                                lead.fit_tier === "HOT"
                                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                  : lead.fit_tier === "WARM"
                                  ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                  : lead.fit_tier === "DROPPED"
                                  ? "bg-slate-800 text-slate-400 border-slate-700"
                                  : "bg-sky-500/20 text-sky-300 border-sky-500/40"
                              }`}
                            >
                              {lead.fit_tier === "HOT" ? "🔥 HOT" : lead.fit_tier === "WARM" ? "⚡ WARM" : lead.fit_tier === "DROPPED" ? "⛔ DROPPED" : `${lead.fit_tier || "HOT"}`}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-xs text-slate-300 max-w-xs">
                        <div className="space-y-1.5">
                          {lead.why_they_need_us ? (
                            <div className="text-[11px] text-amber-300/90 italic bg-amber-500/10 p-1.5 rounded border border-amber-500/20 line-clamp-2">
                              "{lead.why_they_need_us}"
                            </div>
                          ) : (
                            <div className="font-medium text-slate-200 line-clamp-2">
                              {lead.primary_gap_summary || "Solvable gap identified in digital footprint"}
                            </div>
                          )}
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {lead.matched_service && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 font-semibold">
                                🎯 {lead.matched_service.split(" ")[0]}
                              </span>
                            )}
                            {!cleanDomain && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/25">
                                Missing Website
                              </span>
                            )}
                            {!lead.email && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">
                                No Email
                              </span>
                            )}
                            {!lead.phone && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                                No Phone
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-right whitespace-nowrap space-x-2">
                        {isNeedsReview(lead) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleQuickApprove(lead.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 font-semibold text-xs transition border border-emerald-500/30 cursor-pointer"
                          >
                            <ShieldCheck className="w-3.5 h-3.5" /> Approve & Queue
                          </button>
                        )}
                        <Link
                          href={`/leads/${lead.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium text-xs transition border border-sky-500/20 cursor-pointer"
                        >
                          View Details <ArrowUpRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        {hasPermission(currentUser, "can_delete_leads", false) && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                await deleteLead(lead.id);
                                loadLeads(activeTier, selectedRunId);
                              } catch (err) {
                                console.error(err);
                              }
                            }}
                            className="px-2 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showDispatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Send className="w-5 h-5 text-sky-400" />
                <h3 className="text-lg font-bold text-white">Human-Paced Cold Outreach Dispatch</h3>
              </div>
              {!isDispatching && (
                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            {isDispatching ? (
              <div className="py-8 text-center space-y-4">
                <Loader2 className="w-10 h-10 text-sky-400 animate-spin mx-auto" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-200">Dispatching Outreach Emails in Progress...</p>
                  <p className="text-xs text-sky-400 font-mono">
                    Applying 5s-15s randomized anti-spam delays between messages to guarantee inbox delivery and protect sender domain reputation.
                  </p>
                </div>
              </div>
            ) : dispatchResult ? (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between">
                  <span className="font-semibold">{dispatchResult.message}</span>
                  <span className="bg-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-mono">{dispatchResult.mode}</span>
                </div>

                {dispatchResult.results && dispatchResult.results.length > 0 && (
                  <div className="max-h-60 overflow-y-auto space-y-2 pr-1 text-xs">
                    {dispatchResult.results.map((res, i) => (
                      <div key={i} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
                        <div className="truncate max-w-[260px]">
                          <span className="font-bold text-slate-200 block truncate">{res.company}</span>
                          <span className="text-[11px] text-slate-400 font-mono truncate block">{res.email}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${res.status === "SENT" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"}`}>
                          {res.status}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => setShowDispatchModal(false)}
                  className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                >
                  Done & Close
                </button>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
