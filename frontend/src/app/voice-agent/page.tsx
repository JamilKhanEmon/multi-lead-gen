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
  HelpCircle,
  BookOpen,
  ListPlus,
  Tag,
  SlidersHorizontal,
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
  syncElevenLabsAgent,
  deleteElevenLabsAgent,
  fetchElevenLabsAccountStatus,
  ElevenLabsAccountStatus,
  VoiceKnowledgeBase,
  VoiceCallQueueItem,
  VoiceCallLog,
  ScriptQuestionItem,
  FaqKbItem,
} from "@/lib/api";

// Default Test Prospect so simulator is always ready for 1-click test calls
const DEFAULT_TEST_PROSPECT: VoiceCallQueueItem = {
  id: "00000000-0000-0000-0000-000000000001",
  lead_id: "demo-test-1",
  contact_person: "Mr. Farhan Ahmed",
  company_name: "Apex Global Solutions",
  phone: "+8801711223344",
  country: "Bangladesh",
  language: "English",
  exact_problem: "website visitor conversion drop-offs and low buyer inquiries",
  status: "READY",
  selected_for_call: false,
  call_attempts: 0,
  created_at: new Date().toISOString(),
};

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
  const [isSyncingAgent, setIsSyncingAgent] = useState(false);
  const [elAccount, setElAccount] = useState<ElevenLabsAccountStatus | null>(null);
  const [loadingElAccount, setLoadingElAccount] = useState(false);
  const [deletingAgentId, setDeletingAgentId] = useState<string | null>(null);
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

  // Admin Script & Dynamic KB Modals / State
  const [showAddStepModal, setShowAddStepModal] = useState(false);
  const [newStepPurpose, setNewStepPurpose] = useState("Qualifying Question");
  const [newStepQuestion, setNewStepQuestion] = useState("");

  const [showAddFaqModal, setShowAddFaqModal] = useState(false);
  const [newFaqCategory, setNewFaqCategory] = useState("Pricing");
  const [newFaqQuestion, setNewFaqQuestion] = useState("");
  const [newFaqTriggers, setNewFaqTriggers] = useState("");
  const [newFaqAnswer, setNewFaqAnswer] = useState("");

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
  const [selectedSimLead, setSelectedSimLead] = useState<VoiceCallQueueItem | null>(DEFAULT_TEST_PROSPECT);
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
      if (queueData.length > 0) {
        setSelectedSimLead((prev) => (prev && prev.id !== DEFAULT_TEST_PROSPECT.id ? prev : queueData[0]));
      } else {
        setSelectedSimLead((prev) => prev || DEFAULT_TEST_PROSPECT);
      }
      if (kbData?.elevenlabs_api_key_configured || kbData?.elevenlabs_api_key) {
        fetchElevenLabsAccountStatus(kbData.elevenlabs_api_key)
          .then((st) => {
            if (st.is_connected) {
              setElAccount(st);
              if (st.voices && st.voices.length > 0) setVoices(st.voices);
            }
          })
          .catch(() => {});
      }
    } catch (err: any) {
      console.error("Failed to load Voice Agent data:", err);
      showToast("Error loading Voice Agent data", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFetchElevenLabsAccount = async (apiKeyOverride?: string) => {
    setLoadingElAccount(true);
    try {
      const targetKey = apiKeyOverride !== undefined ? apiKeyOverride : kb?.elevenlabs_api_key;
      const res = await fetchElevenLabsAccountStatus(targetKey);
      setElAccount(res);
      if (res.is_connected) {
        if (res.voices && res.voices.length > 0) {
          setVoices(res.voices);
        }
        showToast("Live ElevenLabs Account & Models connected!", "success");
      } else if (res.error) {
        showToast(res.error, "error");
      }
    } catch {
      showToast("Failed to fetch live ElevenLabs account details", "error");
    } finally {
      setLoadingElAccount(false);
    }
  };

  const handleDeleteElevenLabsAgent = async (agentId: string, agentName?: string) => {
    if (
      !confirm(
        `Are you sure you want to permanently delete agent "${agentName || agentId}" (${agentId}) from your ElevenLabs account?`
      )
    ) {
      return;
    }
    setDeletingAgentId(agentId);
    try {
      await deleteElevenLabsAgent(agentId);
      showToast(`Agent "${agentName || agentId}" deleted successfully from ElevenLabs!`, "success");
      if (kb?.elevenlabs_agent_id === agentId) {
        setKb({ ...kb, elevenlabs_agent_id: "" });
        await saveVoiceKB({ elevenlabs_agent_id: "" });
      }
      await handleFetchElevenLabsAccount();
    } catch (err: any) {
      showToast(err.message || "Failed to delete agent from ElevenLabs", "error");
    } finally {
      setDeletingAgentId(null);
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

  // Delete a single lead from call queue
  const handleDeleteQueueItem = async (itemId: string, companyName: string) => {
    if (!confirm(`Are you sure you want to remove "${companyName}" from the call queue?`)) return;
    try {
      await deleteQueueItem(itemId);
      setQueue((prev) => prev.filter((item) => item.id !== itemId));
      showToast(`Removed "${companyName}" from call queue`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to remove lead from queue", "error");
    }
  };

  // Delete all selected leads from call queue
  const handleDeleteSelected = async () => {
    const selectedIds = queue.filter((q) => q.selected_for_call).map((q) => q.id);
    if (selectedIds.length === 0) {
      showToast("No leads selected to delete", "error");
      return;
    }
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} selected lead(s) from the queue?`)) return;
    try {
      await batchQueueAction("delete_selected", selectedIds);
      setQueue((prev) => prev.filter((item) => !selectedIds.includes(item.id)));
      showToast(`Successfully deleted ${selectedIds.length} lead(s) from queue`, "success");
    } catch (err: any) {
      showToast(err.message || "Failed to delete selected leads", "error");
    }
  };

  // Filtered queue items based on toolbar filters & search
  const filteredQueue = queue.filter((item) => {
    if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
    if (countryFilter !== "ALL" && item.country !== countryFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchComp = item.company_name?.toLowerCase().includes(q);
      const matchPhone = item.phone?.toLowerCase().includes(q);
      const matchPerson = item.contact_person?.toLowerCase().includes(q);
      if (!matchComp && !matchPhone && !matchPerson) return false;
    }
    return true;
  });

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
        audio.onended = () => setIsAgentSpeaking(false);
        audio.onerror = () => setIsAgentSpeaking(false);
        await audio.play();
        return;
      } catch (err) {
        console.warn("Audio element playback error, falling back:", err);
      }
    }

    // Try backend ElevenLabs TTS synthesis
    try {
      const blob = await synthesizeTTSAudio(text, kb?.elevenlabs_voice_id || undefined);
      if (blob && blob.size > 0) {
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
          setIsAgentSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        audio.onerror = () => {
          setIsAgentSpeaking(false);
          URL.revokeObjectURL(audioUrl);
        };
        await audio.play();
        return;
      }
    } catch (err) {
      console.warn("Backend TTS synthesis error, falling back to speech synthesis:", err);
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

  // Toggle Live Microphone Listening (Roleplay as Client)
  const toggleMicListening = () => {
    if (isRecordingMic) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch (e) {}
      }
      setIsRecordingMic(false);
      return;
    }

    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast(
        "Speech Recognition is not supported by your browser. Please use Chrome, Edge, or Safari.",
        "error"
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;

      const isBn = selectedSimLead?.language?.toLowerCase() === "bengali";
      recognition.lang = isBn ? "bn-BD" : "en-US";

      recognition.onstart = () => {
        setIsRecordingMic(true);
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        let finalTranscript = "";
        for (let i = 0; i < event.results.length; i++) {
          const item = event.results[i];
          if (item.isFinal) {
            finalTranscript += item[0].transcript;
          } else {
            interim += item[0].transcript;
          }
        }
        const textToSet = finalTranscript || interim;
        setSimUserInput(textToSet);

        if (finalTranscript.trim()) {
          setIsRecordingMic(false);
          handleSimTurn(finalTranscript.trim());
        }
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsRecordingMic(false);
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          showToast("Microphone access was denied. Please allow microphone permissions in your browser.", "error");
        }
      };

      recognition.onend = () => {
        setIsRecordingMic(false);
      };

      recognition.start();
    } catch (err) {
      console.error("Speech recognition startup error:", err);
      setIsRecordingMic(false);
      showToast("Could not start microphone listening", "error");
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

    const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
    try {
      const payload = {
        queue_item_id: activeLead.id.startsWith("00000000") ? undefined : activeLead.id,
        user_speech_text: userText,
        conversation_history: updatedHistory.map((h) => ({
          speaker: h.speaker === "agent" ? "agent" : "user",
          text: h.text,
        })),
        client_name: activeLead.contact_person,
        company_name: activeLead.company_name,
        exact_problem: activeLead.exact_problem,
        language: activeLead.language || "English",
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
    const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
    if (!selectedSimLead) {
      setSelectedSimLead(activeLead);
    }
    setSimActive(true);
    setSimConnecting(true);
    setSimHistory([]);
    setCallDuration(0);
    setSimBookedLink(null);
    setSimBookedTime(null);

    setTimeout(() => {
      setSimConnecting(false);
      const clientName = activeLead.contact_person || "Sir";
      const problem = activeLead.exact_problem || "website conversion bottlenecks";

      // Use admin defined Step 1 from script_questions_json if configured
      const step1 = (kb?.script_questions_json || []).find((s) => s.step === 1 && s.active !== false);
      let firstGreeting = "";
      if (step1 && step1.question) {
        firstGreeting = step1.question
          .replace(/\{\{\s*client_name\s*\}\}/gi, clientName)
          .replace(/\{\{\s*company_name\s*\}\}/gi, activeLead.company_name)
          .replace(/\{\{\s*agent_persona_name\s*\}\}/gi, kb?.agent_persona_name || "Alex")
          .replace(/\{\{\s*my_company\s*\}\}/gi, kb?.company_name || "Enterprise Systems")
          .replace(/\{\{\s*exact_problem\s*\}\}/gi, problem);
      } else {
        firstGreeting = `Hello ${clientName}, this is ${kb?.agent_persona_name || "our representative"} from ${kb?.company_name || "our team"}. I'm reaching out regarding ${activeLead.company_name}'s website audit where we noticed ${problem}...`;
      }

      const startTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSimHistory([{ speaker: "agent", text: firstGreeting, time: startTime }]);
      playAgentResponse(firstGreeting);

      callTimerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }, 1200);
  };

  const handleEndSimCall = async () => {
    setSimActive(false);
    setIsAgentSpeaking(false);
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
    }
    setIsRecordingMic(false);
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }

    const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
    if (activeLead && !activeLead.id.startsWith("00000000") && simHistory.length > 0) {
      try {
        await completeCallAndRecord(activeLead.id, {
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
              Card 1 Verified Lead Intake • Personal Voice Cloning • Dynamic Country Routing (English, Bengali, Arabic)
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
          <SlidersHorizontal className="w-4 h-4 text-emerald-400" />
          <span>Admin Script & Knowledge Base</span>
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
                    const allSelected = queue.length > 0 && queue.every((q) => q.selected_for_call);
                    const targetState = !allSelected;
                    // Optimistic update
                    setQueue((prev) => prev.map((q) => ({ ...q, selected_for_call: targetState })));
                    try {
                      await batchQueueAction(targetState ? "select_all" : "deselect_all");
                    } catch (err) {
                      await loadData();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Select / Deselect All</span>
                </button>

                {queue.some((q) => q.selected_for_call) && (
                  <button
                    onClick={handleDeleteSelected}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 text-xs font-medium border border-rose-500/30 transition shadow-sm"
                    title="Delete Selected Leads"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                    <span>Delete Selected ({queue.filter((q) => q.selected_for_call).length})</span>
                  </button>
                )}

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
                    <th className="p-3.5 w-10 text-center">
                      <label className="flex items-center justify-center cursor-pointer" title="Select / Deselect all visible">
                        <input
                          type="checkbox"
                          checked={filteredQueue.length > 0 && filteredQueue.every((q) => q.selected_for_call)}
                          onChange={async (e) => {
                            const newChecked = e.target.checked;
                            const targetIds = new Set(filteredQueue.map((q) => q.id));
                            setQueue((prev) =>
                              prev.map((q) => (targetIds.has(q.id) ? { ...q, selected_for_call: newChecked } : q))
                            );
                            try {
                              await batchQueueAction(newChecked ? "select_all" : "deselect_all");
                            } catch (err: any) {
                              console.error("Failed to batch update selection:", err);
                              await loadData();
                            }
                          }}
                          className="w-4 h-4 cursor-pointer accent-emerald-500 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:outline-none"
                        />
                      </label>
                    </th>
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
                  ) : filteredQueue.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-8 text-slate-500">
                        No leads match your current filter or search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredQueue.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-900/60 transition">
                        <td className="p-3.5 text-center">
                          <label className="flex items-center justify-center cursor-pointer p-1 -m-1">
                            <input
                              type="checkbox"
                              checked={!!item.selected_for_call}
                              onChange={async (e) => {
                                const newChecked = e.target.checked;
                                // 1. Instant optimistic state update
                                setQueue((prev) =>
                                  prev.map((q) => (q.id === item.id ? { ...q, selected_for_call: newChecked } : q))
                                );
                                // 2. Async backend persist
                                try {
                                  await updateQueueItem(item.id, { selected_for_call: newChecked });
                                } catch (err: any) {
                                  console.error("Failed to update queue item selection:", err);
                                  // Rollback on failure
                                  setQueue((prev) =>
                                    prev.map((q) => (q.id === item.id ? { ...q, selected_for_call: !newChecked } : q))
                                  );
                                  showToast("Failed to update selection", "error");
                                }
                              }}
                              className="w-4 h-4 cursor-pointer accent-emerald-500 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-0 focus:outline-none"
                            />
                          </label>
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
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => {
                                setSelectedSimLead(item);
                                setActiveTab("simulator");
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-sm"
                              title="Call Lead with AI"
                            >
                              <PhoneCall className="w-3 h-3" />
                              <span>Call (AI)</span>
                            </button>
                            <button
                              onClick={() => handleDeleteQueueItem(item.id, item.company_name)}
                              className="p-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 border border-rose-500/20 hover:border-rose-500/40 rounded-lg transition"
                              title="Delete Lead from Queue"
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

                  <button
                    type="button"
                    onClick={async () => {
                      if (!kb) return;
                      await saveVoiceKB({ cloned_voice_id: "", cloned_voice_name: "" });
                      setKb({ ...kb, cloned_voice_id: "", cloned_voice_name: "" });
                      showToast("Deactivated cloned voice", "success");
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/60 border border-rose-900/60 hover:bg-rose-900/60 text-rose-300 transition cursor-pointer"
                  >
                    Cancel Cloned Voice ✕
                  </button>
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
                            if (isSelected) {
                              await saveVoiceKB({ elevenlabs_voice_id: "" });
                              setKb({ ...kb, elevenlabs_voice_id: "" });
                              showToast(`Cancelled active voice: ${v.name}`, "success");
                            } else {
                              await saveVoiceKB({ elevenlabs_voice_id: v.voice_id });
                              setKb({ ...kb, elevenlabs_voice_id: v.voice_id });
                              showToast(`Voice set to: ${v.name}`, "success");
                            }
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? "bg-purple-600 hover:bg-rose-600 text-white group shadow-md shadow-purple-600/30"
                              : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                          }`}
                          title={isSelected ? "Click to cancel / deactivate this voice" : "Select this voice as active"}
                        >
                          {isSelected ? (
                            <>
                              <span className="group-hover:hidden flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Active
                              </span>
                              <span className="hidden group-hover:inline text-rose-100 font-bold">
                                Cancel Active ✕
                              </span>
                            </>
                          ) : (
                            "Use Voice"
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: Admin Studio: Script Flow & Knowledge Base (KB) */}
        {activeTab === "prompt" && (
          <div className="max-w-4xl mx-auto space-y-6">
            {/* Top Bar with Save Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Admin Voice Studio: Script Flow & Knowledge Base
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Zero-code control: Configure what questions your AI asks on calls, and how it answers any client doubts or questions.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddStepModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                >
                  <ListPlus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>+ Add Script Step</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAddFaqModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5"
                >
                  <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                  <span>+ Add Q&A</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!kb) return;
                    setSavingKb(true);
                    try {
                      await saveVoiceKB(kb);
                      showToast("All Script Flow & Knowledge Base changes saved to Database!", "success");
                    } catch (err: any) {
                      showToast("Failed to save settings: " + (err.message || ""), "error");
                    } finally {
                      setSavingKb(false);
                    }
                  }}
                  disabled={savingKb}
                  className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {savingKb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save to Database</span>
                </button>
              </div>
            </div>

            {/* SECTION 1: Outbound Call Script Flow */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <ListPlus className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    1. Outbound Call Script Flow (Sequential Questions Spoken by AI Agent)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20 text-[10px] font-mono font-bold">
                    {(kb?.script_questions_json || []).length} Steps
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddStepModal(true)}
                  className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Step</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                When calling a prospect, the agent asks these questions in sequence. 
                Variables like <code className="text-cyan-300 font-mono">{"{{client_name}}"}</code>, <code className="text-cyan-300 font-mono">{"{{company_name}}"}</code>, <code className="text-cyan-300 font-mono">{"{{exact_problem}}"}</code> automatically populate with prospect data.
              </p>

              {/* Steps List */}
              <div className="space-y-3 pt-2">
                {(kb?.script_questions_json || []).map((stepItem, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-mono font-bold text-[10px] border border-cyan-500/30">
                          Step {stepItem.step || idx + 1}
                        </span>
                        <input
                          type="text"
                          value={stepItem.purpose || ""}
                          onChange={(e) => {
                            if (!kb) return;
                            const updated = [...(kb.script_questions_json || [])];
                            updated[idx] = { ...updated[idx], purpose: e.target.value };
                            setKb({ ...kb, script_questions_json: updated });
                          }}
                          placeholder="Purpose (e.g. Problem Hook / Qualifying Question)"
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-cyan-500 focus:outline-none text-xs text-slate-200 font-semibold px-1 py-0.5"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={stepItem.active !== false}
                            onChange={(e) => {
                              if (!kb) return;
                              const updated = [...(kb.script_questions_json || [])];
                              updated[idx] = { ...updated[idx], active: e.target.checked };
                              setKb({ ...kb, script_questions_json: updated });
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                          />
                          <span>Active</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            if (!kb) return;
                            const updated = [...(kb.script_questions_json || [])];
                            updated.splice(idx, 1);
                            const renumbered = updated.map((s, i) => ({ ...s, step: i + 1 }));
                            setKb({ ...kb, script_questions_json: renumbered });
                            showToast("Step removed", "success");
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                          title="Delete Step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      value={stepItem.question || ""}
                      onChange={(e) => {
                        if (!kb) return;
                        const updated = [...(kb.script_questions_json || [])];
                        updated[idx] = { ...updated[idx], question: e.target.value };
                        setKb({ ...kb, script_questions_json: updated });
                      }}
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 font-sans focus:outline-none focus:border-cyan-500 leading-relaxed"
                      placeholder="Enter what the agent will say or ask at this step..."
                    />
                  </div>
                ))}

                {(kb?.script_questions_json || []).length === 0 && (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    No script steps configured yet. Click "+ Add Step" above to add your first question.
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 2: Dynamic Knowledge Base (KB) & Client Q&A */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    2. Knowledge Base (KB) & Q&A (Objection Handling & Common Inquiries)
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] font-mono font-bold">
                    {(kb?.faq_kb_json || []).length} Q&A Rules
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setShowAddFaqModal(true)}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Q&A</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                When a prospect raises an objection or asks a question during a call, the agent immediately delivers these answers via ElevenLabs. You can add or modify rules anytime without writing code.
              </p>

              {/* FAQ KB Cards Grid */}
              <div className="space-y-3 pt-2">
                {(kb?.faq_kb_json || []).map((faqItem, idx) => (
                  <div
                    key={faqItem.id || idx}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono font-bold text-[10px] border border-purple-500/30">
                          {faqItem.category || "General"}
                        </span>
                        <input
                          type="text"
                          value={faqItem.question || ""}
                          onChange={(e) => {
                            if (!kb) return;
                            const updated = [...(kb.faq_kb_json || [])];
                            updated[idx] = { ...updated[idx], question: e.target.value };
                            setKb({ ...kb, faq_kb_json: updated });
                          }}
                          placeholder="Client Question / Objection Title"
                          className="bg-transparent border-b border-transparent hover:border-slate-700 focus:border-purple-500 focus:outline-none text-xs text-white font-bold px-1 py-0.5"
                        />
                      </div>

                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-slate-400">
                          <input
                            type="checkbox"
                            checked={faqItem.active !== false}
                            onChange={(e) => {
                              if (!kb) return;
                              const updated = [...(kb.faq_kb_json || [])];
                              updated[idx] = { ...updated[idx], active: e.target.checked };
                              setKb({ ...kb, faq_kb_json: updated });
                            }}
                            className="rounded border-slate-700 bg-slate-900 text-purple-500 focus:ring-0"
                          />
                          <span>Active</span>
                        </label>

                        <button
                          type="button"
                          onClick={() => {
                            if (!kb) return;
                            const updated = (kb.faq_kb_json || []).filter((_, i) => i !== idx);
                            setKb({ ...kb, faq_kb_json: updated });
                            showToast("Q&A removed from Knowledge Base", "success");
                          }}
                          className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                          title="Delete Q&A"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Trigger keywords */}
                    <div className="flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <input
                        type="text"
                        value={faqItem.triggers || ""}
                        onChange={(e) => {
                          if (!kb) return;
                          const updated = [...(kb.faq_kb_json || [])];
                          updated[idx] = { ...updated[idx], triggers: e.target.value };
                          setKb({ ...kb, faq_kb_json: updated });
                        }}
                        placeholder="Trigger keywords (comma separated, e.g: price, cost, fee, expensive, pricing)"
                        className="w-full bg-slate-900 border border-slate-800/80 rounded-lg px-2.5 py-1 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-purple-500"
                      />
                    </div>

                    {/* Agent Spoken Answer */}
                    <div>
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">
                        Agent Spoken Answer (ElevenLabs Voice):
                      </label>
                      <textarea
                        rows={2}
                        value={faqItem.answer || ""}
                        onChange={(e) => {
                          if (!kb) return;
                          const updated = [...(kb.faq_kb_json || [])];
                          updated[idx] = { ...updated[idx], answer: e.target.value };
                          setKb({ ...kb, faq_kb_json: updated });
                        }}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-100 font-sans focus:outline-none focus:border-purple-500 leading-relaxed"
                        placeholder="Enter the spoken answer the agent will deliver via ElevenLabs..."
                      />
                    </div>
                  </div>
                ))}

                {(kb?.faq_kb_json || []).length === 0 && (
                  <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                    No Q&A rules configured yet. Click "+ Add Q&A" above to add question-answer rules.
                  </div>
                )}
              </div>
            </div>

            {/* SECTION 3: Agent Persona & Offer Settings */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <div className="border-b border-slate-800/80 pb-3 flex items-center gap-2">
                <Bot className="w-4 h-4 text-emerald-400" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  3. Agent Persona & Company Offer
                </h3>
              </div>

              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Company / Agency Name</label>
                    <input
                      type="text"
                      value={kb?.company_name || ""}
                      onChange={(e) => kb && setKb({ ...kb, company_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 font-semibold mb-1">Agent Persona Name</label>
                    <input
                      type="text"
                      value={kb?.agent_persona_name || ""}
                      onChange={(e) => kb && setKb({ ...kb, agent_persona_name: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Core Risk-Free Offer</label>
                  <input
                    type="text"
                    value={kb?.core_offer || ""}
                    onChange={(e) => kb && setKb({ ...kb, core_offer: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                {/* ElevenLabs Conversational AI Cloud Architecture (Zero-VPS Load) */}
                <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 via-slate-950 to-slate-900 border border-indigo-800/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse" />
                      <h4 className="font-bold text-xs text-indigo-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                        ElevenLabs Conversational AI Engine (Zero-VPS Cloud)
                      </h4>
                    </div>
                    {kb?.elevenlabs_agent_id ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30">
                        ⚡ Cloud Agent Active
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30">
                        Pending Sync
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    All Speech-to-Text (STT), Brain LLM reasoning, and real-time Voice Streaming execute directly on ElevenLabs' high-speed global cluster. <strong className="text-indigo-300">0% CPU / RAM load on your VPS.</strong>
                  </p>

                  <div className="space-y-3 pt-1">
                    {/* API Key Input Row */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-300 font-semibold text-[11px]">
                          ElevenLabs API Key
                        </label>
                        {elAccount?.is_connected ? (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Live Account Connected
                          </span>
                        ) : null}
                      </div>

                      <div className="flex gap-2">
                        <input
                          type="password"
                          placeholder="sk_... (ElevenLabs Secret API Key)"
                          value={kb?.elevenlabs_api_key || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (kb) setKb({ ...kb, elevenlabs_api_key: val });
                          }}
                          className="flex-1 bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            if (!kb?.elevenlabs_api_key && !kb?.elevenlabs_api_key_configured) {
                              showToast("Please enter your ElevenLabs API Key first", "error");
                              return;
                            }
                            setLoadingElAccount(true);
                            try {
                              const st = await fetchElevenLabsAccountStatus(kb?.elevenlabs_api_key);
                              setElAccount(st);
                              if (st.is_connected) {
                                if (st.voices && st.voices.length > 0) setVoices(st.voices);
                                showToast("Live ElevenLabs Account & Models connected!", "success");
                              } else if (st.error) {
                                showToast(st.error, "error");
                              }
                            } catch {
                              showToast("Failed to fetch live ElevenLabs status", "error");
                            } finally {
                              setLoadingElAccount(false);
                            }
                          }}
                          disabled={loadingElAccount}
                          className="px-3.5 py-2 bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
                        >
                          {loadingElAccount ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-indigo-400" />}
                          <span>{loadingElAccount ? "Syncing..." : "Sync Live Account"}</span>
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-500 mt-1">
                        {kb?.elevenlabs_api_key_configured || elAccount?.is_connected
                          ? "✅ ElevenLabs API Key is actively configured and verified"
                          : "Enter key starting with 'sk_' to instantly load your available models, quota, and voices."}
                      </p>
                    </div>

                    {/* Live ElevenLabs Account Dashboard Card */}
                    {elAccount?.is_connected && elAccount.subscription && (
                      <div className="p-3.5 rounded-xl bg-indigo-950/30 border border-indigo-800/40 space-y-3">
                        <div className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-200">Plan:</span>
                            <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 font-bold uppercase text-[10px] border border-indigo-500/30">
                              {elAccount.subscription.tier}
                            </span>
                            <span className="text-[11px] text-emerald-400 font-semibold">● Active</span>
                          </div>

                          <div className="text-[11px] text-slate-300 font-mono">
                            Quota: {elAccount.subscription.character_count.toLocaleString()} / {elAccount.subscription.character_limit.toLocaleString()} chars
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-slate-900 rounded-full h-1.5 overflow-hidden">
                          <div
                            className="bg-gradient-to-r from-indigo-500 to-cyan-400 h-1.5 rounded-full transition-all"
                            style={{
                              width: `${Math.min(
                                100,
                                Math.round(
                                  (elAccount.subscription.character_count / (elAccount.subscription.character_limit || 1)) * 100
                                )
                              )}%`,
                            }}
                          />
                        </div>

                        {/* Active Models in Account */}
                        <div className="space-y-1.5 pt-1">
                          <div className="text-[10px] uppercase font-bold text-slate-400 flex items-center justify-between">
                            <span>Active Models Available in Your Account</span>
                            <span className="text-cyan-400 font-mono">{elAccount.models.length} Models</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                            {elAccount.models.map((m) => (
                              <button
                                key={m.model_id}
                                type="button"
                                onClick={() => {
                                  if (kb) setKb({ ...kb, elevenlabs_model_id: m.model_id });
                                  showToast(`Selected TTS Model: ${m.name}`, "success");
                                }}
                                className={`px-2 py-1 rounded text-[10px] font-mono border transition flex items-center gap-1 ${
                                  (kb?.elevenlabs_model_id || "eleven_turbo_v2") === m.model_id
                                    ? "bg-indigo-600/40 border-indigo-400 text-indigo-200 font-bold"
                                    : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                                title={m.description || m.name}
                              >
                                {m.model_id === "eleven_turbo_v2" && <span className="text-cyan-400 font-bold">⚡</span>}
                                <span>{m.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Existing Conversational Agents in Account */}
                        {elAccount.agents && elAccount.agents.length > 0 && (
                          <div className="pt-2.5 border-t border-indigo-900/40 space-y-2.5">
                            <label className="block text-slate-300 font-semibold text-[11px] flex items-center justify-between">
                              <span>Select Existing Agent from ElevenLabs Account</span>
                              <span className="text-[10px] text-cyan-400 font-mono font-bold bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                                {elAccount.agents.length} Found
                              </span>
                            </label>

                            {/* Dropdown for quick selection */}
                            <select
                              value={kb?.elevenlabs_agent_id || ""}
                              onChange={(e) => {
                                if (kb && e.target.value) {
                                  setKb({ ...kb, elevenlabs_agent_id: e.target.value });
                                  showToast(`Selected agent: ${e.target.value}`, "success");
                                }
                              }}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                            >
                              <option value="">-- Choose an existing agent in your account --</option>
                              {elAccount.agents.map((ag) => (
                                <option key={ag.agent_id} value={ag.agent_id}>
                                  🤖 {ag.name || "Agent"} ({ag.agent_id}) {kb?.elevenlabs_agent_id === ag.agent_id ? "★ ACTIVE" : ""}
                                </option>
                              ))}
                            </select>

                            {/* Agent Cards with Direct Delete Buttons */}
                            <div className="space-y-1.5 pt-1">
                              <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                                Manage Created Agents (Direct Delete from ElevenLabs):
                              </span>
                              <div className="grid grid-cols-1 gap-1.5">
                                {elAccount.agents.map((ag) => {
                                  const isSelected = kb?.elevenlabs_agent_id === ag.agent_id;
                                  const isDeleting = deletingAgentId === ag.agent_id;
                                  return (
                                    <div
                                      key={ag.agent_id}
                                      className={`flex items-center justify-between p-2 rounded-lg border transition text-xs ${
                                        isSelected
                                          ? "bg-indigo-950/40 border-indigo-500/50 text-indigo-100"
                                          : "bg-slate-950 border-slate-800/80 text-slate-300 hover:border-slate-700"
                                      }`}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <Bot className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-indigo-400" : "text-slate-400"}`} />
                                        <div className="truncate">
                                          <div className="font-semibold text-[11px] truncate flex items-center gap-1.5">
                                            <span>{ag.name || "Sales Agent"}</span>
                                            {isSelected && (
                                              <span className="text-[9px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-1.5 py-0.2 rounded font-mono font-bold">
                                                ACTIVE
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-[9px] font-mono text-slate-500 truncate">
                                            ID: {ag.agent_id}
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex items-center gap-1.5 shrink-0">
                                        {!isSelected ? (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (kb) {
                                                setKb({ ...kb, elevenlabs_agent_id: ag.agent_id });
                                                showToast(`Selected agent: ${ag.name || ag.agent_id}`, "success");
                                              }
                                            }}
                                            className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-200 transition cursor-pointer"
                                          >
                                            Select
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              if (kb) {
                                                setKb({ ...kb, elevenlabs_agent_id: "" });
                                                showToast("Deselected active agent", "success");
                                              }
                                            }}
                                            className="px-2 py-1 rounded bg-indigo-600/30 text-indigo-300 text-[10px] font-semibold hover:bg-indigo-600/40 transition cursor-pointer"
                                          >
                                            Deselect
                                          </button>
                                        )}

                                        {/* Direct Delete from ElevenLabs Account */}
                                        <button
                                          type="button"
                                          disabled={isDeleting}
                                          onClick={() => handleDeleteElevenLabsAgent(ag.agent_id, ag.name)}
                                          className="p-1 rounded bg-rose-950/40 border border-rose-900/50 hover:bg-rose-900/40 text-rose-400 hover:text-rose-200 transition cursor-pointer disabled:opacity-50"
                                          title="Delete permanently from ElevenLabs account"
                                        >
                                          {isDeleting ? (
                                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                          ) : (
                                            <Trash2 className="w-3.5 h-3.5" />
                                          )}
                                        </button>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          Brain LLM Engine (Selected on ElevenLabs)
                        </label>
                        <select
                          value={kb?.elevenlabs_llm || "gemini-1.5-flash"}
                          onChange={(e) => kb && setKb({ ...kb, elevenlabs_llm: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-indigo-500"
                        >
                          <optgroup label="⚡ Google Gemini (Ultra-Fast Sub-Second Latency - Best for Calls)">
                            <option value="gemini-2.0-flash">⚡ Gemini 2.0 Flash (Next-Gen Ultra-Fast ~350ms)</option>
                            <option value="gemini-1.5-flash">⚡ Gemini 1.5 Flash (Sub-Second Latency - Recommended)</option>
                            <option value="gemini-1.5-pro">🔬 Gemini 1.5 Pro (Deep Reasoning & Analysis)</option>
                            <option value="gemini-1.0-pro">⚡ Gemini 1.0 Pro (Standard)</option>
                          </optgroup>

                          <optgroup label="🎯 OpenAI GPT Series">
                            <option value="gpt-4o-mini">🎯 GPT-4o Mini (Cost-Effective & Natural Conversational)</option>
                            <option value="gpt-4o">🧠 GPT-4o (Flagship Multimodal Intelligence)</option>
                            <option value="gpt-4-turbo">🏢 GPT-4 Turbo (High Precision Enterprise)</option>
                            <option value="gpt-3.5-turbo">⚡ GPT-3.5 Turbo (Fast Classic)</option>
                          </optgroup>

                          <optgroup label="🧠 Anthropic Claude Series">
                            <option value="claude-3-7-sonnet">👑 Claude 3.7 Sonnet (Latest Hybrid Reasoning)</option>
                            <option value="claude-3-5-sonnet">💼 Claude 3.5 Sonnet (Elite Consultative Sales)</option>
                            <option value="claude-3-haiku">⚡ Claude 3 Haiku (Ultra-Fast Response)</option>
                          </optgroup>

                          <optgroup label="🌐 Custom & Open-Source LLMs (Groq / OpenClaw)">
                            <option value="custom-llm">🛠️ Custom LLM / OpenClaw (DeepSeek R1 / Llama 3.3)</option>
                          </optgroup>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          ElevenLabs Agent ID (Auto-Generated or Manual)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. agt_..."
                          value={kb?.elevenlabs_agent_id || ""}
                          onChange={(e) => kb && setKb({ ...kb, elevenlabs_agent_id: e.target.value })}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-100 font-mono text-xs focus:outline-none focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    {/* Sync / Deploy Button */}
                    <div className="pt-2 flex items-center justify-between border-t border-indigo-900/40">
                      <div className="text-[10px] text-slate-400">
                        Pushes current Script Questions, FAQ KB & Prompt into an ElevenLabs Conversational Agent.
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!kb?.elevenlabs_api_key && !kb?.elevenlabs_api_key_configured) {
                            showToast("Please enter and save your ElevenLabs API Key first!", "error");
                            return;
                          }
                          setIsSyncingAgent(true);
                          try {
                            await saveVoiceKB(kb);
                            const res = await syncElevenLabsAgent();
                            setKb({ ...kb, elevenlabs_agent_id: res.agent_id, elevenlabs_llm: res.llm });
                            showToast(`Success! ElevenLabs Agent deployed (ID: ${res.agent_id})`, "success");
                            // Re-fetch live account to list the new agent
                            await handleFetchElevenLabsAccount();
                          } catch (err: any) {
                            showToast(err.message || "Failed to deploy ElevenLabs Agent", "error");
                          } finally {
                            setIsSyncingAgent(false);
                          }
                        }}
                        disabled={isSyncingAgent}
                        className="px-4 py-2 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 disabled:opacity-50 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-md shadow-indigo-600/20 cursor-pointer"
                      >
                        {isSyncingAgent ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                        <span>{kb?.elevenlabs_agent_id ? "Re-Sync Agent to ElevenLabs" : "Deploy / Create ElevenLabs Agent"}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* ElevenLabs Agent Studio Controls (No Hardcode Speech & Live Sliders) */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                        ElevenLabs Agent Studio Controls (No Hardcode Speech & Live Sliders)
                      </h4>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono">1:1 Studio Parity</span>
                  </div>

                  {/* 1. First Message (Welcome Speech) + Interruptible Toggle */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                        <span>First Message (Initial greeting spoken when prospect answers)</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg hover:border-slate-700 transition">
                        <span className="text-[10px] text-slate-300 font-semibold">Interruptible Speech:</span>
                        <input
                          type="checkbox"
                          checked={kb?.interruptible !== false}
                          onChange={(e) => kb && setKb({ ...kb, interruptible: e.target.checked })}
                          className="rounded text-indigo-500 bg-slate-950 border-slate-700 focus:ring-0 cursor-pointer"
                        />
                        <span className={`text-[10px] font-bold ${kb?.interruptible !== false ? "text-emerald-400" : "text-slate-500"}`}>
                          {kb?.interruptible !== false ? "ON" : "OFF"}
                        </span>
                      </label>
                    </div>

                    <textarea
                      rows={3}
                      value={kb?.first_message || ""}
                      onChange={(e) => kb && setKb({ ...kb, first_message: e.target.value })}
                      placeholder="Hello {{client_name}}, this is {{agent_persona_name}} with {{my_company}} calling regarding..."
                      className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
                    />

                    {/* Quick Variable Tag Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500">Insert tag:</span>
                      {["{{client_name}}", "{{company_name}}", "{{exact_problem}}", "{{agent_persona_name}}", "{{my_company}}"].map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => {
                            if (!kb) return;
                            setKb({ ...kb, first_message: (kb.first_message || "") + " " + tag });
                          }}
                          className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-indigo-500/50 text-[10px] text-indigo-300 font-mono transition"
                        >
                          + {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 2. Voice Sliders & Timezone */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-800/80">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex justify-between">
                        <span>Voice Stability</span>
                        <span className="text-cyan-400 font-mono">{Number(kb?.voice_stability ?? 0.5).toFixed(2)}</span>
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={kb?.voice_stability ?? 0.5}
                        onChange={(e) => kb && setKb({ ...kb, voice_stability: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-slate-900 rounded cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">More variable ➔ Stable</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex justify-between">
                        <span>Clarity / Similarity</span>
                        <span className="text-cyan-400 font-mono">{Number(kb?.voice_similarity ?? 0.75).toFixed(2)}</span>
                      </label>
                      <input
                        type="range"
                        min="0.0"
                        max="1.0"
                        step="0.05"
                        value={kb?.voice_similarity ?? 0.75}
                        onChange={(e) => kb && setKb({ ...kb, voice_similarity: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-slate-900 rounded cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">Low ➔ High likeness</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex justify-between">
                        <span>Speaking Speed</span>
                        <span className="text-cyan-400 font-mono">{Number(kb?.voice_speed ?? 1.0).toFixed(2)}x</span>
                      </label>
                      <input
                        type="range"
                        min="0.7"
                        max="1.3"
                        step="0.05"
                        value={kb?.voice_speed ?? 1.0}
                        onChange={(e) => kb && setKb({ ...kb, voice_speed: parseFloat(e.target.value) })}
                        className="w-full accent-cyan-400 bg-slate-900 rounded cursor-pointer"
                      />
                      <span className="text-[9px] text-slate-500">0.7x Slow ➔ 1.3x Fast</span>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex items-center gap-1">
                        <Clock className="w-3 h-3 text-cyan-400" />
                        <span>Agent Timezone</span>
                      </label>
                      <select
                        value={kb?.agent_timezone || "Asia/Dhaka"}
                        onChange={(e) => kb && setKb({ ...kb, agent_timezone: e.target.value })}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-200 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                      >
                        <option value="Asia/Dhaka">🇧🇩 Asia/Dhaka (GMT+6)</option>
                        <option value="America/New_York">🇺🇸 America/New_York (EST)</option>
                        <option value="Europe/London">🇬🇧 Europe/London (GMT)</option>
                        <option value="Asia/Dubai">🇦🇪 Asia/Dubai (GST)</option>
                        <option value="UTC">🌐 UTC Standard</option>
                      </select>
                      <span className="text-[9px] text-slate-500">Local schedule alignment</span>
                    </div>
                  </div>

                  {/* 3. In-Call Qualification & Delivery Speech Prompts (Zero Hardcoded Speech) */}
                  <div className="space-y-3 pt-3 border-t border-slate-800/80">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-[11px] text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        <span>In-Call Qualification & Delivery Speech (Zero Hardcoded Speech)</span>
                      </h5>
                      <span className="text-[10px] text-emerald-400 font-semibold">100% Dynamic</span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          1. WhatsApp Number Inquiry (Prompt to verify or request WhatsApp number)
                        </label>
                        <textarea
                          rows={2}
                          value={kb?.whatsapp_prompt_question || ""}
                          onChange={(e) => kb && setKb({ ...kb, whatsapp_prompt_question: e.target.value })}
                          placeholder="Awesome! I will send over the meeting invite—is this your direct WhatsApp number, or should I send it to another number?"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          2. Email Address Inquiry (Prompt to confirm email for calendar invite)
                        </label>
                        <textarea
                          rows={2}
                          value={kb?.email_prompt_question || ""}
                          onChange={(e) => kb && setKb({ ...kb, email_prompt_question: e.target.value })}
                          placeholder="Could you also confirm your official business email so I can send over the Google Calendar invite?"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                        3. Final Meeting Confirmation Speech (Wrap-up and polite departure)
                      </label>
                      <textarea
                        rows={2}
                        value={kb?.meeting_confirmation_speech || ""}
                        onChange={(e) => kb && setKb({ ...kb, meeting_confirmation_speech: e.target.value })}
                        placeholder="Awesome! I have sent our Calendly scheduling link to your WhatsApp and email so you can pick any time that works best. Have a great day, {{client_name}}!"
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-emerald-500"
                      />
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        Supported variables: <span className="text-emerald-400 font-mono">{"{{client_name}}"}</span>, <span className="text-emerald-400 font-mono">{"{{meeting_time}}"}</span>, <span className="text-emerald-400 font-mono">{"{{meeting_platform}}"}</span>, <span className="text-emerald-400 font-mono">{"{{meeting_link}}"}</span>
                      </p>
                    </div>
                  </div>

                  {/* 4. Calendly.com Credentials & Booking Integration */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-blue-950/40 via-slate-950 to-slate-900 border border-blue-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-400" />
                        <h5 className="font-bold text-xs text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span>Calendly.com Scheduling & Credentials</span>
                        </h5>
                      </div>
                      {kb?.calendly_url ? (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Calendly Active</span>
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium border border-amber-500/20">
                          Calendly Not Configured
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Connect your official <strong className="text-white">calendly.com</strong> link. When a lead agrees to a demo or meeting, the agent provides this direct calendar link so the client can pick their own time without any back-and-forth negotiation.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex items-center justify-between">
                          <span>Calendly Booking URL</span>
                          {kb?.calendly_url && (
                            <a
                              href={kb.calendly_url.startsWith("http") ? kb.calendly_url : `https://${kb.calendly_url}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-cyan-400 hover:text-cyan-300 inline-flex items-center gap-0.5 text-[10px]"
                            >
                              <span>Test Link</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </label>
                        <input
                          type="url"
                          value={kb?.calendly_url || ""}
                          onChange={(e) => kb && setKb({ ...kb, calendly_url: e.target.value })}
                          placeholder="https://calendly.com/your-org/intro-call"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-mono"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          e.g., https://calendly.com/your-company/intro-call
                        </span>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex items-center justify-between">
                          <span>Calendly API Key / Token (Optional)</span>
                          {kb?.calendly_api_key_configured && (
                            <span className="text-emerald-400 text-[10px] flex items-center gap-0.5">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              <span>Configured</span>
                            </span>
                          )}
                        </label>
                        <input
                          type="password"
                          value={kb?.calendly_api_key || ""}
                          onChange={(e) => kb && setKb({ ...kb, calendly_api_key: e.target.value })}
                          placeholder={kb?.calendly_api_key_configured ? "•••••••••••••••••••• (Leave blank to keep current)" : "Personal Access Token from calendly.com/integrations"}
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-blue-500 font-mono"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Allows automated webhook booking synchronization
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Country Language Routing Map */}
                <div className="pt-3 border-t border-slate-800 space-y-2">
                  <h4 className="font-bold text-slate-300 flex items-center gap-1.5">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    <span>Dynamic Country ➔ Language Routing</span>
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
                      setSavingKb(true);
                      try {
                        await saveVoiceKB(kb);
                        showToast("Settings successfully saved to Database!", "success");
                      } catch (err: any) {
                        showToast("Failed to save: " + (err.message || ""), "error");
                      } finally {
                        setSavingKb(false);
                      }
                    }}
                    disabled={savingKb}
                    className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    {savingKb ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    <span>Save All Changes to Database</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Modal: Add Script Step */}
            {showAddStepModal && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <ListPlus className="w-4 h-4 text-cyan-400" />
                      <h3 className="font-bold text-sm text-white">Add New Script Step</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddStepModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Step Purpose / Label</label>
                      <input
                        type="text"
                        value={newStepPurpose}
                        onChange={(e) => setNewStepPurpose(e.target.value)}
                        placeholder="e.g. Qualifying Question / Booking Pitch"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">Spoken Question / Script</label>
                      <textarea
                        rows={3}
                        value={newStepQuestion}
                        onChange={(e) => setNewStepQuestion(e.target.value)}
                        placeholder="Enter what the agent will say or ask at this step..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Supported tags: <span className="text-cyan-300 font-mono">{"{{client_name}}"}</span>, <span className="text-cyan-300 font-mono">{"{{company_name}}"}</span>, <span className="text-cyan-300 font-mono">{"{{exact_problem}}"}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddStepModal(false)}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!kb) return;
                        const currentSteps = kb.script_questions_json || [];
                        const nextStepNum = currentSteps.length + 1;
                        const newStep = {
                          step: nextStepNum,
                          purpose: newStepPurpose.trim() || `Step ${nextStepNum}`,
                          question: newStepQuestion.trim() || "Are you currently experiencing conversion drop-offs on your website or landing pages?",
                          active: true,
                        };
                        setKb({
                          ...kb,
                          script_questions_json: [...currentSteps, newStep],
                        });
                        setNewStepQuestion("");
                        setShowAddStepModal(false);
                        showToast(`Added Step ${nextStepNum} to Call Script!`, "success");
                      }}
                      className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md shadow-cyan-600/20"
                    >
                      Add Step
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Modal: Add FAQ KB */}
            {showAddFaqModal && (
              <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-purple-400" />
                      <h3 className="font-bold text-sm text-white">Add Q&A to Knowledge Base</h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAddFaqModal(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Category</label>
                        <select
                          value={newFaqCategory}
                          onChange={(e) => setNewFaqCategory(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                        >
                          <option value="Pricing">Pricing / Cost</option>
                          <option value="Services">Services / Offer</option>
                          <option value="Competitor">Competitor / Team</option>
                          <option value="Time">Time / Busy</option>
                          <option value="Information">Information / Send Email</option>
                          <option value="General">General FAQ</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1">Question / Objection Title</label>
                        <input
                          type="text"
                          value={newFaqQuestion}
                          onChange={(e) => setNewFaqQuestion(e.target.value)}
                          placeholder="e.g. Where is your headquarters located?"
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Trigger Keywords (Comma separated)
                      </label>
                      <input
                        type="text"
                        value={newFaqTriggers}
                        onChange={(e) => setNewFaqTriggers(e.target.value)}
                        placeholder="e.g. office, location, headquarters, address, city"
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-[11px]"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        The AI agent triggers this spoken response whenever the prospect mentions any of these keywords.
                      </p>
                    </div>

                    <div>
                      <label className="block text-slate-300 font-semibold mb-1">
                        Agent Spoken Answer (ElevenLabs Voice)
                      </label>
                      <textarea
                        rows={3}
                        value={newFaqAnswer}
                        onChange={(e) => setNewFaqAnswer(e.target.value)}
                        placeholder="Enter the spoken answer (keep under 15-20 words for natural speech flow)..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowAddFaqModal(false)}
                      className="px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold hover:bg-slate-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!kb) return;
                        if (!newFaqQuestion.trim() || !newFaqAnswer.trim()) {
                          showToast("Please enter both question and answer", "error");
                          return;
                        }
                        const currentFaqs = kb.faq_kb_json || [];
                        const newFaq = {
                          id: `faq_${Date.now()}`,
                          category: newFaqCategory,
                          question: newFaqQuestion.trim(),
                          triggers: newFaqTriggers.trim() || newFaqQuestion.trim(),
                          answer: newFaqAnswer.trim(),
                          active: true,
                        };
                        setKb({
                          ...kb,
                          faq_kb_json: [...currentFaqs, newFaq],
                        });
                        setNewFaqQuestion("");
                        setNewFaqTriggers("");
                        setNewFaqAnswer("");
                        setShowAddFaqModal(false);
                        showToast("Added new Q&A to Knowledge Base!", "success");
                      }}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md shadow-purple-600/20"
                    >
                      Add Q&A
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: Live Call Simulator (ElevenLabs-Style Web Testing Studio) */}
        {activeTab === "simulator" && (() => {
          const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
          return (
            <div className="max-w-3xl mx-auto space-y-4">
              {/* Target & Call Control Card */}
              <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-slate-950 border border-slate-800 shadow-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-md shrink-0">
                      {activeLead.contact_person.charAt(0)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold text-white">
                          Target: {activeLead.contact_person}
                        </h3>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                          {activeLead.company_name}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5 flex flex-wrap items-center gap-2">
                        <span>📞 {activeLead.phone}</span>
                        <span>•</span>
                        <span>{getCountryFlag(activeLead.country)} {activeLead.country}</span>
                        <span>•</span>
                        <span className="text-cyan-400 font-semibold">Language: {activeLead.language || "English"}</span>
                      </div>
                    </div>
                  </div>

                  {/* Switch Target Dropdown & Timer */}
                  <div className="flex items-center gap-2">
                    <select
                      value={activeLead.id}
                      onChange={(e) => {
                        if (e.target.value === DEFAULT_TEST_PROSPECT.id) {
                          setSelectedSimLead(DEFAULT_TEST_PROSPECT);
                        } else {
                          const found = queue.find((q) => q.id === e.target.value);
                          if (found) setSelectedSimLead(found);
                        }
                      }}
                      disabled={simActive}
                      className="bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value={DEFAULT_TEST_PROSPECT.id}>⭐ Demo Prospect: Farhan Ahmed (Apex Global)</option>
                      {queue.map((q) => (
                        <option key={q.id} value={q.id}>
                          👤 {q.contact_person} ({q.company_name})
                        </option>
                      ))}
                    </select>

                    {simActive && (
                      <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-rose-500/30 shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                        <span className="font-mono text-xs text-rose-400 font-bold">
                          {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Call Control Button */}
                <div>
                  {!simActive ? (
                    <button
                      type="button"
                      onClick={handleStartSimCall}
                      className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
                    >
                      <PhoneCall className="w-4 h-4" />
                      <span>Dial Lead & Start Test Call</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleEndSimCall}
                      className="w-full py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 cursor-pointer"
                    >
                      <PhoneOff className="w-4 h-4" />
                      <span>Hang Up / End Call</span>
                    </button>
                  )}
                </div>
              </div>

              {/* ElevenLabs Animated Conversational Sphere / Visualizer Orb */}
              {simActive && (
                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-xl flex flex-col items-center justify-center relative overflow-hidden">
                  <div
                    className={`absolute w-44 h-44 rounded-full blur-2xl transition-all duration-700 opacity-60 ${
                      isAgentSpeaking
                        ? "bg-cyan-500/40 animate-pulse scale-125"
                        : isRecordingMic
                        ? "bg-rose-500/40 animate-pulse scale-125"
                        : isProcessingTurn
                        ? "bg-amber-500/40 animate-pulse"
                        : "bg-indigo-500/20"
                    }`}
                  />

                  <div
                    className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-500 ${
                      isAgentSpeaking
                        ? "ring-4 ring-cyan-400/50 shadow-2xl shadow-cyan-500/50 scale-105"
                        : isRecordingMic
                        ? "ring-4 ring-rose-400/60 shadow-2xl shadow-rose-500/50 scale-110"
                        : isProcessingTurn
                        ? "ring-2 ring-amber-400/60 animate-spin"
                        : "ring-1 ring-slate-700"
                    }`}
                  >
                    <div
                      className={`w-20 h-20 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-inner ${
                        isAgentSpeaking
                          ? "bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 animate-pulse"
                          : isRecordingMic
                          ? "bg-gradient-to-tr from-rose-600 via-pink-500 to-amber-500 animate-pulse"
                          : isProcessingTurn
                          ? "bg-gradient-to-tr from-amber-600 to-orange-500"
                          : "bg-gradient-to-tr from-slate-800 to-slate-900 border border-slate-700"
                      }`}
                    >
                      {isAgentSpeaking ? (
                        <Volume2 className="w-8 h-8 text-white animate-pulse" />
                      ) : isRecordingMic ? (
                        <Mic className="w-8 h-8 text-white animate-pulse" />
                      ) : isProcessingTurn ? (
                        <RefreshCw className="w-8 h-8 text-white animate-spin" />
                      ) : (
                        <Bot className="w-8 h-8 text-slate-300" />
                      )}
                    </div>
                  </div>

                  {/* Realtime Live Speech Status */}
                  <div className="mt-3 text-center">
                    <div className="text-xs font-bold tracking-wide uppercase">
                      {isAgentSpeaking ? (
                        <span className="text-cyan-300 flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          AI Agent is Speaking (ElevenLabs Voice)
                        </span>
                      ) : isRecordingMic ? (
                        <span className="text-rose-300 flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
                          Listening to Client (Speak into Mic)
                        </span>
                      ) : isProcessingTurn ? (
                        <span className="text-amber-300 flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          AI Brain Reasoning & Generating Speech...
                        </span>
                      ) : (
                        <span className="text-emerald-400 flex items-center justify-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                          Call Connected • Ready for Client Voice
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Live Call Transcript Bubble Box (Clear Agent vs Client Dialogue) */}
              {simActive && (
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-3 min-h-[220px] max-h-[380px] overflow-y-auto">
                  {simConnecting ? (
                    <div className="flex flex-col items-center justify-center p-8 text-xs text-slate-400 gap-2">
                      <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
                      <span>Dialing {activeLead.phone}... Connecting ElevenLabs stream...</span>
                    </div>
                  ) : (
                    simHistory.map((h, i) => {
                      const isAgent = h.speaker === "agent";
                      return (
                        <div
                          key={i}
                          className={`flex flex-col ${isAgent ? "items-start" : "items-end"}`}
                        >
                          {/* Speaker Label with Audio Replay */}
                          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1 px-1">
                            {isAgent ? (
                              <>
                                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                                <span className="text-cyan-400">🤖 AI Sales Agent (ElevenLabs)</span>
                                <span className="text-slate-600">•</span>
                                <span className="text-slate-500 font-normal">{h.time}</span>
                                <button
                                  type="button"
                                  onClick={() => playAgentResponse(h.text)}
                                  className="ml-1 text-[9px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-0.5 bg-cyan-950/60 border border-cyan-800/50 px-1.5 py-0.2 rounded cursor-pointer"
                                  title="Replay Audio"
                                >
                                  <Volume2 className="w-2.5 h-2.5" />
                                  <span>Replay</span>
                                </button>
                              </>
                            ) : (
                              <>
                                <span className="text-slate-500 font-normal">{h.time}</span>
                                <span className="text-slate-600">•</span>
                                <span className="text-emerald-400">👤 Client / Prospect (You)</span>
                                <User className="w-3.5 h-3.5 text-emerald-400" />
                              </>
                            )}
                          </div>

                          {/* Speech Bubble */}
                          <div
                            className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-md ${
                              isAgent
                                ? "bg-slate-900 border border-cyan-500/30 text-slate-100 rounded-tl-sm"
                                : "bg-emerald-950/90 border border-emerald-500/50 text-emerald-100 rounded-tr-sm"
                            }`}
                          >
                            {h.text}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Quick Objection / Reply Test Pills */}
              {simActive && !simConnecting && (
                <div className="space-y-1.5 px-1">
                  <div className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider flex items-center justify-between">
                    <span>⚡ Quick Objection & Response Test Pills:</span>
                    <span className="text-[10px] text-slate-500">Click pill to test agent reaction</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {[
                      "What is your pricing?",
                      "I am busy right now, call later",
                      "We already have a team",
                      "Can you send an email with details?",
                      "Yes, send me your Calendly link to book a time",
                    ].map((pill) => (
                      <button
                        key={pill}
                        type="button"
                        disabled={isProcessingTurn || isAgentSpeaking}
                        onClick={() => handleSimTurn(pill)}
                        className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-emerald-500/50 text-[10px] font-medium text-slate-300 hover:text-emerald-300 transition cursor-pointer disabled:opacity-40"
                      >
                        "{pill}"
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Lead Reply Input for Simulator */}
              {simActive && !simConnecting && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (isRecordingMic) {
                      toggleMicListening();
                    }
                    handleSimTurn(simUserInput);
                  }}
                  className="space-y-2"
                >
                  <div className="flex items-center gap-2">
                    {/* Realtime Microphone Button */}
                    <button
                      type="button"
                      onClick={toggleMicListening}
                      disabled={isProcessingTurn}
                      className={`px-3.5 py-2.5 rounded-xl border font-bold flex items-center gap-2 transition cursor-pointer text-xs shrink-0 ${
                        isRecordingMic
                          ? "bg-rose-500/20 border-rose-500 text-rose-300 ring-2 ring-rose-500/40 shadow-lg shadow-rose-500/20 animate-pulse"
                          : "bg-slate-900 border-slate-700 hover:border-emerald-500 text-slate-200 hover:text-white"
                      }`}
                      title={isRecordingMic ? "Click to stop mic" : "Click to speak with your microphone"}
                    >
                      {isRecordingMic ? (
                        <>
                          <MicOff className="w-4 h-4 text-rose-400" />
                          <span>Listening...</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-4 h-4 text-emerald-400" />
                          <span>Speak Mic</span>
                        </>
                      )}
                    </button>

                    {/* Text Input / Spoken transcript */}
                    <input
                      type="text"
                      placeholder={
                        isRecordingMic
                          ? "Listening... Speak naturally into your mic (e.g. 'I am busy right now', 'What is your price?')..."
                          : "Type reply or click 'Speak Mic' to talk in real-time..."
                      }
                      value={simUserInput}
                      onChange={(e) => setSimUserInput(e.target.value)}
                      className={`flex-1 bg-slate-900 border rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none transition ${
                        isRecordingMic
                          ? "border-rose-500/70 ring-1 ring-rose-500/50 text-rose-100"
                          : "border-slate-800 focus:border-emerald-500"
                      }`}
                    />

                    {/* Send Button */}
                    <button
                      type="submit"
                      disabled={!simUserInput.trim() || isProcessingTurn}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer shrink-0"
                    >
                      {isProcessingTurn ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <span>Send</span>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between px-1 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                      <span>💡 Tip: Click</span>
                      <strong className="text-emerald-400">Speak Mic</strong>
                      <span>to roleplay as a client speaking directly through your microphone.</span>
                    </span>
                    <span>
                      Language: <span className="text-cyan-400 font-semibold">{activeLead.language || "English"}</span>
                    </span>
                  </div>
                </form>
              )}

              {/* Meeting Booked Banner */}
              {simBookedLink && (
                <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/60 via-slate-900 to-blue-950/40 border border-emerald-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{simBookedLink.includes("calendly.com") ? "🎉 Calendly Direct Booking Link" : `🎉 Demo Locked: ${simBookedTime}`}</span>
                      {simBookedLink.includes("calendly.com") && (
                        <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[9px] font-mono border border-blue-500/30">
                          calendly.com
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] font-mono text-emerald-400 truncate max-w-md mt-0.5">
                      {simBookedLink}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {simBookedLink.startsWith("http") && (
                      <a
                        href={simBookedLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold cursor-pointer flex items-center gap-1 shadow-sm"
                      >
                        <span>Open Link</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(simBookedLink);
                        showToast(simBookedLink.includes("calendly.com") ? "Calendly booking link copied!" : "Meeting link copied!", "success");
                      }}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer"
                    >
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

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
