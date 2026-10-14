"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  MessageSquare,
  Bot,
  User,
  Send,
  Sparkles,
  Phone,
  Mail,
  Globe,
  Settings,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Filter,
  RefreshCw,
  Power,
  UserCheck,
  UserX,
  ExternalLink,
  ChevronRight,
  Plus,
  Trash2,
  HelpCircle,
  Briefcase,
  DollarSign,
  Languages,
  AlertCircle,
  X,
  Check
} from "lucide-react";
import {
  fetchConversations,
  fetchConversationDetail,
  sendHumanMessage,
  toggleHumanTakeover,
  updateConversationStatus,
  convertConversationToLead,
  fetchChatbotConfig,
  updateChatbotConfig,
  simulateChatMessage,
  ConversationItem,
  ConversationDetail,
  ChatbotConfig
} from "@/lib/api";

export default function ConversationalLeadQualification() {
  // State
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeConversation, setActiveConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  
  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Human Message Input
  const [humanMsgText, setHumanMsgText] = useState<string>("");
  const [sendingMsg, setSendingMsg] = useState<boolean>(false);

  // Modals
  const [showConfigModal, setShowConfigModal] = useState<boolean>(false);
  const [showSimulateModal, setShowSimulateModal] = useState<boolean>(false);

  // Config Form State
  const [editConfig, setEditConfig] = useState<Partial<ChatbotConfig>>({});
  const [savingConfig, setSavingConfig] = useState<boolean>(false);
  const [configSuccess, setConfigSuccess] = useState<string | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);

  // Simulation State
  const [simText, setSimText] = useState<string>("");
  const [simSender, setSimSender] = useState<string>("Inbound Prospect");
  const [simPlatform, setSimPlatform] = useState<string>("whatsapp");
  const [simRunning, setSimRunning] = useState<boolean>(false);
  const [simResponse, setSimResponse] = useState<any | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Initial Load
  useEffect(() => {
    loadConfig();
    loadConversations();
  }, [platformFilter, statusFilter]);

  // Periodic Refresh
  useEffect(() => {
    const timer = setInterval(() => {
      loadConversations(false);
      if (selectedId) {
        loadConversationDetail(selectedId, false);
      }
    }, 6000);
    return () => clearInterval(timer);
  }, [selectedId, platformFilter, statusFilter]);

  useEffect(() => {
    if (selectedId) {
      loadConversationDetail(selectedId, true);
    }
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation?.messages]);

  const loadConfig = async () => {
    try {
      const data = await fetchChatbotConfig();
      setConfig(data);
      setEditConfig(data);
    } catch (err) {
      console.error("Failed to load chatbot config:", err);
    }
  };

  const loadConversations = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    try {
      const data = await fetchConversations(statusFilter, platformFilter, searchQuery);
      setConversations(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch (err) {
      console.error("Failed to load conversations:", err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  const loadConversationDetail = async (id: string, showSpinner = true) => {
    if (showSpinner) setDetailLoading(true);
    try {
      const detail = await fetchConversationDetail(id);
      setActiveConversation(detail);
    } catch (err) {
      console.error("Failed to load detail:", err);
    } finally {
      if (showSpinner) setDetailLoading(false);
    }
  };

  const handleToggleMasterAI = async () => {
    if (!config) return;
    const newMaster = !config.master_ai_enabled;
    try {
      await updateChatbotConfig({ master_ai_enabled: newMaster });
      setConfig({ ...config, master_ai_enabled: newMaster });
      setEditConfig((prev) => ({ ...prev, master_ai_enabled: newMaster }));
    } catch (err) {
      console.error("Failed to toggle master AI:", err);
    }
  };

  const handleToggleLeadTakeover = async () => {
    if (!activeConversation) return;
    const nextAi = !activeConversation.ai_enabled;
    try {
      const res = await toggleHumanTakeover(activeConversation.id, nextAi);
      setActiveConversation({
        ...activeConversation,
        ai_enabled: res.ai_enabled,
        status: res.status,
      });
      setConversations((prev) =>
        prev.map((c) =>
          c.id === activeConversation.id
            ? { ...c, ai_enabled: res.ai_enabled, status: res.status }
            : c
        )
      );
    } catch (err) {
      console.error("Failed to toggle lead takeover:", err);
    }
  };

  const handleSendHumanMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeConversation || !humanMsgText.trim() || sendingMsg) return;
    setSendingMsg(true);
    try {
      await sendHumanMessage(activeConversation.id, humanMsgText.trim(), "Support Agent");
      setHumanMsgText("");
      await loadConversationDetail(activeConversation.id, false);
      await loadConversations(false);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleConvertToLead = async () => {
    if (!activeConversation) return;
    try {
      const res = await convertConversationToLead(activeConversation.id);
      setActiveConversation({
        ...activeConversation,
        status: "QUALIFIED",
        qualification_score: 1.0,
        lead_id: res.lead_id,
      });
      loadConversations(false);
    } catch (err) {
      console.error("Failed to convert lead:", err);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    setConfigSuccess(null);
    try {
      setConfigError(null);
      await updateChatbotConfig(editConfig);
      await loadConfig();
      setConfigSuccess("Business Profile & AI Settings saved successfully!");
      setTimeout(() => setConfigSuccess(null), 3000);
    } catch (err: any) {
      setConfigError("Error updating config: " + err.message);
    } finally {
      setSavingConfig(false);
    }
  };

  const handleRunSimulation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!simText.trim() || simRunning) return;
    setSimRunning(true);
    setSimResponse(null);
    try {
      setConfigError(null);
      const res = await simulateChatMessage({
        platform: simPlatform,
        sender_name: simSender,
        message_text: simText.trim(),
      });
      setSimResponse(res);
      setSimText("");
      await loadConversations(false);
      setSelectedId(res.conversation_id);
    } catch (err: any) {
      setConfigError("Simulation error: " + err.message);
    } finally {
      setSimRunning(false);
    }
  };

  // Helper for language badges
  const getLanguageFlag = (lang?: string) => {
    if (!lang) return "🌐";
    const l = lang.toLowerCase();
    if (l.includes("bengali") || l.includes("bangla")) return "🇧🇩";
    if (l.includes("english")) return "🇺🇸";
    if (l.includes("spanish")) return "🇪🇸";
    if (l.includes("arabic")) return "🇸🇦";
    if (l.includes("hindi")) return "🇮🇳";
    if (l.includes("french")) return "🇫🇷";
    if (l.includes("german")) return "🇩🇪";
    return "🌐";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header / Master AI Bar */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bold text-sm tracking-wide text-white">
                  Conversational Lead Qualification
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-semibold">
                  Global Meta Ads AI
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Inbound WhatsApp & Messenger Chatbot with Real-time Multi-lingual Qualification
              </p>
            </div>
          </div>

          {/* Dynamic Active Business Badge */}
          {config && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/60 text-xs">
              <Briefcase className="w-3.5 h-3.5 text-cyan-400" />
              <span className="text-slate-400">Business:</span>
              <span className="font-semibold text-white">{config.business_name}</span>
              <span className="text-slate-500">•</span>
              <span className="text-slate-300">{config.country}</span>
              <span className="text-slate-500">•</span>
              <span className="font-mono text-cyan-300 font-bold">{config.currency_symbol} {config.currency_code}</span>
            </div>
          )}
        </div>

        {/* Master AI Toggle & Actions */}
        <div className="flex items-center gap-3">
          {/* Master AI Global Switch */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Master AI Pilot:</span>
            <button
              onClick={handleToggleMasterAI}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                config?.master_ai_enabled
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-amber-500/20 text-amber-400 border border-amber-500/40 hover:bg-amber-500/30"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  config?.master_ai_enabled ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`}
              />
              <span>{config?.master_ai_enabled ? "AI ACTIVE (AUTO)" : "PAUSED (MANUAL)"}</span>
            </button>
          </div>

          {/* Simulate Chat Trigger */}
          <button
            onClick={() => setShowSimulateModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simulate / Test</span>
          </button>

          {/* Business Profile Settings */}
          <button
            onClick={() => setShowConfigModal(true)}
            title="Configure Business Profile, Worldwide Currency & Qualification Criteria"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden sm:inline">Business Profile & Rules</span>
          </button>
        </div>
      </div>

      {/* Main 3-Column Workspace */}
      <div className="grid grid-cols-12 flex-1 overflow-hidden">
        {/* Left Column: Conversations Inbox (3 cols) */}
        <div className="col-span-12 md:col-span-4 lg:col-span-3 border-r border-slate-800 bg-slate-950/60 flex flex-col h-full overflow-hidden">
          {/* Search & Filter Bar */}
          <div className="p-3 border-b border-slate-800 space-y-2 shrink-0">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search leads, phone, email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadConversations()}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Platform & Status Tabs */}
            <div className="flex items-center justify-between gap-1 text-[11px]">
              <div className="flex items-center gap-1 overflow-x-auto py-0.5">
                {["ALL", "whatsapp", "messenger"].map((p) => (
                  <button
                    key={p}
                    onClick={() => setPlatformFilter(p)}
                    className={`px-2 py-0.5 rounded-md font-medium capitalize transition cursor-pointer ${
                      platformFilter === p
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                        : "text-slate-400 hover:bg-slate-900"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-md text-[10px] text-slate-300 px-1.5 py-0.5 focus:outline-none"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="HUMAN_TAKEOVER">Takeover</option>
                <option value="CLOSED">Closed</option>
              </select>
            </div>
          </div>

          {/* Conversations List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-500 gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                <span className="text-xs">Loading conversations...</span>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-8 text-slate-500 text-center gap-3">
                <MessageSquare className="w-8 h-8 text-slate-700" />
                <div className="text-xs">No active conversations found.</div>
                <button
                  onClick={() => setShowSimulateModal(true)}
                  className="text-xs text-cyan-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3 h-3" /> Start a Test Chat
                </button>
              </div>
            ) : (
              conversations.map((conv) => {
                const isSelected = conv.id === selectedId;
                const isQualified = conv.status === "QUALIFIED";
                const isTakeover = !conv.ai_enabled || conv.status === "HUMAN_TAKEOVER";

                return (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedId(conv.id)}
                    className={`p-3 cursor-pointer transition flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-slate-900/90 border-l-2 border-cyan-500 shadow-inner"
                        : "hover:bg-slate-900/40"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {/* Platform Icon Badge */}
                        <div
                          className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white ${
                            conv.platform === "whatsapp"
                              ? "bg-emerald-600"
                              : "bg-blue-600"
                          }`}
                        >
                          {conv.platform === "whatsapp" ? "W" : "M"}
                        </div>
                        <span className="font-semibold text-xs text-slate-100 truncate max-w-[120px]">
                          {conv.sender_name || "Inbound Visitor"}
                        </span>
                        <span title={conv.detected_language} className="text-xs">
                          {getLanguageFlag(conv.detected_language)}
                        </span>
                      </div>

                      {/* Status Chip */}
                      <span
                        className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${
                          isQualified
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                            : isTakeover
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                        }`}
                      >
                        {isQualified ? "QUALIFIED" : isTakeover ? "HUMAN" : "AI"}
                      </span>
                    </div>

                    {/* Latest Message Preview */}
                    <p className="text-xs text-slate-400 line-clamp-1">
                      {conv.last_message_text || "No message yet"}
                    </p>

                    {/* Qualification Progress & Timestamp */}
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <div className="w-12 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              isQualified ? "bg-emerald-400" : "bg-cyan-400"
                            }`}
                            style={{
                              width: `${Math.round((conv.qualification_score || 0) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="font-mono text-[9px]">
                          {Math.round((conv.qualification_score || 0) * 100)}%
                        </span>
                      </div>
                      <span>
                        {conv.last_message_at
                          ? new Date(conv.last_message_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Center Column: Live Chat Thread (6 cols) */}
        <div className="col-span-12 md:col-span-8 lg:col-span-6 flex flex-col h-full bg-slate-950 border-r border-slate-800 overflow-hidden">
          {activeConversation ? (
            <>
              {/* Active Conversation Top Bar */}
              <div className="flex items-center justify-between px-5 py-3 bg-slate-900/70 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-300 font-bold flex items-center justify-center text-xs border border-cyan-500/30">
                    {activeConversation.sender_name?.charAt(0) || "U"}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xs font-bold text-white">
                        {activeConversation.sender_name || "Inbound Visitor"}
                      </h2>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ({activeConversation.platform})
                      </span>
                      <span className="text-xs">
                        {getLanguageFlag(activeConversation.detected_language)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>ID: {activeConversation.external_sender_id}</span>
                      {activeConversation.sender_phone && (
                        <span>• 📞 {activeConversation.sender_phone}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Per-Lead Human Takeover Switch */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleLeadTakeover}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer border ${
                      activeConversation.ai_enabled
                        ? "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                        : "bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30"
                    }`}
                  >
                    {activeConversation.ai_enabled ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                        <span>AI Pilot: ACTIVE</span>
                      </>
                    ) : (
                      <>
                        <UserX className="w-3.5 h-3.5 text-amber-400" />
                        <span>HUMAN MODE (AI OFF)</span>
                      </>
                    )}
                  </button>

                  {/* Convert to Lead button if not already linked */}
                  {!activeConversation.lead_id ? (
                    <button
                      onClick={handleConvertToLead}
                      title="Convert to CRM Lead"
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Convert Lead</span>
                    </button>
                  ) : (
                    <span className="flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-lg text-xs font-semibold">
                      <Check className="w-3 h-3" /> CRM Lead
                    </span>
                  )}
                </div>
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-950/40">
                {detailLoading ? (
                  <div className="flex justify-center p-8 text-slate-500">
                    <RefreshCw className="w-5 h-5 animate-spin text-cyan-400" />
                  </div>
                ) : activeConversation.messages.length === 0 ? (
                  <div className="text-center p-8 text-xs text-slate-500">
                    No messages yet in this conversation.
                  </div>
                ) : (
                  activeConversation.messages.map((m) => {
                    const isUser = m.sender_type === "USER";
                    const isAI = m.sender_type === "AI";
                    const isHuman = m.sender_type === "HUMAN_AGENT";

                    return (
                      <div
                        key={m.id}
                        className={`flex flex-col ${
                          isUser ? "items-start" : "items-end"
                        }`}
                      >
                        {/* Sender Label */}
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mb-1 px-1">
                          {isUser ? (
                            <>
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{m.sender_name || "Prospect"}</span>
                            </>
                          ) : isAI ? (
                            <>
                              <Bot className="w-3 h-3 text-cyan-400" />
                              <span className="text-cyan-400 font-semibold">{m.sender_name || "AI Assistant"}</span>
                            </>
                          ) : (
                            <>
                              <UserCheck className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400 font-semibold">Live Agent</span>
                            </>
                          )}
                          <span>•</span>
                          <span>
                            {new Date(m.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>

                        {/* Message Bubble */}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-xs shadow-md leading-relaxed ${
                            isUser
                              ? "bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-sm"
                              : isAI
                              ? "bg-gradient-to-r from-cyan-950/90 to-blue-950/90 border border-cyan-500/40 text-cyan-100 rounded-tr-sm"
                              : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-100 rounded-tr-sm"
                          }`}
                        >
                          <p className="whitespace-pre-wrap">{m.content}</p>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input Bar (for Human Agent) */}
              <form
                onSubmit={handleSendHumanMessage}
                className="p-3 bg-slate-900/80 border-t border-slate-800 flex items-center gap-2 shrink-0"
              >
                <input
                  type="text"
                  placeholder={
                    activeConversation.ai_enabled
                      ? "Type a manual reply (AI will still assist unless Takeover is ON)..."
                      : "Type manual message as live human agent..."
                  }
                  value={humanMsgText}
                  onChange={(e) => setHumanMsgText(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
                <button
                  type="submit"
                  disabled={!humanMsgText.trim() || sendingMsg}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-cyan-600/20"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-500 gap-3">
              <MessageSquare className="w-12 h-12 text-slate-800" />
              <div className="text-sm font-medium">Select a conversation from the left to view transcript.</div>
            </div>
          )}
        </div>

        {/* Right Column: Live Lead Qualification & Intel (3 cols) */}
        <div className="hidden lg:flex lg:col-span-3 flex-col h-full bg-slate-950/80 border-l border-slate-800 p-4 overflow-y-auto space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Live Qualification Intel
            </h3>
            <span className="text-[10px] font-mono text-cyan-400">Zero Hardcode AI</span>
          </div>

          {activeConversation ? (
            <>
              {/* Qualification Progress Gauge */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">Qualification Score</span>
                  <span
                    className={`font-mono text-xs font-bold ${
                      activeConversation.qualification_score >= 1.0
                        ? "text-emerald-400"
                        : "text-cyan-400"
                    }`}
                  >
                    {Math.round((activeConversation.qualification_score || 0) * 100)}% Complete
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      activeConversation.qualification_score >= 1.0
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                        : "bg-gradient-to-r from-cyan-500 to-blue-500"
                    }`}
                    style={{
                      width: `${Math.round((activeConversation.qualification_score || 0) * 100)}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400">
                  <span>Language: {activeConversation.detected_language || "Auto-detecting"}</span>
                  <span className="capitalize">{activeConversation.status.toLowerCase()}</span>
                </div>
              </div>

              {/* Extracted Data Card */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Extracted Attributes</span>
                  </h4>
                  <span className="text-[10px] text-slate-500">Real-time LLM</span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Name:</span>
                    <span className="text-slate-100 font-semibold">
                      {activeConversation.extracted_data?.name || activeConversation.sender_name || (
                        <span className="text-slate-500 italic">Pending...</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Email Address:</span>
                    <span className="text-slate-100 font-mono">
                      {activeConversation.extracted_data?.email || activeConversation.sender_email || (
                        <span className="text-slate-500 italic font-sans">Pending...</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Phone / WhatsApp:</span>
                    <span className="text-slate-100 font-mono">
                      {activeConversation.extracted_data?.phone || activeConversation.sender_phone || (
                        <span className="text-slate-500 italic font-sans">Pending...</span>
                      )}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-medium">Service Inquiries / Needs:</span>
                    <span className="text-slate-200">
                      {activeConversation.extracted_data?.needs || (
                        <span className="text-slate-500 italic">Pending...</span>
                      )}
                    </span>
                  </div>

                  {activeConversation.extracted_data?.budget && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-medium">Budget / Timeline:</span>
                      <span className="text-slate-200 font-mono">
                        {activeConversation.extracted_data.budget}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Dynamic Business Offerings Summary */}
              {config && (
                <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2 text-xs">
                  <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-blue-400" />
                    <span>Active Business Profile</span>
                  </h4>
                  <p className="text-[11px] text-slate-400">{config.description}</p>
                  <div className="pt-2 border-t border-slate-800/80 space-y-1">
                    <span className="text-[10px] font-semibold text-slate-400">Offerings ({config.services_json?.length || 0}):</span>
                    {config.services_json?.slice(0, 3).map((s, idx) => (
                      <div key={idx} className="flex justify-between text-[11px] text-slate-300">
                        <span className="truncate">{s.name}</span>
                        <span className="font-mono text-cyan-400 font-semibold">{s.price || "Quote"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* CRM Conversion Status */}
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 block">CRM Lead Status</span>
                  <span className="font-semibold text-emerald-400">
                    {activeConversation.lead_id ? "Linked to CRM" : "Not yet linked"}
                  </span>
                </div>
                {activeConversation.lead_id && (
                  <a
                    href="/leads"
                    className="flex items-center gap-1 text-[11px] text-cyan-400 hover:underline font-semibold"
                  >
                    <span>View CRM</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </>
          ) : (
            <div className="text-xs text-slate-500 text-center p-6">
              Select a conversation to inspect lead qualification data.
            </div>
          )}
        </div>
      </div>

      {/* MODAL 1: Business Profile & Worldwide Settings */}
      {showConfigModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">
                  Dynamic Business Profile & Worldwide AI Settings
                </h3>
              </div>
              <button
                onClick={() => setShowConfigModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {configSuccess && (
              <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4" />
                <span>{configSuccess}</span>
              </div>
            )}

            {configError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                <span>{configError}</span>
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Business / Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editConfig.business_name || ""}
                    onChange={(e) =>
                      setEditConfig({ ...editConfig, business_name: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Apex Global Solutions, Elite Dental, Nova Logistics"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Industry / Niche *
                  </label>
                  <input
                    type="text"
                    required
                    value={editConfig.industry || ""}
                    onChange={(e) =>
                      setEditConfig({ ...editConfig, industry: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                    placeholder="e.g. Real Estate, SaaS, Healthcare, Manufacturing"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Market Reach / Country *
                  </label>
                  <input
                    type="text"
                    required
                    value={editConfig.country || ""}
                    onChange={(e) =>
                      setEditConfig({ ...editConfig, country: e.target.value })
                    }
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                    placeholder="Global / Worldwide, United States, UK, Europe, etc."
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Currency Symbol *
                    </label>
                    <input
                      type="text"
                      required
                      value={editConfig.currency_symbol || "$"}
                      onChange={(e) =>
                        setEditConfig({ ...editConfig, currency_symbol: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500 font-mono"
                      placeholder="$ / € / £ / ৳ / ₹"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">
                      Currency Code *
                    </label>
                    <input
                      type="text"
                      required
                      value={editConfig.currency_code || "USD"}
                      onChange={(e) =>
                        setEditConfig({ ...editConfig, currency_code: e.target.value })
                      }
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500 font-mono uppercase"
                      placeholder="USD, EUR, GBP, BDT"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Tagline / Value Proposition
                </label>
                <input
                  type="text"
                  value={editConfig.tagline || ""}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, tagline: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. Driving 10x ROI with automated B2B customer acquisition"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  About Us & Master Knowledge Base
                </label>
                <textarea
                  rows={3}
                  value={editConfig.description || ""}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, description: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="Provide background context about your business, past track record, and core values..."
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  AI Tone & Conversational Style
                </label>
                <input
                  type="text"
                  value={editConfig.ai_tone || ""}
                  onChange={(e) =>
                    setEditConfig({ ...editConfig, ai_tone: e.target.value })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="Professional, consultative, warm, and highly engaging"
                />
              </div>

              {/* Meta Credentials Section */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Meta Webhook Integration Credentials</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">
                      Meta Webhook Verify Token
                    </label>
                    <input
                      type="text"
                      value={editConfig.meta_verify_token || ""}
                      onChange={(e) =>
                        setEditConfig({ ...editConfig, meta_verify_token: e.target.value })
                      }
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-[11px] mb-1">
                      WhatsApp Phone Number ID (Cloud API)
                    </label>
                    <input
                      type="text"
                      value={editConfig.whatsapp_phone_number_id || ""}
                      onChange={(e) =>
                        setEditConfig({ ...editConfig, whatsapp_phone_number_id: e.target.value })
                      }
                      placeholder="e.g. 1098237498234"
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-slate-400 text-[11px] mb-1">
                    Meta Page Access Token
                  </label>
                  <input
                    type="password"
                    value={editConfig.meta_page_access_token || ""}
                    onChange={(e) =>
                      setEditConfig({ ...editConfig, meta_page_access_token: e.target.value })
                    }
                    placeholder="EAABw..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowConfigModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold shadow-lg shadow-cyan-600/20 transition flex items-center gap-1.5"
                >
                  {savingConfig ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  <span>Save All Settings</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Interactive Chat Simulation Drawer */}
      {showSimulateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-sm text-white">
                  Test / Simulate Customer Interaction
                </h3>
              </div>
              <button
                onClick={() => setShowSimulateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Send a test message as a customer in any language (English, Bengali, Spanish, Banglish, etc.) to test how the AI responds and extracts qualification details in real-time.
            </p>

            <form onSubmit={handleRunSimulation} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Prospect Name
                  </label>
                  <input
                    type="text"
                    value={simSender}
                    onChange={(e) => setSimSender(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                    placeholder="e.g. Sarah Jenkins or তারিক রহমান"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    Platform Channel
                  </label>
                  <select
                    value={simPlatform}
                    onChange={(e) => setSimPlatform(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                  >
                    <option value="whatsapp">WhatsApp</option>
                    <option value="messenger">Messenger</option>
                    <option value="instagram">Instagram Direct</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Customer Message *
                </label>
                <textarea
                  rows={3}
                  required
                  value={simText}
                  onChange={(e) => setSimText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  placeholder="e.g. 'Hello, what are your service charges? My name is David, email is david@example.com' or 'আপনাদের সার্ভিস এর খরচ কেমন? আমার নাম রহিম'"
                />
              </div>

              {simResponse && (
                <div className="p-3 bg-cyan-950/40 border border-cyan-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                      AI Response Received:
                    </span>
                    <span className="text-[10px] font-mono text-slate-300">
                      Detected: {simResponse.detected_language}
                    </span>
                  </div>
                  <p className="text-xs text-slate-100 font-medium whitespace-pre-wrap">
                    {simResponse.ai_reply}
                  </p>
                  <div className="text-[10px] text-slate-400 pt-1 border-t border-cyan-500/20">
                    Qualification: {Math.round((simResponse.qualification_score || 0) * 100)}% • Status: {simResponse.status}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSimulateModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 font-semibold hover:bg-slate-700 transition"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={simRunning || !simText.trim()}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold shadow-lg shadow-cyan-600/20 transition flex items-center gap-1.5"
                >
                  {simRunning ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  <span>Test Send</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
