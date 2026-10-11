"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  fetchInboxMessages,
  triggerInboxSync,
  deleteInboxMessage,
  sendManualReply,
  fetchEmailThread,
  InboxMessage,
  ThreadMessage,
} from "@/lib/api";

/* ── Helpers ─────────────────────────────────────── */
function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}
function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short", month: "short", day: "numeric",
    year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}
function initial(email: string) { return (email || "?")[0].toUpperCase(); }
function avatarBg(email: string) {
  const pool = ["bg-violet-500","bg-sky-500","bg-emerald-500","bg-orange-500",
                 "bg-pink-500","bg-indigo-500","bg-teal-500","bg-rose-500"];
  let h = 0; for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return pool[h % pool.length];
}

const labelStyle: Record<string, string> = {
  HOT_LEAD: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  NEUTRAL:  "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/40",
};

/* ── Thread bubble ───────────────────────────────── */
function ThreadBubble({ msg }: { msg: ThreadMessage }) {
  const out = msg.direction === "outbound";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"} mb-4`}>
      <div className={`max-w-[88%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
        out
          ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-100"
          : "bg-slate-800/70 border border-slate-700/50 text-slate-200"
      }`}>
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className={`text-[10px] font-bold uppercase tracking-wider ${out ? "text-indigo-400" : "text-slate-400"}`}>
            {out ? "📤 You" : `📥 ${msg.from || "Client"}`}
          </span>
          {msg.step > 0 && (
            <span className="text-[9px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full">
              Step {msg.step}
            </span>
          )}
          {msg.ai_label && (
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${labelStyle[msg.ai_label] || "bg-slate-700 text-slate-400"}`}>
              🤖 {msg.ai_label.replace("_", " ")}
            </span>
          )}
          {msg.analyzed_by && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium flex items-center gap-1 ${
                msg.analyzed_by === "OPENCLAW"
                  ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                  : "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
              }`}
              title={msg.analyzed_by === "OPENCLAW" ? "Classified by OpenClaw AI Agent" : "Classified by Deterministic Rule Engine"}
            >
              {msg.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw AI" : "🛡️ Rule Logic"}
            </span>
          )}
          <span className="text-[9px] text-slate-500 ml-auto">{timeAgo(msg.sent_at)}</span>
        </div>
        <p className="font-semibold text-xs mb-2 pb-1.5 border-b border-white/5 opacity-80">{msg.subject}</p>
        <p className="whitespace-pre-wrap text-xs sm:text-[13px] leading-relaxed text-slate-200/90 font-normal">{msg.body || msg.snippet || "(no content)"}</p>
      </div>
    </div>
  );
}

