"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  fetchInboxMessages,
  triggerInboxSync,
  deleteInboxMessage,
  sendManualReply,
  fetchEmailThread,
  InboxMessage,
  ThreadMessage,
  getStoredUser,
  hasPermission,
  AuthUser,
} from "@/lib/api";

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
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function initial(email: string) {
  return (email || "?")[0].toUpperCase();
}

function avatarBg(email: string) {
  const pool = [
    "bg-violet-500",
    "bg-sky-500",
    "bg-emerald-500",
    "bg-orange-500",
    "bg-pink-500",
    "bg-indigo-500",
    "bg-teal-500",
    "bg-rose-500",
  ];
  let h = 0;
  for (const c of email) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return pool[h % pool.length];
}

const labelStyle: Record<string, string> = {
  HOT_LEAD: "bg-orange-500/20 text-orange-300 border-orange-500/40",
  NEUTRAL: "bg-yellow-500/20 text-yellow-300 border-yellow-500/40",
  REJECTED: "bg-red-500/20 text-red-300 border-red-500/40",
};

interface ConversationThread {
  id: string;
  client_email: string;
  client_name?: string;
  subject: string;
  last_snippet: string;
  last_date: string | null;
  last_direction: "inbound" | "outbound";
  account_email: string;
  unread_count: number;
  has_reply: boolean;
  message_count: number;
  messages: InboxMessage[];
}

