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
  ArrowLeft,
  UploadCloud,
  Play,
  Pause,
  Bot,
  User,
  Globe,
  Radio,
  Sliders,
  DollarSign,
  Share2,
  Lock,
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
  syncLeadsFromCard1,
  cloneUserVoice,
  fetchAvailableVoices,
  synthesizeTTSAudio,
  VoiceKnowledgeBase,
  VoiceCallQueueItem,
  VoiceCallLog,
} from "@/lib/api";

export default function VoiceAgentPage() {
  const [activeTab, setActiveTab] = useState<"sheet" | "studio" | "prompt" | "simulator" | "logs">("sheet");

  const [kb, setKb] = useState<VoiceKnowledgeBase | null>(null);
  const [queue, setQueue] = useState<VoiceCallQueueItem[]>([]);
  const [logs, setLogs] = useState<VoiceCallLog[]>([]);
  const [voices, setVoices] = useState<any[]>([]);
  const [officeHours, setOfficeHours] = useState<{ is_within_hours: boolean; message: string }>({
    is_within_hours: true,
    message: "Checking...",
  });

  const [loading, setLoading] = useState(true);
  const [savingKb, setSavingKb] = useState(false);
  const [syncingLeads, setSyncingLeads] = useState(false);
  const [toastMsg, setToastMsg] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Ready for Call Filters
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [countryFilter, setCountryFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Add Lead Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLead, setNewLead] = useState({
    contact_person: "",
    company_name: "",
    phone: "",
    country: "Bangladesh",
    language: "Bengali",
    exact_problem: "",
  });

  // Voice Studio Cloning State
  const [voiceNameInput, setVoiceNameInput] = useState("My Cloned Sales Voice");
  const [isRecordingSample, setIsRecordingSample] = useState(false);
  const [recordTimer, setRecordTimer] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cloningLoading, setCloningLoading] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Audio Preview Player
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Simulator State
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

  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const recognitionRef = useRef<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [kbData, queueData, logsData, hoursData, voicesData] = await Promise.all([
        fetchVoiceKB(),
        fetchCallQueue(),
        fetchCallLogs(),
        checkOfficeHours(),
        fetchAvailableVoices(),
      ]);
      setKb(kbData);
      setQueue(queueData);
      setLogs(logsData);
      setOfficeHours(hoursData);
      setVoices(voicesData);
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

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMsg({ text, type });
    setTimeout(() => setToastMsg(null), 4000);
  };

  // Sync Card 1 leads handler
  const handleSyncFromCard1 = async () => {
    try {
      setSyncingLeads(true);
      const res = await syncLeadsFromCard1();
      showToast(`Synced ${res.synced_count} verified leads from Card 1 into Call Queue!`, "success");
      const updatedQueue = await fetchCallQueue();
      setQueue(updatedQueue);
    } catch (err: any) {
      showToast(err.message || "Failed to sync leads from Card 1", "error");
    } finally {
      setSyncingLeads(false);
    }
  };

  // Toggle Auto-Call Autopilot
  const handleToggleAutoCall = async () => {
    if (!kb) return;
    const nextState = !kb.auto_call_enabled;
    try {
      await saveVoiceKB({ auto_call_enabled: nextState });
      setKb({ ...kb, auto_call_enabled: nextState });
      showToast(`Autonomous Auto-Call is now ${nextState ? "ACTIVE" : "PAUSED"}`, "success");
    } catch (err: any) {
      showToast("Failed to toggle auto-call", "error");
    }
  };

  // Voice Recording for Cloning
  const startRecordingSample = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mr.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setRecordedBlob(audioBlob);
        stream.getTracks().forEach((t) => t.stop());
      };

      mr.start();
      setIsRecordingSample(true);
      setRecordTimer(0);
      recordIntervalRef.current = setInterval(() => {
        setRecordTimer((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      showToast("Microphone permission denied", "error");
    }
  };

  const stopRecordingSample = () => {
    if (mediaRecorderRef.current && isRecordingSample) {
      mediaRecorderRef.current.stop();
      setIsRecordingSample(false);
      if (recordIntervalRef.current) clearInterval(recordIntervalRef.current);
    }
  };

  // Execute Voice Cloning
  const handleCloneVoice = async () => {
    const audioPayload = uploadedFile || recordedBlob;
    if (!audioPayload) {
      showToast("Please record your voice or upload an audio file first.", "error");
      return;
    }
    if (!voiceNameInput.trim()) {
      showToast("Please enter a name for your cloned voice.", "error");
      return;
    }

    try {
      setCloningLoading(true);
      const res = await cloneUserVoice(voiceNameInput.trim(), audioPayload);
      showToast(`Success! Voice cloned: ${res.voice_name}`, "success");
      setRecordedBlob(null);
      setUploadedFile(null);
      await loadData();
    } catch (err: any) {
      showToast(err.message || "Voice cloning failed. Check your ElevenLabs API Key.", "error");
    } finally {
      setCloningLoading(false);
    }
  };

  // Play audio preview
  const handlePlayPreview = (voiceId: string, previewUrl?: string) => {
    if (previewingVoiceId === voiceId) {
      previewAudioRef.current?.pause();
      setPreviewingVoiceId(null);
      return;
    }

    if (previewUrl) {
      if (previewAudioRef.current) previewAudioRef.current.pause();
      const audio = new Audio(previewUrl);
      previewAudioRef.current = audio;
      audio.play();
      setPreviewingVoiceId(voiceId);
      audio.onended = () => setPreviewingVoiceId(null);
    } else {
      showToast("Preview not available for this voice", "error");
    }
  };

  // Speak agent text (ElevenLabs audio playback or fallback)
  const playAgentResponse = async (text: string, base64Audio?: string) => {
    setIsAgentSpeaking(true);
    if (base64Audio) {
      try {
        const audio = new Audio(`data:audio/mpeg;base64,${base64Audio}`);
        audio.play();
        audio.onended = () => setIsAgentSpeaking(false);
        audio.onerror = () => setIsAgentSpeaking(false);
        return;
      } catch (err) {
        console.warn("Audio element playback error, falling back:", err);
      }
    }

    // Fallback: Browser WebSpeech
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.onend = () => setIsAgentSpeaking(false);
      utterance.onerror = () => setIsAgentSpeaking(false);
      window.speechSynthesis.speak(utterance);
    } else {
      setIsAgentSpeaking(false);
    }
  };

  // Simulator Turn Handler
  const handleSimTurn = async (userText: string) => {
    if (!userText.trim() || isProcessingTurn) return;
    setIsProcessingTurn(true);

    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updatedHistory = [...simHistory, { speaker: "lead" as const, text: userText, time: nowTime }];
    setSimHistory(updatedHistory);
    setSimUserInput("");

    try {
      const payload = {
        queue_item_id: selectedSimLead?.id,
        user_speech_text: userText,
        conversation_history: updatedHistory.map((h) => ({
          speaker: h.speaker === "agent" ? "agent" : "user",
          text: h.text,
        })),
        client_name: selectedSimLead?.contact_person,
        company_name: selectedSimLead?.company_name,
        exact_problem: selectedSimLead?.exact_problem,
        language: selectedSimLead?.language || "Bengali",
      };

      const res = await sendVoiceDialogueTurn(payload);
      const agentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      setSimHistory((prev) => [
        ...prev,
        { speaker: "agent", text: res.agent_reply_text, time: agentTime },
      ]);

      if (res.meeting_booked && res.meeting_link) {
        setSimBookedLink(res.meeting_link);
        setSimBookedTime(res.meeting_time || "Tomorrow at 11:00 AM");
      }

      await playAgentResponse(res.agent_reply_text, res.audio_base64 || undefined);
    } catch (err: any) {
      showToast("Error processing speech turn", "error");
    } finally {
      setIsProcessingTurn(false);
    }
  };

  // Start Call Simulation
  const handleStartSimCall = () => {
    if (!selectedSimLead) {
      showToast("Select a lead first", "error");
      return;
    }
    setSimActive(true);
    setSimConnecting(true);
    setSimHistory([]);
    setCallDuration(0);
    setSimBookedLink(null);
    setSimBookedTime(null);

    setTimeout(() => {
      setSimConnecting(false);
      const isBn = (selectedSimLead.language || "").toLowerCase().includes("bengali");
      const clientName = selectedSimLead.contact_person || "স্যার";
      const problem = selectedSimLead.exact_problem || "ওয়েবসাইটের অডিট";

      const firstGreeting = isBn
        ? `হ্যালো ${clientName}! আমি ${kb?.agent_persona_name || "আমাদের রিপ্রেজেন্টেটিভ"} বলছি ${kb?.company_name || "আমাদের প্রতিষ্ঠান"} থেকে। আপনার ${selectedSimLead.company_name}-এর ওয়েবসাইটে দেখলাম ${problem}...`
        : `Hello ${clientName}, this is ${kb?.agent_persona_name || "our representative"} from ${kb?.company_name || "our team"}. I'm reaching out regarding ${selectedSimLead.company_name}'s website audit where we noticed ${problem}...`;

      const startTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSimHistory([{ speaker: "agent", text: firstGreeting, time: startTime }]);
      playAgentResponse(firstGreeting);

      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }, 1500);
  };

  const handleEndSimCall = async () => {
    setSimActive(false);
    setIsAgentSpeaking(false);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    if (selectedSimLead && simHistory.length > 0) {
      try {
        await completeCallAndRecord(selectedSimLead.id, {
          meeting_booked: !!simBookedLink,
          meeting_link: simBookedLink || undefined,
          meeting_time: simBookedTime || undefined,
          duration_seconds: callDuration,
          sentiment: simBookedLink ? "HOT_INTERESTED" : "NEUTRAL",
          transcript: simHistory.map((h) => ({ speaker: h.speaker, text: h.text })),
          summary: `Call finished in ${callDuration}s. Outcome: ${simBookedLink ? "Meeting Booked" : "Completed"}`,
        });
        showToast("Call log and outcome saved successfully!", "success");
        await loadData();
      } catch (err) {
        console.error("Failed to record completion:", err);
      }
    }
  };

  // Helper for Country Flags
  const getCountryFlag = (country?: string) => {
    if (!country) return "🌐";
    const c = country.toLowerCase();
    if (c.includes("bangla") || c.includes("bd")) return "🇧🇩";
    if (c.includes("united states") || c.includes("usa") || c.includes("us")) return "🇺🇸";
    if (c.includes("united kingdom") || c.includes("uk")) return "🇬🇧";
    if (c.includes("canada")) return "🇨🇦";
    if (c.includes("australia")) return "🇦🇺";
    if (c.includes("arab") || c.includes("uae") || c.includes("dubai")) return "🇦🇪";
    if (c.includes("saudi")) return "🇸🇦";
    if (c.includes("qatar")) return "🇶🇦";
    if (c.includes("spain")) return "🇪🇸";
    return "🌐";
  };

  return (
    <div className="flex flex-col h-[calc(100vh-5rem)] bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Module Locked Notice */}
      <div className="p-4 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/40 border-b border-amber-500/30 flex items-center justify-between gap-4 px-6 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Lock className="w-4 h-4" />
          </div>
          <div>
            <span className="text-xs font-bold text-amber-300 block">
              Autonomous Voice Outreach Module Locked
            </span>
            <span className="text-[11px] text-slate-400">
              This module is currently locked for upcoming ElevenLabs production updates.
            </span>
          </div>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Operations Center</span>
        </Link>
      </div>

      {/* Toast Alert */}
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

      {/* Top Header / Autopilot Status Bar */}
      <header className="px-6 py-3.5 bg-slate-900/90 border-b border-slate-800 backdrop-blur-md shrink-0 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
            <PhoneCall className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-white tracking-wide">
                Autonomous Voice Outreach Agent
              </h1>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-semibold">
                ElevenLabs Multilingual v2
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Card 1 Verified Lead Intake • Personal Voice Cloning • Dynamic Country Routing (বাংলা, English, Arabic)
            </p>
          </div>
        </div>

        {/* Global Controls */}
        <div className="flex items-center gap-3">
          {/* Autonomous Auto-Call Pilot Toggle */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
            <span className="text-xs text-slate-400 font-medium hidden sm:inline">Auto-Call Pilot:</span>
            <button
              onClick={handleToggleAutoCall}
              className={`flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                kb?.auto_call_enabled
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-500/30"
                  : "bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-750"
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${kb?.auto_call_enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              <span>{kb?.auto_call_enabled ? "AUTOPILOT ON" : "STANDBY (MANUAL)"}</span>
            </button>
          </div>

          {/* Sync Leads from Card 1 button */}
          <button
            onClick={handleSyncFromCard1}
            disabled={syncingLeads}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md shadow-cyan-600/20 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingLeads ? "animate-spin" : ""}`} />
            <span>Sync Card 1 Leads</span>
          </button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="px-6 bg-slate-950 border-b border-slate-800/80 flex items-center gap-2 shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab("sheet")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
            activeTab === "sheet"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Ready for Call Queue ({queue.length})</span>
        </button>

        <button
          onClick={() => setActiveTab("studio")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
            activeTab === "studio"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Radio className="w-4 h-4 text-purple-400" />
          <span>Voice Studio & Cloning</span>
          {kb?.cloned_voice_id && (
            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("prompt")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
            activeTab === "prompt"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>Voice KB & Language Rules</span>
        </button>

        <button
          onClick={() => setActiveTab("simulator")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
            activeTab === "simulator"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Mic className="w-4 h-4 text-sky-400" />
          <span>Live Call Simulator</span>
        </button>

        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition ${
            activeTab === "logs"
              ? "border-emerald-500 text-emerald-400"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Calendar className="w-4 h-4 text-amber-400" />
          <span>Call Logs & Deals ({logs.length})</span>
        </button>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* TAB 1: Ready for Call Queue */}
        {activeTab === "sheet" && (
          <div className="space-y-4">
            {/* Filter & Action Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-3 rounded-2xl">
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    const allSelected = queue.every((q) => q.selected_for_call);
                    await batchQueueAction(allSelected ? "deselect_all" : "select_all");
                    await loadData();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select / Deselect All</span>
                </button>

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Status</option>
                  <option value="READY">Ready</option>
                  <option value="MEETING_BOOKED">Meeting Booked</option>
                  <option value="CALL_DONE">Call Done</option>
                </select>

                <select
                  value={countryFilter}
                  onChange={(e) => setCountryFilter(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                >
                  <option value="ALL">All Countries</option>
                  <option value="Bangladesh">Bangladesh 🇧🇩</option>
                  <option value="United States">USA 🇺🇸</option>
                  <option value="United Kingdom">UK 🇬🇧</option>
                  <option value="United Arab Emirates">UAE 🇦🇪</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Search company, phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Lead</span>
                </button>
              </div>
            </div>

            {/* Leads Table */}
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5 w-10">Select</th>
                    <th className="p-3.5">Company & Decision Maker</th>
                    <th className="p-3.5">Phone & Country</th>
                    <th className="p-3.5">Language</th>
                    <th className="p-3.5">Card 1 Identified Website Gap</th>
                    <th className="p-3.5">Status</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {queue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-slate-500">
                        No leads in queue. Click "Sync Card 1 Leads" above to pull real phone numbers!
                      </td>
                    </tr>
                  ) : (
                    queue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/60 transition">
                        <td className="p-3.5">
                          <input
                            type="checkbox"
                            checked={item.selected_for_call}
                            onChange={async (e) => {
                              await updateQueueItem(item.id, { selected_for_call: e.target.checked });
                              setQueue((prev) =>
                                prev.map((q) => (q.id === item.id ? { ...q, selected_for_call: e.target.checked } : q))
                              );
                            }}
                            className="rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0"
                          />
                        </td>
                        <td className="p-3.5">
                          <div className="font-semibold text-white">{item.company_name}</div>
                          <div className="text-[11px] text-slate-400">
                            {item.contact_person} {item.contact_title ? `• ${item.contact_title}` : ""}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-mono text-slate-200 font-semibold">{item.phone}</div>
                          <div className="text-[11px] text-slate-400 flex items-center gap-1">
                            <span>{getCountryFlag(item.country)}</span>
                            <span>{item.country || "Bangladesh"}</span>
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-mono font-medium">
                            {item.language || "Bengali"}
                          </span>
                        </td>
                        <td className="p-3.5 max-w-xs">
                          <div className="text-slate-300 line-clamp-2 text-[11px] leading-relaxed">
                            {item.exact_problem}
                          </div>
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              item.status === "MEETING_BOOKED"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : item.status === "READY"
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3.5 text-right">
                          <button
                            onClick={() => {
                              setSelectedSimLead(item);
                              setActiveTab("simulator");
                            }}
                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 ml-auto"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Call (AI)</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 2: Voice Studio & Voice Cloning */}
        {activeTab === "studio" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Cloner Box */}
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-purple-950/20 to-slate-900 border border-purple-500/30 space-y-5 shadow-2xl">
              <div className="flex items-center gap-2.5">
                <Radio className="w-6 h-6 text-purple-400" />
                <div>
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Instant Voice Cloning Studio (ElevenLabs)
                  </h2>
                  <p className="text-xs text-slate-400">
                    Record 30-60 seconds of your voice directly through your mic, or upload an audio file. The AI will call prospects speaking in your exact voice!
                  </p>
                </div>
              </div>

              {/* Cloned Voice Active Card */}
              {kb?.cloned_voice_id && (
                <div className="p-4 rounded-xl bg-purple-950/40 border border-purple-500/40 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-500/20 flex items-center justify-center text-purple-300 font-bold text-xs border border-purple-500/40">
                      ⭐
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Active Cloned Voice: {kb.cloned_voice_name || "Your Cloned Voice"}</span>
                        <span className="text-[10px] font-mono px-2 py-0.2 rounded bg-purple-500/30 text-purple-200">READY</span>
                      </div>
                      <div className="text-[10px] font-mono text-purple-300/80">Voice ID: {kb.cloned_voice_id}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Record / Upload Options */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option 1: Live Mic Recorder */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <Mic className="w-4 h-4 text-purple-400" />
                      <span>Option A: Record from Microphone</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Read any paragraph for 30 seconds clearly into your microphone.
                    </p>
                  </div>

                  <div className="py-2 text-center">
                    {isRecordingSample ? (
                      <div className="space-y-2">
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono text-xs animate-pulse">
                          <span className="w-2 h-2 rounded-full bg-rose-500" />
                          <span>Recording: {recordTimer}s</span>
                        </div>
                        <button
                          type="button"
                          onClick={stopRecordingSample}
                          className="w-full py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition"
                        >
                          Stop Recording
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={startRecordingSample}
                        className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2"
                      >
                        <Mic className="w-4 h-4" />
                        <span>Start 30-Sec Recording</span>
                      </button>
                    )}
                    {recordedBlob && (
                      <div className="text-[11px] text-emerald-400 font-medium mt-2">
                        ✓ Recorded sample ready ({recordedBlob.size} bytes)
                      </div>
                    )}
                  </div>
                </div>

                {/* Option 2: Upload File */}
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 flex flex-col justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-cyan-400" />
                      <span>Option B: Upload Audio File</span>
                    </h3>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Upload an existing clean voice sample (.mp3, .wav, or .m4a).
                    </p>
                  </div>

                  <div className="py-2">
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          setUploadedFile(e.target.files[0]);
                        }
                      }}
                      className="w-full text-xs text-slate-400 file:mr-2 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
                    />
                    {uploadedFile && (
                      <div className="text-[11px] text-emerald-400 font-medium mt-2 truncate">
                        ✓ Selected: {uploadedFile.name}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Clone Button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                <input
                  type="text"
                  placeholder="Voice Label (e.g. Executive Voice / Closer Voice)"
                  value={voiceNameInput}
                  onChange={(e) => setVoiceNameInput(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 flex-1 focus:outline-none focus:border-purple-500"
                />
                <button
                  type="button"
                  onClick={handleCloneVoice}
                  disabled={cloningLoading || (!recordedBlob && !uploadedFile)}
                  className="px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs shadow-lg shadow-purple-600/20 transition flex items-center justify-center gap-2 cursor-pointer"
                >
                  {cloningLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>Clone My Voice with ElevenLabs</span>
                </button>
              </div>
            </div>

            {/* Premade & Available Voices Catalog */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                ElevenLabs Voice Catalog & Active Caller Voice
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {voices.map((v) => {
                  const isSelected = kb?.elevenlabs_voice_id === v.voice_id;
                  return (
                    <div
                      key={v.voice_id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between transition ${
                        isSelected
                          ? "bg-purple-950/30 border-purple-500/60 shadow-md"
                          : "bg-slate-950 border-slate-800 hover:bg-slate-900"
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-white">{v.name}</span>
                          {v.category === "cloned" && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                              CLONED
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {v.labels?.accent || "Neutral"} • {v.labels?.gender || "Human"} • {v.labels?.use_case || "Sales"}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {v.preview_url && (
                          <button
                            type="button"
                            onClick={() => handlePlayPreview(v.voice_id, v.preview_url)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            title="Play Preview"
                          >
                            {previewingVoiceId === v.voice_id ? (
                              <Pause className="w-3.5 h-3.5 text-purple-400" />
                            ) : (
                              <Play className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={async () => {
                            if (!kb) return;
                            await saveVoiceKB({ elevenlabs_voice_id: v.voice_id });
                            setKb({ ...kb, elevenlabs_voice_id: v.voice_id });
                            showToast(`Voice set to: ${v.name}`, "success");
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                            isSelected
                              ? "bg-purple-600 text-white"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                        >
                          {isSelected ? "Active" : "Use Voice"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Voice KB & Language Rules */}
        {activeTab === "prompt" && (
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Voice Knowledge Base & Rules
              </h3>

              <div className="space-y-4 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Company / Agency Name</label>
                  <input
                    type="text"
                    value={kb?.company_name || ""}
                    onChange={(e) => kb && setKb({ ...kb, company_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Agent Persona Name</label>
                  <input
                    type="text"
                    value={kb?.agent_persona_name || ""}
                    onChange={(e) => kb && setKb({ ...kb, agent_persona_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Core Risk-Free Offer</label>
                  <input
                    type="text"
                    value={kb?.core_offer || ""}
                    onChange={(e) => kb && setKb({ ...kb, core_offer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">
                    System Instructions (18-Word Strict Rule)
                  </label>
                  <textarea
                    rows={4}
                    value={kb?.system_prompt || ""}
                    onChange={(e) => kb && setKb({ ...kb, system_prompt: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs leading-relaxed"
                  />
                </div>

                {/* Country Language Routing Map */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Dynamic Country ➔ Language Mapping</span>
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px] font-mono">
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                      <span>🇧🇩 Bangladesh</span>
                      <span className="text-cyan-400 font-bold">Bengali</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                      <span>🇺🇸 USA / Global</span>
                      <span className="text-cyan-400 font-bold">English</span>
                    </div>
                    <div className="p-2 rounded-lg bg-slate-950 border border-slate-800 flex justify-between">
                      <span>🇦🇪 UAE / Middle East</span>
                      <span className="text-cyan-400 font-bold">Arabic</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={async () => {
                      if (!kb) return;
                      await saveVoiceKB(kb);
                      showToast("Voice KB settings saved successfully!", "success");
                    }}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Knowledge Base</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: Live Call Simulator */}
        {activeTab === "simulator" && (
          <div className="max-w-3xl mx-auto space-y-5">
            <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-950 border border-slate-800 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-sky-500/20 text-sky-400 flex items-center justify-center font-bold text-xs border border-sky-500/30">
                    {selectedSimLead?.contact_person?.charAt(0) || "P"}
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white">
                      Target: {selectedSimLead?.contact_person} ({selectedSimLead?.company_name})
                    </h3>
                    <div className="text-[10px] text-slate-400 font-mono">
                      📞 {selectedSimLead?.phone} • {getCountryFlag(selectedSimLead?.country)} {selectedSimLead?.country} • Language: {selectedSimLead?.language || "Bengali"}
                    </div>
                  </div>
                </div>

                {simActive && (
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="font-mono text-xs text-emerald-400 font-bold">
                      {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                    </span>
                  </div>
                )}
              </div>

              {/* Call Control Button */}
              <div className="pt-2">
                {!simActive ? (
                  <button
                    type="button"
                    onClick={handleStartSimCall}
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20"
                  >
                    <PhoneCall className="w-4 h-4" />
                    <span>Dial Lead & Start Test Call</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleEndSimCall}
                    className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>Hang Up / End Call</span>
                  </button>
                )}
              </div>
            </div>

            {/* Live Call Transcript Bubble Box */}
            {simActive && (
              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 min-h-[260px] max-h-[380px] overflow-y-auto">
                {simConnecting ? (
                  <div className="flex items-center justify-center p-8 text-xs text-slate-400 gap-2">
                    <RefreshCw className="w-4 h-4 animate-spin text-sky-400" />
                    <span>Dialing {selectedSimLead?.phone}... Ringing...</span>
                  </div>
                ) : (
                  simHistory.map((h, i) => (
                    <div
                      key={i}
                      className={`flex flex-col ${
                        h.speaker === "agent" ? "items-start" : "items-end"
                      }`}
                    >
                      <div className="text-[10px] text-slate-500 mb-0.5 px-1">
                        {h.speaker === "agent" ? "🤖 AI Voice Agent" : "👤 Lead"} • {h.time}
                      </div>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs ${
                          h.speaker === "agent"
                            ? "bg-slate-800 text-slate-100 rounded-tl-sm border border-slate-700"
                            : "bg-emerald-950/80 text-emerald-100 rounded-tr-sm border border-emerald-500/40"
                        }`}
                      >
                        {h.text}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Lead Reply Input for Simulator */}
            {simActive && !simConnecting && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSimTurn(simUserInput);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  placeholder="Type prospect reply (e.g. 'আমি ব্যস্ত আছি', 'কত খরচ?', 'কাল সকাল ১১টায় পারব')..."
                  value={simUserInput}
                  onChange={(e) => setSimUserInput(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={!simUserInput.trim() || isProcessingTurn}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition"
                >
                  Speak
                </button>
              </form>
            )}

            {/* Meeting Booked Banner */}
            {simBookedLink && (
              <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-emerald-300">
                    🎉 Demo Locked: {simBookedTime}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 truncate max-w-md">
                    {simBookedLink}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(simBookedLink);
                    showToast("Google Meet link copied!", "success");
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold"
                >
                  Copy Link
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: Call Logs & Won Deals */}
        {activeTab === "logs" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 overflow-hidden shadow-xl">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/90 text-[11px] font-mono text-slate-400 uppercase tracking-wider">
                    <th className="p-3.5">Company & Contact</th>
                    <th className="p-3.5">Phone & Language</th>
                    <th className="p-3.5">Duration</th>
                    <th className="p-3.5">Outcome & Sentiment</th>
                    <th className="p-3.5">Meeting Link</th>
                    <th className="p-3.5 text-right">Summary</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-8 text-slate-500">
                        No call logs yet. Initiate calls from Queue or Simulator!
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-900/60 transition">
                        <td className="p-3.5">
                          <div className="font-semibold text-white">{log.company_name}</div>
                          <div className="text-[11px] text-slate-400">{log.contact_person}</div>
                        </td>
                        <td className="p-3.5">
                          <div className="font-mono text-slate-200">{log.phone}</div>
                          <div className="text-[11px] text-cyan-400">{log.language_used || "Bengali"}</div>
                        </td>
                        <td className="p-3.5 font-mono text-slate-300">
                          {log.call_duration_seconds}s
                        </td>
                        <td className="p-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold border ${
                              log.sentiment === "HOT_INTERESTED" || log.meeting_booked
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {log.meeting_booked ? "MEETING_BOOKED (HOT)" : log.sentiment}
                          </span>
                        </td>
                        <td className="p-3.5 font-mono text-[11px]">
                          {log.meeting_link ? (
                            <a
                              href={log.meeting_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-cyan-400 hover:underline flex items-center gap-1"
                            >
                              <span>Open Meet</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-slate-500">—</span>
                          )}
                        </td>
                        <td className="p-3.5 text-right text-slate-400 text-[11px]">
                          {log.summary || "Call completed"}
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

      {/* MODAL: Manual Add Lead */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="font-bold text-sm text-white">Add Manual Lead to Voice Queue</h3>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await addLeadToQueue({
                  ...newLead,
                  selected_for_call: true,
                });
                setShowAddModal(false);
                setNewLead({
                  contact_person: "",
                  company_name: "",
                  phone: "",
                  country: "Bangladesh",
                  language: "Bengali",
                  exact_problem: "",
                });
                await loadData();
              }}
              className="space-y-3 text-xs"
            >
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Company Name</label>
                <input
                  type="text"
                  required
                  value={newLead.company_name}
                  onChange={(e) => setNewLead({ ...newLead, company_name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Decision Maker Name</label>
                <input
                  type="text"
                  required
                  value={newLead.contact_person}
                  onChange={(e) => setNewLead({ ...newLead, contact_person: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                />
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Phone Number</label>
                <input
                  type="text"
                  required
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Country</label>
                  <select
                    value={newLead.country}
                    onChange={(e) => {
                      const c = e.target.value;
                      const lang = c === "Bangladesh" ? "Bengali" : c.includes("Arab") ? "Arabic" : "English";
                      setNewLead({ ...newLead, country: c, language: lang });
                    }}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                  >
                    <option value="Bangladesh">Bangladesh</option>
                    <option value="United States">United States</option>
                    <option value="United Kingdom">United Kingdom</option>
                    <option value="United Arab Emirates">UAE</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Language</label>
                  <input
                    type="text"
                    value={newLead.language}
                    onChange={(e) => setNewLead({ ...newLead, language: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-300 font-semibold mb-1">Identified Website Gap / Problem</label>
                <textarea
                  rows={2}
                  required
                  value={newLead.exact_problem}
                  onChange={(e) => setNewLead({ ...newLead, exact_problem: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg font-bold"
                >
                  Save Lead
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
