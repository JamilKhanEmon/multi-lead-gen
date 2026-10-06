"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Zap,
  ShieldCheck,
  Send,
  Mail,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Search,
  Plus,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Clock,
  MapPin,
  ExternalLink,
  MessageSquare,
  Phone,
  PhoneCall,
  Sparkles,
  ArrowRight,
  Filter,
  Check,
  X,
  Building2,
  ChevronRight,
  Sliders,
  TrendingUp,
  Inbox,
  AlertCircle,
  Lock,
  Users,
  Loader2,
} from "lucide-react";
import {
  fetchLeads,
  fetchAutopilotCampaigns,
  createAutopilotCampaign,
  toggleAutopilotCampaign,
  runAutopilotBatch,
  deleteAutopilotCampaign,
  fetchAutopilotAnalytics,
  fetchAutopilotActivity,
  humanVerifyLeadEmail,
  markLeadHotDeal,
  simulateLeadReply,
  Lead,
  AutopilotCampaign,
  AutopilotAnalytics,
  AutopilotActivityItem,
  getStoredUser,
  AuthUser,
  hasPermission
} from "@/lib/api";

export default function AutopilotPage() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [campaigns, setCampaigns] = useState<AutopilotCampaign[]>([]);
  const [analytics, setAnalytics] = useState<AutopilotAnalytics | null>(null);
  const [activity, setActivity] = useState<AutopilotActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Active Tab for Pipeline Stages
  // "ready" | "sent" | "review" | "hot_deals"
  const [activeStage, setActiveStage] = useState<"ready" | "sent" | "review" | "hot_deals">("ready");

  // Autopilot Campaign Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cName, setCName] = useState("");
  const [cKeywords, setCKeywords] = useState("Software Agency, Web Development");
  const [cCountry, setCCountry] = useState("Bangladesh");
  const [cSubCities, setCSubCities] = useState<string[]>(["Uttara", "Gazipur", "Mirpur", "Tangail"]);
  const [subCityInput, setSubCityInput] = useState("");
  const [cDailyLimit, setCDailyLimit] = useState(100);
  const [cUnlimited, setCUnlimited] = useState(false);
  const [cAutoMail, setCAutoMail] = useState(true);
  const [cUseGlobalTemplate, setCUseGlobalTemplate] = useState(true);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [runningBatchId, setRunningBatchId] = useState<string | null>(null);

  // Inline Review Edit
  const [reviewEmailInput, setReviewEmailInput] = useState<Record<string, string>>({});
  const [verifyingLeadId, setVerifyingLeadId] = useState<string | null>(null);

  // Simulate Reply Modal
  const [replyLead, setReplyLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState("Yes, please send me details about your pricing and service offer.");
  const [simulatingReply, setSimulatingReply] = useState(false);

  // Notification Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    try {
      const [leadsData, campaignsData, analyticsData, activityData] = await Promise.all([
        fetchLeads(),
        fetchAutopilotCampaigns(),
        fetchAutopilotAnalytics(),
        fetchAutopilotActivity()
      ]);
      setLeads(leadsData);
      setCampaigns(campaignsData);
      setAnalytics(analyticsData);
      setActivity(activityData);
    } catch (err) {
      console.error("Failed to load autopilot data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    setCurrentUser(user);
    loadData();

    // Dynamically adjust polling interval:
    // If any campaign is running, poll every 3 seconds so the user sees live progressive updates!
    // Otherwise poll every 20 seconds.
    const isAnyRunning = campaigns.some((c) => c.status === "RUNNING") || runningBatchId !== null;
    const intervalMs = isAnyRunning ? 3000 : 20000;

    const interval = setInterval(loadData, intervalMs);
    return () => clearInterval(interval);
  }, [loadData, campaigns, runningBatchId]);

  // Handle Sub-city tag addition
  const handleAddSubCity = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = subCityInput.trim().replace(/,/g, "");
      if (val && !cSubCities.includes(val)) {
        setCSubCities([...cSubCities, val]);
        setSubCityInput("");
      }
    }
  };

  const handleRemoveSubCity = (tag: string) => {
    setCSubCities(cSubCities.filter((c) => c !== tag));
  };

  // Create Campaign
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasPermission(currentUser, "can_create_autopilot_campaigns", false)) {
      showToast("Permission Denied: Search input and campaign configuration is restricted to Super Admin.");
      return;
    }
    if (!cName.trim()) {
      showToast("Please enter a campaign name");
      return;
    }
    setCreatingCampaign(true);
    try {
      const kwList = cKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      await createAutopilotCampaign({
        name: cName.trim(),
        keywords: kwList.length ? kwList : ["Business"],
        country: cCountry,
        sub_cities: cSubCities.length ? cSubCities : ["Dhaka"],
        daily_lead_limit: cUnlimited ? 0 : Number(cDailyLimit) || 100,
        daily_email_limit: 50,
        is_unlimited_leads: cUnlimited,
        auto_mail_enabled: cAutoMail,
        use_global_template: cUseGlobalTemplate
      });
      showToast("✓ Autopilot Campaign launched successfully!");
      setShowCreateModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to create campaign");
    } finally {
      setCreatingCampaign(false);
    }
  };

  // Run Campaign Cycle Now (1-Click Across ALL Sub-Locations)
  const handleRunNow = async (id: string, name: string) => {
    if (!hasPermission(currentUser, "can_run_autopilot_cycle", false)) {
      showToast("Permission Denied: Triggering search cycles is controlled by Super Admin.");
      return;
    }
    setRunningBatchId(id);
    showToast(`⚡ 1-Click Launch: Scanning ALL sub-locations for "${name}"...`);
    try {
      const res = await runAutopilotBatch(id);
      const locsCount = (res.sub_cities_processed || []).length;
      showToast(`✓ All Locations Complete! Added ${res.leads_added} genuine leads across ${locsCount > 0 ? locsCount : "all"} locations (${res.emails_dispatched} emails dispatched)!`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to run campaign batch");
    } finally {
      setRunningBatchId(null);
    }
  };

  // Toggle Campaign Active/Pause
  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await toggleAutopilotCampaign(id, !currentActive);
      showToast(`Campaign ${!currentActive ? "Resumed" : "Paused"}`);
      loadData();
    } catch (err: any) {
      showToast("Failed to toggle campaign status");
    }
  };

  // Delete Campaign
  const handleDeleteCampaign = async (id: string) => {
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    try {
      await deleteAutopilotCampaign(id);
      showToast("Campaign deleted");
      loadData();
    } catch (err: any) {
      showToast("Failed to delete campaign");
    }
  };

  // Verify Lead Email (Human Review)
  const handleVerifyLead = async (leadId: string) => {
    if (!hasPermission(currentUser, "can_verify_autopilot_leads", false)) {
      showToast("Permission Denied: Quality review and lead approval is controlled by Super Admin.");
      return;
    }
    setVerifyingLeadId(leadId);
    try {
      const newEmail = reviewEmailInput[leadId];
      await humanVerifyLeadEmail(leadId, {
        new_email: newEmail,
        approve_for_outreach: true,
        notes: "Approved by reviewer"
      });
      showToast("✓ Lead verified and moved to Outreach Queue!");
      loadData();
    } catch (err: any) {
      showToast(err.message || "Verification failed");
    } finally {
      setVerifyingLeadId(null);
    }
  };

  // Simulate Incoming Reply
  const handleSimulateReplySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyLead) return;
    setSimulatingReply(true);
    try {
      const res = await simulateLeadReply(replyLead.id, replyText);
      if (res.sentiment === "POSITIVE") {
        showToast(`🔥 Hot Deal Activated! ${replyLead.business_name} moved to Final Deals!`);
      } else {
        showToast(`Reply processed (${res.sentiment}): ${res.explanation}`);
      }
      setReplyLead(null);
      loadData();
    } catch (err: any) {
      showToast("Failed to simulate reply");
    } finally {
      setSimulatingReply(false);
    }
  };

  // Filter Leads by Stage
  const isNeedsReview = (l: Lead) => {
    return (
      l.email_status === "NEEDS_REVIEW" ||
      l.outreach_status === "NEEDS_REVIEW" ||
      l.tier === "Review Needed" ||
      l.tier === "Rejected" ||
      l.is_qualified === false
    );
  };

  const isHotDeal = (l: Lead) => {
    return l.deal_status === "HOT_LEAD" || l.outreach_status === "REPLIED_HOT";
  };

  const isSentMail = (l: Lead) => {
    return l.outreach_status === "SENT" || l.outreach_status === "FOLLOWUP_SENT";
  };

  const hasEmailForOutreach = (l: Lead) => {
    return Boolean(l.email && l.email.trim() && l.email_status !== "NOT_FOUND");
  };

  const reviewLeads = leads.filter(isNeedsReview);

  const readyLeads = leads.filter(
    (l) => hasEmailForOutreach(l) && !isNeedsReview(l) && !isHotDeal(l) && !isSentMail(l)
  );

  const sentLeads = leads.filter(isSentMail);

  const hotDeals = leads.filter(isHotDeal);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-sky-500/50 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm animate-in slide-in-from-bottom duration-200">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header & Anti-Spam Engine Status Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-sky-500/20">
              <Zap className="w-5 h-5 fill-current" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Autonomous Cold Email & Autopilot Engine</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                  Continuous Autopilot
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Multi-zone discovery, de-duplication shield, zero-bounce verification, and anti-spam drip outreach.
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition shadow-sm"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin text-sky-400" : ""}`} />
            <span>Sync Stats</span>
          </button>

          {hasPermission(currentUser, "can_create_autopilot_campaigns", false) ? (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-white text-xs font-bold transition shadow-lg shadow-sky-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>New Autopilot Campaign</span>
            </button>
          ) : (
            <div
              title="Search input and campaign configuration is restricted to Super Admin"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 text-xs font-semibold cursor-not-allowed select-none"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>New Campaign (Locked)</span>
            </div>
          )}
        </div>
      </div>

      {/* Anti-Spam Protection Badges Ribbon */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-slate-200">Zero-Bounce Shield: </span>
            <span className="text-slate-400">Real-time MX & Syntax verified</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <Clock className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-slate-200">Anti-Spam Delay: </span>
            <span className="text-slate-400">120-240s Random Human Jitter</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <MapPin className="w-4 h-4 text-sky-400 shrink-0" />
          <div className="truncate">
            <span className="font-semibold text-slate-200">Business Hours: </span>
            <span className="text-slate-400">Delivering 09:00 - 17:30 local</span>
          </div>
        </div>
      </div>

      {/* Top Executive KPI Cards (Super Admin Live Analytics) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Leads Discovered */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Discovered</span>
            <Building2 className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {analytics?.total_leads || leads.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-emerald-400 font-medium">
            <span>+{analytics?.today_leads || 0} discovered today</span>
          </div>
        </div>

        {/* Card 2: Ready for Outreach */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Ready for Mail</span>
            <Inbox className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-300 tracking-tight">
            {readyLeads.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
            <span>100% verified MX in queue</span>
          </div>
        </div>

        {/* Card 3: Dispatched Emails */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Emails Sent</span>
            <Send className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            {analytics?.total_sent || sentLeads.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-sky-400">
            <span>+{analytics?.sent_today || 0} dispatched today</span>
          </div>
        </div>

        {/* Card 4: Hot Deals & Positive Replies */}
        <div className="p-5 rounded-2xl bg-gradient-to-b from-rose-950/20 via-slate-900 to-slate-950 border border-rose-500/30 shadow-xl relative overflow-hidden group">
          <div className="flex items-center justify-between text-rose-300 mb-2">
            <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1">
              <Flame className="w-3.5 h-3.5 fill-rose-500 text-rose-500 animate-pulse" />
              <span>Hot Deals CRM</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-bold">
              {analytics?.response_rate || 0}% Reply Rate
            </span>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-rose-400 tracking-tight">
            {hotDeals.length}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[11px] text-rose-300/80 font-medium">
            <span>Positive responders ready for closing</span>
          </div>
        </div>
      </div>

      {/* Active Campaigns Management Section */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" />
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Active Autopilot Discovery Campaigns
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            {campaigns.length} Active {campaigns.length === 1 ? "Schedule" : "Schedules"}
          </span>
        </div>

        {campaigns.length === 0 ? (
          <div className="p-6 text-center border border-dashed border-slate-800 rounded-xl space-y-3">
            <div className="w-10 h-10 rounded-full bg-sky-500/10 text-sky-400 flex items-center justify-center mx-auto">
              <Zap className="w-5 h-5" />
            </div>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              No continuous autopilot campaigns created yet. Click <strong>"New Autopilot Campaign"</strong> to set target keywords and sub-cities for automatic daily lead generation.
            </p>
            {hasPermission(currentUser, "can_create_autopilot_campaigns", false) ? (
              <button
                onClick={() => setShowCreateModal(true)}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-sky-500/20"
              >
                Configure First Campaign
              </button>
            ) : (
              <span className="text-xs text-amber-400/80 font-mono flex items-center justify-center gap-1.5">
                <Lock className="w-3.5 h-3.5" />
                <span>Search input creation requires Super Admin permission.</span>
              </span>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((camp) => (
              <div
                key={camp.id}
                className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 hover:border-slate-700 transition space-y-3 relative group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{camp.name}</h3>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <MapPin className="w-3 h-3 text-sky-400" />
                      <span>{camp.country}</span>
                    </div>
                  </div>
                  <span
                    className={`text-[9px] font-mono px-2 py-0.5 rounded-full font-bold uppercase border ${
                      camp.status === "RUNNING"
                        ? "bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse"
                        : camp.is_active
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-800 text-slate-400 border-slate-700"
                    }`}
                  >
                    {camp.status === "RUNNING" ? "Running Cycle" : camp.is_active ? "Active Autopilot" : "Paused"}
                  </span>
                </div>

                {/* Target Sub-Locations */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="uppercase">Target Sub-Locations ({camp.sub_cities?.length || 0}):</span>
                    <span className="text-emerald-400 font-semibold text-[10px]">1-Click Scans All</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {camp.sub_cities?.map((sc) => (
                      <span
                        key={sc}
                        className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-medium"
                      >
                        <span className="text-[8px] text-emerald-400">✓</span> {sc}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Found:</span>
                    <span className="font-bold text-slate-200">{camp.total_leads_found} leads</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Sent:</span>
                    <span className="font-bold text-sky-400">{camp.total_emails_sent} sent</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-800/60">
                  {hasPermission(currentUser, "can_run_autopilot_cycle", false) ? (
                    <button
                      onClick={() => handleRunNow(camp.id, camp.name)}
                      disabled={runningBatchId === camp.id || camp.status === "RUNNING"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 disabled:opacity-75 disabled:cursor-not-allowed text-sky-300 border border-sky-500/40 text-xs font-semibold transition shadow-sm"
                    >
                      {runningBatchId === camp.id || camp.status === "RUNNING" ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span className="text-amber-300 animate-pulse">Scanning Sub-Locations...</span>
                        </>
                      ) : (
                        <>
                          <Play className="w-3 h-3 fill-current text-sky-400" />
                          <span>Run All Locations (1-Click)</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <div
                      title="Triggering search cycles is restricted to Super Admin"
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-slate-500 text-[11px] cursor-not-allowed select-none"
                    >
                      <Lock className="w-3 h-3 text-amber-400" />
                      <span>Run All Locations (Locked)</span>
                    </div>
                  )}

                  {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleToggleActive(camp.id, camp.is_active)}
                        title={camp.is_active ? "Pause Campaign" : "Resume Campaign"}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                      >
                        {camp.is_active ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => handleDeleteCampaign(camp.id)}
                        title="Delete Campaign"
                        className="p-1.5 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Master Leads CRM Pipeline & Dispatch Hub Showcase */}
      <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 border border-slate-800 p-6 shadow-xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-amber-400" />
              <span>Master Leads CRM & Dedicated Pipeline</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              All leads with email addresses automatically enter the cold email pipeline and receive drip sequences, with 1-click WhatsApp and full dossier intelligence.
            </p>
          </div>
          <Link
            href="/leads"
            className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-amber-500/20 shrink-0"
          >
            <span>Open Master Leads CRM (Full Page)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* 3 Streamlined Pipeline Cards with Direct Links */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Card 1: All Leads */}
          <Link
            href="/leads"
            className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-amber-500/40 hover:bg-amber-500/5 transition group space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">All Database Leads</span>
              <Users className="w-4 h-4 text-amber-400 group-hover:scale-110 transition" />
            </div>
            <div className="text-2xl font-black text-white font-mono">{leads.length}</div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>View full catalog</span>
              <span className="text-amber-400 font-semibold group-hover:translate-x-0.5 transition">Explore Master CRM →</span>
            </div>
          </Link>

          {/* Card 2: Autopilot Cold Mail */}
          <Link
            href="/leads?pipeline=autopilot"
            className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-sky-500/40 hover:bg-sky-500/5 transition group space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-sky-300">Auto Cold Mail Active</span>
              <Zap className="w-4 h-4 text-sky-400 group-hover:scale-110 transition" />
            </div>
            <div className="text-2xl font-black text-sky-300 font-mono">{leads.filter(l => Boolean(l.email && l.email.trim())).length}</div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Automatic email dispatch</span>
              <span className="text-sky-400 font-semibold group-hover:translate-x-0.5 transition">View Mail Pipeline →</span>
            </div>
          </Link>

          {/* Card 3: Hot Deals */}
          <Link
            href="/leads?pipeline=hot_deals"
            className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-rose-500/40 hover:bg-rose-500/5 transition group space-y-2 block"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-rose-300">Hot Deals & Replies</span>
              <Flame className="w-4 h-4 text-rose-400 group-hover:scale-110 transition" />
            </div>
            <div className="text-2xl font-black text-rose-300 font-mono">{hotDeals.length}</div>
            <div className="text-[11px] text-slate-400 flex items-center justify-between">
              <span>Interested / Positive replies</span>
              <span className="text-rose-400 font-semibold group-hover:translate-x-0.5 transition">View Deals CRM →</span>
            </div>
          </Link>
        </div>

        {/* Anti-Spam Safety & Rate Guard Status */}
        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 text-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold text-white flex items-center gap-2">
                <span>Autonomous Anti-Spam Cadence Protection: Active</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  Healthy
                </span>
              </div>
              <div className="text-slate-400 text-[11px]">
                5 to 15 minute randomized delay between individual dispatches · 50 emails/day safety threshold · Zero bounce shield
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-slate-400 text-[11px] font-mono shrink-0">
            <span>SPF / DKIM: <strong className="text-emerald-400">PASSED</strong></span>
            <span>Sender Score: <strong className="text-sky-400">99.4/100</strong></span>
          </div>
        </div>
      </div>

      {/* Live Activity Stream Feed Ticker */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Live Real-Time Outreach & Discovery Feed
            </h3>
          </div>
          <span className="text-[10px] font-mono text-slate-500">Autonomous Worker Active</span>
        </div>

        <div className="space-y-2 max-h-48 overflow-y-auto pr-2">
          {activity.length === 0 ? (
            <div className="text-xs text-slate-500 italic py-2">
              Awaiting next automated event cycle...
            </div>
          ) : (
            activity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-850 text-xs"
              >
                <div className="flex items-center gap-2.5 truncate">
                  <span
                    className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold ${
                      item.reply_sentiment === "POSITIVE"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    }`}
                  >
                    {item.step === 1 ? "P1" : item.step === 2 ? "F2" : "F3"}
                  </span>
                  <div className="truncate">
                    <span className="font-semibold text-white">{item.business_name}</span>
                    <span className="text-slate-400 text-[11px] ml-1.5 font-mono">
                      ({item.recipient_email})
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase ${
                      item.reply_sentiment === "POSITIVE"
                        ? "bg-rose-500/20 text-rose-300 font-bold"
                        : "bg-emerald-500/10 text-emerald-400"
                    }`}
                  >
                    {item.reply_sentiment ? `Replied: ${item.reply_sentiment}` : "Dispatched"}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(item.sent_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* MODAL: CREATE AUTOPILOT CAMPAIGN */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-xl rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl relative">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Create Autopilot Campaign</h3>
                  <p className="text-xs text-slate-400">
                    Set discovery topics and sub-cities for continuous automated outreach.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">
              {/* Field 1: Campaign Name */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Campaign Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dhaka IT & Software Firms Outreach"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Field 2: Business Keywords */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Business Keywords / Topics (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Software Agency, Dental Clinic, Real Estate"
                  value={cKeywords}
                  onChange={(e) => setCKeywords(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Field 3: Country */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Target Country
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Bangladesh"
                  value={cCountry}
                  onChange={(e) => setCCountry(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              {/* Field 4: Sub-cities Multi-Tag Input */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Sub-Cities & Areas (Type area and press Enter)
                </label>
                <div className="flex flex-wrap items-center gap-1.5 p-2 rounded-xl bg-slate-950 border border-slate-800 min-h-[46px]">
                  {cSubCities.map((sc) => (
                    <span
                      key={sc}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-300 border border-sky-500/30 text-xs font-mono"
                    >
                      <span>{sc}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveSubCity(sc)}
                        className="hover:text-rose-400"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    placeholder={cSubCities.length === 0 ? "Type city & press Enter..." : "Add more..."}
                    value={subCityInput}
                    onChange={(e) => setSubCityInput(e.target.value)}
                    onKeyDown={handleAddSubCity}
                    className="flex-1 min-w-[120px] bg-transparent text-xs text-white focus:outline-none px-2 py-1"
                  />
                </div>
              </div>

              {/* Field 5: Daily Limit & Unlimited Toggle */}
              <div className="grid grid-cols-2 gap-4 items-center pt-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Daily Lead Target
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="1000"
                    disabled={cUnlimited}
                    value={cDailyLimit}
                    onChange={(e) => setCDailyLimit(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white disabled:opacity-40"
                  />
                </div>

                <div className="flex items-center gap-2 pt-5">
                  <input
                    type="checkbox"
                    id="unlimited_checkbox"
                    checked={cUnlimited}
                    onChange={(e) => setCUnlimited(e.target.checked)}
                    className="w-4 h-4 rounded text-sky-500 bg-slate-950 border-slate-700"
                  />
                  <label htmlFor="unlimited_checkbox" className="text-xs text-slate-300 cursor-pointer">
                    Unlimited (No daily cap)
                  </label>
                </div>
              </div>

              {/* Field 6: Auto-Mail Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <span className="text-xs font-semibold text-white block">Auto-Dispatch Emails</span>
                  <span className="text-[11px] text-slate-400">
                    Immediately queue verified leads for automated 2-4m outreach
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={cAutoMail}
                  onChange={(e) => setCAutoMail(e.target.checked)}
                  className="w-5 h-5 rounded text-sky-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              {/* Field 7: Global Template vs AI Pitch Toggle */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-white block">Use Saved Global Email Template</span>
                    <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-medium">
                      {cUseGlobalTemplate ? "Admin Template Active" : "AI Pitch Mode"}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    {cUseGlobalTemplate
                      ? "Checked: Uses saved Global Template from Admin Panel with dynamic gap & persona rotation"
                      : "Unchecked: AI dynamically writes industry-specific adaptive pitch per lead"}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={cUseGlobalTemplate}
                  onChange={(e) => setCUseGlobalTemplate(e.target.checked)}
                  className="w-5 h-5 rounded text-sky-500 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingCampaign}
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-sky-500/20"
                >
                  {creatingCampaign ? "Creating..." : "Save & Launch Autopilot"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SIMULATE CLIENT REPLY */}
      {replyLead && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white">Simulate Client Reply</h3>
                <p className="text-xs text-slate-400">{replyLead.business_name}</p>
              </div>
              <button onClick={() => setReplyLead(null)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSimulateReplySubmit} className="space-y-3">
              <div>
                <label className="text-xs text-slate-300 block mb-1">
                  Client Response Content:
                </label>
                <textarea
                  rows={4}
                  required
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 font-sans"
                />
              </div>

              {/* Quick Presets */}
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setReplyText("Yes, I am interested! Please send your pricing.")}
                  className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-mono border border-emerald-500/30"
                >
                  + "Yes, interested"
                </button>
                <button
                  type="button"
                  onClick={() => setReplyText("Sounds great, let's schedule a call this week.")}
                  className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-300 text-[10px] font-mono border border-emerald-500/30"
                >
                  + "Schedule call"
                </button>
                <button
                  type="button"
                  onClick={() => setReplyText("Please unsubscribe me and remove from list.")}
                  className="px-2.5 py-1 rounded-md bg-rose-500/10 text-rose-300 text-[10px] font-mono border border-rose-500/30"
                >
                  + "Unsubscribe"
                </button>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setReplyLead(null)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={simulatingReply}
                  className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition"
                >
                  {simulatingReply ? "Processing..." : "Process Inbound Reply"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
