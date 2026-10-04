"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  createResearchRun,
  fetchResearchRun,
  cancelResearchRun,
  ResearchRun,
  getStoredUser,
  hasPermission,
  AuthUser,
} from "@/lib/api";
import {
  Compass,
  Sparkles,
  AlertCircle,
  Globe2,
  Building2,
  MapPin,
  Briefcase,
  Layers,
  X,
  XCircle,
  CheckCircle2,
  Loader2,
  ArrowRight,
  RefreshCw,
  Search,
  ShieldCheck,
  Lock,
  Send,
} from "lucide-react";

export default function ResearchInitiatorPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [subCity, setSubCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [depth, setDepth] = useState("DEEP");
  const [autoMailEnabled, setAutoMailEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Live Research Progress Tracking
  const [activeRun, setActiveRun] = useState<ResearchRun | null>(null);
  const [progressPct, setProgressPct] = useState(15);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  const handleCancelRun = async () => {
    if (!activeRun) return;
    if (!confirm("Are you sure you want to stop and cancel this autonomous research run?")) return;
    setCancelling(true);
    try {
      const res = await cancelResearchRun(activeRun.id);
      if (res) {
        setActiveRun(res);
      } else {
        setActiveRun((prev) => (prev ? { ...prev, status: "CANCELLED" } : null));
      }
    } catch (err: any) {
      alert("Failed to cancel run: " + err.message);
    } finally {
      setCancelling(false);
    }
  };

  // Poll active run every 2 seconds
  useEffect(() => {
    if (!activeRun || activeRun.status === "COMPLETED" || activeRun.status === "FAILED") return;
    const runId = activeRun.id;

    const interval = setInterval(async () => {
      try {
        const updated = await fetchResearchRun(runId);
        if (updated) {
          setActiveRun(updated);
          if (updated.status === "COMPLETED") {
            setProgressPct(100);
            clearInterval(interval);
          } else if (updated.discovered_count > 0) {
            const processed = updated.qualified_count + updated.rejected_count + updated.failed_count;
            const pct = Math.min(98, Math.max(30, Math.round((processed / updated.discovered_count) * 100)));
            setProgressPct(pct);
          } else {
            setProgressPct((prev) => Math.min(30, prev + 3));
          }
        }
      } catch (e) {
        console.debug("Poll run error:", e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [activeRun?.id, activeRun?.status]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setProgressPct(15);

    try {
      const cleanOverride =
        industry
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "general";

      const locationParts = [subCity.trim(), city.trim(), country.trim()].filter(Boolean);
      const computedLocation = locationParts.join(", ");

      const run = await createResearchRun({
        country: country.trim(),
        city: city.trim(),
        sub_city: subCity.trim(),
        location: computedLocation,
        industry: industry.trim(),
        depth,
        company_limit: 0, // Auto-exhaustion loop (no artificial limit)
        business_type_override: cleanOverride,
        auto_mail_enabled: autoMailEnabled,
      });

      setActiveRun(run);
    } catch (err: any) {
      setError(err.message || "Failed to trigger research run");
    } finally {
      setSubmitting(false);
    }
  };

  const processedCount = activeRun
    ? activeRun.qualified_count + activeRun.rejected_count + activeRun.failed_count
    : 0;

  // ==============================================================================
  // LIVE PROGRESS VIEW (Shown when a research run is active or completed)
  // ==============================================================================
  if (activeRun) {
    const isCompleted = activeRun.status === "COMPLETED";
    const isCancelled = activeRun.status === "CANCELLED";
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Compass
                className={`w-6 h-6 ${
                  isCancelled
                    ? "text-rose-400"
                    : isCompleted
                    ? "text-emerald-400"
                    : "text-sky-400 animate-spin"
                }`}
              />
              {isCancelled
                ? "Autonomous Research Cancelled"
                : isCompleted
                ? "Autonomous Research Completed"
                : "Autonomous Research in Progress"}
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Target: <span className="text-sky-300 font-semibold">{activeRun.industry}</span> in{" "}
              <span className="text-emerald-300 font-semibold">{activeRun.location}</span>
            </p>
          </div>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-full font-bold uppercase border ${
              isCancelled
                ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                : isCompleted
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-sky-500/10 text-sky-400 border-sky-500/30 animate-pulse"
            }`}
          >
            {activeRun.status}
          </span>
        </div>

        {/* Live Percentage Card */}
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-6 relative overflow-hidden shadow-2xl">
          <div className="flex items-end justify-between">
            <div>
              <span className="text-xs font-mono text-slate-400 uppercase tracking-wider">
                Overall Progress
              </span>
              <div className="text-4xl font-extrabold text-white mt-1 flex items-baseline gap-2">
                <span className={isCompleted ? "text-emerald-400" : "text-sky-400"}>
                  {progressPct}%
                </span>
                <span className="text-xs font-normal text-slate-400">
                  {isCompleted ? "Completed" : "Executing..."}
                </span>
              </div>
            </div>
            <div className="text-right text-xs font-mono text-slate-400">
              {activeRun.discovered_count > 0 ? (
                <span>
                  {processedCount} of {activeRun.discovered_count} Companies Audited
                </span>
              ) : (
                <span>Discovering verified commercial entities...</span>
              )}
            </div>
          </div>

          {/* Glowing Animated Progress Bar */}
          <div className="w-full bg-slate-950/80 rounded-full h-3.5 p-0.5 border border-slate-800 overflow-hidden shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-700 ease-out ${
                isCompleted
                  ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-lg shadow-emerald-500/30"
                  : "bg-gradient-to-r from-sky-500 via-indigo-500 to-sky-400 shadow-lg shadow-sky-500/30"
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          {/* 4 Real-time Metrics Counters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Discovered</span>
              <span className="text-lg font-bold text-white mt-0.5 block">{activeRun.discovered_count}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-mono text-slate-400 block">Audited</span>
              <span className="text-lg font-bold text-slate-200 mt-0.5 block">{processedCount}</span>
            </div>
            <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-mono text-emerald-400 block">Qualified</span>
              <span className="text-lg font-bold text-emerald-400 mt-0.5 block">{activeRun.qualified_count}</span>
            </div>
            <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 text-center">
              <span className="text-[10px] uppercase font-mono text-rose-400 block">Unreachable</span>
              <span className="text-lg font-bold text-rose-400 mt-0.5 block">{activeRun.rejected_count}</span>
            </div>
          </div>

          {/* Interactive Pipeline Execution Stages */}
          <div className="pt-4 border-t border-slate-800/80 space-y-3">
            <div className="text-xs font-semibold text-slate-300">Live Execution Stages:</div>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2.5 text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>AI Search Expansion & Geo-Boundary Filtering (Completed)</span>
              </div>
              <div
                className={`flex items-center gap-2.5 ${
                  activeRun.discovered_count > 0 ? "text-emerald-400" : "text-sky-400"
                }`}
              >
                {activeRun.discovered_count > 0 ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                )}
                <span>
                  Hostinger OpenClaw Directory & Web Discovery (
                  {activeRun.discovered_count > 0
                    ? `${activeRun.discovered_count} commercial entities found`
                    : "Searching..."}
                  )
                </span>
              </div>
              <div
                className={`flex items-center gap-2.5 ${
                  isCompleted
                    ? "text-emerald-400"
                    : activeRun.discovered_count > 0
                    ? "text-sky-400"
                    : "text-slate-500"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : activeRun.discovered_count > 0 ? (
                  <Loader2 className="w-4 h-4 shrink-0 animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span>
                  Multi-page Deep Crawling, Contact Extraction & Retries (
                  {processedCount}/{activeRun.discovered_count})
                </span>
              </div>
              <div
                className={`flex items-center gap-2.5 ${
                  isCompleted ? "text-emerald-400" : "text-slate-500"
                }`}
              >
                {isCompleted ? (
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span>Deterministic 135-Parameter Mathematical Qualification & Scoring</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={() => router.push(`/leads?run_id=${activeRun.id}`)}
              className="w-full sm:flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
            >
              <span>View Leads in Pipeline ({activeRun.qualified_count} Qualified)</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            {!isCompleted && !isCancelled && (
              <button
                type="button"
                onClick={handleCancelRun}
                disabled={cancelling}
                className="w-full sm:w-auto py-3 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                <span>{cancelling ? "Cancelling..." : "Cancel Run"}</span>
              </button>
            )}
            <button
              onClick={() => {
                setActiveRun(null);
                setIndustry("");
              }}
              className="w-full sm:w-auto py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
            >
              Start Another Run
            </button>
          </div>
        </div>
      </div>
    );
  }

  const canRunResearch = hasPermission(currentUser, "can_run_research", false);

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" />
          Launch Autonomous Research Run
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          OpenClaw autonomously discovers real local businesses, audits their live websites, and qualifies high-intent B2B leads.
        </p>
      </div>

      {!canRunResearch && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2.5">
          <Lock className="w-4 h-4 shrink-0 text-amber-400" />
          <span>Your account does not have permission to launch autonomous research runs. Please contact an administrator to request discovery access.</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4 sm:space-y-5">
        {/* 1. Country Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Country</span>
              <span className="text-[10px] normal-case bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-normal">
                Required
              </span>
            </label>
            {country && (
              <button
                type="button"
                onClick={() => setCountry("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              placeholder="e.g. United States, United Kingdom, Canada, Australia, UAE"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
            {country && (
              <button
                type="button"
                onClick={() => setCountry("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 2. City Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>City</span>
              <span className="text-[10px] normal-case bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-normal">
                Required
              </span>
            </label>
            {city && (
              <button
                type="button"
                onClick={() => setCity("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              placeholder="e.g. New York, London, Toronto, Sydney, Dubai"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
            {city && (
              <button
                type="button"
                onClick={() => setCity("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 3. Sub-City / Area Field (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Sub-City / Area / District</span>
              <span className="text-[10px] normal-case bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-normal">
                Optional
              </span>
            </label>
            {subCity && (
              <button
                type="button"
                onClick={() => setSubCity("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={subCity}
              onChange={(e) => setSubCity(e.target.value)}
              placeholder="e.g. Manhattan, Brooklyn, SoHo, Downtown, Marina (Leave empty to scan entire city)"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {subCity && (
              <button
                type="button"
                onClick={() => setSubCity("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            If left empty, OpenClaw will scan across all districts and neighborhoods of the target city.
          </p>
        </div>

        {/* 4. Business Type / Industry Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
              <span>Business Type / Industry</span>
              <span className="text-[10px] normal-case bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-normal">
                Any Business
              </span>
            </label>
            {industry && (
              <button
                type="button"
                onClick={() => setIndustry("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              required
              placeholder="e.g. Dental Clinic, Real Estate, Restaurant, Gym, Software Agency"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {industry && (
              <button
                type="button"
                onClick={() => setIndustry("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Research Depth Selector */}
        <div>
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Research Depth</span>
          </label>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition"
          >
            <option value="DEEP">DEEP (Recommended: Live Multi-page Website Crawl + Verified Contacts + Gap Analysis)</option>
            <option value="STANDARD">STANDARD (Website Crawl + Contacts)</option>
            <option value="QUICK">QUICK (Website Header & Status Check)</option>
          </select>
        </div>

        {/* Auto Cold Mail Dispatch Toggle */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-slate-200 uppercase tracking-wider flex items-center gap-2 cursor-pointer">
              <Send className="w-4 h-4 text-sky-400" />
              <span>Auto-Send Cold Outreach Emails</span>
            </label>
            <input
              type="checkbox"
              checked={autoMailEnabled}
              onChange={(e) => setAutoMailEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-500 cursor-pointer"
            />
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            {autoMailEnabled ? (
              <span className="text-emerald-400 font-medium flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
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

        {/* Autonomous Exhaustion Loop Badge */}
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs text-emerald-200 leading-relaxed">
            <span className="font-semibold text-emerald-300">Continuous Auto-Discovery:</span>
            {" "}No artificial candidate limits. OpenClaw will automatically loop and discover all genuine verified businesses found in your specified area.
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !canRunResearch}
          className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {canRunResearch ? (
            <>
              <Sparkles className="w-4 h-4" />
              {submitting ? "Initiating Research Run..." : "Start Autonomous Research"}
            </>
          ) : (
            <>
              <Lock className="w-4 h-4" />
              <span>Research Run Locked (No Permission)</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
