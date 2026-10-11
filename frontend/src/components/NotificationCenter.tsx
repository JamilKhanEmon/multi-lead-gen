"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Bell,
  BellRing,
  X,
  ExternalLink,
  CheckCheck,
  Flame,
  MessageSquare,
  Ban,
  Sparkles,
  ShieldAlert,
} from "lucide-react";
import { fetchReplies, ReplyEntry } from "@/lib/api";

interface ToastNotification {
  id: string;
  title: string;
  company_name: string;
  client_email: string;
  ai_label: string;
  analyzed_by?: string;
  snippet: string;
  created_at: number;
}

export default function NotificationCenter() {
  const router = useRouter();
  const [replies, setReplies] = useState<ReplyEntry[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const [soundEnabled, setSoundEnabled] = useState(true);

  const seenIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Synthesize pleasant notification chime via Web Audio API (Zero external assets needed)
  const playChime = useCallback((isHot: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      if (isHot) {
        // High-energy positive chime for HOT LEAD (C5 -> E5 -> G5 chord)
        [523.25, 659.25, 783.99].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.35);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.35);
        });
      } else {
        // Gentle neutral chime (D5 -> A5)
        [587.33, 880].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = "sine";
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.07);
          gain.gain.setValueAtTime(0.09, ctx.currentTime + idx * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.07 + 0.3);
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start(ctx.currentTime + idx * 0.07);
          osc.stop(ctx.currentTime + idx * 0.07 + 0.3);
        });
      }
    } catch {
      // Ignored if browser blocks audio before first user interaction
    }
  }, []);

  // Poll for replies and trigger real-time alerts
  const checkNewReplies = useCallback(async () => {
    try {
      const data = await fetchReplies();
      if (!Array.isArray(data)) return;

      setReplies(data);

      // Load already seen IDs from localStorage
      let storedSeen = new Set<string>();
      try {
        const raw = localStorage.getItem("leadgen_seen_replies");
        if (raw) storedSeen = new Set(JSON.parse(raw));
      } catch {}

      if (initialLoadRef.current) {
        // First load: seed seen IDs so old replies don't trigger a flood of toasts
        data.forEach((r) => storedSeen.add(r.id));
        seenIdsRef.current = storedSeen;
        try {
          localStorage.setItem("leadgen_seen_replies", JSON.stringify([...storedSeen]));
        } catch {}
        initialLoadRef.current = false;

        // Unread count: items marked unread in local state
        const unread = data.filter((r) => !storedSeen.has(r.id));
        setUnreadCount(unread.length);
        return;
      }

      // Detect genuinely NEW incoming replies
      const newIncoming: ReplyEntry[] = [];
      for (const r of data) {
        if (!seenIdsRef.current.has(r.id) && !storedSeen.has(r.id)) {
          newIncoming.push(r);
          seenIdsRef.current.add(r.id);
          storedSeen.add(r.id);
        }
      }

      if (newIncoming.length > 0) {
        try {
          localStorage.setItem("leadgen_seen_replies", JSON.stringify([...storedSeen]));
        } catch {}

        setUnreadCount((prev) => prev + newIncoming.length);

        // Spawn visual toast and play chime
        newIncoming.slice(0, 3).forEach((item) => {
          const isHot = item.ai_label === "HOT_LEAD";
          const title = isHot
            ? "🔥 HOT LEAD Alert!"
            : item.ai_label === "REJECTED"
            ? "🚫 Rejection Received"
            : "💬 New Lead Reply";

          if (soundEnabled) {
            playChime(isHot);
          }

          const toastId = `${item.id}-${Date.now()}`;
          const newToast: ToastNotification = {
            id: toastId,
            title,
            company_name: item.company_name || "Unknown Business",
            client_email: item.client_email,
            ai_label: item.ai_label,
            analyzed_by: item.analyzed_by,
            snippet: item.reply_snippet || item.reply_text || "New message from prospect",
            created_at: Date.now(),
          };

          setToasts((prev) => [newToast, ...prev.slice(0, 4)]);

          // Auto-dismiss toast after 7 seconds
          setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== toastId));
          }, 7000);
        });
      }
    } catch (err) {
      // Background poll silently catches errors
    }
  }, [playChime, soundEnabled]);

  useEffect(() => {
    checkNewReplies();
    const interval = setInterval(checkNewReplies, 15000); // Poll every 15s
    return () => clearInterval(interval);
  }, [checkNewReplies]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const markAllAsRead = () => {
    setUnreadCount(0);
    const allIds = replies.map((r) => r.id);
    seenIdsRef.current = new Set(allIds);
    try {
      localStorage.setItem("leadgen_seen_replies", JSON.stringify(allIds));
    } catch {}
  };

  const navigateToMessage = (clientEmail: string) => {
    setIsOpen(false);
    router.push(`/inbox?client=${encodeURIComponent(clientEmail)}`);
  };

  return (
    <>
      {/* ── Bell Icon in Header ── */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (!isOpen) {
              setUnreadCount(0);
            }
          }}
          className={`relative p-2 rounded-xl border transition cursor-pointer ${
            unreadCount > 0
              ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10"
              : "bg-slate-900 hover:bg-slate-800 border-slate-800 text-slate-400 hover:text-slate-200"
          }`}
          title="Lead Alerts & Incoming Replies"
        >
          {unreadCount > 0 ? (
            <BellRing className="w-4 h-4 animate-bounce text-amber-400" />
          ) : (
            <Bell className="w-4 h-4" />
          )}

          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 px-1.5 py-0.2 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-rose-500/30">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>

        {/* ── Dropdown Menu ── */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center justify-between p-3.5 border-b border-slate-800 bg-slate-950/70">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                  Live Lead Notifications
                </h4>
              </div>
              <button
                type="button"
                onClick={markAllAsRead}
                className="text-[10px] text-slate-400 hover:text-sky-300 flex items-center gap-1 transition cursor-pointer"
                title="Mark all as read"
              >
                <CheckCheck className="w-3 h-3" />
                <span>Mark Read</span>
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60 font-sans">
              {replies && replies.length > 0 ? (
                replies.slice(0, 10).map((r) => {
                  const isHot = r.ai_label === "HOT_LEAD";
                  const isRej = r.ai_label === "REJECTED";

                  return (
                    <div
                      key={r.id}
                      onClick={() => navigateToMessage(r.client_email)}
                      className="p-3 hover:bg-slate-800/50 transition cursor-pointer group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs flex-shrink-0 ${
                              isHot
                                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                : isRej
                                ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                                : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                            }`}
                          >
                            {isHot ? "🔥" : isRej ? "🚫" : "💬"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate group-hover:text-sky-300 transition">
                              {r.company_name || r.client_email}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">{r.client_email}</p>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <span
                            className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${
                              isHot
                                ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                : isRej
                                ? "bg-rose-500/15 text-rose-300 border-rose-500/30"
                                : "bg-slate-700 text-slate-300 border-slate-600"
                            }`}
                          >
                            {r.ai_label?.replace("_", " ")}
                          </span>
                          {r.analyzed_by && (
                            <span className="text-[8px] text-purple-300 font-mono">
                              {r.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw" : "🛡️ Logic"}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="mt-1.5 text-[11px] text-slate-300/90 line-clamp-2 leading-relaxed bg-slate-950/40 p-1.5 rounded-lg border border-white/5">
                        {r.reply_snippet || r.reply_text || "No preview"}
                      </p>
                    </div>
                  );
                })
              ) : (
                <div className="p-6 text-center text-slate-500 text-xs">
                  No incoming email replies detected yet.
                </div>
              )}
            </div>

            <div className="p-2 border-t border-slate-800 bg-slate-950/70 flex items-center justify-between text-[11px]">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push("/replies");
                }}
                className="text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 transition"
              >
                <span>View All Replies</span>
                <ExternalLink className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  router.push("/inbox");
                }}
                className="text-slate-400 hover:text-slate-200 transition"
              >
                Go to Inbox
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Floating Real-Time Toast Notifications (Top-Right) ── */}
      <div className="fixed top-20 right-4 sm:right-6 z-[999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => {
          const isHot = toast.ai_label === "HOT_LEAD";
          const isRej = toast.ai_label === "REJECTED";

          return (
            <div
              key={toast.id}
              className={`pointer-events-auto rounded-2xl border p-4 shadow-2xl backdrop-blur-md transition-all transform animate-in slide-in-from-right duration-300 ${
                isHot
                  ? "bg-slate-950/95 border-amber-500/50 shadow-amber-500/20 text-amber-100"
                  : isRej
                  ? "bg-slate-950/95 border-rose-500/50 shadow-rose-500/20 text-rose-100"
                  : "bg-slate-950/95 border-sky-500/50 shadow-sky-500/20 text-sky-100"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">{isHot ? "🔥" : isRej ? "🚫" : "💬"}</span>
                  <div>
                    <h5 className="text-xs font-black tracking-wide">{toast.title}</h5>
                    <p className="text-[11px] font-semibold text-white truncate max-w-[200px]">
                      {toast.company_name}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="mt-2 text-xs text-slate-300 line-clamp-2 bg-black/40 p-2 rounded-xl border border-white/5">
                "{toast.snippet}"
              </p>

              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
                  {toast.analyzed_by === "OPENCLAW" ? "⚡ OpenClaw AI" : "🛡️ Rule Logic"}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    setToasts((prev) => prev.filter((t) => t.id !== toast.id));
                    router.push(`/inbox?client=${encodeURIComponent(toast.client_email)}`);
                  }}
                  className="text-xs font-bold px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 transition flex items-center gap-1 shadow-md shadow-sky-500/20"
                >
                  <span>Open Inbox</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
