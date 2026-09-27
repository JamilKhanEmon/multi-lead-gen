"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchRuns,
  fetchLeads,
  fetchHealth,
  deleteLead,
  deleteResearchRun,
  clearAllResearchRuns,
  resetDatabase,
  ResearchRun,
  Lead,
  SystemHealth,
} from "@/lib/api";
import { useWebSocket } from "@/hooks/useWebSocket";
import {
  Activity,
  CheckCircle2,
  Clock,
  ExternalLink,
  Flame,
  Radio,
  Server,
  Zap,
  Terminal,
  Loader2,
  Phone,
  Mail,
  Globe,
  User,
  Trash2,
} from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const [runs, setRuns] = useState<ResearchRun[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);

  const handleDeleteRun = async (runId: string) => {
    if (!confirm("Are you sure you want to delete this research run?")) return;
    try {
      await deleteResearchRun(runId);
      setRuns((prev) => prev.filter((r) => r.id !== runId));
    } catch (err: any) {
      alert("Failed to delete run: " + err.message);
    }
  };

  const handleClearRuns = async () => {
    if (!confirm("Clear all research run history?")) return;
    try {
      await clearAllResearchRuns();
      setRuns([]);
    } catch (err: any) {
      alert("Failed to clear research runs: " + err.message);
    }
  };

  const handleDeleteLead = async (leadId: string) => {
    if (!confirm("Delete this lead?")) return;
    try {
      await deleteLead(leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err: any) {
      alert("Failed to delete lead: " + err.message);
    }
  };

  const handleResetDatabase = async () => {
    if (!confirm("WARNING: Are you sure you want to purge all test data (leads, runs, and discovered businesses)? System parameters and services will be preserved.")) return;
    try {
      await resetDatabase(true);
      setLeads([]);
      setRuns([]);
      alert("All test data has been purged successfully!");
    } catch (err: any) {
      alert("Failed to reset database: " + err.message);
    }
  };

  const [activityLogs, setActivityLogs] = useState<string[]>([]);

  useEffect(() => {
    const time = new Date().toLocaleTimeString();
    setActivityLogs([
      `[${time}] 🚀 LeadGen Autonomous Engine Online (127.0.0.1:8000)`,
      `[${time}] 🦞 OpenClaw Gateway Connected on ws://127.0.0.1:18789`,
      `[${time}] 🤖 Ollama Multimodal Intelligence Ready (gemma3:4b)`,
    ]);
  }, []);

  const { lastMessage, isConnected } = useWebSocket();

  const loadData = async () => {
    try {
      const [r, l] = await Promise.all([fetchRuns(), fetchLeads()]);
      setRuns(r);
      setLeads(l);
      try {
        const h = await fetchHealth();
        setHealth(h);
      } catch {
        // Health requires admin JWT; fallback if not logged in
      }
    } catch (e) {
      console.error("Dashboard data load error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Auto-poll active research runs every 2s when a job is RUNNING
  useEffect(() => {
    let interval: any;
    if (runs.some((r) => r.status === "RUNNING")) {
      interval = setInterval(() => {
        loadData();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [runs]);

  // Update real-time counters & log stream if WebSocket emits an event
  useEffect(() => {
    if (lastMessage) {
      loadData();
      const time = new Date().toLocaleTimeString();
      let logLine = "";
      if (typeof lastMessage === "object") {
        const evt = lastMessage.event || "event";
        const data = lastMessage.data || {};
        if (evt === "discovery_completed") {
          logLine = `[${time}] 🦞 OpenClaw Discovery completed: Found ${data.discovered_count || 0} candidate businesses.`;
        } else if (evt === "lead_evaluated") {
          logLine = `[${time}] 🎯 Qualified Lead: ${data.business_name || "Business"} -> ${data.tier || "Evaluated"} (Score: ${data.final_score || 0})`;
        } else {
          logLine = `[${time}] ⚡ Event: ${evt} - ${JSON.stringify(data)}`;
        }
      } else {
        logLine = `[${time}] ⚡ ${String(lastMessage)}`;
      }
      setActivityLogs((prev) => [logLine, ...prev.slice(0, 49)]);
    }
  }, [lastMessage]);

  const strongCount = leads.filter((l) => l.tier === "Strong Potential").length;
  const reviewCount = leads.filter((l) => l.tier === "Review Needed").length;
  const totalDiscovered = runs.reduce((acc, r) => acc + (r.discovered_count || 0), 0);
  const activeRuns = runs.filter((r) => r.status === "RUNNING").length;

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Executive Dashboard</h2>
          <p className="text-sm text-slate-400">Autonomous B2B intelligence & deterministic lead qualification.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs">
            <Radio className={`w-3 h-3 ${isConnected ? "text-emerald-400 animate-pulse" : "text-amber-400"}`} />
            <span className="text-slate-300 font-mono">{isConnected ? "Live Event Stream" : "Connecting..."}</span>
          </div>
          <button
            onClick={handleResetDatabase}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 font-semibold text-xs transition"
            title="Purge all test leads, runs, and businesses"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Purge Test Data
          </button>
          <Link
            href="/research"
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs transition shadow-lg shadow-sky-500/20"
          >
            <Zap className="w-3.5 h-3.5" />
            Launch Research
          </Link>
        </div>
      </div>

      {/* System Health Indicators (No ON/OFF button; background status only) */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { name: "OpenClaw Gateway", status: "Healthy", detail: "127.0.0.1:18789 (LaunchAgent)" },
          { name: "Ollama Intelligence", status: "Ready", detail: "gemma3:4b (Multimodal Text+Vision)" },
          { name: "PostgreSQL Database", status: "Connected", detail: "127.0.0.1:5432 (Immutable State)" },
          { name: "Redis Coordination", status: "Active", detail: "127.0.0.1:6379 (Queue & Pub/Sub)" },
        ].map((item, idx) => (
          <div key={idx} className="glass-card p-4 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-400">{item.name}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            </div>
            <div className="text-sm font-semibold text-slate-100">{item.status}</div>
            <div className="text-[11px] text-slate-400 truncate mt-1">{item.detail}</div>
          </div>
        ))}
      </div>

      {/* Metric Counters */}
      <div className="grid grid-cols-4 gap-4">
        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <div className="text-xs font-medium text-slate-400">Total Discovered</div>
          <div className="text-3xl font-extrabold text-white mt-1">{totalDiscovered}</div>
          <div className="text-[11px] text-slate-400 mt-2">Corroborated companies</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-emerald-500/20 bg-emerald-950/10">
          <div className="text-xs font-medium text-emerald-400 flex items-center gap-1.5">
            <Flame className="w-3.5 h-3.5" /> Strong Potential
          </div>
          <div className="text-3xl font-extrabold text-emerald-300 mt-1">{strongCount}</div>
          <div className="text-[11px] text-emerald-400/80 mt-2">Score &ge; 80 (Hard gates passed)</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-amber-500/20 bg-amber-950/10">
          <div className="text-xs font-medium text-amber-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" /> Review Needed
          </div>
          <div className="text-3xl font-extrabold text-amber-300 mt-1">{reviewCount}</div>
          <div className="text-[11px] text-amber-400/80 mt-2">Score 60–79 (Corroboration ongoing)</div>
        </div>

        <div className="glass-panel p-5 rounded-xl border border-slate-800">
          <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Active Runs
          </div>
          <div className="text-3xl font-extrabold text-white mt-1">{activeRuns}</div>
          <div className="text-[11px] text-slate-400 mt-2">Worker tasks processing</div>
        </div>
      </div>

      {/* Live Backend Activity Stream Widget */}
      <div className="glass-panel p-5 rounded-2xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2 font-mono">
            <Terminal className="w-4 h-4 text-sky-400" />
            Live Backend Activity Console
          </h3>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[11px] font-mono text-emerald-400 uppercase">Real-Time Stream Active</span>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 font-mono text-xs text-slate-300 space-y-2 max-h-44 overflow-y-auto" suppressHydrationWarning>
          {activityLogs.length === 0 ? (
            <div className="text-slate-500 italic">Initializing autonomous activity stream...</div>
          ) : (
            activityLogs.map((log, i) => (
              <div key={i} className={`leading-relaxed ${i === 0 ? "text-sky-300 font-semibold" : "text-slate-400"}`}>
                {log}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Active Research Runs */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Recent Research Runs</h3>
          <div className="flex items-center gap-3">
            {runs.length > 0 && (
              <button
                onClick={handleClearRuns}
                className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1 font-medium transition"
              >
                <Trash2 className="w-3 h-3" /> Clear History
              </button>
            )}
            <Link href="/research" className="text-xs text-sky-400 hover:underline">New Run</Link>
          </div>
        </div>

        {runs.length === 0 ? (
          <div className="glass-panel p-8 rounded-xl border border-slate-800 text-center text-slate-400">
            No research runs executed yet. Click &quot;Launch Research&quot; to begin.
          </div>
        ) : (
          <div className="space-y-3">
            {runs.slice(0, 5).map((run) => (
              <div key={run.id} className="glass-panel p-4 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-slate-200">{run.industry}</span>
                    <span className="text-xs text-slate-400 font-normal">in {run.location}</span>
                    <span className="text-[10px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono uppercase">
                      {run.depth}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-slate-400 mt-2 font-mono">
                    <span>Discovered: <strong className="text-slate-200">{run.discovered_count}</strong></span>
                    <span>Researched: <strong className="text-slate-200">{run.researched_count}</strong></span>
                    <span className="text-emerald-400">Qualified: <strong>{run.qualified_count}</strong></span>
                    <span className="text-slate-500">Rejected: <strong>{run.rejected_count}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    run.status === "RUNNING" ? "bg-sky-500/20 text-sky-300 animate-pulse border border-sky-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  }`}>
                    {run.status}
                  </span>
                  <button
                    onClick={() => handleDeleteRun(run.id)}
                    title="Delete research run"
                    className="p-1 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition border border-slate-700/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Qualified Leads Preview */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Top Qualified Potential Leads</h3>
          <Link href="/leads" className="text-xs text-sky-400 hover:underline">Full Pipeline &rarr;</Link>
        </div>

        {leads.length === 0 ? (
          <div className="glass-panel p-8 rounded-xl border border-slate-800 text-center text-slate-400">
            No qualified leads yet. Run research to identify solvable gaps.
          </div>
        ) : (
          <div className="glass-panel rounded-xl border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-900/80 text-xs text-slate-400 border-b border-slate-800 font-medium">
                <tr>
                  <th className="py-3 px-4">Tier & Score</th>
                  <th className="py-3 px-4">Company & Lead</th>
                  <th className="py-3 px-4">Website</th>
                  <th className="py-3 px-4">Direct Contact</th>
                  <th className="py-3 px-4">Detected Gap</th>
                  <th className="py-3 px-4 text-right">Dossier</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {leads.slice(0, 8).map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => router.push(`/leads/${lead.id}`)}
                    className="hover:bg-slate-800/50 transition cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                          lead.tier === "Strong Potential"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                        }`}>
                          {lead.tier}
                        </span>
                        <span className="font-mono text-xs font-bold text-white">{lead.final_score}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 font-medium text-slate-200 max-w-[200px]">
                      <div className="group-hover:text-sky-400 transition truncate">{lead.business_name || "Commercial Candidate"}</div>
                      {lead.contact_person && (
                        <div className="text-[11px] text-purple-300 flex items-center gap-1 font-normal mt-0.5 truncate">
                          <User className="w-3 h-3 text-purple-400 shrink-0" />
                          <span>{lead.contact_person} {lead.contact_title ? `(${lead.contact_title})` : ""}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {lead.domain ? (
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
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/25">
                          Missing Website
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs">
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
                          <a
                            href={`mailto:${lead.email}`}
                            onClick={(e) => e.stopPropagation()}
                            className="hover:underline text-emerald-300 flex items-center gap-1.5 truncate max-w-[160px]"
                          >
                            <Mail className="w-3 h-3 text-emerald-400 shrink-0" /> {lead.email}
                          </a>
                        ) : (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                            <Mail className="w-3 h-3 text-slate-600 shrink-0" /> No direct email
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400 truncate max-w-xs">
                      {lead.primary_gap_summary}
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <Link
                          href={`/leads/${lead.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-sky-400 hover:text-sky-300 inline-flex items-center gap-1 font-medium"
                        >
                          Inspect <ExternalLink className="w-3 h-3" />
                        </Link>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteLead(lead.id);
                          }}
                          title="Delete lead"
                          className="p-1 rounded-lg bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
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