function ThreadBubble({ msg }: { msg: ThreadMessage }) {
  const out = msg.direction === "outbound";
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[88%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-sm ${
          out
            ? "bg-indigo-600/20 border border-indigo-500/30 text-indigo-100"
            : "bg-slate-800/70 border border-slate-700/50 text-slate-200"
        }`}
      >
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              out ? "text-indigo-400" : "text-slate-400"
            }`}
          >
            {out ? "📤 You" : `📥 ${msg.from || "Client"}`}
          </span>
          {msg.step > 0 && (
            <span className="text-[9px] bg-slate-700/60 text-slate-400 px-1.5 py-0.5 rounded-full">
              Step {msg.step}
            </span>
          )}
          {msg.ai_label && (
            <span
              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium ${
                labelStyle[msg.ai_label] || "bg-slate-700 text-slate-400"
              }`}
            >
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
              title={
                msg.analyzed_by === "OPENCLAW"
                  ? "Classified by OpenClaw AI Agent"
                  : "Classified by Deterministic Rule Engine"
              }
            >
              {msg.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw AI" : "🛡️ Rule Logic"}
            </span>
          )}
          <span className="text-[9px] text-slate-500 ml-auto">
            {timeAgo(msg.sent_at)}
          </span>
        </div>
        <p className="font-semibold text-xs mb-2 pb-1.5 border-b border-white/5 opacity-80">
          {msg.subject}
        </p>
        <p className="whitespace-pre-wrap text-xs sm:text-[13px] leading-relaxed text-slate-200/90 font-normal">
          {msg.body || msg.snippet || "(no content)"}
        </p>
      </div>
    </div>
  );
}

export default function InboxPage() {
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [selectedClientEmail, setSelectedClientEmail] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  const [showReply, setShowReply] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [filterAccount, setFilterAccount] = useState("ALL");
  const [filterType, setFilterType] = useState<"all" | "replies" | "unread">("all");
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const threadEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCurrentUser(getStoredUser());
  }, []);

  const loadMessages = useCallback(async () => {
    setLoading(true);
    const data = await fetchInboxMessages(100);
    setMessages(data.messages || []);
    setAccounts(data.accounts || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const conversations = useMemo<ConversationThread[]>(() => {
    const map = new Map<string, ConversationThread>();

    for (const msg of messages) {
      let clientEmail = "";
      if (msg.direction === "outbound") {
        clientEmail = (msg.to || "").trim().toLowerCase();
      } else {
        clientEmail = (msg.from_email || "").trim().toLowerCase();
      }

      if (!clientEmail || !clientEmail.includes("@")) {
        clientEmail = (msg.from_email || msg.to || "unknown@domain.com").trim().toLowerCase();
      }

      const existing = map.get(clientEmail);
      if (!existing) {
        const cleanedSubject = msg.subject ? msg.subject.replace(/^(re:\s*)+/i, "").trim() : "(No Subject)";
        map.set(clientEmail, {
          id: clientEmail,
          client_email: clientEmail,
          client_name: msg.direction === "inbound" && msg.from_raw ? msg.from_raw.replace(/<.*?>/, "").trim() : undefined,
          subject: cleanedSubject || "(No Subject)",
          last_snippet: msg.snippet || msg.body || "",
          last_date: msg.date,
          last_direction: msg.direction || "inbound",
          account_email: msg.account_email,
          unread_count: msg.is_unread ? 1 : 0,
          has_reply: Boolean(msg.is_reply || msg.direction === "inbound"),
          message_count: 1,
          messages: [msg],
        });
      } else {
        existing.message_count += 1;
        existing.messages.push(msg);
        if (msg.is_unread) existing.unread_count += 1;
        if (msg.is_reply || msg.direction === "inbound") existing.has_reply = true;

        const existingTime = existing.last_date ? new Date(existing.last_date).getTime() : 0;
        const msgTime = msg.date ? new Date(msg.date).getTime() : 0;
        if (msgTime >= existingTime) {
          existing.last_date = msg.date;
          existing.last_snippet = msg.snippet || msg.body || existing.last_snippet;
          existing.last_direction = msg.direction || "inbound";
          if (msg.direction === "inbound" && msg.from_raw) {
            existing.client_name = msg.from_raw.replace(/<.*?>/, "").trim();
          }
          if (msg.account_email) {
            existing.account_email = msg.account_email;
          }
        }
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const ta = a.last_date ? new Date(a.last_date).getTime() : 0;
      const tb = b.last_date ? new Date(b.last_date).getTime() : 0;
      return tb - ta;
    });
  }, [messages]);

  useEffect(() => {
    if (conversations.length > 0 && !selectedClientEmail) {
      setSelectedClientEmail(conversations[0].client_email);
    }
  }, [conversations, selectedClientEmail]);

  const activeConv = useMemo(() => {
    return conversations.find((c) => c.client_email === selectedClientEmail) || null;
  }, [conversations, selectedClientEmail]);

  useEffect(() => {
    if (!selectedClientEmail || !activeConv) {
      setThread([]);
      return;
    }

    setReplySubject(
      activeConv.subject.toLowerCase().startsWith("re:")
        ? activeConv.subject
        : `Re: ${activeConv.subject}`
    );
    setShowReply(false);
    setReplyBody("");
    setSendMsg(null);
    setThreadLoading(true);

    fetchEmailThread(selectedClientEmail)
      .then((r) => {
        let serverThread = r.thread || [];
        if (serverThread.length === 0 && activeConv.messages.length > 0) {
          serverThread = activeConv.messages.map((m) => ({
            direction: (m.direction as "inbound" | "outbound") || "inbound",
            from: m.from_email,
            to: m.to,
            subject: m.subject,
            body: m.body || m.snippet,
            snippet: m.snippet,
            sent_at: m.date,
            step: 0,
          }));
          serverThread.sort((a, b) => {
            const ta = a.sent_at ? new Date(a.sent_at).getTime() : 0;
            const tb = b.sent_at ? new Date(b.sent_at).getTime() : 0;
            return ta - tb;
          });
        }
        setThread(serverThread);
        setThreadLoading(false);
        setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      })
      .catch((e) => {
        console.debug("Thread fetch notice:", e);
        setThreadLoading(false);
      });
  }, [selectedClientEmail, activeConv]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await triggerInboxSync();
      setSyncMsg(r.message);
      await loadMessages();
    } catch {
      setSyncMsg("Sync failed.");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 5000);
    }
  };

  const handleDeleteConversation = async (conv: ConversationThread) => {
    if (!hasPermission(currentUser, "can_delete_inbox", false)) {
      alert("Permission Denied: Your account does not have permission to delete inbox messages.");
      return;
    }
    if (!confirm(`Delete conversation with "${conv.client_email}" (${conv.message_count} messages)?`)) return;
    setDeletingId(conv.id);
    try {
      for (const m of conv.messages) {
        if (m.account_id && m.imap_seq && !m.imap_seq.startsWith("sent_")) {
          await deleteInboxMessage(m.account_id, m.imap_seq);
        }
      }
      setMessages((prev) =>
        prev.filter((m) => {
          const target = m.direction === "outbound" ? m.to : m.from_email;
          return (target || "").toLowerCase() !== conv.client_email.toLowerCase();
        })
      );
      if (selectedClientEmail === conv.client_email) {
        setSelectedClientEmail(null);
      }
    } catch (e: any) {
      setSendMsg(`Delete error: ${e.message}`);
    } finally {
      setDeletingId(null);
    }
  };

  const handleSendReply = async () => {
    if (!activeConv || !replyBody.trim()) return;
    setSending(true);
    setSendMsg(null);
    try {
      await sendManualReply({
        to_email: activeConv.client_email,
        subject: replySubject,
        body: replyBody,
        account_id: activeConv.account_email,
      });
      setSendMsg(`Reply sent to ${activeConv.client_email}`);
      const newMsg: ThreadMessage = {
        direction: "outbound",
        to: activeConv.client_email,
        subject: replySubject,
        body: replyBody,
        snippet: replyBody.slice(0, 140),
        sent_at: new Date().toISOString(),
        step: 0,
      };
      setThread((prev) => [...prev, newMsg]);
      setReplyBody("");
      setShowReply(false);
      setTimeout(() => threadEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: any) {
      setSendMsg(`Error: ${e.message}`);
    } finally {
      setSending(false);
      setTimeout(() => setSendMsg(null), 6000);
    }
  };

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const q = searchQ.toLowerCase().trim();
      const matchesSearch =
        !q ||
        c.client_email.toLowerCase().includes(q) ||
        (c.client_name && c.client_name.toLowerCase().includes(q)) ||
        c.subject.toLowerCase().includes(q) ||
        c.last_snippet.toLowerCase().includes(q);

      const matchesAccount = filterAccount === "ALL" || c.account_email === filterAccount;
      const matchesType =
        filterType === "all" ||
        (filterType === "replies" && c.has_reply) ||
        (filterType === "unread" && c.unread_count > 0);

      return matchesSearch && matchesAccount && matchesType;
    });
  }, [conversations, searchQ, filterAccount, filterType]);

  const totalUnreadConversations = useMemo(() => {
    return conversations.filter((c) => c.unread_count > 0).length;
  }, [conversations]);

  return (
    <div
      className="flex h-screen overflow-hidden text-white"
      style={{ background: "linear-gradient(135deg,#09090f 0%,#0d1021 60%,#090d18 100%)" }}
    >
      <div
        className="w-84 sm:w-96 flex-shrink-0 flex flex-col border-r border-slate-800/60"
        style={{ background: "rgba(10,12,22,0.97)" }}
      >
        <div className="px-4 pt-5 pb-3 border-b border-slate-800/60">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <span className="text-lg">📬</span> Unified Inbox
                {totalUnreadConversations > 0 && (
                  <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">
                    {totalUnreadConversations}
                  </span>
                )}
              </h1>
              <p className="text-[10px] text-slate-500">
                {conversations.length} conversation{conversations.length === 1 ? "" : "s"} across {accounts.length} account(s)
              </p>
            </div>
            <button
              id="inbox-refresh-btn"
              onClick={handleSync}
              disabled={syncing}
              className="w-7 h-7 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 text-indigo-300 flex items-center justify-center text-sm disabled:opacity-50 transition"
              title="Sync Inbox"
            >
              <span className={syncing ? "animate-spin inline-block" : ""}>🔄</span>
            </button>
          </div>

          <input
            type="text"
            placeholder="Search conversations..."
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
            className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500/50 transition"
          />

          <div className="flex gap-1 mt-2">
            {(["all", "replies", "unread"] as const).map((f) => {
              const count =
                f === "all"
                  ? conversations.length
                  : f === "replies"
                  ? conversations.filter((c) => c.has_reply).length
                  : conversations.filter((c) => c.unread_count > 0).length;

              return (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`flex-1 py-1 rounded-lg text-[10px] font-medium transition capitalize flex items-center justify-center gap-1 ${
                    filterType === f
                      ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                      : "text-slate-500 hover:text-slate-300"
                  }`}
                >
                  <span>{f === "all" ? "All" : f === "replies" ? "↩ Replies" : "● Unread"}</span>
                  <span className="text-[9px] opacity-70 font-mono">({count})</span>
                </button>
              );
            })}
          </div>

          {accounts.length > 1 && (
            <select
              value={filterAccount}
              onChange={(e) => setFilterAccount(e.target.value)}
              className="w-full mt-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5 text-[10px] text-slate-300 focus:outline-none"
            >
              <option value="ALL">All Accounts</option>
              {accounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          )}
        </div>

        {syncMsg && (
          <div className="mx-3 mt-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px]">
            {syncMsg}
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-40 gap-2 text-slate-500 text-xs">
              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              Loading conversations...
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-600 text-xs text-center px-4">
              <span className="text-2xl">📭</span>
              <p>No conversations found</p>
              <button
                onClick={handleSync}
                className="mt-1 text-indigo-400 hover:underline text-[11px]"
              >
                Scan inbox now
              </button>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedClientEmail === conv.client_email;
              return (
                <div
                  key={conv.id}
                  className={`group relative flex items-start gap-3 px-4 py-3 cursor-pointer transition ${
                    isSelected
                      ? "bg-indigo-600/15 border-l-2 border-indigo-500"
                      : "hover:bg-slate-800/30"
                  }`}
                  onClick={() => setSelectedClientEmail(conv.client_email)}
                >
                  <div
                    className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm ${avatarBg(
                      conv.client_email
                    )}`}
                  >
                    {initial(conv.client_email)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`text-[12px] truncate font-semibold ${
                          conv.unread_count > 0 ? "text-white" : "text-slate-300"
                        }`}
                      >
                        {conv.client_name || conv.client_email}
                      </span>
                      <span className="text-[9px] text-slate-500 flex-shrink-0">
                        {timeAgo(conv.last_date)}
                      </span>
                    </div>

                    <p
                      className={`text-[11px] truncate mt-0.5 ${
                        conv.unread_count > 0 ? "text-slate-200 font-medium" : "text-slate-400"
                      }`}
                    >
                      {conv.subject}
                    </p>

                    <p className="text-[10px] text-slate-500 truncate mt-0.5">
                      {conv.last_direction === "outbound" ? "You: " : ""}
                      {conv.last_snippet}
                    </p>

                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {conv.unread_count > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                      {conv.has_reply && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 border border-sky-500/25 font-semibold">
                          ↩ Reply
                        </span>
                      )}
                      {conv.message_count > 1 && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 font-medium">
                          {conv.message_count} msgs
                        </span>
                      )}
                      {conv.last_direction === "outbound" && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-medium">
                          📤 Sent
                        </span>
                      )}
                    </div>
                  </div>

                  {hasPermission(currentUser, "can_delete_inbox", false) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteConversation(conv);
                      }}
                      disabled={deletingId === conv.id}
                      title="Delete entire conversation"
                      className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-lg bg-red-500/20 hover:bg-red-500/40 text-red-400 flex items-center justify-center text-[10px] transition disabled:opacity-50"
                    >
                      {deletingId === conv.id ? "⏳" : "🗑"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-800/60 text-[9px] text-slate-500">
          Showing {filteredConversations.length} / {conversations.length} conversation threads
        </div>
      </div>

      <div className="flex-1 flex flex-col overflow-hidden">
        {activeConv ? (
          <>
            <div className="px-6 py-4 border-b border-slate-800/60 bg-slate-900/30 flex-shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold text-white truncate">
                    {activeConv.subject}
                  </h2>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 ${avatarBg(
                        activeConv.client_email
                      )}`}
                    >
                      {initial(activeConv.client_email)}
                    </div>
                    <span className="text-xs text-slate-200 font-semibold">
                      {activeConv.client_name || activeConv.client_email}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      &lt;{activeConv.client_email}&gt;
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-[10px] text-slate-500">
                    {fmt(activeConv.last_date)}
                  </span>
                  {activeConv.has_reply && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-300 border border-sky-500/30 font-medium">
                      ↩ Replied
                    </span>
                  )}
                  {hasPermission(currentUser, "can_send_emails", false) ? (
                    <button
                      id="open-reply-composer"
                      onClick={() => setShowReply((v) => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition shadow-lg shadow-indigo-500/20"
                    >
                      ✍️ {showReply ? "Close" : "Reply"}
                    </button>
                  ) : (
                    <span
                      title="Direct outbound sending is restricted for your account"
                      className="text-[11px] px-2.5 py-1 rounded-xl bg-slate-800 text-slate-500 border border-slate-700/60 font-medium cursor-not-allowed"
                    >
                      Reply (Restricted)
                    </span>
                  )}
                  {hasPermission(currentUser, "can_delete_inbox", false) && (
                    <button
                      onClick={() => handleDeleteConversation(activeConv)}
                      disabled={deletingId === activeConv.id}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-medium transition disabled:opacity-50"
                      title="Delete Conversation"
                    >
                      {deletingId === activeConv.id ? "⏳" : "🗑️"}
                    </button>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                📮 Connected via account: {activeConv.account_email}
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {threadLoading ? (
                <div className="flex items-center justify-center h-28 gap-2">
                  <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  <p className="text-slate-400 text-xs">Loading complete conversation thread...</p>
                </div>
              ) : thread.length > 0 ? (
                <>
                  <div className="flex items-center justify-between mb-4 border-b border-slate-800/60 pb-2">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      💬 Full Thread Timeline — {thread.length} message{thread.length === 1 ? "" : "s"}
                    </p>
                    <span className="text-[9px] text-slate-500">
                      Chronological Order
                    </span>
                  </div>
                  {thread.map((t, i) => (
                    <ThreadBubble key={i} msg={t} />
                  ))}
                  <div ref={threadEndRef} />
                </>
              ) : (
                <div className="bg-slate-900/40 rounded-2xl border border-slate-800/50 p-5 text-xs text-slate-200 leading-relaxed whitespace-pre-wrap font-mono">
                  {activeConv.last_snippet || "(No content recorded for this conversation)"}
                </div>
              )}
            </div>

            {showReply && (
              <div className="border-t border-slate-800/60 bg-slate-900/70 px-6 py-4 flex-shrink-0">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 w-16">To:</span>
                    <span className="text-xs text-indigo-300 font-medium">
                      {activeConv.client_email}
                    </span>
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
                    placeholder={`Write your reply to ${activeConv.client_email}...`}
                    className="w-full bg-slate-800/60 border border-slate-700/50 rounded-xl px-4 py-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50 resize-none"
                    autoFocus
                  />
                  <div className="flex items-center justify-between gap-3">
                    {sendMsg && (
                      <span
                        className={`text-xs ${
                          sendMsg.startsWith("Reply sent")
                            ? "text-emerald-400 font-medium"
                            : "text-red-400"
                        }`}
                      >
                        {sendMsg}
                      </span>
                    )}
                    <div className="flex gap-2 ml-auto">
                      <button
                        onClick={() => setShowReply(false)}
                        className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 text-xs transition"
                      >
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
            <div className="w-16 h-16 rounded-3xl bg-slate-800/50 border border-slate-700/40 flex items-center justify-center text-3xl">
              ✉️
            </div>
            <div>
              <p className="text-slate-300 font-semibold">Select a conversation to read</p>
              <p className="text-slate-500 text-sm mt-1">
                {conversations.length > 0
                  ? `${conversations.length} conversation thread(s) available`
                  : "Click 🔄 to scan your inbox"}
              </p>
            </div>
            {conversations.length === 0 && !loading && (
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
