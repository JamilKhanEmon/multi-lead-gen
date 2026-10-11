"use client";

import { useState, useEffect, useCallback } from "react";
import { fetchInboxMessages, triggerInboxSync, InboxMessage } from "@/lib/api";

function timeAgo(isoDate: string | null): string {
  if (!isoDate) return "—";
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(isoDate).toLocaleDateString();
}

function formatFullDate(isoDate: string | null): string {
  if (!isoDate) return "—";
  return new Date(isoDate).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getInitial(email: string): string {
  return (email || "?")[0].toUpperCase();
}

function avatarColor(email: string): string {
  const colors = [
    "bg-violet-500", "bg-sky-500", "bg-emerald-500",
    "bg-orange-500", "bg-pink-500", "bg-indigo-500",
    "bg-teal-500", "bg-rose-500",
  ];
  let hash = 0;
  for (const c of email) hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
  return colors[hash % colors.length];
}

export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selected, setSelected] = useState<InboxMessage | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [searchQ, setSearchQ] = useState("");
  const [filterAccount, setFilterAccount] = useState<string>("ALL");
  const [filterType, setFilterType] = useState<"all" | "replies" | "unread">("all");

  const loadMessages = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchInboxMessages(100);
      setMessages(data.messages || []);
      setAccounts(data.accounts || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await triggerInboxSync();
      setSyncMsg(res.message);
      await loadMessages();
    } catch {
      setSyncMsg("Inbox sync failed.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  const filtered = messages.filter((m) => {
    const q = searchQ.toLowerCase();
    const matchSearch =
      !q ||
      m.from_email.toLowerCase().includes(q) ||
      m.subject.toLowerCase().includes(q) ||
      m.snippet.toLowerCase().includes(q);
    const matchAccount = filterAccount === "ALL" || m.account_email === filterAccount;
    const matchType =
      filterType === "all" ||
      (filterType === "replies" && m.is_reply) ||
      (filterType === "unread" && m.is_unread);
    return matchSearch && matchAccount && matchType;
  });

  const unreadCount = messages.filter((m) => m.is_unread).length;

  return (
    <div
      className="flex h-screen overflow-hidden text-white"
      style={{ background: "linear-gradient(135deg,#09090f 0%,#0d1021 60%,#090d18 100%)" }}
    >
      {/* ── Left Panel: Message List ── */}
      <div
        className="w-full max-w-sm flex-shrink-0 flex flex-col border-r border-slate-800/60"
        style={{ background: "rgba(10,12,22,0.95)" }}
      >
        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-slate-800/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-base font-bold text-white flex items-center gap-2">
                <span className="text-xl">📬</span> Inbox
                {unreadCount > 0 && (
                  <span className="text-xs bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-[11px] text-slate-500 mt-0.5">{accounts.length} account(s) connected</p>
            </div>
            <button
              id="inbox-refresh-btn"
              onClick={handleSync}
              disabled={syncing}
              title="Sync inbox"
              className="w-8 h-8 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 flex items-center justify-center transition text-sm disabled:opacity-50"
            >
              <span className={syncing ? "animate-spin inline-block" : ""}>🔄</span>
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="Search emails..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition"
          />

          {/* Filter tabs */}
          <div className="flex gap-1.5 mt-2.5">
            {(["all", "replies", "unread"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilterType(f)}
                className={`flex-1 py-1 rounded-lg text-xs font-medium transition capitalize ${
                  filterType === f
                    ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {f === "all" ? "All" : f === "replies" ? "↩ Replies" : "● Unread"}
              </button>
            ))}
          </div>

          {/* Account filter */}
          {accounts.length > 1 && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="w-full mt-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Accounts ({messages.length})</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a} ({messages.filter((m) => m.account_email === a).length})
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Sync status */}
        {syncMsg && (
          <div className="mx-3 mt-2 px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
            {syncMsg}
          </div>
        )}

        {/* Message list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3">
              <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-500 text-xs">Loading inbox...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 px-4 text-center">
              <span className="text-3xl opacity-30">📭</span>
              <p className="text-slate-500 text-xs">No messages found</p>
            </div>
          ) : (
            filtered.map((msg) => (
              <div
                key={msg.id}
                onClick={() => setSelected(msg)}
                className={`flex items-start gap-3 px-4 py-3.5 cursor-pointer border-b border-slate-800/40 transition-all duration-150 ${
                  selected?.id === msg.id
                    ? "bg-indigo-600/10 border-l-2 border-l-indigo-500"
                    : "hover:bg-slate-800/30"
                }`}
              >
                {/* Avatar */}
                <div
                  className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white ${avatarColor(msg.from_email)}`}
                >
                  {getInitial(msg.from_email)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`text-xs truncate font-semibold ${msg.is_unread ? "text-white" : "text-slate-400"}`}>
                      {msg.from_email}
                    </span>
                    <span className="text-[10px] text-slate-600 flex-shrink-0">{timeAgo(msg.date)}</span>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${msg.is_unread ? "text-slate-200 font-medium" : "text-slate-400"}`}>
                    {msg.subject}
                  </p>
                  <p className="text-[11px] text-slate-600 truncate mt-0.5">{msg.snippet}</p>

                  {/* Badges */}
                  <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                    {msg.is_unread && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0" />
                    )}
                    {msg.is_reply && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-400 border border-sky-500/30 font-medium">
                        ↩ Reply
                      </span>
                    )}
                    {accounts.length > 1 && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700/60 text-slate-500 truncate max-w-[80px]">
                        {msg.account_email.split("@")[0]}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer count */}
        <div className="px-4 py-2.5 border-t border-slate-800/60 text-[10px] text-slate-600">
          {filtered.length} of {messages.length} messages
        </div>
      </div>

      {/* ── Right Panel: Email Detail ── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Email header */}
            <div className="px-8 py-5 border-b border-slate-800/60 bg-slate-900/30 flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-white leading-snug">{selected.subject}</h2>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0 ${avatarColor(selected.from_email)}`}
                    >
                      {getInitial(selected.from_email)}
                    </div>
                    <div>
                      <span className="text-sm text-slate-200 font-medium">{selected.from_raw || selected.from_email}</span>
                      <p className="text-xs text-slate-500">{selected.from_email}</p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className="text-xs text-slate-500">{formatFullDate(selected.date)}</span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {selected.is_reply && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        ↩ Reply
                      </span>
                    )}
                    {selected.is_unread && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                        ● Unread
                      </span>
                    )}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-700/60 text-slate-400">
                      📮 {selected.account_email}
                    </span>
                  </div>
                </div>
              </div>

              {/* To field */}
              {selected.to && (
                <div className="mt-3 text-xs text-slate-500">
                  <span className="text-slate-600">To: </span>
                  <span className="text-slate-400">{selected.to}</span>
                </div>
              )}
            </div>

            {/* Email body */}
            <div className="flex-1 overflow-y-auto px-8 py-6">
              <div
                className="bg-slate-900/40 rounded-2xl border border-slate-800/50 p-6 text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-mono"
                style={{ minHeight: "200px" }}
              >
                {selected.body || selected.snippet || "(No content)"}
              </div>

              {/* Thread info */}
              {selected.in_reply_to && (
                <div className="mt-4 px-4 py-3 rounded-xl bg-slate-800/30 border border-slate-700/30 text-xs text-slate-500">
                  <span className="text-slate-600">↩ In reply to: </span>
                  <span className="font-mono break-all">{selected.in_reply_to}</span>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-20 h-20 rounded-3xl bg-slate-800/50 border border-slate-700/40 flex items-center justify-center text-4xl">
              ✉️
            </div>
            <div>
              <p className="text-slate-300 font-semibold text-base">Select an email to read</p>
              <p className="text-slate-600 text-sm mt-1">
                {messages.length > 0
                  ? `${messages.length} messages across ${accounts.length} account(s)`
                  : "Click 🔄 to scan your inbox"}
              </p>
            </div>
            {messages.length === 0 && !loading && (
              <button
                onClick={handleSync}
                disabled={syncing}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition"
              >
                {syncing ? "Scanning..." : "🔄 Scan Inbox Now"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
