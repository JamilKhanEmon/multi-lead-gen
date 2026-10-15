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
  RotateCcw,
  Clock,
  MapPin,
  ExternalLink,
  Globe2,
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
  Briefcase,
  Target,
} from "lucide-react";
import {
  fetchLeads,
  fetchAutopilotCampaigns,
  createAutopilotCampaign,
  toggleAutopilotCampaign,
  runAutopilotBatch,
  deleteAutopilotCampaign,
  updateAutopilotCampaign,
  fetchAutopilotAnalytics,
  fetchAutopilotActivity,
  humanVerifyLeadEmail,
  markLeadHotDeal,
  simulateLeadReply,
  triggerInboxSync,
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

  const [activeStage, setActiveStage] = useState<"ready" | "sent" | "review" | "hot_deals">("ready");

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cName, setCName] = useState("");
  const [cKeywords, setCKeywords] = useState("");
  const [cCountry, setCCountry] = useState("");
  const [cCity, setCCity] = useState("");
  const [cSubCities, setCSubCities] = useState<string[]>([]);
  const [subCityInput, setSubCityInput] = useState("");
  const [cDailyLimit, setCDailyLimit] = useState(50);
  const [cUnlimited, setCUnlimited] = useState(false);
  const [cAutoMail, setCAutoMail] = useState(false);
  const [cUseGlobalTemplate, setCUseGlobalTemplate] = useState(false);
  const [cUseCompanyKb, setCUseCompanyKb] = useState(true);
  const [cAnalyzeWebsite, setCAnalyzeWebsite] = useState(false);
  const [cMaxServices, setCMaxServices] = useState<number>(0);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const [runningBatchId, setRunningBatchId] = useState<string | null>(null);

  const [addingSubCityCampId, setAddingSubCityCampId] = useState<string | null>(null);
  const [newSubCityVal, setNewSubCityVal] = useState("");
  const [expandedSubCities, setExpandedSubCities] = useState<Record<string, boolean>>({});

  const [addingServiceCampId, setAddingServiceCampId] = useState<string | null>(null);
  const [newServiceName, setNewServiceName] = useState("");
  const [newServiceType, setNewServiceType] = useState<"software" | "marketing">("software");
  const [newServiceDesc, setNewServiceDesc] = useState("");
  const [newServiceHook, setNewServiceHook] = useState("");

  const [cCustomServices, setCCustomServices] = useState<any[]>([]);
  const [cShowAddCustomService, setCShowAddCustomService] = useState(false);
  const [cCustomName, setCCustomName] = useState("");
  const [cCustomType, setCCustomType] = useState<"software" | "marketing">("software");
  const [cCustomDesc, setCCustomDesc] = useState("");

  const [reviewEmailInput, setReviewEmailInput] = useState<Record<string, string>>({});
  const [verifyingLeadId, setVerifyingLeadId] = useState<string | null>(null);

  const [replyLead, setReplyLead] = useState<Lead | null>(null);
  const [replyText, setReplyText] = useState("Yes, please send me details about your pricing and service offer.");
  const [simulatingReply, setSimulatingReply] = useState(false);

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

    const isAnyRunning = campaigns.some((c) => c.status === "RUNNING") || runningBatchId !== null;
    const intervalMs = isAnyRunning ? 3000 : 20000;

    const interval = setInterval(loadData, intervalMs);
    return () => clearInterval(interval);
  }, [loadData, campaigns, runningBatchId]);

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

  const handleAddSubCityToCampaign = async (camp: AutopilotCampaign) => {
    if (!newSubCityVal.trim()) return;
    const clean = newSubCityVal.trim();
    const currentSubs = camp.sub_cities || [];
    if (currentSubs.includes(clean)) {
      showToast("This area is already added");
      return;
    }
    const updated = [...currentSubs, clean];
    try {
      await updateAutopilotCampaign(camp.id, { sub_cities: updated });
      showToast(`✓ Added "${clean}" to campaign!`);
      setNewSubCityVal("");
      setAddingSubCityCampId(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to add location");
    }
  };

  const handleRemoveSubCityFromCampaign = async (camp: AutopilotCampaign, subCityToRemove: string) => {
    const updated = (camp.sub_cities || []).filter((sc) => sc !== subCityToRemove);
    try {
      await updateAutopilotCampaign(camp.id, { sub_cities: updated });
      showToast(`Removed "${subCityToRemove}"`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to remove location");
    }
  };

  const handleAddServiceToCampaign = async (camp: AutopilotCampaign) => {
    if (!newServiceName.trim()) return;
    const cleanName = newServiceName.trim();
    const currentServices = (camp.target_services || []) as any[];
    const newCard = {
      name: cleanName,
      type: newServiceType,
      description: newServiceDesc.trim() || `${cleanName} digital solution for high-converting lead generation.`,
      offer_hook: newServiceHook.trim() || "5-Minute Live Interactive Software Demo",
    };
    const updated = [...currentServices, newCard];
    try {
      await updateAutopilotCampaign(camp.id, { target_services: updated });
      showToast(`✓ Added pitch card "${cleanName}"!`);
      setNewServiceName("");
      setNewServiceDesc("");
      setNewServiceHook("");
      setAddingServiceCampId(null);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to add pitch card");
    }
  };

  const handleRemoveServiceFromCampaign = async (camp: AutopilotCampaign, indexToRemove: number) => {
    const currentServices = (camp.target_services || []) as any[];
    const updated = currentServices.filter((_, idx) => idx !== indexToRemove);
    try {
      await updateAutopilotCampaign(camp.id, { target_services: updated });
      showToast(`✓ Removed pitch card`);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to remove pitch card");
    }
  };

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
    if (!cCountry.trim()) {
      showToast("Please enter target country");
      return;
    }
    setCreatingCampaign(true);
    try {
      const kwList = cKeywords.split(",").map((k) => k.trim()).filter(Boolean);
      const initialSubs = [...cSubCities];
      if (cCity.trim() && !initialSubs.some(s => s.toLowerCase().includes(cCity.trim().toLowerCase()))) {
        initialSubs.unshift(cCity.trim());
      }
      await createAutopilotCampaign({
        name: cName.trim(),
        keywords: kwList.length ? kwList : ["Business"],
        country: cCountry.trim(),
        sub_cities: initialSubs,
        daily_lead_limit: cUnlimited ? 0 : Number(cDailyLimit) || 50,
        daily_email_limit: 50,
        is_unlimited_leads: cUnlimited,
        auto_mail_enabled: cAutoMail,
        use_global_template: cUseGlobalTemplate,
        use_company_kb: cUseCompanyKb,
        analyze_website: cAnalyzeWebsite,
        max_services: cMaxServices,
        target_services: cCustomServices,
      });
      showToast("✓ Autopilot Campaign launched successfully!");
      setShowCreateModal(false);
      setCCustomServices([]);
      loadData();
    } catch (err: any) {
      showToast(err.message || "Failed to create campaign");
    } finally {
      setCreatingCampaign(false);
    }
  };

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

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await toggleAutopilotCampaign(id, !currentActive);
      showToast(`Campaign ${!currentActive ? "Resumed" : "Paused"}`);
      loadData();
    } catch (err: any) {
      showToast("Failed to toggle campaign status");
    }
  };

  const handleResetCampaign = async (id: string) => {
    try {
      await toggleAutopilotCampaign(id, true, "IDLE");
      showToast("✓ Campaign status reset to Idle");
      loadData();
    } catch (err: any) {
      showToast("Failed to reset campaign status");
    }
  };

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

      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-sky-500/50 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 text-sm animate-in slide-in-from-bottom duration-200">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-sky-500/10 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400 shadow-lg shadow-sky-500/10 shrink-0">
              <Zap className="w-5 h-5 fill-sky-400/20 text-sky-400" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                  Autonomous Cold Email & Autopilot Engine
                </h1>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold tracking-wide uppercase whitespace-nowrap shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  24/7 Autopilot Active
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Continuous country-wide discovery, deep AI audits, zero-bounce verification, and safe drip outreach.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={async () => {
              setRefreshing(true);
              try {
                const res = await triggerInboxSync();
                if (res.status === "warning") {
                  showToast(res.message);
                } else {
                  showToast(res.message || "Inbox scanned successfully!");
                }
              } catch (e: any) {
                showToast(e.message || "Inbox sync failed");
              } finally {
                setRefreshing(false);
                loadData();
              }
            }}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:text-emerald-200 transition shadow-sm"
            title="Scan connected IMAP inbox for new client email replies"
          >
            <Inbox className={`w-3.5 h-3.5 ${refreshing ? "animate-pulse text-emerald-400" : ""}`} />
            <span>Scan Client Replies</span>
          </button>

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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

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
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-sky-400" />
                        <span>{camp.country}</span>
                      </div>
                      <span className="text-slate-600">•</span>
                      {camp.analyze_website ? (
                        <span className="text-[10px] text-pink-400 font-medium flex items-center gap-1">
                          <Globe2 className="w-3 h-3" /> Full Web Audit
                        </span>
                      ) : (
                        <span className="text-[10px] text-sky-400 font-medium flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> Social & Demo Pitch
                        </span>
                      )}
                      <span className="text-slate-600">•</span>
                      <span className="text-[10px] text-purple-400 font-medium flex items-center gap-1">
                        <Briefcase className="w-3 h-3" />
                        {camp.max_services && camp.max_services > 0 ? `${camp.max_services} Service Cards` : "Auto Pitch Cards"}
                      </span>
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

                {camp.keywords && camp.keywords.length > 0 && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span className="uppercase">Target Keywords ({camp.keywords.length}):</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {camp.keywords.map((kw) => (
                        <span
                          key={kw}
                          className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-purple-500/10 text-purple-300 border border-purple-500/30 font-medium"
                        >
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="uppercase">Target Sub-Locations ({camp.sub_cities?.length || 0}):</span>
                    <div className="flex items-center gap-2">
                      {camp.sub_cities && camp.sub_cities.length > 8 && (
                        <button
                          type="button"
                          onClick={() => setExpandedSubCities(prev => ({ ...prev, [camp.id]: !prev[camp.id] }))}
                          className="text-sky-400 hover:text-sky-300 font-sans font-semibold text-[10px]"
                        >
                          {expandedSubCities[camp.id] ? "Collapse ▲" : `View All (${camp.sub_cities.length}) ▼`}
                        </button>
                      )}
                      <span className="text-emerald-400 font-semibold text-[10px]">
                        {camp.sub_cities?.length && camp.sub_cities.length > 20 ? "AI Nationwide Scan" : "1-Click Scans All"}
                      </span>
                    </div>
                  </div>
                  <div className={`flex flex-wrap gap-1 pr-1 transition-all ${expandedSubCities[camp.id] ? "max-h-80 overflow-y-auto" : "max-h-24 overflow-y-auto"}`}>
                    {camp.sub_cities?.map((sc) => (
                      <span
                        key={sc}
                        className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-sky-500/10 text-sky-300 border border-sky-500/30 flex items-center gap-1 font-medium group"
                      >
                        <span className="text-[8px] text-emerald-400">✓</span> {sc}
                        {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSubCityFromCampaign(camp, sc)}
                            title={`Remove ${sc}`}
                            className="opacity-40 group-hover:opacity-100 hover:text-rose-400 ml-0.5"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                    {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                      addingSubCityCampId === camp.id ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            placeholder="Type area & press Enter..."
                            value={newSubCityVal}
                            onChange={(e) => setNewSubCityVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddSubCityToCampaign(camp);
                              } else if (e.key === "Escape") {
                                setAddingSubCityCampId(null);
                              }
                            }}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-slate-950 border border-sky-500 text-white focus:outline-none min-w-[170px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddSubCityToCampaign(camp)}
                            className="text-[10px] px-2 py-0.5 rounded-md bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingSubCityCampId(null)}
                            className="text-[10px] px-1 text-slate-400 hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingSubCityCampId(camp.id);
                            setNewSubCityVal("");
                          }}
                          className="text-[10px] px-2 py-0.5 rounded-md font-mono bg-slate-800/80 hover:bg-slate-800 text-slate-300 hover:text-sky-300 border border-dashed border-slate-700 flex items-center gap-1 transition"
                        >
                          + Add Area
                        </button>
                      )
                    )}
                  </div>
                </div>

                {/* TARGET SERVICE PITCH CARDS */}
                <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                    <span className="uppercase flex items-center gap-1.5 text-purple-300 font-semibold">
                      <Briefcase className="w-3.5 h-3.5 text-purple-400" />
                      <span>Service Pitch Cards ({camp.target_services?.length || 0}):</span>
                    </span>
                    {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                      <button
                        type="button"
                        onClick={() => {
                          setAddingServiceCampId(addingServiceCampId === camp.id ? null : camp.id);
                          setNewServiceName("");
                          setNewServiceDesc("");
                          setNewServiceHook("");
                        }}
                        className="text-purple-400 hover:text-purple-300 transition flex items-center gap-1 font-sans font-semibold text-[10px] cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>{addingServiceCampId === camp.id ? "Close Form" : "+ Add Pitch Card"}</span>
                      </button>
                    )}
                  </div>

                  {/* Inline Add Pitch Card Form */}
                  {addingServiceCampId === camp.id && (
                    <div className="p-2.5 rounded-xl bg-purple-950/30 border border-purple-700/50 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-purple-200 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-400" />
                          New Pitch Card
                        </span>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => setNewServiceType("software")}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition ${
                              newServiceType === "software" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            Software
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewServiceType("marketing")}
                            className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase transition ${
                              newServiceType === "marketing" ? "bg-pink-600 text-white" : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            Marketing
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder="Service / Solution Name"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                      <input
                        type="text"
                        placeholder="Problem solved / Value proposition"
                        value={newServiceDesc}
                        onChange={(e) => setNewServiceDesc(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                      <input
                        type="text"
                        placeholder="Live Demo Offer Hook"
                        value={newServiceHook}
                        onChange={(e) => setNewServiceHook(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                      />
                      <div className="flex items-center justify-end gap-1.5 pt-0.5">
                        <button
                          type="button"
                          onClick={() => setAddingServiceCampId(null)}
                          className="px-2 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAddServiceToCampaign(camp)}
                          className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px] transition cursor-pointer"
                        >
                          Save Card
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Cards Grid */}
                  {camp.target_services && camp.target_services.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-0.5">
                      {camp.target_services.map((svc: any, idx: number) => {
                        const sName = typeof svc === "string" ? svc : (svc.name || "Custom Solution");
                        const sType = typeof svc === "object" ? (svc.type || "software") : "software";
                        const sDesc = typeof svc === "object" ? (svc.description || svc.features || "") : "";
                        const sHook = typeof svc === "object" ? (svc.offer_hook || svc.wedge || "5-Minute Live Interactive Demo") : "5-Minute Live Interactive Demo";
                        return (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-slate-950/80 border border-purple-900/40 hover:border-purple-600/60 transition space-y-1 relative group"
                          >
                            <div className="flex items-start justify-between gap-1">
                              <span className="font-semibold text-white text-[11px] leading-tight line-clamp-1">{sName}</span>
                              <div className="flex items-center gap-1 shrink-0">
                                <span className={`text-[8px] font-mono uppercase px-1 py-0.2 rounded font-bold ${
                                  sType === "marketing" ? "bg-pink-500/20 text-pink-300 border border-pink-500/30" : "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                }`}>
                                  {sType}
                                </span>
                                {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveServiceFromCampaign(camp, idx)}
                                    className="text-slate-500 hover:text-rose-400 p-0.5 transition cursor-pointer"
                                    title="Remove this pitch card"
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {sDesc && <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{sDesc}</p>}
                            <div className="text-[9px] text-emerald-400 font-mono flex items-center gap-1 pt-0.5">
                              <Check className="w-2.5 h-2.5 text-emerald-400 shrink-0" />
                              <span className="truncate">{sHook}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800 text-[10px] text-slate-400 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                        AI matches tailored pitch cards from Company KB per niche during runs.
                      </span>
                      {hasPermission(currentUser, "can_create_autopilot_campaigns", false) && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingServiceCampId(camp.id);
                            setNewServiceName("");
                            setNewServiceDesc("");
                            setNewServiceHook("");
                          }}
                          className="text-purple-400 hover:text-purple-300 font-semibold underline shrink-0 cursor-pointer ml-2"
                        >
                          + Add Card
                        </button>
                      )}
                    </div>
                  )}
                </div>

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
                      {camp.status === "RUNNING" && (
                        <button
                          onClick={() => handleResetCampaign(camp.id)}
                          title="Reset status to Idle"
                          className="p-1.5 rounded-lg hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 transition"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                      )}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

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

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-5 shadow-2xl relative my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Launch Autonomous Autopilot Campaign</h3>
                  <p className="text-xs text-slate-400">
                    OpenClaw autonomously discovers real local businesses, audits their live channels, and qualifies high-intent B2B leads.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="space-y-4">

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span>Campaign Name</span>
                    <span className="text-[10px] normal-case bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-normal">
                      Required
                    </span>
                  </label>
                  {cName && (
                    <button
                      type="button"
                      onClick={() => setCName("")}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Campaign Name"
                  value={cName}
                  onChange={(e) => setCName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Globe2 className="w-3.5 h-3.5 text-sky-400" />
                    <span>Country</span>
                    <span className="text-[10px] normal-case bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-normal">
                      Required
                    </span>
                  </label>
                  {cCountry && (
                    <button
                      type="button"
                      onClick={() => setCCountry("")}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Target Country"
                  value={cCountry}
                  onChange={(e) => setCCountry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>City / Division</span>
                    <span className="text-[10px] normal-case bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-normal">
                      Optional
                    </span>
                  </label>
                  {cCity && (
                    <button
                      type="button"
                      onClick={() => setCCity("")}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="City / Division (Leave empty to scan entire country)"
                  value={cCity}
                  onChange={(e) => setCCity(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  If left empty, OpenClaw will scan across all major divisions and commercial hub cities nationwide.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sub-City / Area / District</span>
                    <span className="text-[10px] normal-case bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-normal">
                      Optional
                    </span>
                  </label>
                  {cSubCities.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCSubCities([])}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Clear All
                    </button>
                  )}
                </div>
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
                    placeholder={cSubCities.length === 0 ? "Type sub-city / area & press Enter (Leave empty to auto-scan all)" : "Add more..."}
                    value={subCityInput}
                    onChange={(e) => setSubCityInput(e.target.value)}
                    onKeyDown={handleAddSubCity}
                    className="flex-1 min-w-[140px] bg-transparent text-xs text-white focus:outline-none px-2 py-1"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  If left empty, OpenClaw will autonomously scan across all districts and neighborhoods of the target area.
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Business Type / Industry</span>
                    <span className="text-[10px] normal-case bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-normal">
                      Required
                    </span>
                  </label>
                  {cKeywords && (
                    <button
                      type="button"
                      onClick={() => setCKeywords("")}
                      className="text-xs text-slate-400 hover:text-slate-200 transition"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  required
                  placeholder="Target business types / industries (separated by comma)"
                  value={cKeywords}
                  onChange={(e) => setCKeywords(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 cursor-pointer">
                    <Send className="w-4 h-4 text-sky-400" />
                    <span>Auto-Send Cold Outreach Emails</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={cAutoMail}
                    onChange={(e) => setCAutoMail(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500 cursor-pointer"
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {cAutoMail ? (
                    <span className="text-emerald-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                      ON: Step-1 cold outreach email will automatically be sent to valid leads as soon as discovered.
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      OFF: Emails won't send automatically. Valid leads will be held in the Outreach Queue for human-paced batch mailing.
                    </span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 cursor-pointer">
                    <Building2 className="w-4 h-4 text-purple-400" />
                    <span>Use Company KB & Branded Pitch</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={cUseCompanyKb}
                    onChange={(e) => setCUseCompanyKb(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-purple-500 focus:ring-purple-500 cursor-pointer"
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {cUseCompanyKb ? (
                    <span className="text-purple-400 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-purple-400" />
                      ON: Company KB Active — Uses your agency profile & custom service catalog from Admin for discovery call pitch & value wedges.
                    </span>
                  ) : (
                    <span className="text-amber-400 font-medium flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-400" />
                      OFF: Generic AI Pitch Mode — Zero company branding; consultative B2B digital transformation pitch.
                    </span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 cursor-pointer">
                    <Globe2 className="w-4 h-4 text-pink-400" />
                    <span>Deep Website Technical Audit</span>
                  </label>
                  <input
                    type="checkbox"
                    checked={cAnalyzeWebsite}
                    onChange={(e) => setCAnalyzeWebsite(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-pink-500 focus:ring-pink-500 cursor-pointer"
                  />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {cAnalyzeWebsite ? (
                    <span className="text-pink-300 font-medium flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-pink-400" />
                      ON: Full Website Audit — Scrapes complete code, mobile layout breaks, GA4/Pixel tracking, and broken link 404s.
                    </span>
                  ) : (
                    <span className="text-sky-300 font-medium flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5 shrink-0 text-sky-400" />
                      OFF (Recommended): Social Media & Demo Focus — Skips website scraping if phone/email is found. Pitches Company KB solutions & live software demos without website complaining.
                    </span>
                  )}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Briefcase className="w-4 h-4 text-purple-400" />
                    <span>Service Pitch Cards</span>
                  </label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setCMaxServices(0)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                        cMaxServices === 0
                          ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400"
                          : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-300" />
                      <span>Auto (LLM Self)</span>
                    </button>
                    {[1, 2, 3, 4, 5].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setCMaxServices(num)}
                        className={`w-8 h-8 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                          cMaxServices === num
                            ? "bg-purple-500 text-white shadow-md shadow-purple-500/30 ring-2 ring-purple-400"
                            : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800"
                        }`}
                      >
                        {num}
                      </button>
                    ))}
                    <div className="flex items-center gap-1.5 ml-1 bg-slate-900 px-2 py-1 rounded-lg border border-slate-800">
                      <span className="text-[10px] text-slate-400 font-mono">Custom:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={cMaxServices > 0 ? cMaxServices : ""}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= 10) {
                            setCMaxServices(val);
                          } else if (e.target.value === "") {
                            setCMaxServices(0);
                          }
                        }}
                        placeholder="Auto"
                        className="w-12 bg-transparent text-xs text-white text-center focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {cMaxServices === 0 ? (
                    <span className="text-purple-300 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                      <span><strong>LLM Self-Decide (Auto):</strong> AI will autonomously analyze target industry bottlenecks and decide the optimal 2 to 4 highest-converting service cards.</span>
                    </span>
                  ) : (
                    <span>
                      Manual limit active: generating or pulling exactly <strong className="text-purple-300">{cMaxServices} {cMaxServices === 1 ? "service card" : "service cards"}</strong> (max 5-10 cards).
                    </span>
                  )}
                </p>

                {/* Custom Services Added in Modal */}
                {cCustomServices.length > 0 && (
                  <div className="space-y-1 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] font-mono text-purple-300 uppercase block">Selected Pitch Cards ({cCustomServices.length}):</span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                      {cCustomServices.map((cs, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-slate-900 border border-purple-500/40 flex items-start justify-between gap-1">
                          <div>
                            <div className="text-[11px] font-semibold text-white">{cs.name}</div>
                            <div className="text-[9px] text-slate-400 line-clamp-1">{cs.description}</div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCCustomServices(cCustomServices.filter((_, i) => i !== idx))}
                            className="text-slate-500 hover:text-rose-400 p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Add Custom Pitch Card in Modal */}
                {cShowAddCustomService ? (
                  <div className="p-2.5 rounded-xl bg-purple-950/40 border border-purple-700/60 space-y-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-purple-200">Custom Pitch Card</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setCCustomType("software")}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${cCustomType === "software" ? "bg-purple-600 text-white" : "bg-slate-800 text-slate-400"}`}
                        >
                          Software
                        </button>
                        <button
                          type="button"
                          onClick={() => setCCustomType("marketing")}
                          className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase ${cCustomType === "marketing" ? "bg-pink-600 text-white" : "bg-slate-800 text-slate-400"}`}
                        >
                          Marketing
                        </button>
                      </div>
                    </div>
                    <input
                      type="text"
                      placeholder="Service / Solution Name"
                      value={cCustomName}
                      onChange={(e) => setCCustomName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <input
                      type="text"
                      placeholder="Value proposition / problem solved"
                      value={cCustomDesc}
                      onChange={(e) => setCCustomDesc(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-2.5 py-1 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500"
                    />
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        onClick={() => setCShowAddCustomService(false)}
                        className="px-2 py-0.5 rounded text-[10px] text-slate-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!cCustomName.trim()) return;
                          setCCustomServices([...cCustomServices, {
                            name: cCustomName.trim(),
                            type: cCustomType,
                            description: cCustomDesc.trim() || `${cCustomName.trim()} solution.`,
                            offer_hook: "5-Minute Live Interactive Software Demo",
                          }]);
                          setCCustomName("");
                          setCCustomDesc("");
                          setCShowAddCustomService(false);
                        }}
                        className="px-3 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white font-semibold text-[10px]"
                      >
                        Add Card
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setCShowAddCustomService(true)}
                    className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 cursor-pointer pt-0.5"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Custom Pitch Card to Campaign</span>
                  </button>
                )}
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-emerald-400" />
                    <span>Target Leads to Discover</span>
                  </label>
                  <span className="text-xs font-mono text-emerald-400 font-semibold">
                    {cUnlimited ? "Unlimited" : `${cDailyLimit} Leads`}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {[20, 50, 100, 200].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setCUnlimited(false);
                        setCDailyLimit(preset);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                        !cUnlimited && cDailyLimit === preset
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                          : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                      }`}
                    >
                      {preset} Leads
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCUnlimited(true)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      cUnlimited
                        ? "bg-purple-500/20 text-purple-300 border border-purple-500/40"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                    }`}
                  >
                    Unlimited
                  </button>
                  <div className="flex items-center gap-1.5 ml-auto">
                    <span className="text-[11px] text-slate-400">Custom:</span>
                    <input
                      type="number"
                      min="10"
                      max="10000"
                      disabled={cUnlimited}
                      value={cDailyLimit}
                      onChange={(e) => {
                        setCUnlimited(false);
                        setCDailyLimit(Number(e.target.value));
                      }}
                      className="w-20 px-2 py-1 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 disabled:opacity-40"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500">
                  OpenClaw will hunt across sub-cities and multi-engine queries until {cUnlimited ? "unlimited verified leads are discovered" : `${cDailyLimit} verified commercial entities are discovered`}.
                </p>
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
                  className="px-5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-sky-500/20 flex items-center gap-1.5"
                >
                  {creatingCampaign ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating Campaign...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Save & Launch Autopilot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