/* ── Main page ───────────────────────────────────── */
export default function InboxPage() {
  const [messages, setMessages]         = useState<InboxMessage[]>([]);
  const [accounts, setAccounts]         = useState<string[]>([]);
  const [selected, setSelected]         = useState<InboxMessage | null>(null);
  const [thread, setThread]             = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loading, setLoading]           = useState(true);
  const [syncing, setSyncing]           = useState(false);
  const [syncMsg, setSyncMsg]           = useState<string | null>(null);
  const [deletingId, setDeletingId]     = useState<string | null>(null);
  const [replyBody, setReplyBody]       = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending]           = useState(false);
  const [sendMsg, setSendMsg]           = useState<string | null>(null);
  const [showReply, setShowReply]       = useState(false);
  const [searchQ, setSearchQ]           = useState("");
  const [filterAccount, setFilterAccount] = useState("ALL");
  const [filterType, setFilterType]     = useState<"all"|"replies"|"unread">("all");
  const threadEndRef                    = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const data = await fetchInboxMessages(100);
    setMessages(data.messages || []);
    setAccounts(data.accounts || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  // Load thread when message selected
  useEffect(() => {
    if (!selected) { setThread([]); return; }
    setReplySubject(`Re: ${selected.subject}`);
    setShowReply(false);
    setReplyBody("");
    setSendMsg(null);
    setThreadLoading(true);
    fetchEmailThread(selected.from_email).then((r) => {
      setThread(r.thread || []);
      setThreadLoading(false);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    });
  }, [selected]);

  const handleSync = async () => {
    setSyncing(true); setSyncMsg(null);
    try {
      const r = await triggerInboxSync();
      setSyncMsg(r.message);
      await loadMessages();
    } catch { setSyncMsg("Sync failed."); }
    finally { setSyncing(false); setTimeout(() => setSyncMsg(null), 5000); }
  };

  const handleDelete = async (msg: InboxMessage) => {
    if (!confirm(`Delete this email from "${msg.from_email}"?`)) return;
    setDeletingId(msg.id);
    try {
      await deleteInboxMessage(msg.account_id, msg.imap_seq);
      setMessages((prev) => prev.filter((m) => m.id !== msg.id));
      if (selected?.id === msg.id) setSelected(null);
    } catch (e: any) {
      setSendMsg(`❌ Delete failed: ${e.message}`);
    } finally { setDeletingId(null); }
  };

  const handleSendReply = async () => {
    if (!selected || !replyBody.trim()) return;
    setSending(true); setSendMsg(null);
    try {
      await sendManualReply({
        to_email: selected.from_email,
        subject: replySubject,
        body: replyBody,
        account_id: selected.account_id,
      });
      setSendMsg(`✅ Reply sent to ${selected.from_email}`);
      setReplyBody("");
      setShowReply(false);
      // Reload thread
      const r = await fetchEmailThread(selected.from_email);
      setThread(r.thread || []);
    } catch (e: any) {
      setSendMsg(`❌ ${e.message}`);
    } finally { setSending(false); setTimeout(() => setSendMsg(null), 6000); }
  };

  const filtered = messages.filter((m) => {
    const q = searchQ.toLowerCase();
    const ms = !q || m.from_email.toLowerCase().includes(q) ||
               m.subject.toLowerCase().includes(q) || m.snippet.toLowerCase().includes(q);
    const ma = filterAccount === "ALL" || m.account_email === filterAccount;
    const mt = filterType === "all" || (filterType === "replies" && m.is_reply) ||
               (filterType === "unread" && m.is_unread);
    return ms && ma && mt;
  });

  const unreadCount = messages.filter((m) => m.is_unread).length;

  return (
    <div className="flex h-screen overflow-hidden text-white"
         style={{ background: "linear-gradient(135deg,#09090f 0%,#0d1021 60%,#090d18 100%)" }}>

      {/* ── LEFT: Message List ─────────────────────── */}
      <div className="w-80 flex-shrink-0 flex flex-col border-r border-slate-800/60"
           style={{ background: "rgba(10,12,22,0.97)" }}>

        {/* Header */}
        <div className="px-4 pt-5 pb-3 border-b border-slate-800/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="text-lg">📬</span> Inbox
                {unreadCount > 0 && (
                  <span className="text-[10px] bg-indigo-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                    {unreadCount}
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-slate-500">{accounts.length} account(s)</p>
            </div>
            <button id="inbox-refresh-btn" onClick={handleSync} disabled={syncing}
              className="w-7 h-7 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-sm disabled:opacity-50 transition">
              <span className={syncing ? "animate-spin inline-block" : ""}>🔄</span>
            </button>
          </div>

          <input type="text" placeholder="Search..." value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition" />

          <div className="flex gap-1 mt-2">
            {(["all","replies","unread"] as const).map((f) => (
              <button key={f} onClick={() => setFilterType(f)}
                className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition capitalize ${
                  filterType === f ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40" : "text-slate-600 hover:text-slate-400"
                }`}>
                {f === "all" ? "All" : f === "replies" ? "↩ Replies" : "● Unread"}
              </button>
            ))}
          </div>

          {accounts.length > 1 && (
            <select value={filterAccount} onChange={(e) => setFilterAccount(e.target.value)}
              className="w-full mt-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-[10px] text-slate-300 focus:outline-none">
              <option value="ALL">All Accounts ({messages.length})</option>
              {accounts.map((a) => (
                <option key={a} value={a}>{a} ({messages.filter((m) => m.account_email === a).length})</option>
              ))}
            </select>
          )}
        </div>

        {syncMsg && (
          <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px]">
            {syncMsg}
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-slate-600 text-[10px]">Loading...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 gap-2 text-center px-4">
              <span className="text-2xl opacity-30">📭</span>
              <p className="text-slate-600 text-xs">No messages</p>
            </div>
          ) : (
            filtered.map((msg) => (
              <div key={msg.id}
                className={`group relative flex items-start gap-2.5 px-3 py-3 cursor-pointer border-b border-slate-800/30 transition-all ${
                  selected?.id === msg.id
                    ? "bg-indigo-600/10 border-l-2 border-l-indigo-500"
                    : "hover:bg-slate-800/20"
                }`}
                onClick={() => setSelected(msg)}>

                {/* Avatar */}
                <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white ${avatarBg(msg.from_email)}`}>
                  {initial(msg.from_email)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-[11px] truncate font-semibold ${msg.is_unread ? "text-white" : "text-slate-400"}`}>
                      {msg.from_email}
                    </span>
                    <span className="text-[9px] text-slate-700 flex-shrink-0">{timeAgo(msg.date)}</span>
                  </div>
                  <p className={`text-[10px] truncate mt-0.5 ${msg.is_unread ? "text-slate-200 font-medium" : "text-slate-500"}`}>
                    {msg.subject}
                  </p>
                  <p className="text-[9px] text-slate-700 truncate">{msg.snippet}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {msg.is_unread && <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />}
                    {msg.is_reply && <span className="text-[8px] px-1 py-0.5 rounded bg-sky-500/15 text-sky-400">↩ Reply</span>}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(msg); }}
                  disabled={deletingId === msg.id}
                  title="Delete email"
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center text-[10px] transition disabled:opacity-50"
                >
                  {deletingId === msg.id ? "⏳" : "🗑"}
                </button>
              </div>
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-800/60 text-[9px] text-slate-700">
          {filtered.length} / {messages.length} messages
        </div>
      </div>

      {/* ── RIGHT: Thread + Reply ──────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selected ? (
          <>
            {/* Email header */}
            <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/30 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-white truncate">{selected.subject}</h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${avatarBg(selected.from_email)}`}>
                      {initial(selected.from_email)}
                    </div>
                    <span className="text-xs text-slate-300 font-medium">{selected.from_raw || selected.from_email}</span>
                    <span className="text-[10px] text-slate-600">{selected.from_email}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-slate-600">{fmt(selected.date)}</span>
                  {selected.is_reply && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30">↩ Reply</span>
                  )}
                  {selected.is_unread && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">Unread</span>
                  )}
                  {/* Reply button */}
                  <button
                    id="open-reply-composer"
                    onClick={() => setShowReply((v) => !v)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-500/20"
                  >
                    ✍️ {showReply ? "Close" : "Reply"}
                  </button>
                  <button
                    onClick={() => handleDelete(selected)}
                    disabled={deletingId === selected.id}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium transition disabled:opacity-50"
                  >
                    {deletingId === selected.id ? "⏳" : "🗑️"}
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-600 mt-1">📮 via {selected.account_email}</p>
            </div>

            {/* Thread view */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {threadLoading ? (
                <div className="flex items-center justify-center h-20 gap-2">
                  <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-500 text-xs">Loading thread...</p>
                </div>
              ) : thread.length > 0 ? (
                <>
                  <p className="text-[10px] text-slate-600 mb-4 uppercase tracking-wider font-medium">
                    💬 Full Thread — {thread.length} messages
                  </p>
                  {thread.map((t, i) => <ThreadBubble key={i} msg={t} />)}
                  <div ref={threadEndRef} />
                </>
              ) : (
                /* No thread history — show raw email body */
                <div className="bg-slate-900/40 rounded-2xl border border-slate-800/50 p-5 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                  {selected.body || selected.snippet || "(No content)"}
                </div>
              )}
            </div>

            {/* Reply Composer */}
            {showReply && (
              <div className="border-t border-slate-800/60 bg-slate-900/60 px-6 py-4 flex-shrink-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">To:</span>
                    <span className="text-xs text-slate-300 font-medium">{selected.from_email}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">Subject:</span>
                    <input
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      className="flex-1 bg-slate-800/60 border border-slate-700/50 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                  <textarea
                    id="reply-body-textarea"
                    rows={5}
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write your reply..."
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none"
                  />
                  <div className="flex items-center justify-between gap-3">
                    {sendMsg && (
                      <span className={`text-xs ${sendMsg.startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
                        {sendMsg}
                      </span>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <button onClick={() => setShowReply(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition">
                        Cancel
                      </button>
                      <button
                        id="send-reply-btn"
                        onClick={handleSendReply}
                        disabled={sending || !replyBody.trim()}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition disabled:opacity-50 shadow-lg shadow-indigo-500/20"
                      >
                        {sending ? "⏳ Sending..." : "📤 Send Reply"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-6">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/50 border border-slate-700/40 flex items-center justify-center text-3xl">✉️</div>
            <div>
              <p className="text-slate-300 font-semibold">Select an email to read</p>
              <p className="text-slate-600 text-sm mt-1">
                {messages.length > 0
                  ? `${messages.length} messages across ${accounts.length} account(s)`
                  : "Click 🔄 to scan your inbox"}
              </p>
            </div>
            {messages.length === 0 && !loading && (
              <button onClick={handleSync} disabled={syncing}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition">
                {syncing ? "Scanning..." : "🔄 Scan Inbox Now"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
