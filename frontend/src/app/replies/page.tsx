"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchReplies, triggerInboxSync, ReplyEntry } from "@/lib/api";

type TabType = "hot" | "neutral" | "rejected";

const TAB_CONFIG: Record<TabType, { label: string; icon: string; color: string; bg: string; border: string; badge: string }> = {
  hot: {
    label: "Hot Leads",
    icon: "🔥",
    color: "text-orange-400",
    bg: "bg-orange-500/10",
    border: "border-orange-500/30",
    badge: "bg-orange-500/20 text-orange-300 border border-orange-500/40",
  },
  neutral: {
    label: "Neutral",
    icon: "🟡",
    color: "text-yellow-400",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
    badge: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/40",
  },
  rejected: {
    label: "Rejected",
    icon: "🚫",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    badge: "bg-red-500/20 text-red-300 border border-red-500/40",
  },
};

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function ReplyCard({ reply, tab }: { reply: ReplyEntry; tab: TabType }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = TAB_CONFIG[tab];

  return (
    <div
      className={`group rounded-2xl border ${cfg.border} ${cfg.bg} backdrop-blur-sm p-5 transition-all duration-300 hover:scale-[1.01] hover:shadow-xl cursor-pointer`}
      style={{ background: "rgba(15,17,26,0.7)" }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ${cfg.bg} border ${cfg.border}`}>
            {tab === "hot" ? "🔥" : tab === "neutral" ? "💬" : "🚫"}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-white text-sm truncate">{reply.company_name}</p>
            <p className="text-xs text-slate-400 truncate">{reply.client_email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badge}`}>
            {reply.ai_label?.replace("_", " ")}
          </span>
          {reply.analyzed_by && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                reply.analyzed_by === "OPENCLAW"
                  ? "bg-purple-500/15 text-purple-300 border-purple-500/30 shadow-sm shadow-purple-500/10"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30 shadow-sm shadow-emerald-500/10"
              }`}
              title={reply.analyzed_by === "OPENCLAW" ? "Classified by OpenClaw AI Agent" : "Classified by Deterministic Rule Engine"}
            >
              {reply.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw AI" : "🛡️ Rule Logic"}
            </span>
          )}
          <span className="text-xs text-slate-500">{timeAgo(reply.replied_at)}</span>
          <span className="text-slate-500 text-sm transition-transform duration-200 group-hover:text-slate-300" style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>▾</span>
        </div>
      </div>

      {/* Campaign subject */}
      <div className="mt-3 flex items-center gap-2">
        <span className="text-xs text-slate-500">📧 Campaign:</span>
        <span className="text-xs text-slate-300 truncate">{reply.campaign_subject || "—"}</span>
        {reply.step && (
          <span className="text-xs bg-slate-700/60 text-slate-400 px-2 py-0.5 rounded-full ml-auto flex-shrink-0">
            Step {reply.step}
          </span>
        )}
      </div>

      {/* Reply snippet */}
      <div className="mt-3 rounded-xl bg-slate-800/50 border border-slate-700/40 p-3">
        <p className="text-xs text-slate-400 mb-1 font-medium uppercase tracking-wider">Reply</p>
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">
          {expanded ? reply.reply_text : reply.reply_snippet}
        </p>
        {!expanded && reply.reply_text?.length > 200 && (
          <p className="text-xs text-indigo-400 mt-1">Click to expand...</p>
        )}
      </div>

      {/* Expanded: extra details */}
      {expanded && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {reply.contact_person && (
            <div className="bg-slate-800/40 rounded-lg p-2">
              <p className="text-xs text-slate-500">Contact</p>
              <p className="text-xs text-slate-200 font-medium">{reply.contact_person}</p>
            </div>
          )}
          <div className="bg-slate-800/40 rounded-lg p-2">
            <p className="text-xs text-slate-500">Deal Status</p>
            <p className="text-xs text-slate-200 font-medium">{reply.deal_status || "—"}</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-2">
            <p className="text-xs text-slate-500">Outreach Status</p>
            <p className="text-xs text-slate-200 font-medium">{reply.outreach_status || "—"}</p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-2">
            <p className="text-xs text-slate-500">Analysis Engine</p>
            <p className="text-xs text-slate-200 font-medium">
              {reply.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw AI" : "🛡️ Deterministic Rule Logic"}
            </p>
          </div>
          <div className="bg-slate-800/40 rounded-lg p-2">
            <p className="text-xs text-slate-500">Replied At</p>
            <p className="text-xs text-slate-200 font-medium">
              {reply.replied_at ? new Date(reply.replied_at).toLocaleString() : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function RepliesPage() {
  const [activeTab, setActiveTab] = useState<TabType>("hot");
  const [replies, setReplies] = useState<ReplyEntry[]>([]);
  const [counts, setCounts] = useState<Record<TabType, number>>({ hot: 0, neutral: 0, rejected: 0 });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const loadReplies = useCallback(async (tab: TabType) => {
    setLoading(true);
    try {
      const data = await fetchReplies(tab);
      setReplies(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAllCounts = useCallback(async () => {
    const [hot, neutral, rejected] = await Promise.all([
      fetchReplies("hot"),
      fetchReplies("neutral"),
      fetchReplies("rejected"),
    ]);
    setCounts({ hot: hot.length, neutral: neutral.length, rejected: rejected.length });
  }, []);

  useEffect(() => {
    loadReplies(activeTab);
    loadAllCounts();
  }, [activeTab, loadReplies, loadAllCounts]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await triggerInboxSync();
      setSyncMsg(res.message);
      await loadReplies(activeTab);
      await loadAllCounts();
    } catch {
      setSyncMsg("Inbox sync failed. Check inbox configuration.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  const cfg = TAB_CONFIG[activeTab];

  return (
    <div className="min-h-screen text-white" style={{ background: "linear-gradient(135deg, #0a0c14 0%, #0f1120 50%, #0a0e1a 100%)" }}>
      {/* Header */}
      <div className="border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-xl px-6 py-5 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <span className="text-2xl">📬</span> Reply Intelligence
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">AI-classified client replies across all campaigns</p>
          </div>
          <div className="flex items-center gap-3">
            {syncMsg && (
              <span className="text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-3 py-1.5 rounded-lg animate-pulse">
                {syncMsg}
              </span>
            )}
            <button
              id="inbox-sync-btn"
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-500/20"
            >
              <span className={syncing ? "animate-spin" : ""}>🔄</span>
              {syncing ? "Scanning..." : "Scan Inbox"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {(Object.keys(TAB_CONFIG) as TabType[]).map((tab) => {
            const c = TAB_CONFIG[tab];
            return (
              <div
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`rounded-2xl border p-5 cursor-pointer transition-all duration-200 hover:scale-[1.02] ${
                  activeTab === tab ? `${c.border} ${c.bg}` : "border-slate-800/50 bg-slate-900/30"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-2xl">{c.icon}</span>
                  <span className={`text-2xl font-bold ${activeTab === tab ? c.color : "text-slate-300"}`}>
                    {counts[tab]}
                  </span>
                </div>
                <p className={`text-sm font-semibold mt-2 ${activeTab === tab ? c.color : "text-slate-400"}`}>
                  {c.label}
                </p>
              </div>
            );
          })}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          {(Object.keys(TAB_CONFIG) as TabType[]).map((tab) => {
            const c = TAB_CONFIG[tab];
            return (
              <button
                key={tab}
                id={`tab-${tab}`}
                onClick={() => setActiveTab(tab)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
                  activeTab === tab
                    ? `${c.bg} ${c.border} ${c.color}`
                    : "bg-slate-900/40 border-slate-700/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                {c.icon} {c.label}
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeTab === tab ? c.badge : "bg-slate-700 text-slate-400"}`}>
                  {counts[tab]}
                </span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-10 h-10 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-slate-400 text-sm">Loading replies...</p>
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
            <span className="text-5xl opacity-40">{cfg.icon}</span>
            <p className="text-slate-300 font-medium">No {cfg.label} replies yet</p>
            <p className="text-slate-500 text-sm max-w-xs">
              {activeTab === "hot"
                ? "When clients show interest, they'll appear here after inbox sync."
                : activeTab === "neutral"
                ? "Non-committal replies will appear here."
                : "Opt-out and rejected replies will appear here."}
            </p>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all"
            >
              {syncing ? "Scanning..." : "🔄 Scan Inbox Now"}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {replies.map((reply) => (
              <ReplyCard key={reply.id} reply={reply} tab={activeTab} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
