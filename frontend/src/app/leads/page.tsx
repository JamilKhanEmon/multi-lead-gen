"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchLeads, fetchRuns, deleteLead, clearAllLeads, cancelResearchRun, Lead, ResearchRun } from "@/lib/api";
import {
  Users,
  Filter,
  ArrowUpRight,
  Search,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  User,
  Trash2,
  MapPin,
  Layers,
  Loader2,
  CheckCircle2,
  Compass,
  XCircle,
} from "lucide-react";

export default function LeadsPipelinePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string>("ALL");
  const [activeTier, setActiveTier] = useState<string>("ALL");
  const [websiteFilter, setWebsiteFilter] = useState<"ALL" | "WITH_WEBSITE" | "NO_WEBSITE">("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeRunningRun, setActiveRunningRun] = useState<ResearchRun | null>(null);

  const loadLeads = (tier?: string, runId?: string) => {
    setLoading(true);
    fetchLeads(tier, runId)
      .then((data) => setLeads(data))
      .catch((e) => console.error("Error loading leads:", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // Check if run_id is passed in URL query param
    let initialRunId = "ALL";
    if (typeof window !== "undefined") {
      const urlRunId = new URLSearchParams(window.location.search).get("run_id");
      if (urlRunId) {
        initialRunId = urlRunId;
        setSelectedRunId(urlRunId);
      }
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

  // Poll when a research run is active in the background
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

  const handleDeleteSingle = async (leadId: string) => {
    if (!confirm("Are you sure you want to remove this lead?")) return;
    try {
      await deleteLead(leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err: any) {
      alert("Failed to delete lead: " + err.message);
    }
  };

  const handleClearAll = async () => {
    const tierMsg = activeTier === "ALL" ? "all leads" : `all '${activeTier}' leads`;
    if (!confirm(`Are you sure you want to delete ${tierMsg}? This action cannot be undone.`)) return;
    try {
      await clearAllLeads(activeTier);
      loadLeads(activeTier, selectedRunId);
    } catch (err: any) {
      alert("Failed to clear leads: " + err.message);
    }
  };

  const GENERIC_PLATFORMS = ["facebook.com", "instagram.com", "youtube.com", "linkedin.com", "twitter.com", "google.com"];

  const filtered = leads.filter((lead) => {
    const bizName = (lead.business_name || "").toLowerCase().trim();
    if (GENERIC_PLATFORMS.some((p) => bizName.includes(p)) || bizName === "facebook" || bizName === "instagram") {
      return false;
    }
    const cleanDomain = lead.domain && !GENERIC_PLATFORMS.some((p) => lead.domain?.toLowerCase().includes(p)) ? lead.domain : null;
    const matchesTier = activeTier === "ALL" || lead.tier === activeTier;
    const matchesRun = selectedRunId === "ALL" || lead.run_id === selectedRunId;
    const matchesWebsite =
      websiteFilter === "ALL" ||
      (websiteFilter === "WITH_WEBSITE" && !!cleanDomain) ||
      (websiteFilter === "NO_WEBSITE" && !cleanDomain);
    const matchesSearch =
      searchTerm === "" ||
      (lead.business_name && lead.business_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.primary_gap_summary && lead.primary_gap_summary.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.address && lead.address.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesTier && matchesRun && matchesWebsite && matchesSearch;
  });

  const noWebsiteCount = leads.filter((l) => !l.domain || GENERIC_PLATFORMS.some((p) => l.domain?.toLowerCase().includes(p))).length;
  const withWebsiteCount = leads.filter((l) => !!l.domain && !GENERIC_PLATFORMS.some((p) => l.domain?.toLowerCase().includes(p))).length;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Active Background Research Run Banner with Live Percentage Bar */}
      {activeRunningRun && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-sky-950/80 via-slate-900 to-indigo-950/80 border border-sky-500/40 shadow-xl shadow-sky-500/10 space-y-2.5 animate-in fade-in duration-300">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-white flex items-center gap-2">
              <Loader2 className="w-4 h-4 text-sky-400 animate-spin" />
              <span>
                Active Research in Progress:{" "}
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
                  : "Discovering Entities (15%)..."}
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
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>
              Discovered: {activeRunningRun.discovered_count} | Auditing Live Websites with OpenClaw...
            </span>
            <span className="text-emerald-400 font-semibold">
              Qualified Leads Found: {activeRunningRun.qualified_count}
            </span>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
            Qualified Lead Pipeline
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Deterministically scored and gate-validated prospective clients with corroborated solvable gaps and map locations.
          </p>
        </div>
        {leads.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition self-end sm:self-auto"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Pipeline
          </button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search Batch / Run Selector Dropdown */}
          {runs.length > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs">
              <Layers className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-400 font-medium">Batch:</span>
              <select
                value={selectedRunId}
                onChange={(e) => handleRunChange(e.target.value)}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer max-w-[180px] sm:max-w-xs truncate"
              >
                <option value="ALL" className="bg-slate-900 text-white">
                  All Batches ({leads.length})
                </option>
                {runs.map((r) => (
                  <option key={r.id} value={r.id} className="bg-slate-900 text-white">
                    {r.industry} • {r.location} (
                    {new Date(r.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                    )
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tier Tabs */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 overflow-x-auto max-w-full">
            {["ALL", "Strong Potential", "Review Needed", "Rejected"].map((tier) => (
              <button
                key={tier}
                onClick={() => setActiveTier(tier)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                  activeTier === tier
                    ? "bg-slate-800 text-white shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {tier}
              </button>
            ))}
          </div>

          {/* Website Presence Filter */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-slate-800 text-xs">
            <button
              onClick={() => setWebsiteFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                websiteFilter === "ALL"
                  ? "bg-slate-800 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({leads.length})
            </button>
            <button
              onClick={() => setWebsiteFilter("NO_WEBSITE")}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                websiteFilter === "NO_WEBSITE"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  : "text-amber-400/80 hover:text-amber-300"
              }`}
              title="Businesses without a website — prime web development agency leads"
            >
              <span className="w-2 h-2 rounded-full bg-amber-400 inline-block"></span>
              No Website ({noWebsiteCount})
            </button>
            <button
              onClick={() => setWebsiteFilter("WITH_WEBSITE")}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                websiteFilter === "WITH_WEBSITE"
                  ? "bg-slate-800 text-sky-300"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              With Website ({withWebsiteCount})
            </button>
          </div>
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search company or gap..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Pipeline Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {loading ? "Loading prospective leads..." : "No leads match the selected criteria."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm min-w-[700px]">
            <thead className="bg-slate-900/90 text-xs text-slate-400 border-b border-slate-800 font-semibold tracking-wider uppercase">
              <tr>
                <th className="py-3.5 px-4">Score & Tier</th>
                <th className="py-3.5 px-4">Company & Lead</th>
                <th className="py-3.5 px-4">Website</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4">Detected Solvable Gap</th>
                <th className="py-3.5 px-4 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className="hover:bg-slate-800/50 transition cursor-pointer group"
                >
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        lead.tier === "Strong Potential"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : lead.tier === "Review Needed"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>
                        {lead.tier}
                      </span>
                      <span className="font-mono text-xs font-bold text-white">{lead.final_score}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-semibold text-slate-100 max-w-xs">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="group-hover:text-sky-400 transition truncate">{lead.business_name || "Commercial Candidate"}</span>
                      {lead.business_type && lead.business_type !== "other" && (
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          lead.business_type.toLowerCase().includes("developer") || lead.business_type.toLowerCase().includes("builder")
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : lead.business_type.toLowerCase().includes("agency") || lead.business_type.toLowerCase().includes("broker")
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : lead.business_type.toLowerCase().includes("clinic") || lead.business_type.toLowerCase().includes("hospital")
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                            : lead.business_type.toLowerCase().includes("law") || lead.business_type.toLowerCase().includes("legal")
                            ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                            : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                        }`}>
                          {lead.business_type}
                        </span>
                      )}
                    </div>
                    {lead.contact_person && (
                      <div className="text-[11px] text-purple-300 flex items-center gap-1 font-normal mt-0.5">
                        <User className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">{lead.contact_person} {lead.contact_title ? `(${lead.contact_title})` : ""}</span>
                      </div>
                    )}
                    {lead.address ? (
                      <a
                        href={lead.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.business_name || ''} ${lead.address}`)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Click to view exact location in Google Maps"
                        className="text-[11px] text-amber-400/90 hover:text-amber-300 font-normal truncate mt-1 inline-flex items-center gap-1 hover:underline max-w-full"
                      >
                        <MapPin className="w-3 h-3 text-amber-400 shrink-0" />
                        <span className="truncate">{lead.address}</span>
                        <ExternalLink className="w-2.5 h-2.5 opacity-60 shrink-0" />
                      </a>
                    ) : lead.google_maps_url ? (
                      <a
                        href={lead.google_maps_url}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        title="Click to view location search on Google Maps"
                        className="text-[10px] text-amber-400/80 hover:text-amber-300 font-normal mt-0.5 inline-flex items-center gap-1 hover:underline"
                      >
                        <MapPin className="w-2.5 h-2.5 text-amber-400" /> View Map Location
                      </a>
                    ) : null}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap">
                    {lead.domain && !GENERIC_PLATFORMS.some((p) => lead.domain?.toLowerCase().includes(p)) ? (
                      <a
                        href={`https://${lead.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-sky-400 font-mono hover:underline inline-flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" /> {lead.domain} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <div className="space-y-1.5" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/25">
                          No Website (Web Dev Lead)
                        </span>
                        <div className="flex items-center gap-1.5">
                          <a
                            href={lead.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.business_name || ''} ${lead.address || ''}`)}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Open exact location on Google Maps"
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1 transition"
                          >
                            <MapPin className="w-2.5 h-2.5" /> Maps
                          </a>
                          <a
                            href={lead.google_search_url || `https://www.google.com/search?q=${encodeURIComponent(lead.business_name || '')}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Search business on Google"
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1 transition"
                          >
                            <Search className="w-2.5 h-2.5" /> Google
                          </a>
                          <a
                            href={`https://www.facebook.com/search/top?q=${encodeURIComponent(lead.business_name || '')}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Search Facebook Page"
                            className="px-2 py-0.5 rounded text-[10px] font-medium bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center gap-1 transition"
                          >
                            FB
                          </a>
                        </div>
                      </div>
                    )}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap text-xs">
                    <div>
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline text-sky-300 font-mono flex items-center gap-1.5"
                        >
                          <Phone className="w-3 h-3 text-sky-400 shrink-0" /> {lead.phone}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-600 shrink-0" /> No direct phone
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      {lead.email ? (
                        <div className="flex items-center gap-1.5 truncate max-w-[220px]">
                          <a
                            href={`mailto:${lead.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className={`hover:underline flex items-center gap-1.5 truncate ${
                              lead.email_status === "SUGGESTED" ? "text-amber-300" : "text-emerald-300"
                            }`}
                          >
                            <Mail className={`w-3 h-3 shrink-0 ${
                              lead.email_status === "SUGGESTED" ? "text-amber-400" : "text-emerald-400"
                            }`} />
                            <span className="truncate">{lead.email}</span>
                          </a>
                          {lead.email_status === "SUGGESTED" && (
                            <span
                              title="Domain pattern suggestion (Not scraped directly from site). Verify or use verified phone/WhatsApp."
                              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/25 font-mono shrink-0 font-medium"
                            >
                              Suggested
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-600 shrink-0" /> No direct email
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs text-slate-300 max-w-sm">
                    {lead.primary_gap_summary}
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/leads/${lead.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium text-xs transition border border-sky-500/20"
                      >
                        View Dossier <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSingle(lead.id);
                        }}
                        title="Delete lead from pipeline"
                        className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </div>
  );
}
