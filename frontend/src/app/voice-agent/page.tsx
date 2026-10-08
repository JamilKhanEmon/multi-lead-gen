"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Mic,
  MicOff,
  Calendar,
  Clock,
  Sparkles,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Video,
  Layers,
  FileSpreadsheet,
  Settings,
  MessageSquare,
  CheckSquare,
  Square,
  Volume2,
  Copy,
  ChevronRight,
  ShieldCheck,
  Zap,
  Loader2,
  Lock,
  ArrowLeft,
} from "lucide-react";
import {
  fetchVoiceKB,
  saveVoiceKB,
  fetchCallQueue,
  addLeadToQueue,
  updateQueueItem,
  deleteQueueItem,
  batchQueueAction,
  sendVoiceDialogueTurn,
  completeCallAndRecord,
  fetchCallLogs,
  checkOfficeHours,
  VoiceKnowledgeBase,
  VoiceCallQueueItem,
  VoiceCallLog,
} from "@/lib/api";

export default function VoiceAgentPage() {

  const [activeTab, setActiveTab] = useState<"sheet" | "prompt" | "simulator" | "logs">("sheet");

  const [kb, setKb] = useState<VoiceKnowledgeBase | null>(null);
  const [queue, setQueue] = useState<VoiceCallQueueItem[]>([]);
  const [logs, setLogs] = useState<VoiceCallLog[]>([]);
  const [officeHours, setOfficeHours] = useState<{ is_within_hours: boolean; message: string }>({
    is_within_hours: true,
    message: "Checking...",
  });

  const [loading, setLoading] = useState(true);
  const [savingKb, setSavingKb] = useState(false);
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  const [newLead, setNewLead] = useState({
    contact_person: "",
    company_name: "",
    phone: "",
    exact_problem: "",
  });
  const [showAddModal, setShowAddModal] = useState(false);

  const [selectedSimLead, setSelectedSimLead] = useState<VoiceCallQueueItem | null>(null);
  const [simActive, setSimActive] = useState(false);
  const [simConnecting, setSimConnecting] = useState(false);
  const [simHistory, setSimHistory] = useState<Array<{ speaker: "agent" | "lead"; text: string; time: string }>>([]);
  const [simUserInput, setSimUserInput] = useState("");
  const [simBookedLink, setSimBookedLink] = useState<string | null>(null);
  const [simBookedTime, setSimBookedTime] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [kbData, queueData, logsData, hoursData] = await Promise.all([
        fetchVoiceKB(),
        fetchCallQueue(),
        fetchCallLogs(),
        checkOfficeHours(),
      ]);
      setKb(kbData);
      setQueue(queueData);
      setLogs(logsData);
      setOfficeHours(hoursData);
      if (queueData.length > 0 && !selectedSimLead) {
        setSelectedSimLead(queueData[0]);
      }
    } catch (err: any) {
      console.error("Failed to load Voice Agent data:", err);
      showToast("Error loading Voice Agent data", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (queue.length > 0) {
      if (!selectedSimLead || !queue.some((q) => q.id === selectedSimLead.id)) {
        setSelectedSimLead(queue[0]);
      }
    }
  }, [queue, selectedSimLead]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const recognitionRef = useRef<any>(null);
  const isAgentSpeakingRef = useRef(false);
  const isProcessingTurnRef = useRef(false);

  const speakText = (text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      window.speechSynthesis.resume();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(
        (v) =>
          v.lang.startsWith("en") &&
          (v.name.includes("Natural") ||
            v.name.includes("Google") ||
            v.name.includes("Samantha") ||
            v.name.includes("Daniel") ||
            v.name.includes("Karen"))
      ) || voices.find((v) => v.lang.startsWith("en"));
      if (voice) utterance.voice = voice;

      utterance.onstart = () => {
        setIsAgentSpeaking(true);
        isAgentSpeakingRef.current = true;

        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch (_) {}
        }
        setIsRecordingMic(false);
      };
      utterance.onend = () => {
        setIsAgentSpeaking(false);
        isAgentSpeakingRef.current = false;
      };
      utterance.onerror = () => {
        setIsAgentSpeaking(false);
        isAgentSpeakingRef.current = false;
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Speech synthesis error:", e);
      setIsAgentSpeaking(false);
      isAgentSpeakingRef.current = false;
    }
  };

  const toggleMicListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showToast("Speech recognition not supported in this browser. Please type or use Chrome.", "error");
      return;
    }

    if (isRecordingMic) {
      recognitionRef.current?.stop();
      setIsRecordingMic(false);
      return;
    }

    if (isAgentSpeakingRef.current || isProcessingTurnRef.current) {
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onstart = () => setIsRecordingMic(true);
      recognition.onresult = (event: any) => {

        if (isAgentSpeakingRef.current || isProcessingTurnRef.current) {
          return;
        }

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            const transcript = event.results[i][0].transcript.trim();
            if (transcript) {
              try {
                recognition.stop();
              } catch (_) {}
              setIsRecordingMic(false);
              handleSendSimSpeech(transcript);
              break;
            }
          }
        }
      };
      recognition.onerror = () => setIsRecordingMic(false);
      recognition.onend = () => setIsRecordingMic(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.warn("Mic error:", err);
      setIsRecordingMic(false);
    }
  };

  const handleCellEdit = async (itemId: string, field: keyof VoiceCallQueueItem, value: any) => {
    setQueue((prev) =>
      prev.map((item) => (item.id === itemId ? { ...item, [field]: value } : item))
    );
    try {
      await updateQueueItem(itemId, { [field]: value });
    } catch {
      showToast("Failed to save cell edit", "error");
    }
  };

  const handleToggleSelectAll = async () => {
    const allSelected = queue.every((q) => q.selected_for_call);
    const newSelectState = !allSelected;
    setQueue((prev) => prev.map((q) => ({ ...q, selected_for_call: newSelectState })));
    try {
      await batchQueueAction(newSelectState ? "select_all" : "deselect_all");
      showToast(newSelectState ? "Selected all leads" : "Deselected all leads");
    } catch {
      showToast("Failed to update selection", "error");
    }
  };

  const handleSyncFromLeads = async () => {
    setSyncingLeads(true);
    try {
      const res = await batchQueueAction("sync_from_leads");
      showToast(res.message || "Synced leads to Sheet View");
      const updatedQueue = await fetchCallQueue();
      setQueue(updatedQueue);
    } catch {
      showToast("Failed to sync leads from database", "error");
    } finally {
      setSyncingLeads(false);
    }
  };

  const handleAddManualLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.company_name || !newLead.phone) {
      showToast("Company name and phone are required", "error");
      return;
    }
    try {
      const created = await addLeadToQueue({
        contact_person: newLead.contact_person || "Managing Director",
        company_name: newLead.company_name,
        phone: newLead.phone,
        exact_problem: newLead.exact_problem || "Operational defect loss & bottlenecks",
        selected_for_call: true,
      });
      setQueue((prev) => [created, ...prev]);
      setShowAddModal(false);
      setNewLead({ contact_person: "", company_name: "", phone: "", exact_problem: "" });
      showToast("Lead added to Sheet View");
    } catch {
      showToast("Failed to add lead", "error");
    }
  };

  const handleDeleteLeadRow = async (id: string) => {
    try {
      await deleteQueueItem(id);
      setQueue((prev) => prev.filter((q) => q.id !== id));
      showToast("Lead row removed");
    } catch {
      showToast("Failed to delete lead", "error");
    }
  };

  const handleSaveKb = async () => {
    if (!kb) return;
    setSavingKb(true);
    try {
      const updated = await saveVoiceKB(kb);
      setKb(updated);
      showToast("ElevenLabs-style Prompt & Knowledge Base saved!");
    } catch {
      showToast("Failed to save Knowledge Base", "error");
    } finally {
      setSavingKb(false);
    }
  };

  const startSimulatorCall = (targetLead?: VoiceCallQueueItem) => {
    const lead = targetLead || selectedSimLead || queue[0];
    if (!lead) {
      showToast("No lead selected to simulate", "error");
      return;
    }
    setSelectedSimLead(lead);
    setSimConnecting(true);
    setSimHistory([]);
    setSimBookedLink(null);
    setSimBookedTime(null);
    setCallDuration(0);

    setTimeout(() => {
      setSimConnecting(false);
      setSimActive(true);

      const firstGreeting = kb?.first_message
        ? kb.first_message
            .replace(/\{\{\s*client_name\s*\}\}/gi, lead.contact_person || "Sir")
            .replace(/\{\{\s*company_name\s*\}\}/gi, lead.company_name)
            .replace(/\{\{\s*agent_persona_name\s*\}\}/gi, kb.agent_persona_name || "")
            .replace(/\{\{\s*my_company\s*\}\}/gi, kb.company_name || "")
        : `Hello ${lead.contact_person || "there"}, this is ${kb?.agent_persona_name || "our team"} from ${kb?.company_name || "our company"} regarding ${lead.company_name || "your business"}'s recent inquiry.`;

      setSimHistory([
        {
          speaker: "agent",
          text: firstGreeting,
          time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
        },
      ]);
      speakText(firstGreeting);

      if (callTimerRef.current) clearInterval(callTimerRef.current);
      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }, 1200);
  };

  const handleSendSimSpeech = async (customSpeech?: string) => {
    const speech = (customSpeech || simUserInput).trim();
    if (!speech || !simActive || isProcessingTurnRef.current) return;

    isProcessingTurnRef.current = true;
    setIsProcessingTurn(true);

    const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const updatedHistory = [...simHistory, { speaker: "lead" as const, text: speech, time: timeStr }];
    setSimHistory(updatedHistory);
    setSimUserInput("");

    try {
      const response = await sendVoiceDialogueTurn({
        queue_item_id: selectedSimLead?.id,
        user_speech_text: speech,
        conversation_history: updatedHistory.map((h) => ({ speaker: h.speaker, text: h.text })),
        client_name: selectedSimLead?.contact_person,
        company_name: selectedSimLead?.company_name,
        exact_problem: selectedSimLead?.exact_problem,
      });

      const replyTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setSimHistory((prev) => [
        ...prev,
        { speaker: "agent", text: response.agent_reply_text, time: replyTime },
      ]);
      speakText(response.agent_reply_text);

      if (response.meeting_booked && response.meeting_link) {
        setSimBookedLink(response.meeting_link);
        setSimBookedTime(response.meeting_time || "Tomorrow at 11:00 AM");
      }
    } catch (e) {
      console.error("Simulation dialogue turn error:", e);
      showToast("Dialogue connection error", "error");
    } finally {
      isProcessingTurnRef.current = false;
      setIsProcessingTurn(false);
    }
  };

  const endSimulatorCall = async (markMeeting: boolean = false) => {
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSimActive(false);

    if (selectedSimLead) {
      const isBooked = markMeeting || Boolean(simBookedLink);
      try {
        await completeCallAndRecord(selectedSimLead.id, {
          meeting_booked: isBooked,
          meeting_link: simBookedLink || (isBooked ? `https://meet.google.com/b2b-demo-${selectedSimLead.id.slice(0, 4)}` : undefined),
          meeting_time: simBookedTime || (isBooked ? "Tomorrow at 3:00 PM" : undefined),
          transcript: simHistory,
          duration_seconds: callDuration,
          sentiment: isBooked ? "DEMO_BOOKED" : "INTERESTED",
          summary: isBooked
            ? `Demo successfully scheduled for ${simBookedTime || "Tomorrow at 3:00 PM"}. Link dispatched.`
            : "Call completed. Client verified.",
        });

        setQueue((prev) =>
          prev.map((item) =>
            item.id === selectedSimLead.id
              ? {
                  ...item,
                  status: isBooked ? "MEETING_BOOKED" : "CALL_DONE",
                  selected_for_call: false,
                  meeting_link: simBookedLink || undefined,
                  meeting_time: simBookedTime || undefined,
                }
              : item
          )
        );

        showToast(
          isBooked
            ? "Meeting locked & link dispatched! Lead marked MEETING_BOOKED."
            : "Call completed. Lead marked CALL_DONE (Duplicate protected)."
        );
        const updatedLogs = await fetchCallLogs();
        setLogs(updatedLogs);
      } catch (err) {
        console.error("Failed to record call completion:", err);
      }
    }
  };

  const totalLeads = queue.length;
  const selectedCount = queue.filter((q) => q.selected_for_call).length;
  const bookedCount = queue.filter((q) => q.status === "MEETING_BOOKED").length;
  const doneCount = queue.filter((q) => q.status === "CALL_DONE").length;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-y-auto space-y-6">

      <div className="p-8 rounded-2xl bg-gradient-to-r from-slate-900 via-emerald-950/20 to-slate-900 border border-emerald-500/30 text-center space-y-4 shadow-2xl relative overflow-hidden m-4 sm:m-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-xl shadow-emerald-500/10 mb-1">
          <Lock className="w-8 h-8 text-amber-400" />
        </div>
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold uppercase tracking-wider mb-2">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Module Locked — Coming Soon</span>
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">
            Autonomous Voice Outreach Agent
          </h2>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            This module is currently locked for upcoming production integration with ElevenLabs Conversational Voice API.
            Please utilize Module 01 for autonomous lead discovery and deterministic qualification.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition shadow-lg shadow-sky-500/20"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Operations Center</span>
          </Link>
        </div>
      </div>

      {toastMsg && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-top-2 ${
            toastMsg.type === "success"
              ? "bg-emerald-950 border-emerald-500/60 text-emerald-200"
              : "bg-rose-950 border-rose-500/60 text-rose-200"
          }`}
        >
          {toastMsg.type === "success" ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertCircle className="w-4 h-4 text-rose-400" />}
          <span>{toastMsg.text}</span>
        </div>
      )}

      <header className="px-6 py-4 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-600 to-sky-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white tracking-tight flex items-center gap-2">
                B2B Autonomous Voice Caller
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-medium">
                  ElevenLabs Engine
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                PostgreSQL-backed Interactive Sheet View • Smart Office Hours • Auto Zoom/Meet Link Dispatch
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-mono flex items-center gap-2 ${
              officeHours.is_within_hours
                ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
                : "bg-amber-950/40 border-amber-500/30 text-amber-300"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>{officeHours.message}</span>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition"
            title="Refresh All Data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-sky-400" : ""}`} />
          </button>
        </div>
      </header>

      <div className="px-6 py-4 grid grid-cols-2 md:grid-cols-4 gap-4 shrink-0">
        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Total Queue Leads</div>
          <div className="text-2xl font-black text-white font-mono">{totalLeads}</div>
          <div className="text-[10px] text-slate-500">{selectedCount} ready to call</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 uppercase">Selected For Call</div>
          <div className="text-2xl font-black text-sky-400 font-mono">{selectedCount}</div>
          <div className="text-[10px] text-sky-400/80">Filtered & Verified</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/30">
          <div className="text-[11px] font-mono text-emerald-400 uppercase flex items-center gap-1.5">
            <Video className="w-3.5 h-3.5" />
            Demos / Meetings Booked
          </div>
          <div className="text-2xl font-black text-emerald-300 font-mono">{bookedCount}</div>
          <div className="text-[10px] text-emerald-400/80">Link sent to WhatsApp</div>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/60 border border-slate-800/80">
          <div className="text-[11px] font-mono text-slate-400 uppercase flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            Completed / Verified
          </div>
          <div className="text-2xl font-black text-indigo-300 font-mono">{doneCount}</div>
          <div className="text-[10px] text-indigo-400/80">Duplicate call protected</div>
        </div>
      </div>

      <div className="px-6 border-b border-slate-800/80 flex items-center gap-2 shrink-0">
        <button
          onClick={() => setActiveTab("sheet")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "sheet"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Interactive Sheet View ({totalLeads})</span>
        </button>

        <button
          onClick={() => setActiveTab("prompt")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "prompt"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>ElevenLabs Prompt & KB Studio</span>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "simulator"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Mic className="w-4 h-4 text-sky-400" />
          <span>Live Call Simulator (Browser Test)</span>
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
            activeTab === "logs"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="w-4 h-4 text-amber-400" />
          <span>Booked Demos & Call Logs ({logs.length})</span>
        </button>
      </div>

      <div className="p-6 flex-1 flex flex-col">

        {activeTab === "sheet" && (
          <div className="space-y-4 flex flex-col h-full">

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/60 border border-slate-800 p-3 rounded-2xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={handleToggleSelectAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  {queue.every((q) => q.selected_for_call) ? (
                    <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>Select / Deselect All</span>
                </button>

                <button
                  onClick={handleSyncFromLeads}
                  disabled={syncingLeads}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-sky-950/60 hover:bg-sky-900/60 text-sky-300 text-xs font-medium border border-sky-800/60 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingLeads ? "animate-spin" : ""}`} />
                  <span>Sync from Qualified Leads</span>
                </button>

                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Add Lead</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const firstSelected = queue.find((q) => q.selected_for_call && q.status === "READY");
                    if (firstSelected) {
                      setActiveTab("simulator");
                      startSimulatorCall(firstSelected);
                    } else {
                      showToast("No READY leads selected for calling", "error");
                    }
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition"
                >
                  <PhoneCall className="w-3.5 h-3.5" />
                  <span>Start Sequential Calling Selected ({selectedCount})</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40 flex-1 flex flex-col">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider sticky top-0">
                    <tr>
                      <th className="py-3 px-3 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={queue.length > 0 && queue.every((q) => q.selected_for_call)}
                          onChange={handleToggleSelectAll}
                          className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-3">Contact Person (Inline Edit)</th>
                      <th className="py-3 px-3">Phone Number</th>
                      <th className="py-3 px-3">Company / Factory</th>
                      <th className="py-3 px-3 min-w-[280px]">Exact Problem (Spoken by Agent)</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Quick Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {queue.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-12 text-slate-500">
                          No leads in the calling sheet. Click &ldquo;Sync from Qualified Leads&rdquo; or &ldquo;Add Lead&rdquo; above.
                        </td>
                      </tr>
                    ) : (
                      queue.map((item) => (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-850/50 transition group ${
                            item.selected_for_call ? "bg-slate-900/30" : "opacity-75"
                          }`}
                        >

                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={item.selected_for_call}
                              onChange={(e) => handleCellEdit(item.id, "selected_for_call", e.target.checked)}
                              className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={item.contact_person}
                              onChange={(e) => handleCellEdit(item.id, "contact_person", e.target.value)}
                              className="bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-white font-medium px-2 py-1 rounded border border-transparent focus:border-slate-700 outline-none w-full transition"
                            />
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={item.phone}
                              onChange={(e) => handleCellEdit(item.id, "phone", e.target.value)}
                              className="bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-slate-300 font-mono px-2 py-1 rounded border border-transparent focus:border-slate-700 outline-none w-full transition"
                            />
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={item.company_name}
                              onChange={(e) => handleCellEdit(item.id, "company_name", e.target.value)}
                              className="bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-slate-200 font-medium px-2 py-1 rounded border border-transparent focus:border-slate-700 outline-none w-full transition"
                            />
                          </td>

                          <td className="py-3 px-3">
                            <input
                              type="text"
                              value={item.exact_problem}
                              onChange={(e) => handleCellEdit(item.id, "exact_problem", e.target.value)}
                              className="bg-transparent hover:bg-slate-800/80 focus:bg-slate-800 text-amber-300/90 px-2 py-1 rounded border border-transparent focus:border-slate-700 outline-none w-full transition"
                            />
                          </td>

                          <td className="py-3 px-3">
                            {item.status === "MEETING_BOOKED" ? (
                              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold">
                                <Video className="w-3 h-3" />
                                <span>MEETING BOOKED</span>
                              </div>
                            ) : item.status === "CALL_DONE" ? (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700 text-[11px] font-semibold">
                                <CheckCircle2 className="w-3 h-3 text-indigo-400" />
                                <span>CALL DONE</span>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[11px] font-semibold">
                                <Clock className="w-3 h-3" />
                                <span>READY</span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {item.meeting_link && (
                                <a
                                  href={item.meeting_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-emerald-950 hover:bg-emerald-900 border border-emerald-500/40 text-emerald-400 transition"
                                  title="Open Booked Meeting Link"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button
                                onClick={() => {
                                  setActiveTab("simulator");
                                  startSimulatorCall(item);
                                }}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 transition"
                                title="Test Call This Lead"
                              >
                                <PhoneCall className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteLeadRow(item.id)}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 border border-slate-700 hover:border-rose-800 transition"
                                title="Remove Row"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === "prompt" && kb && (
          <div className="max-w-4xl mx-auto w-full space-y-6">
            <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                <div>
                  <h2 className="text-base font-black text-white flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    ElevenLabs Conversational Prompt & Persona
                  </h2>
                  <p className="text-xs text-slate-400">
                    Configure your agent&apos;s personality, short 18-word response constraints, and dynamic variables.
                  </p>
                </div>
                <button
                  onClick={handleSaveKb}
                  disabled={savingKb}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold shadow-lg shadow-emerald-500/20 transition"
                >
                  <Save className={`w-3.5 h-3.5 ${savingKb ? "animate-spin" : ""}`} />
                  <span>{savingKb ? "Saving Changes..." : "Save Prompt & KB"}</span>
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-800/40 space-y-2">
                <span className="text-[11px] font-mono text-purple-300 font-bold uppercase tracking-wider">
                  Available Dynamic Variables (Injected at Runtime from Sheet View)
                </span>
                <div className="flex flex-wrap gap-2 text-xs font-mono">
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{client_name}}"}
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{company_name}}"}
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{exact_problem}}"}
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{my_company}}"}
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{core_offer}}"}
                  </span>
                  <span className="px-2 py-1 rounded bg-slate-900 border border-purple-500/30 text-purple-200">
                    {"{{meeting_platform}}"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>First Message (Initial Greeting Line Spoken Immediately)</span>
                  <span className="text-[10px] text-slate-400 font-normal">Spoken the second call connects</span>
                </label>
                <textarea
                  rows={2}
                  value={kb.first_message}
                  onChange={(e) => setKb({ ...kb, first_message: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-purple-500 outline-none leading-relaxed transition"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                  <span>System Prompt & Conversational Constraints</span>
                  <span className="text-[10px] text-purple-400 font-mono">Max 18-word response rule</span>
                </label>
                <textarea
                  rows={7}
                  value={kb.system_prompt}
                  onChange={(e) => setKb({ ...kb, system_prompt: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:border-purple-500 outline-none leading-relaxed font-mono transition"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Your Company Name</label>
                  <input
                    type="text"
                    value={kb.company_name}
                    onChange={(e) => setKb({ ...kb, company_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Agent Persona Name</label>
                  <input
                    type="text"
                    value={kb.agent_persona_name}
                    onChange={(e) => setKb({ ...kb, agent_persona_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Core Service Name</label>
                  <input
                    type="text"
                    value={kb.service_name}
                    onChange={(e) => setKb({ ...kb, service_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Low-Risk Introductory Offer</label>
                  <input
                    type="text"
                    value={kb.core_offer}
                    onChange={(e) => setKb({ ...kb, core_offer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Meeting Platform (Auto-Generated Link)</label>
                  <select
                    value={kb.meeting_platform}
                    onChange={(e) => setKb({ ...kb, meeting_platform: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none transition"
                  >
                    <option value="Google Meet">Google Meet (Instant Auto Link)</option>
                    <option value="Zoom">Zoom Meeting</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-200">Office Hours Window (No Calls Outside)</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={kb.office_hours_start}
                      onChange={(e) => setKb({ ...kb, office_hours_start: e.target.value })}
                      placeholder="10:00"
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none font-mono transition text-center"
                    />
                    <span className="text-slate-500 text-xs font-bold">to</span>
                    <input
                      type="text"
                      value={kb.office_hours_end}
                      onChange={(e) => setKb({ ...kb, office_hours_end: e.target.value })}
                      placeholder="18:00"
                      className="w-1/2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:border-purple-500 outline-none font-mono transition text-center"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "simulator" && (
          <div className="max-w-4xl mx-auto w-full grid grid-cols-1 md:grid-cols-3 gap-6">

            <div className="md:col-span-1 space-y-4">
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                <span className="text-[11px] font-mono text-slate-400 uppercase">Target Lead Context</span>

                <div className="space-y-1">
                  <label className="text-[10px] text-slate-500 uppercase font-mono">Select Lead</label>
                  <select
                    value={selectedSimLead?.id || ""}
                    onChange={(e) => {
                      const found = queue.find((q) => q.id === e.target.value);
                      if (found) setSelectedSimLead(found);
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-xs text-white outline-none focus:border-sky-500"
                  >
                    {queue.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.company_name} — {q.contact_person}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedSimLead && (
                  <div className="space-y-2 text-xs border-t border-slate-800/80 pt-2 text-slate-300">
                    <div>
                      <span className="text-slate-500 text-[10px] block">Decision Maker:</span>
                      <span className="font-bold text-white">{selectedSimLead.contact_person}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Company Phone:</span>
                      <span className="font-mono text-sky-400">{selectedSimLead.phone}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] block">Verified Defect / Problem:</span>
                      <span className="text-amber-300 font-medium">{selectedSimLead.exact_problem}</span>
                    </div>
                  </div>
                )}

                <div className="pt-2">
                  {!simActive ? (
                    <button
                      onClick={() => startSimulatorCall(selectedSimLead || queue[0])}
                      disabled={simConnecting || (!selectedSimLead && queue.length === 0)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-xs shadow-lg shadow-emerald-500/20 transition cursor-pointer"
                    >
                      <PhoneCall className={`w-4 h-4 ${simConnecting ? "animate-bounce" : ""}`} />
                      <span>{simConnecting ? "Connecting Call..." : "Start Browser Test Call"}</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => endSimulatorCall(false)}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-lg shadow-rose-600/20 transition cursor-pointer"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>End Call</span>
                    </button>
                  )}
                </div>
              </div>

              {simBookedLink && (
                <div className="p-4 rounded-2xl bg-emerald-950/60 border border-emerald-500/40 space-y-2 animate-in fade-in zoom-in-95">
                  <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Meeting Successfully Booked!</span>
                  </div>
                  <div className="text-[11px] text-emerald-300">
                    Slot: <strong className="text-white">{simBookedTime}</strong>
                  </div>
                  <a
                    href={simBookedLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-[11px] text-sky-400 underline font-mono break-all"
                  >
                    <span>{simBookedLink}</span>
                    <ExternalLink className="w-3 h-3 shrink-0" />
                  </a>
                </div>
              )}
            </div>

            <div className="md:col-span-2 flex flex-col h-[520px] rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">

              <div className="px-4 py-3 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      simActive ? "bg-emerald-400 animate-ping" : "bg-slate-600"
                    }`}
                  />
                  <span className="font-bold text-white">
                    {simActive
                      ? `Live Call with ${selectedSimLead?.contact_person || "Lead"}`
                      : "Simulator Standby"}
                  </span>
                  {isAgentSpeaking && (
                    <div className="flex items-center gap-1 ml-2 text-[10px] text-emerald-400 font-mono animate-pulse">
                      <Volume2 className="w-3.5 h-3.5" />
                      <span>Speaking</span>
                      <span className="flex items-center gap-0.5 ml-0.5">
                        <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce" />
                        <span className="w-1 h-3.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                        <span className="w-1 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                      </span>
                    </div>
                  )}
                </div>
                {simActive && (
                  <div className="font-mono text-emerald-400 text-xs">
                    {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                  </div>
                )}
              </div>

              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {simHistory.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-2">
                    <PhoneForwarded className="w-8 h-8 opacity-40" />
                    <p>Click &ldquo;Start Browser Test Call&rdquo; to simulate a live phone conversation.</p>
                  </div>
                ) : (
                  simHistory.map((turn, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${turn.speaker === "agent" ? "items-start" : "items-end"} group`}
                    >
                      <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                        <span>{turn.speaker === "agent" ? "AI Agent (Your Voice)" : selectedSimLead?.contact_person || "Lead"}</span>
                        <span>•</span>
                        <span>{turn.time}</span>
                        {turn.speaker === "agent" && (
                          <button
                            onClick={() => speakText(turn.text)}
                            className="p-0.5 hover:text-sky-300 text-slate-500 transition"
                            title="Replay Audio"
                          >
                            <Volume2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      <div
                        className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs leading-relaxed ${
                          turn.speaker === "agent"
                            ? "bg-slate-800 text-slate-100 border border-slate-700/80 rounded-tl-none"
                            : "bg-emerald-600 text-white rounded-tr-none shadow-md shadow-emerald-600/20"
                        }`}
                      >
                        {turn.text}
                      </div>
                    </div>
                  ))
                )}
                {isProcessingTurn && (
                  <div className="flex flex-col items-start group animate-in fade-in slide-in-from-bottom-1">
                    <div className="flex items-center gap-1 text-[10px] text-slate-500 mb-0.5">
                      <span>AI Agent (Your Voice)</span>
                      <span>•</span>
                      <span>Thinking...</span>
                    </div>
                    <div className="px-3.5 py-2 rounded-2xl text-xs bg-slate-800 text-slate-300 border border-slate-700/80 rounded-tl-none flex items-center gap-2">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0ms]" />
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:150ms]" />
                        <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:300ms]" />
                      </span>
                      <span className="text-[11px] text-slate-400">Processing response...</span>
                    </div>
                  </div>
                )}
              </div>

              {simActive && (
                <div className="px-3 py-2 bg-slate-950/80 border-t border-slate-800/80 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                  <span className="text-slate-500 shrink-0 font-mono">Test as Client:</span>
                  <button
                    onClick={() => handleSendSimSpeech("Uh could you please share with me what the service list")}
                    disabled={!simActive || isProcessingTurn || isAgentSpeaking}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 transition disabled:opacity-40"
                  >
                    &ldquo;What is the service list?&rdquo;
                  </button>
                  <button
                    onClick={() => handleSendSimSpeech("I am very busy right now.")}
                    disabled={!simActive || isProcessingTurn || isAgentSpeaking}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 shrink-0 transition disabled:opacity-40"
                  >
                    &ldquo;I am too busy&rdquo;
                  </button>
                  <button
                    onClick={() => handleSendSimSpeech("Yeah I'm available at this time")}
                    disabled={!simActive || isProcessingTurn || isAgentSpeaking}
                    className="px-2 py-1 rounded-lg bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border border-emerald-500/40 shrink-0 font-bold transition disabled:opacity-40"
                  >
                    &ldquo;Available at this time (Agree)&rdquo;
                  </button>
                  <button
                    onClick={() => handleSendSimSpeech("Tomorrow at 11 AM works for me.")}
                    disabled={!simActive || isProcessingTurn || isAgentSpeaking}
                    className="px-2 py-1 rounded-lg bg-sky-950 hover:bg-sky-900 text-sky-300 border border-sky-500/40 shrink-0 font-bold transition disabled:opacity-40"
                  >
                    &ldquo;Tomorrow 11 AM works (Agree)&rdquo;
                  </button>
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendSimSpeech();
                }}
                className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2"
              >
                <button
                  type="button"
                  onClick={toggleMicListening}
                  disabled={!simActive || isProcessingTurn || isAgentSpeaking}
                  className={`p-2 rounded-xl border transition ${
                    isRecordingMic
                      ? "bg-rose-600 border-rose-500 text-white animate-pulse"
                      : "bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300 disabled:opacity-40"
                  }`}
                  title={isRecordingMic ? "Listening to your voice... click to stop" : "Click to speak via Microphone"}
                >
                  {isRecordingMic ? <Mic className="w-4 h-4 text-white" /> : <MicOff className="w-4 h-4" />}
                </button>

                <input
                  type="text"
                  value={simUserInput}
                  onChange={(e) => setSimUserInput(e.target.value)}
                  disabled={!simActive || isProcessingTurn}
                  placeholder={
                    !simActive
                      ? "Start call first..."
                      : isProcessingTurn
                      ? "Agent is thinking..."
                      : isRecordingMic
                      ? "Listening to your microphone..."
                      : "Type or speak what client says..."
                  }
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white outline-none focus:border-sky-500 disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!simActive || !simUserInput.trim() || isProcessingTurn}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white text-xs font-bold transition flex items-center gap-1.5"
                >
                  {isProcessingTurn ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  <span>Send</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {activeTab === "logs" && (
          <div className="space-y-4 max-w-5xl mx-auto w-full">
            <div className="border border-slate-800 rounded-2xl overflow-hidden bg-slate-900/40">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 font-mono text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Company</th>
                    <th className="py-3 px-4">Contact Person</th>
                    <th className="py-3 px-4">Phone</th>
                    <th className="py-3 px-4">Outcome / Sentiment</th>
                    <th className="py-3 px-4">Meeting Link</th>
                    <th className="py-3 px-4">Call Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-12 text-slate-500">
                        No call logs recorded yet. Calls will appear here as they complete.
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-850/50 transition">
                        <td className="py-3 px-4 font-bold text-white">{log.company_name}</td>
                        <td className="py-3 px-4 text-slate-300">{log.contact_person}</td>
                        <td className="py-3 px-4 font-mono text-slate-400">{log.phone}</td>
                        <td className="py-3 px-4">
                          {log.meeting_booked ? (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold">
                              DEMO BOOKED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 text-[10px]">
                              {log.sentiment || "COMPLETED"}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          {log.meeting_link ? (
                            <a
                              href={log.meeting_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sky-400 underline font-mono text-[11px] flex items-center gap-1"
                            >
                              <span>Open Room</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono text-slate-400">
                          {log.call_duration_seconds}s
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full space-y-4 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Add Verified Lead to Sheet View</h3>
            <form onSubmit={handleAddManualLead} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Company / Factory Name</label>
                <input
                  type="text"
                  required
                  value={newLead.company_name}
                  onChange={(e) => setNewLead({ ...newLead, company_name: e.target.value })}
                  placeholder="e.g. Star Textiles Ltd."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Contact Person & Title</label>
                <input
                  type="text"
                  value={newLead.contact_person}
                  onChange={(e) => setNewLead({ ...newLead, contact_person: e.target.value })}
                  placeholder="e.g. Rafiqul Islam, Managing Director"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  placeholder="e.g. +1 555-0199"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Exact Problem / Weakness (Spoken by Agent)</label>
                <input
                  type="text"
                  value={newLead.exact_problem}
                  onChange={(e) => setNewLead({ ...newLead, exact_problem: e.target.value })}
                  placeholder="e.g. Fabric defect losses and buyer penalty"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white outline-none focus:border-emerald-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold"
                >
                  Add Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
