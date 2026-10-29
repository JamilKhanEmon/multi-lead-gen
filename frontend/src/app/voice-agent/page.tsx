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
  ChevronDown,
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
  Eye,
  EyeOff,
  Send,
  Mail,
  RotateCcw,
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
  triggerOutboundCall,
  getAvailableGeminiModels,
  testWhatsAppConnection,
  testEmailConnection,
  VoiceKnowledgeBase,
  VoiceCallQueueItem,
  VoiceCallLog,
  ScriptQuestionItem,
  FaqKbItem,
  getStoredToken,
} from "@/lib/api/voice";

// Default Test Prospect so simulator is always ready for 1-click test calls
const DEFAULT_TEST_PROSPECT: VoiceCallQueueItem = {
  id: "00000000-0000-0000-0000-000000000001",
  lead_id: "demo-test-1",
  contact_person: "Decision Maker",
  company_name: "Prospect Business",
  phone: "",
  email: "",
  country: "Bangladesh",
  language: "Bengali",
  exact_problem: "",
  status: "READY",
  selected_for_call: false,
  call_attempts: 0,
  created_at: new Date().toISOString(),
};

const DEFAULT_FIRST_MESSAGE = "";
const DEFAULT_SENIOR_PLAYBOOK = "";

export default function VoiceAgentPage() {
  const [activeTab, setActiveTab] = useState<"sheet" | "prompt" | "simulator" | "logs">("sheet");

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
  const [callingItemId, setCallingItemId] = useState<string | null>(null);

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
  const [isAddingLead, setIsAddingLead] = useState(false);


  // WhatsApp Gateway Credentials & Test State
  const [showWaToken, setShowWaToken] = useState(false);
  const [testWaPhone, setTestWaPhone] = useState("");
  const [testWaLoading, setTestWaLoading] = useState(false);
  const [testWaFeedback, setTestWaFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  const handleTestWhatsApp = async () => {
    if (!testWaPhone.trim()) {
      showToast("Please enter a destination phone number (e.g., 017xxxxxxxx).", "error");
      return;
    }
    const phoneId = (kb?.whatsapp_phone_number_id || "").trim();
    const token = (kb?.whatsapp_access_token || "").trim();
    if (!phoneId) {
      showToast("Please enter your WhatsApp Phone Number ID first.", "error");
      return;
    }
    if (!token && !kb?.whatsapp_configured) {
      showToast("Please enter your Meta WhatsApp Access Token first.", "error");
      return;
    }

    try {
      setTestWaLoading(true);
      setTestWaFeedback(null);
      const res = await testWhatsAppConnection({
        phone_number_id: phoneId,
        access_token: token,
        target_phone: testWaPhone.trim(),
      });
      setTestWaFeedback({
        success: true,
        msg: `✅ WhatsApp message sent! Message ID: ${res.message_id || "Delivered"}`,
      });
      showToast("WhatsApp test message delivered!", "success");
    } catch (err: any) {
      setTestWaFeedback({
        success: false,
        msg: `❌ Delivery failed: ${err.message}`,
      });
      showToast(err.message || "WhatsApp dispatch failed", "error");
    } finally {
      setTestWaLoading(false);
    }
  };

  // Email Gateway Test State
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testEmailCompany, setTestEmailCompany] = useState("");
  const [testEmailLoading, setTestEmailLoading] = useState(false);
  const [testEmailFeedback, setTestEmailFeedback] = useState<{ success: boolean; msg: string } | null>(null);

  const handleTestEmail = async () => {
    if (!testEmailTo.trim() || !testEmailTo.includes("@")) {
      showToast("Please enter a valid destination email address.", "error");
      return;
    }

    try {
      setTestEmailLoading(true);
      setTestEmailFeedback(null);
      const recipientUsername = testEmailTo.trim().split("@")[0].replace(/[._-]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      const companyFromDomain =
        testEmailTo.includes("@") && !/@(gmail|yahoo|hotmail|outlook)\./i.test(testEmailTo)
          ? testEmailTo.split("@")[1].split(".")[0].toUpperCase()
          : "Enterprise Solutions";
      const resolvedCompany = testEmailCompany.trim() || companyFromDomain;

      const res = await testEmailConnection({
        target_email: testEmailTo.trim(),
        subject: kb?.post_call_email_subject || "Discovery Session: {{my_company}} & {{company_name}}",
        body: kb?.post_call_email_template,
        client_name: recipientUsername || "Valued Partner",
        company_name: resolvedCompany,
        my_company: kb?.company_name || kb?.active_smtp_name || "",
        agent_persona_name: kb?.agent_persona_name || "",
      });
      setTestEmailFeedback({
        success: res.success,
        msg: res.success
          ? `✅ Email sent! Sender: ${res.sender_email || "Active Gateway"} | Status: ${res.note}`
          : `⚠️ Notice: ${res.note}`,
      });
      showToast(res.success ? "Test email dispatched successfully!" : res.note, res.success ? "success" : "error");
    } catch (err: any) {
      setTestEmailFeedback({
        success: false,
        msg: `❌ Email delivery failed: ${err.message}`,
      });
      showToast(err.message || "Email dispatch failed", "error");
    } finally {
      setTestEmailLoading(false);
    }
  };

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

  // Dynamic Gemini Models state (queried live from Google API)
  const [dynamicGeminiModels, setDynamicGeminiModels] = useState<Array<{ id: string; name: string; supports_live: boolean }>>([
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Official - Low Latency)", supports_live: true },
    { id: "gemini-3.8-live", name: "Gemini 3.8 Live (Native Audio)", supports_live: true },
  ]);
  const [loadingModels, setLoadingModels] = useState<boolean>(false);
  const [isModelsFromGoogle, setIsModelsFromGoogle] = useState<boolean>(false);

  const refreshGeminiModels = async (keyToUse?: string) => {
    try {
      setLoadingModels(true);
      const res = await getAvailableGeminiModels(keyToUse || kb?.gemini_api_key);
      if (res && res.models && res.models.length > 0) {
        setDynamicGeminiModels(res.models);
        setIsModelsFromGoogle(res.from_google);
      }
    } catch (e) {
      console.warn("Notice loading dynamic Gemini models:", e);
    } finally {
      setLoadingModels(false);
    }
  };

  // Simulator State
  const [selectedSimLead, setSelectedSimLead] = useState<VoiceCallQueueItem | null>(DEFAULT_TEST_PROSPECT);
  const [simActive, setSimActive] = useState(false);
  const [simConnecting, setSimConnecting] = useState(false);
  const [simHistory, setSimHistory] = useState<Array<{ speaker: "agent" | "lead" | "system"; text: string; time: string }>>([]);
  const [simUserInput, setSimUserInput] = useState("");
  const [simBookedLink, setSimBookedLink] = useState<string | null>(null);
  const [simBookedTime, setSimBookedTime] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  const callTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isRecordingMic, setIsRecordingMic] = useState(false);
  const [isProcessingTurn, setIsProcessingTurn] = useState(false);
  const isAgentSpeakingRef = useRef(false);
  const simActiveRef = useRef(false);
  const isMicMutedRef = useRef(false);
  const recognitionRef = useRef<any>(null);

  // Google Gemini Live Real-time Streaming Web Audio Refs
  const simWebSocketRef = useRef<WebSocket | null>(null);
  const simAudioContextRef = useRef<AudioContext | null>(null);
  const simMediaStreamRef = useRef<MediaStream | null>(null);
  const simProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const simNextPlayTimeRef = useRef<number>(0);
  const simAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const simSessionIdRef = useRef<string>("");
  const simLiveAgentTextRef = useRef<string>("");

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
      if (kbData && (kbData.gemini_api_key || kbData.gemini_api_key_configured)) {
        refreshGeminiModels(kbData.gemini_api_key);
      }
      if (queueData.length > 0) {
        setSelectedSimLead((prev) => (prev && prev.id !== DEFAULT_TEST_PROSPECT.id ? prev : queueData[0]));
      } else {
        setSelectedSimLead((prev) => prev || DEFAULT_TEST_PROSPECT);
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

  const handleDialTwilio = async (item: VoiceCallQueueItem) => {
    if (!confirm(`Place real outbound telephone call to ${item.contact_person} (${item.phone}) via Twilio + Google Gemini Live?`)) return;
    setCallingItemId(item.id);
    try {
      const res = await triggerOutboundCall(item.id);
      showToast(`Call placed to ${item.phone}! ${res.message || "Active"}`, "success");
      const updated = await fetchCallQueue();
      setQueue(updated);
    } catch (err: any) {
      showToast(err.message || "Failed to dispatch Twilio call", "error");
    } finally {
      setCallingItemId(null);
    }
  };

  // Manual Save Lead handler
  const handleSaveLead = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newLead.company_name?.trim()) {
      showToast("Please enter Company Name", "error");
      return;
    }
    if (!newLead.contact_person?.trim()) {
      showToast("Please enter Decision Maker Name", "error");
      return;
    }
    if (!newLead.phone?.trim()) {
      showToast("Please enter Phone Number", "error");
      return;
    }
    if (!newLead.exact_problem?.trim()) {
      showToast("Please enter Website Gap / Problem", "error");
      return;
    }

    setIsAddingLead(true);
    try {
      await addLeadToQueue({
        company_name: newLead.company_name.trim(),
        contact_person: newLead.contact_person.trim(),
        phone: newLead.phone.trim(),
        country: newLead.country || "Bangladesh",
        language: newLead.language || "Bengali",
        exact_problem: newLead.exact_problem.trim(),
        selected_for_call: true,
      });
      showToast("✓ Lead saved to voice queue successfully!", "success");
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
    } catch (err: any) {
      console.error("Save lead error:", err);
      showToast(err.message || "Failed to add lead to queue", "error");
    } finally {
      setIsAddingLead(false);
    }
  };

  // Sync Card 1 leads handler
  const handleSyncFromCard1 = async () => {
    try {
      setSyncingLeads(true);
      const res = await syncLeadsFromCard1();
      showToast(res.message || `Synced ${res.synced_count} verified leads from Card 1 into Call Queue!`, "success");
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
      showToast(err.message || "Voice sample registration failed.", "error");
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

  // Direct Real-time PCM Audio Playback from Google Gemini Live (24kHz Mono)
  const playPcmChunk = (base64Pcm: string) => {
    try {
      if (!simAudioContextRef.current) {
        simAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = simAudioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Cancel any browser speech synthesis to ensure zero voice collision / overlapping
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }

      const binary = atob(base64Pcm);
      const sampleCount = Math.floor(binary.length / 2);
      if (sampleCount === 0) return;
      const float32 = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const byte1 = binary.charCodeAt(i * 2);
        const byte2 = binary.charCodeAt(i * 2 + 1);
        let val = (byte2 << 8) | byte1;
        if (val >= 32768) val -= 65536;
        float32[i] = val / 32768.0;
      }

      const buffer = ctx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);

      const now = ctx.currentTime;
      // Seamless gapless sequential playback: each chunk starts right when previous finishes
      const start = simNextPlayTimeRef.current < now ? now : simNextPlayTimeRef.current;
      source.start(start);
      simNextPlayTimeRef.current = start + buffer.duration;

      simAudioSourcesRef.current.push(source);
      isAgentSpeakingRef.current = true;
      setIsAgentSpeaking(true);
      source.onended = () => {
        simAudioSourcesRef.current = simAudioSourcesRef.current.filter((s) => s !== source);
        if (simAudioSourcesRef.current.length === 0) {
          isAgentSpeakingRef.current = false;
          setIsAgentSpeaking(false);
        }
      };
    } catch (e) {
      console.warn("PCM play error:", e);
    }
  };

  const stopPcmPlayback = () => {
    try {
      simAudioSourcesRef.current.forEach((src) => {
        try {
          src.stop();
        } catch (e) {}
      });
      simAudioSourcesRef.current = [];
      if (simAudioContextRef.current) {
        simNextPlayTimeRef.current = simAudioContextRef.current.currentTime;
      }
      isAgentSpeakingRef.current = false;
      setIsAgentSpeaking(false);
    } catch (e) {}
  };

  const speakBrowserFallback = (utteranceText: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(utteranceText);
      const isBn = /[\u0980-\u09ff]/.test(utteranceText);
      const voices = window.speechSynthesis.getVoices();

      // STRICT FILTER: NEVER select a female voice (Oparna, Lekha, Zira, Heera, etc.)
      const isFemaleVoice = (v: SpeechSynthesisVoice) => {
        const lower = (v.name + " " + (v as any).voiceURI).toLowerCase();
        return (
          lower.includes("female") ||
          lower.includes("oparna") ||
          lower.includes("lekha") ||
          lower.includes("zira") ||
          lower.includes("heera") ||
          lower.includes("samantha") ||
          lower.includes("karen") ||
          lower.includes("victoria") ||
          lower.includes("fiona")
        );
      };

      if (isBn) {
        // Select male Bengali voice if available, or fallback to any Bengali voice with low masculine pitch
        const maleBn = voices.find(
          (v) =>
            v.lang.toLowerCase().includes("bn") &&
            !isFemaleVoice(v) &&
            (v.name.toLowerCase().includes("male") ||
              v.name.toLowerCase().includes("pradeep") ||
              v.name.toLowerCase().includes("bashkar"))
        );
        const anyBn = voices.find((v) => v.lang.toLowerCase().includes("bn"));
        if (maleBn) {
          utterance.voice = maleBn;
        } else if (anyBn) {
          utterance.voice = anyBn;
          utterance.pitch = 0.72; // Deep authoritative pitch to ensure masculine timbre
        }
      } else {
        const maleEn = voices.find(
          (v) =>
            v.lang.toLowerCase().startsWith("en") &&
            !isFemaleVoice(v) &&
            (v.name.toLowerCase().includes("male") ||
              v.name.toLowerCase().includes("david") ||
              v.name.toLowerCase().includes("guy") ||
              v.name.toLowerCase().includes("george") ||
              v.name.toLowerCase().includes("daniel") ||
              v.name.toLowerCase().includes("mark"))
        );
        if (maleEn) utterance.voice = maleEn;
      }
      utterance.rate = 0.96;
      if (!utterance.pitch) utterance.pitch = 0.80; // Authoritative, deep masculine pitch
      utterance.onstart = () => {
        isAgentSpeakingRef.current = true;
        setIsAgentSpeaking(true);
      };
      utterance.onend = () => {
        isAgentSpeakingRef.current = false;
        setIsAgentSpeaking(false);
      };
      utterance.onerror = () => {
        isAgentSpeakingRef.current = false;
        setIsAgentSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn("Browser speech fallback notice:", e);
      setIsAgentSpeaking(false);
    }
  };

  const playAgentResponse = async (text: string) => {
    if (!text || typeof window === "undefined") return;
    // If Gemini Live native PCM audio is currently playing, do not overlay fallback speech
    if (simAudioSourcesRef.current && simAudioSourcesRef.current.length > 0) return;
    try {
      window.speechSynthesis?.cancel();

      // Voice persona selection (defaults to authoritative male Charon)
      const selectedVoice = kb?.gemini_voice_name || "Charon";

      // 1. Primary: High-fidelity natural voice via backend Google Gemini Live Native TTS
      try {
        const formData = new FormData();
        formData.append("text", text);
        formData.append("voice_name", selectedVoice);
        formData.append("voice_id", selectedVoice);
        const token = getStoredToken();
        const headers: Record<string, string> = {};
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const resp = await fetch("/api/v1/voice-agent/tts", {
          method: "POST",
          headers,
          body: formData,
        });
        if (resp.ok) {
          const blob = await resp.blob();
          if (blob.size > 400) {
            const audioUrl = URL.createObjectURL(blob);
            const audio = new Audio(audioUrl);
            setIsAgentSpeaking(true);
            audio.onended = () => {
              setIsAgentSpeaking(false);
              URL.revokeObjectURL(audioUrl);
            };
            audio.onerror = () => {
              setIsAgentSpeaking(false);
              URL.revokeObjectURL(audioUrl);
              speakBrowserFallback(text);
            };
            try {
              await audio.play();
              return;
            } catch (playErr) {
              console.warn("Audio play blocked, using speech fallback:", playErr);
              speakBrowserFallback(text);
              return;
            }
          }
        } else {
          const errData = await resp.json().catch(() => ({}));
          const errMsg = errData.detail || "Voice synthesis error";
          if (resp.status === 400 && errMsg.includes("Gemini API Key")) {
            showToast("⚠️ Google Gemini API Key required! Please enter your key in Settings tab.", "error");
          }
          // Fallback so agent never goes silent
          speakBrowserFallback(text);
          return;
        }
      } catch (err) {
        console.warn("Backend audio notice, falling back to browser speech:", err);
        speakBrowserFallback(text);
        return;
      }
    } catch (e) {
      console.warn("Speech playback notice:", e);
      speakBrowserFallback(text);
    }
  };

  // Browser Speech Recognition for Hands-Free Live Voice Call (Chrome, Safari, Edge)
  const speechRecognitionRef = useRef<any>(null);
  const speechSilenceTimerRef = useRef<any>(null);
  const speechBufferRef = useRef<string>("");
  const activeLeadRef = useRef<VoiceCallQueueItem>(DEFAULT_TEST_PROSPECT);

  const startContinuousMic = (targetLead?: VoiceCallQueueItem) => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      console.warn("Speech recognition not supported in this browser");
      return;
    }

    if (targetLead) {
      activeLeadRef.current = targetLead;
    } else if (selectedSimLead) {
      activeLeadRef.current = selectedSimLead;
    }

    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    speechBufferRef.current = "";

    try {
      const rec = new SpeechRec();
      rec.continuous = true;
      // CRITICAL: interimResults = true provides sub-100ms real-time audio transcript streaming.
      // With interimResults = false, Chrome/Safari enforces a 2.5s - 3.5s silence delay before emitting text.
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      const leadCountry = (activeLeadRef.current?.country || "bangladesh").toLowerCase();
      const leadLang = (activeLeadRef.current?.language || "bengali").toLowerCase();
      const isBn = leadLang.includes("bengal") || leadCountry.includes("bangladesh");
      rec.lang = isBn ? "bn-BD" : "en-US";

      rec.onstart = () => {
        setIsRecordingMic(true);
      };

      const dispatchSpeech = () => {
        const text = speechBufferRef.current.trim();
        speechBufferRef.current = "";
        if (!text) return;
        // Echo prevention: if agent is currently speaking, drop user buffer
        if (isAgentSpeakingRef.current || isMicMutedRef.current) return;
        handleSimTurn(text);
      };

      rec.onresult = (evt: any) => {
        // Acoustic Feedback & Echo Prevention:
        // When AI agent is currently speaking through laptop speakers, ignore mic input!
        if (isAgentSpeakingRef.current || isMicMutedRef.current) {
          speechBufferRef.current = "";
          if (speechSilenceTimerRef.current) {
            clearTimeout(speechSilenceTimerRef.current);
            speechSilenceTimerRef.current = null;
          }
          return;
        }

        let accumulated = "";
        let isFinalBatch = false;
        for (let i = evt.resultIndex; i < evt.results.length; ++i) {
          const item = evt.results[i];
          if (item && item[0]) {
            accumulated += item[0].transcript;
            if (item.isFinal) {
              isFinalBatch = true;
            }
          }
        }

        const trimmed = accumulated.trim();
        if (trimmed) {
          speechBufferRef.current = trimmed;
          if (speechSilenceTimerRef.current) {
            clearTimeout(speechSilenceTimerRef.current);
          }
          // Real-time Voice Activity Detection (VAD):
          // If browser marked a final phrase, dispatch in 200ms; otherwise, after 550ms of silence,
          // instantly send speech to Gemini Live WebSocket. Shaves 2.5+ seconds off call latency!
          const silenceDelay = isFinalBatch ? 200 : 550;
          speechSilenceTimerRef.current = setTimeout(() => {
            dispatchSpeech();
          }, silenceDelay);
        }
      };

      rec.onerror = (err: any) => {
        console.warn("[Mic] Speech recognition notice:", err.error);
        if (err.error !== "no-speech" && err.error !== "aborted") {
          setIsRecordingMic(false);
        }
      };

      rec.onend = () => {
        if (speechSilenceTimerRef.current) {
          clearTimeout(speechSilenceTimerRef.current);
          speechSilenceTimerRef.current = null;
        }
        // Hands-free continuous call: if call is still active and not muted, keep listening
        if (simActiveRef.current && !isMicMutedRef.current) {
          try {
            rec.start();
            setIsRecordingMic(true);
          } catch (e) {}
        } else {
          setIsRecordingMic(false);
        }
      };

      rec.start();
      speechRecognitionRef.current = rec;
      setIsRecordingMic(true);
    } catch (err) {
      console.warn("Mic start notice:", err);
      setIsRecordingMic(false);
    }
  };

  const stopContinuousMic = () => {
    if (speechSilenceTimerRef.current) {
      clearTimeout(speechSilenceTimerRef.current);
      speechSilenceTimerRef.current = null;
    }
    speechBufferRef.current = "";
    if (speechRecognitionRef.current) {
      try {
        speechRecognitionRef.current.stop();
      } catch (e) {}
      speechRecognitionRef.current = null;
    }
    setIsRecordingMic(false);
  };

  const toggleMicListening = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMicMutedRef.current = nextMuted;
    if (nextMuted) {
      stopContinuousMic();
      showToast("🔇 Microphone Muted", "success");
    } else {
      startContinuousMic();
      showToast("🎙️ Microphone Live — Speak Freely", "success");
    }
  };

  // Simulator Turn Handler (100% Google Gemini Live Native Voice)
  const handleSimTurn = async (userText: string) => {
    if (!userText.trim()) return;
    const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const updatedHistory = [...simHistory, { speaker: "lead" as const, text: userText, time: nowTime }];
    setSimHistory(updatedHistory);
    setSimUserInput("");
    setIsProcessingTurn(true);

    const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
    const isLiveWsActive = simWebSocketRef.current && simWebSocketRef.current.readyState === WebSocket.OPEN;

    // Direct Real-time Stream to Gemini Live Native Audio (<300ms, zero lag, zero repetition!)
    if (isLiveWsActive) {
      try {
        simWebSocketRef.current?.send(JSON.stringify({
          type: "text",
          text: userText,
        }));
      } catch (err) {
        console.warn("[SimWS] Failed to send turn over WebSocket:", err);
      }
      setIsProcessingTurn(false);
      return;
    }

    // Fallback only if WebSocket is disconnected
    try {
      const payload = {
        queue_item_id: activeLead.id.startsWith("00000000") ? undefined : activeLead.id,
        session_id: simSessionIdRef.current || `sim_session_${activeLead.id}_${Date.now()}`,
        user_speech_text: userText,
        conversation_history: updatedHistory.map((h) => ({
          speaker: h.speaker === "agent" ? "agent" : "user",
          text: h.text,
        })),
        client_name: activeLead.contact_person,
        company_name: activeLead.company_name,
        exact_problem: activeLead.exact_problem,
        language: activeLead.language || "Bengali",
        client_email: activeLead.email || "",
        phone: activeLead.phone || "",
      };

      const res = await sendVoiceDialogueTurn(payload);
      const agentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      
      setSimHistory((prev) => [
        ...prev,
        { speaker: "agent", text: res.agent_reply_text, time: agentTime },
      ]);

      playAgentResponse(res.agent_reply_text);

      if (res.meeting_booked && res.meeting_link) {
        setSimBookedLink(res.meeting_link);
        setSimBookedTime(res.meeting_time || null);
        showToast("🎉 Appointment Secured! Calendly Link Sent.", "success");
      }
      if (res.should_hangup) {
        setTimeout(() => {
          handleEndSimCall();
        }, 4000);
      }
    } catch (err: any) {
      console.error("[SimTurn] Error processing turn:", err);
      showToast(err.message || "Failed to process dialogue turn", "error");
    } finally {
      setIsProcessingTurn(false);
    }
  };

  // Start Call Simulation (100% Google Gemini AI Sales Call)
  const handleStartSimCall = async () => {
    const activeLead = selectedSimLead || DEFAULT_TEST_PROSPECT;
    if (!selectedSimLead) {
      setSelectedSimLead(activeLead);
    }
    setSimActive(true);
    simActiveRef.current = true;
    isMicMutedRef.current = false;
    setIsMuted(false);
    setSimConnecting(true);
    setSimHistory([]);
    setCallDuration(0);
    setSimBookedLink(null);
    setSimBookedTime(null);

    // Call duration timer
    if (callTimerRef.current) clearInterval(callTimerRef.current);
    callTimerRef.current = setInterval(() => {
      setCallDuration((prev) => {
        if (prev >= 300) {
          handleEndSimCall();
          return prev;
        }
        return prev + 1;
      });
    }, 1000);

    const company = kb?.company_name || "Our Enterprise";
    const persona = kb?.agent_persona_name || "Representative";
    const prospectName = activeLead.contact_person || "Sir";
    const clientCompany = activeLead.company_name || "your business";

    let rawOpening = (kb?.first_message || "").trim();
    if (!rawOpening) {
      const isBn = (activeLead.language || "bengali").toLowerCase() === "bengali";
      rawOpening = isBn
        ? `আসসালামু আলাইকুম স্যার। আমি {{agent_persona_name}} বলছি, {{my_company}} থেকে। কেমন আছেন স্যার?`
        : `Hello {{client_name}}, this is {{agent_persona_name}} from {{my_company}}. How are you today?`;
    }

    const opening = rawOpening
      .replace(/\{\{agent_persona_name\}\}/g, persona)
      .replace(/\{\{my_company\}\}/g, company)
      .replace(/\{\{client_name\}\}/g, prospectName)
      .replace(/\{\{company_name\}\}/g, clientCompany);

    // Connect to Google Gemini Live native audio streaming WebSocket with a unique session ID and dynamic prospect data
    const simSessionId = `sim_${activeLead.id || "live"}_${Date.now()}`;
    simSessionIdRef.current = simSessionId;
    simLiveAgentTextRef.current = "";

    const params = new URLSearchParams();
    if (activeLead.contact_person) params.set("name", activeLead.contact_person);
    if (activeLead.company_name) params.set("company", activeLead.company_name);
    if (activeLead.phone) params.set("phone", activeLead.phone);
    if (activeLead.email) params.set("email", activeLead.email);
    params.set("language", activeLead.language || "Bengali");
    params.set("country", activeLead.country || "Bangladesh");
    if (activeLead.id && !activeLead.id.startsWith("00000000")) params.set("queue_item_id", activeLead.id);
    const qs = params.toString() ? `?${params.toString()}` : "";
    const wsProto = typeof window !== "undefined" && window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsHost = typeof window !== "undefined"
      ? (window.location.port === "3000" ? `${window.location.hostname}:8000` : window.location.host)
      : "127.0.0.1:8000";
    const wsUrl = `${wsProto}//${wsHost}/api/v1/voice-agent/browser/stream/${simSessionId}${qs}`;

    try {
      const socket = new WebSocket(wsUrl);
      simWebSocketRef.current = socket;

      socket.onopen = () => {
        console.log("[SimWS] Connected to Gemini Live stream");
      };

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ready") {
            setSimConnecting(false);
            const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            setSimHistory([{ speaker: "agent", text: opening, time: nowTime }]);
            
            // Check prospect language & country to prevent English leak on Turn 1
            const leadLang = (activeLead.language || "bengali").toLowerCase();
            const leadCountry = (activeLead.country || "bangladesh").toLowerCase();
            const isBnLead = leadLang.includes("bengal") || leadCountry.includes("bangladesh");

            // CRITICAL: Handshake prompt MUST match prospect language and use dynamic persona from database.
            const personaName = (kb?.agent_persona_name || "").trim() || "Sales Representative";
            const handshakeText = isBnLead
              ? `[কল কানেক্ট হয়েছে। ক্লায়েন্ট কল রিসিভ করেছেন। আপনি ${personaName} হিসেবে সম্পূর্ণ খাঁটি ও মিষ্ট বাংলায় অত্যন্ত ভদ্রভাবে এই প্রথম সম্ভাষণটি মুখে বলুন: "${opening}"]`
              : `[Call answered. Deliver this opening greeting aloud now: "${opening}"]`;

            socket.send(JSON.stringify({
              type: "text",
              text: handshakeText,
            }));

            // Automatically open hands-free continuous microphone with low latency VAD
            startContinuousMic(activeLead);
            showToast(`📞 Call Connected! Microphone is LIVE — Speak naturally.`, "success");
          } else if (msg.type === "audio") {
            if (msg.data) {
              playPcmChunk(msg.data);
            }
          } else if (msg.type === "text") {
            const piece = msg.text || "";
            if (piece) {
              simLiveAgentTextRef.current += piece;
              const cleanText = simLiveAgentTextRef.current.trim();
              const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              setSimHistory((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === "agent" && (last as any).isLiveStreaming) {
                  return [
                    ...prev.slice(0, -1),
                    { speaker: "agent", text: cleanText, time: last.time, isLiveStreaming: true } as any
                  ];
                } else {
                  return [
                    ...prev,
                    { speaker: "agent", text: cleanText, time: nowTime, isLiveStreaming: true } as any
                  ];
                }
              });
            }
          } else if (msg.type === "interrupted") {
            stopPcmPlayback();
            simLiveAgentTextRef.current = "";
          } else if (msg.type === "turn_complete") {
            setIsProcessingTurn(false);
            const finalText = simLiveAgentTextRef.current.trim();
            if (finalText) {
              setSimHistory((prev) => {
                const last = prev[prev.length - 1];
                if (last && last.speaker === "agent" && (last as any).isLiveStreaming) {
                  return [
                    ...prev.slice(0, -1),
                    { speaker: "agent", text: finalText, time: last.time }
                  ];
                }
                return prev;
              });

              // Check if meeting link was dispatched
              if (/calendly|meeting|booking|বুকিং|লিংক/i.test(finalText) && /sent|পাঠিয়ে|পাঠানো|দিচ্ছি/i.test(finalText)) {
                const link = kb?.calendly_url || "https://calendly.com";
                setSimBookedLink(link);
                setSimBookedTime("Self-selected via link");
                showToast("🎉 Appointment Secured! Calendly Link Sent.", "success");
              }

              // Check if call should conclude
              if (/ভালো থাকবেন|কথা হবে|goodbye|have a (great|wonderful) day|talk to you soon/i.test(finalText)) {
                setTimeout(() => {
                  handleEndSimCall();
                }, 4000);
              }
            }
            simLiveAgentTextRef.current = "";
          }
        } catch (e) {
          console.warn("[SimWS] Error parsing message:", e);
        }
      };

      socket.onerror = (err) => {
        console.warn("[SimWS] WebSocket error, falling back to REST:", err);
        setSimConnecting(false);
        const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setSimHistory([{ speaker: "agent", text: opening, time: nowTime }]);
        playAgentResponse(opening);
        showToast(`✨ Call Connected! Speaking with AI Sales Agent (${persona}).`, "success");
      };

      socket.onclose = () => {
        console.log("[SimWS] WebSocket closed");
      };
    } catch (e) {
      console.warn("[SimWS] WebSocket launch error:", e);
      setSimConnecting(false);
      const nowTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setSimHistory([{ speaker: "agent", text: opening, time: nowTime }]);
      playAgentResponse(opening);
      showToast(`✨ Call Connected! Speaking with AI Sales Agent (${persona}).`, "success");
    }
  };

  const handleEndSimCall = async () => {
    setSimActive(false);
    simActiveRef.current = false;
    setSimConnecting(false);
    setIsAgentSpeaking(false);
    isAgentSpeakingRef.current = false;
    setIsRecordingMic(false);
    stopContinuousMic();
    stopPcmPlayback();

    if (simWebSocketRef.current) {
      try {
        if (simWebSocketRef.current.readyState === WebSocket.OPEN) {
          simWebSocketRef.current.send(JSON.stringify({ type: "hangup" }));
        }
        simWebSocketRef.current.close();
      } catch (e) {}
      simWebSocketRef.current = null;
    }

    if (simMediaStreamRef.current) {
      simMediaStreamRef.current.getTracks().forEach((t) => t.stop());
      simMediaStreamRef.current = null;
    }

    if (simProcessorRef.current) {
      try {
        simProcessorRef.current.disconnect();
      } catch (e) {}
      simProcessorRef.current = null;
    }

    stopPcmPlayback();

    if (callTimerRef.current) clearInterval(callTimerRef.current);

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
          summary: `Gemini Live call finished in ${callDuration}s. Outcome: ${simBookedLink ? "Meeting Booked" : "Completed"}`,
        });
        showToast("Call log saved successfully!", "success");
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
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 font-semibold">
                Google Gemini 2.0 Live Native Audio
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
                              onClick={() => handleDialTwilio(item)}
                              disabled={callingItemId === item.id}
                              className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-sm cursor-pointer"
                              title="Place Live Outbound Phone Call via Twilio + Google Gemini Live"
                            >
                              {callingItemId === item.id ? (
                                <RefreshCw className="w-3 h-3 animate-spin" />
                              ) : (
                                <PhoneCall className="w-3 h-3 text-cyan-200" />
                              )}
                              <span>{callingItemId === item.id ? "Calling..." : "Dial Phone"}</span>
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSimLead(item);
                                setActiveTab("simulator");
                              }}
                              className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-semibold transition flex items-center gap-1 shadow-sm"
                              title="Test in Browser Simulator"
                            >
                              <Play className="w-3 h-3" />
                              <span>Simulate</span>
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

        {/* TAB 2: Admin Studio: Script Flow & Knowledge Base (KB) */}

        {activeTab === "prompt" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Top Bar with Status & Save Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 shadow-xl">
              <div>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-5 h-5 text-emerald-400" />
                  <h2 className="text-sm font-bold text-white tracking-wide">
                    Admin Voice Studio: Master Sales Playbook & Knowledge Base
                  </h2>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Unified enterprise playbook. Google Gemini 2.0 Live reasons across all objections, services, and sales stages naturally without rigid cards.
                </p>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!kb) return;
                    setKb({
                      ...kb,
                      agent_persona_name: "",
                      company_name: "",
                      service_name: "",
                      core_offer: "",
                      calendly_url: "",
                      first_message: "",
                      system_prompt: "",
                    });
                    showToast("All fields cleared! Enter your custom details and click 'Save to Database'.", "success");
                  }}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold border border-slate-700 transition flex items-center gap-1.5 cursor-pointer"
                  title="Clear all fields to type your own custom data"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
                  <span>Clear All Fields</span>
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!kb) return;
                    setSavingKb(true);
                    try {
                      await saveVoiceKB(kb);
                      showToast("All Playbook & Knowledge Base changes saved to Database!", "success");
                    } catch (err: any) {
                      showToast("Failed to save settings: " + (err.message || ""), "error");
                    } finally {
                      setSavingKb(false);
                    }
                  }}
                  disabled={savingKb}
                  className="px-5 py-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-600/20 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {savingKb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Save to Database</span>
                </button>
              </div>
            </div>

            {/* SECTION 1: Company, Consultant Identity & Voice Profile */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              {/* Invisible credential trap to isolate browser password manager autofill */}
              <div className="sr-only opacity-0 h-0 overflow-hidden" aria-hidden="true">
                <input type="text" name="fake_username_trap" tabIndex={-1} autoComplete="username" />
                <input type="password" name="fake_password_trap" tabIndex={-1} autoComplete="current-password" />
              </div>

              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    1. Company & Senior Consultant Identity
                  </h3>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">100% Database Driven</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Company / Organization Name</label>
                  <input
                    type="text"
                    name="voice_company_name"
                    autoComplete="off"
                    value={kb?.company_name || ""}
                    onChange={(e) => kb && setKb({ ...kb, company_name: e.target.value })}
                    placeholder="Enter company name..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Senior Consultant Persona Name</label>
                  <input
                    type="text"
                    name="voice_agent_persona_name"
                    autoComplete="off"
                    value={kb?.agent_persona_name || ""}
                    onChange={(e) => kb && setKb({ ...kb, agent_persona_name: e.target.value })}
                    placeholder="Enter consultant persona name..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Gemini Live Voice Profile</label>
                  <select
                    value={kb?.gemini_voice_name || "Charon"}
                    onChange={(e) => kb && setKb({ ...kb, gemini_voice_name: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-medium"
                  >
                    <option value="Charon">🏢 Charon (Authoritative, Deep Male - Multilingual)</option>
                    <option value="Puck">⚡ Puck (Energetic, Natural Male - Multilingual)</option>
                    <option value="Fenrir">🎯 Fenrir (Crisp, Confident Male - Multilingual)</option>
                    <option value="Aoede">✨ Aoede (Warm, Engaging Female - Multilingual)</option>
                    <option value="Kore">🌸 Kore (Calm, Sophisticated Female - Multilingual)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Calendly Scheduling Link</label>
                  <input
                    type="url"
                    name="voice_calendly_url"
                    autoComplete="off"
                    value={kb?.calendly_url || ""}
                    onChange={(e) => kb && setKb({ ...kb, calendly_url: e.target.value })}
                    placeholder="https://calendly.com/your-org/demo"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* Core Offer & Services */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-800/80 text-xs">
                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Service Specialty</label>
                  <input
                    type="text"
                    name="voice_service_specialty"
                    autoComplete="off"
                    value={kb?.service_name || ""}
                    onChange={(e) => kb && setKb({ ...kb, service_name: e.target.value })}
                    placeholder="Enter services..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-semibold mb-1">Core Risk-Free Offer</label>
                  <input
                    type="text"
                    name="voice_core_risk_free_offer"
                    id="voice_agent_core_offer_field"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    value={kb?.core_offer || ""}
                    onChange={(e) => kb && setKb({ ...kb, core_offer: e.target.value })}
                    placeholder="Enter core offer..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: Opening Call Greeting (First Words) */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-indigo-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    2. Opening Call Greeting (First Words Spoken by Agent)
                  </h3>
                </div>
                <span className="text-[10px] text-indigo-400 font-mono">Immediate Spoken Hook</span>
              </div>

              <textarea
                rows={2}
                value={kb?.first_message || ""}
                onChange={(e) => kb && setKb({ ...kb, first_message: e.target.value })}
                placeholder="Type your custom opening greeting here (e.g. আসসালামু আলাইকুম স্যার... or Hello {{client_name}})..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-slate-100 text-xs focus:outline-none focus:border-indigo-500 leading-relaxed font-sans"
              />

              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <span className="text-[10px] text-slate-500">Insert variable:</span>
                {["{{agent_persona_name}}", "{{my_company}}", "{{client_name}}", "{{company_name}}"].map((tag) => (
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

            {/* SECTION 3: Master Sales Playbook & Knowledge Document */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    3. Master Sales Playbook & Enterprise Knowledge Base (Unified Paragraphs)
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-purple-300 font-mono">
                    {((kb?.system_prompt || "").split(/\s+/).filter(Boolean).length)} Words
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Write your complete sales script, company knowledge, objection handling rules, and conversation flow here as a natural structured document. Google Gemini 2.0 Live understands this holistically—like an experienced, consultative human salesperson—without being trapped in rigid card checkboxes.
              </p>

              {/* Dynamic Tag Insertion Toolbar */}
              <div className="flex flex-wrap items-center gap-1.5 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80">
                <span className="text-[10px] text-slate-400 font-medium">Insert dynamic variable tag:</span>
                {[
                  "{{agent_persona_name}}",
                  "{{my_company}}",
                  "{{client_name}}",
                  "{{company_name}}",
                  "{{service_name}}",
                  "{{core_offer}}",
                  "{{calendly_url}}",
                  "{{exact_problem}}",
                ].map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => {
                      if (!kb) return;
                      setKb({ ...kb, system_prompt: (kb.system_prompt || "") + " " + tag });
                    }}
                    className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-purple-500/60 text-[10px] text-purple-300 font-mono transition"
                  >
                    + {tag}
                  </button>
                ))}
              </div>

              {/* Playbook Editor Textarea */}
              <div className="relative">
                <textarea
                  rows={18}
                  value={kb?.system_prompt || ""}
                  onChange={(e) => kb && setKb({ ...kb, system_prompt: e.target.value })}
                  placeholder="Enter your comprehensive B2B Sales Playbook..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-100 text-xs focus:outline-none focus:border-purple-500 font-mono leading-relaxed"
                />
              </div>

              {/* Quick Guidance Box */}
              <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-800/30 text-[11px] text-slate-300 space-y-1.5">
                <div className="font-bold text-purple-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Key Senior B2B Consultative Principles Included:</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-slate-400 pl-1 text-[10px]">
                  <li><strong className="text-slate-200">Existing Software Handling:</strong> Never push or force a demo if the client already has a vendor. Compliment them warmly, and ask consultatively about what solution they use and if they face any limitations or missing features.</li>
                  <li><strong className="text-slate-200">Respect Busy Clients:</strong> If the client says "ব্যস্ত আছি / পরে ফোন দিন", immediately acknowledge politely and ask when it would be convenient to follow up without pitching.</li>
                  <li><strong className="text-slate-200">Human Speech Rhythm:</strong> Punctuate answers with natural pauses (commas, dashes) and keep each reply strictly under 20 words for ultra-fast, human-like voice synthesis.</li>
                  <li><strong className="text-slate-200">Flexible Scheduling:</strong> Send your Calendly link via WhatsApp or Email so prospects can choose their own date and time freely.</li>
                </ul>
              </div>
            </div>

            {/* SECTION 4: Telephony & Voice Engine Infrastructure */}
            <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-cyan-400" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                    4. Telephony & AI Voice Engine Infrastructure
                  </h3>
                </div>
                <span className="text-[10px] text-cyan-400 font-mono">Twilio & Google Gemini Live</span>
              </div>

              <div className="space-y-4 text-xs">

                {/* Google Gemini 2.0 Live & Twilio Voice Calling Architecture */}
                <div className="p-5 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-950 to-slate-900 border border-cyan-800/40 space-y-4 shadow-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                      <h4 className="font-bold text-xs text-cyan-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                        Google Gemini 2.0 Flash Live & Twilio Voice Engine
                      </h4>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Speech-to-Text (STT), multilingual dialogue reasoning in <strong className="text-cyan-300">Bangla & English</strong>, and real-time audio generation run on Google Gemini 2.0 Flash Live. Real telephone calls are routed via Twilio.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 pt-1">
                    {/* Gemini API Key */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 font-semibold text-[11px]">
                          Google Gemini API Key
                        </label>
                        {kb?.gemini_api_key_configured ? (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            ✓ Verified
                          </span>
                        ) : (
                          <span className="text-[10px] text-amber-400 font-semibold">● Not Configured</span>
                        )}
                      </div>
                      <div className="flex gap-1.5">
                        <input
                          type="password"
                          name="gemini_api_key_field"
                          autoComplete="new-password"
                          placeholder={kb?.gemini_api_key_configured ? "••••••••••••••••••••••••" : "AIzaSy... (Google AI Studio Key)"}
                          value={kb?.gemini_api_key || ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (kb) setKb({ ...kb, gemini_api_key: val });
                            if (val.length > 25) refreshGeminiModels(val);
                          }}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={() => refreshGeminiModels(kb?.gemini_api_key)}
                          title="Query live models from Google API"
                          className="px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center justify-center transition-colors"
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? "animate-spin text-cyan-400" : ""}`} />
                        </button>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        From <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-cyan-400 underline">aistudio.google.com</a>
                      </p>
                    </div>

                    {/* Dynamic Gemini Model Selection */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <label className="block text-slate-300 font-semibold text-[11px]">
                          Active Gemini Model
                        </label>
                        {isModelsFromGoogle ? (
                          <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                            ✓ Live from Google
                          </span>
                        ) : (
                          <span className="text-[10px] text-slate-400">Presets</span>
                        )}
                      </div>
                      <select
                        value={kb?.gemini_model_id || "gemini-3.8-flash"}
                        onChange={(e) => kb && setKb({ ...kb, gemini_model_id: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-medium"
                      >
                        {dynamicGeminiModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-500">
                        {dynamicGeminiModels.length} models detected. Auto-supports future Google models.
                      </p>
                    </div>

                    {/* Gemini Voice Persona */}
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold text-[11px]">
                        Gemini Live Voice Persona
                      </label>
                      <select
                        value={kb?.gemini_voice_name || "Charon"}
                        onChange={(e) => kb && setKb({ ...kb, gemini_voice_name: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-cyan-500"
                      >
                        <option value="Charon">🏢 Charon (Authoritative, Deep Male - Multilingual)</option>
                        <option value="Puck">⚡ Puck (Energetic, Natural Male - Multilingual)</option>
                        <option value="Fenrir">🎯 Fenrir (Crisp, Confident Male - Multilingual)</option>
                      </select>
                      <p className="text-[10px] text-slate-500">
                        Speaks fluently in Bengali, English, and mixed Banglish automatically.
                      </p>
                    </div>

                    {/* Twilio Account SID */}
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold text-[11px]">
                        Twilio Account SID
                      </label>
                      <input
                        type="text"
                        name="twilio_sid_field"
                        autoComplete="off"
                        placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={kb?.twilio_account_sid || ""}
                        onChange={(e) => kb && setKb({ ...kb, twilio_account_sid: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    {/* Twilio Auth Token */}
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold text-[11px]">
                        Twilio Auth Token
                      </label>
                      <input
                        type="password"
                        name="twilio_auth_token_field"
                        autoComplete="new-password"
                        placeholder="Auth Token"
                        value={kb?.twilio_auth_token || ""}
                        onChange={(e) => kb && setKb({ ...kb, twilio_auth_token: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    {/* Twilio Caller Phone Number */}
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold text-[11px]">
                        Twilio Caller Phone Number
                      </label>
                      <input
                        type="text"
                        placeholder="+1234567890 (E.164)"
                        value={kb?.twilio_from_phone || ""}
                        onChange={(e) => kb && setKb({ ...kb, twilio_from_phone: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    {/* Twilio Webhook Base URL */}
                    <div className="space-y-1">
                      <label className="block text-slate-300 font-semibold text-[11px]">
                        Public Webhook Base URL (ngrok or Domain)
                      </label>
                      <input
                        type="text"
                        placeholder="https://your-domain.com or https://xxxx.ngrok-free.app"
                        value={kb?.twilio_webhook_base_url || ""}
                        onChange={(e) => kb && setKb({ ...kb, twilio_webhook_base_url: e.target.value })}
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-slate-100 font-mono text-xs focus:outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between border-t border-cyan-900/40">
                    <span className="text-[10px] text-slate-400">
                      Twilio telephone stream connects directly to Google Gemini 2.0 Flash in real-time.
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!kb) return;
                        setSavingKb(true);
                        try {
                          await saveVoiceKB(kb);
                          showToast("Gemini Live & Twilio Voice Engine settings saved!", "success");
                        } catch (err: any) {
                          showToast(err.message || "Failed to save settings", "error");
                        } finally {
                          setSavingKb(false);
                        }
                      }}
                      disabled={savingKb}
                      className="px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold rounded-lg text-xs transition flex items-center gap-1.5 shadow-md shadow-cyan-600/20 cursor-pointer disabled:opacity-50"
                    >
                      {savingKb ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save Voice Engine Settings</span>
                    </button>
                  </div>
                </div>

                {/* Google Gemini Live Studio Controls (No Hardcode Speech & Live Sliders) */}
                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Sliders className="w-4 h-4 text-cyan-400" />
                      <h4 className="font-bold text-xs text-white uppercase tracking-wider">
                        Google Gemini Live Studio Controls (Conversational Speech & Sliders)
                      </h4>
                    </div>
                    <span className="text-[10px] text-cyan-400 font-mono">100% Google Gemini Live</span>
                  </div>

                  {/* Interruptible Speech Toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-slate-900 border border-slate-800">
                    <div>
                      <span className="text-xs font-bold text-slate-200">Natural Conversation Interruption</span>
                      <p className="text-[10px] text-slate-400">When client speaks while agent is speaking, agent stops immediately to listen.</p>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer bg-slate-950 border border-slate-700 px-3 py-1.5 rounded-lg hover:border-slate-600 transition">
                      <span className="text-[11px] text-slate-300 font-semibold">Interruptible Speech:</span>
                      <input
                        type="checkbox"
                        checked={kb?.interruptible !== false}
                        onChange={(e) => kb && setKb({ ...kb, interruptible: e.target.checked })}
                        className="rounded text-indigo-500 bg-slate-900 border-slate-700 focus:ring-0 cursor-pointer"
                      />
                      <span className={`text-[11px] font-bold ${kb?.interruptible !== false ? "text-emerald-400" : "text-slate-500"}`}>
                        {kb?.interruptible !== false ? "ON" : "OFF"}
                      </span>
                    </label>
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
                          name="calendly_api_key_field"
                          autoComplete="new-password"
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

                  {/* 5. Meta WhatsApp Business Cloud API Gateway */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-900 border border-emerald-800/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-emerald-400" />
                        <h5 className="font-bold text-xs text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span>WhatsApp Business Cloud API Gateway</span>
                        </h5>
                      </div>
                      {kb?.whatsapp_phone_number_id && (kb?.whatsapp_access_token || kb?.whatsapp_configured) ? (
                        <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Live & Connected
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold border border-amber-500/30 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> Setup Required
                        </span>
                      )}
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Connect your Meta WhatsApp Cloud API credentials to automatically dispatch post-call discovery booking links and reminders directly to your clients' phones.
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex items-center justify-between">
                          <span>WhatsApp Phone Number ID</span>
                          <a
                            href="https://developers.facebook.com/apps"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 font-normal"
                          >
                            Meta Developer Portal <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </label>
                        <input
                          type="text"
                          name="wa_phone_id_field"
                          autoComplete="off"
                          value={kb?.whatsapp_phone_number_id || ""}
                          onChange={(e) => kb && setKb({ ...kb, whatsapp_phone_number_id: e.target.value })}
                          placeholder="e.g. 109283746512345"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                        />
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Found in WhatsApp &gt; API Setup &gt; Phone number ID
                        </span>
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px] flex items-center justify-between">
                          <span>Meta System User Access Token</span>
                          <a
                            href="https://business.facebook.com/settings/system-users"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-emerald-400 hover:underline flex items-center gap-0.5 font-normal"
                          >
                            Business Settings <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </label>
                        <div className="relative">
                          <input
                            type={showWaToken ? "text" : "password"}
                            name="wa_access_token_field"
                            autoComplete="new-password"
                            value={kb?.whatsapp_access_token || ""}
                            onChange={(e) => kb && setKb({ ...kb, whatsapp_access_token: e.target.value })}
                            placeholder={kb?.whatsapp_configured ? "•••••••••••••••••••• (Leave blank to keep current)" : "Permanent token with whatsapp_business_messaging"}
                            className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 pr-9 text-slate-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() => setShowWaToken(!showWaToken)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 text-xs"
                          >
                            {showWaToken ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <span className="text-[10px] text-slate-500 mt-0.5 block">
                          Generate from System Users with whatsapp_business_messaging permission
                        </span>
                      </div>
                    </div>

                    {/* Live Test WhatsApp Delivery Box */}
                    <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-2">
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          value={testWaPhone}
                          onChange={(e) => setTestWaPhone(e.target.value)}
                          placeholder="Test phone (e.g. 01712643138 or +88017...)"
                          className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleTestWhatsApp}
                        disabled={testWaLoading}
                        className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                      >
                        {testWaLoading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Dispatching...</span>
                          </>
                        ) : (
                          <>
                            <Send className="w-3.5 h-3.5" />
                            <span>Send Live Test WhatsApp</span>
                          </>
                        )}
                      </button>
                    </div>

                    {testWaFeedback && (
                      <div
                        className={`p-2 rounded-lg text-xs font-mono ${
                          testWaFeedback.success
                            ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60"
                            : "bg-rose-950/60 text-rose-300 border border-rose-800/60"
                        }`}
                      >
                        {testWaFeedback.msg}
                      </div>
                    )}
                  </div>

                  {/* 6. Post-Call Instant Delivery Templates (WhatsApp & Email) */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-purple-950/40 via-slate-950 to-slate-900 border border-purple-800/40 space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Share2 className="w-4 h-4 text-purple-400" />
                        <h5 className="font-bold text-xs text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                          <span>Post-Call Instant Delivery Templates (WhatsApp & Email)</span>
                        </h5>
                      </div>
                      <span className="px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/30">
                        100% Dynamic Admin Control
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      When a call concludes with an agreed demo or interested lead, the system automatically renders and dispatches these exact personalized templates to the client's verified WhatsApp and email.
                    </p>

                    {/* WhatsApp Template */}
                    <div className="space-y-1.5">
                      <label className="block text-slate-300 font-semibold text-[11px] flex items-center justify-between">
                        <span>Post-Call WhatsApp Message Template</span>
                        <span className="text-[10px] text-purple-400 font-mono">Dispatched instantly to verified WhatsApp</span>
                      </label>
                      <textarea
                        rows={4}
                        value={
                          kb?.post_call_whatsapp_template ??
                          "Hello {{client_name}},\n\nThank you for taking our call today regarding custom software and digital automation for {{company_name}}.\n\nAs discussed, here is the direct link to pick a convenient 10-minute slot for our discovery demo:\n👉 {{calendly_prefilled_url}}\n\n(Your details are already pre-filled—just choose a time that fits your schedule).\n\nIf you have any questions in the meantime, feel free to reply directly to this message.\n\nBest regards,\n{{agent_persona_name}} | {{my_company}}"
                        }
                        onChange={(e) => kb && setKb({ ...kb, post_call_whatsapp_template: e.target.value })}
                        placeholder="Enter your custom post-call WhatsApp message template..."
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                        <span className="text-[10px] text-slate-500">Insert tag:</span>
                        {["{{client_name}}", "{{company_name}}", "{{calendly_prefilled_url}}", "{{agent_persona_name}}", "{{my_company}}"].map((tag) => (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => {
                              if (!kb) return;
                              setKb({ ...kb, post_call_whatsapp_template: (kb.post_call_whatsapp_template || "") + " " + tag });
                            }}
                            className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-purple-500/50 text-[10px] text-purple-300 font-mono transition"
                          >
                            + {tag}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Email Subject & Body Template */}
                    <div className="space-y-3 pt-2 border-t border-slate-800/80">
                      {/* Active Admin SMTP Sender Telemetry */}
                      {kb?.active_smtp_sender ? (
                        <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/50 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px]">
                          <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Connected Admin SMTP Outbox: <strong>{kb.active_smtp_sender}</strong> {kb.active_smtp_name ? `(${kb.active_smtp_name})` : ""}</span>
                          </span>
                          <span className="text-[10px] text-emerald-400/90 font-mono">
                            Host: {kb.active_smtp_host || "Active"} | Total Inboxes: {kb.total_smtp_inboxes || 1}
                          </span>
                        </div>
                      ) : (
                        <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]">
                          <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                            <AlertCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>No active Admin SMTP inboxes detected — Operating in Safe Simulated Mode</span>
                          </span>
                          <Link href="/admin" className="text-[10px] text-purple-400 hover:underline">
                            Admin SMTP Hub &rarr;
                          </Link>
                        </div>
                      )}

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          Post-Call Email Subject Line
                        </label>
                        <input
                          type="text"
                          value={kb?.post_call_email_subject ?? "Discovery Session: {{my_company}} & {{company_name}}"}
                          onChange={(e) => kb && setKb({ ...kb, post_call_email_subject: e.target.value })}
                          placeholder="e.g. Discovery Session: {{my_company}} & {{company_name}}"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>

                      <div>
                        <label className="block text-slate-300 font-semibold mb-1 text-[11px]">
                          Post-Call Email Body (HTML & Plain Text)
                        </label>
                        <textarea
                          rows={8}
                          value={
                            kb?.post_call_email_template ??
                            "Dear {{client_name}},\n\nThank you for speaking with our team today regarding technology solutions and workflow automation for {{company_name}}.\n\nAs discussed on our call, we would love to show you a brief 10-minute preview tailored to your operational needs.\n\nPlease select a convenient date and time on our calendar:\n👉 {{calendly_prefilled_url}}\n\nWhat we will cover in 10 minutes:\n• Live workflow architecture tailored to {{company_name}}\n• Relevant software modules & integration walkthrough\n• Operational ROI & zero-friction deployment roadmap\n\nYour contact details are already attached to the calendar link, so booking takes less than 30 seconds.\n\nIf you have any questions beforehand or need to reschedule, simply reply directly to this email or reach us on WhatsApp.\n\nWarm regards,\n{{agent_persona_name}} & The {{my_company}} Team"
                          }
                          onChange={(e) => kb && setKb({ ...kb, post_call_email_template: e.target.value })}
                          placeholder="Enter your custom post-call email body template..."
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-slate-100 text-xs focus:outline-none focus:border-purple-500 leading-relaxed font-sans"
                        />
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <span className="text-[10px] text-slate-500">Insert tag:</span>
                          {["{{client_name}}", "{{company_name}}", "{{calendly_prefilled_url}}", "{{agent_persona_name}}", "{{my_company}}"].map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              onClick={() => {
                                if (!kb) return;
                                setKb({ ...kb, post_call_email_template: (kb.post_call_email_template || "") + " " + tag });
                              }}
                              className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 hover:border-purple-500/50 text-[10px] text-purple-300 font-mono transition"
                            >
                              + {tag}
                            </button>
                          ))}
                        </div>

                        {/* Live Test Email Delivery Box */}
                        <div className="pt-3 border-t border-slate-800/80 flex flex-col gap-2">
                          <div className="flex flex-col sm:flex-row items-center gap-2">
                            <div className="flex-1 w-full">
                              <input
                                type="email"
                                value={testEmailTo}
                                onChange={(e) => setTestEmailTo(e.target.value)}
                                placeholder="Recipient email (e.g. yourname@gmail.com)"
                                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-purple-500 font-mono"
                              />
                            </div>
                            <div className="w-full sm:w-48">
                              <input
                                type="text"
                                value={testEmailCompany}
                                onChange={(e) => setTestEmailCompany(e.target.value)}
                                placeholder="Prospect Company (optional)"
                                className="w-full bg-slate-900/90 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-100 text-xs focus:outline-none focus:border-purple-500"
                              />
                            </div>
                            <button
                              type="button"
                              onClick={handleTestEmail}
                              disabled={testEmailLoading}
                              className="w-full sm:w-auto px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs transition flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                            >
                              {testEmailLoading ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  <span>Dispatching...</span>
                                </>
                              ) : (
                                <>
                                  <Mail className="w-3.5 h-3.5" />
                                  <span>Send Live Test Email</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {testEmailFeedback && (
                          <div
                            className={`p-2 rounded-lg text-xs font-mono ${
                              testEmailFeedback.success
                                ? "bg-purple-950/60 text-purple-300 border border-purple-800/60"
                                : "bg-rose-950/60 text-rose-300 border border-rose-800/60"
                            }`}
                          >
                            {testEmailFeedback.msg}
                          </div>
                        )}
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

          </div>
        )}

        {/* TAB 4: Live Call Simulator (Google Gemini Live Multimodal Testing Studio) */}
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
                        <button
                          type="button"
                          onClick={() => {
                            const cur = (activeLead.language || "Bengali").toLowerCase();
                            const nextL = cur.includes("bengali") ? "English" : "Bengali";
                            setSelectedSimLead((prev) => ({
                              ...(prev || DEFAULT_TEST_PROSPECT),
                              language: nextL,
                            }));
                          }}
                          className="text-cyan-400 hover:text-cyan-300 font-semibold cursor-pointer underline decoration-cyan-500/40"
                          title="Click to switch language between Bengali & English"
                        >
                          Language: {activeLead.language || "Bengali"} ⇄
                        </button>
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
                      <option value={DEFAULT_TEST_PROSPECT.id}>⭐ Practice Simulator Lead ({DEFAULT_TEST_PROSPECT.contact_person})</option>
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

              {/* 100% Pure Voice Calling Screen (Hands-Free Phone HUD - Zero Chatbot Feeling) */}
              {simActive ? (
                <div className="p-8 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-slate-800 shadow-2xl flex flex-col items-center justify-center relative overflow-hidden space-y-6">
                  {/* Glowing Ambient Acoustic Background Light */}
                  <div
                    className={`absolute w-72 h-72 rounded-full blur-3xl transition-all duration-700 opacity-40 pointer-events-none ${
                      isAgentSpeaking
                        ? "bg-cyan-500/50 scale-125"
                        : isRecordingMic && !isMuted
                        ? "bg-emerald-500/50 scale-125"
                        : "bg-indigo-500/20"
                    }`}
                  />

                  {/* Target Lead & Calling Header */}
                  <div className="text-center z-10 space-y-1">
                    <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 text-[11px] font-mono text-emerald-400 shadow-inner">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      <span>LIVE CALL • {Math.floor(callDuration / 60)}:{(callDuration % 60).toString().padStart(2, "0")}</span>
                    </div>
                    <h3 className="text-2xl font-bold text-white tracking-tight pt-1">
                      {activeLead.contact_person || "Decision Maker"}
                    </h3>
                    <p className="text-xs text-slate-400 font-medium">
                      {activeLead.company_name} • {activeLead.phone || "Direct Voice Line"}
                    </p>
                  </div>

                  {/* High-Fidelity Animated Acoustic Calling Orb */}
                  <div className="relative z-10 my-2 flex items-center justify-center">
                    <div
                      className={`w-36 h-36 rounded-full flex items-center justify-center transition-all duration-500 ${
                        isAgentSpeaking
                          ? "ring-8 ring-cyan-500/30 shadow-2xl shadow-cyan-500/50 scale-110"
                          : isRecordingMic && !isMuted
                          ? "ring-8 ring-emerald-500/30 shadow-2xl shadow-emerald-500/50 scale-110"
                          : isMuted
                          ? "ring-4 ring-rose-500/20 shadow-none"
                          : "ring-2 ring-slate-800"
                      }`}
                    >
                      <div
                        className={`w-28 h-28 rounded-full flex flex-col items-center justify-center transition-all duration-500 shadow-inner ${
                          isAgentSpeaking
                            ? "bg-gradient-to-tr from-cyan-600 via-sky-500 to-indigo-600 animate-pulse"
                            : isRecordingMic && !isMuted
                            ? "bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-600 animate-pulse"
                            : isMuted
                            ? "bg-slate-900 border border-rose-800/60"
                            : "bg-gradient-to-tr from-slate-800 to-slate-900 border border-slate-700"
                        }`}
                      >
                        {isAgentSpeaking ? (
                          <Volume2 className="w-12 h-12 text-white animate-pulse" />
                        ) : isMuted ? (
                          <MicOff className="w-12 h-12 text-rose-400" />
                        ) : (
                          <Mic className="w-12 h-12 text-emerald-300 animate-pulse" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Realtime Call Voice Status */}
                  <div className="z-10 text-center">
                    <div className="text-xs font-semibold tracking-wide">
                      {isAgentSpeaking ? (
                        <span className="text-cyan-300 flex items-center justify-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
                          <span>AI Agent Speaking ({kb?.agent_persona_name || "Karim"} - Gemini Live Voice)...</span>
                        </span>
                      ) : isMuted ? (
                        <span className="text-rose-400 flex items-center justify-center gap-1.5">
                          <MicOff className="w-3.5 h-3.5" />
                          <span>Microphone is Muted</span>
                        </span>
                      ) : isRecordingMic ? (
                        <span className="text-emerald-300 flex items-center justify-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                          <span>🎙️ Microphone Live — Speak naturally with your voice</span>
                        </span>
                      ) : isProcessingTurn ? (
                        <span className="text-amber-300 flex items-center justify-center gap-1.5">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                          <span>AI Processing Voice...</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">Call Connected • Connecting Voice...</span>
                      )}
                    </div>
                  </div>

                  {/* Smartphone In-Call Action Bar (Clean Phone Controls) */}
                  <div className="flex items-center justify-center gap-6 z-10 pt-2">
                    {/* Mute / Unmute Button */}
                    <button
                      type="button"
                      onClick={toggleMicListening}
                      className={`w-14 h-14 rounded-full flex flex-col items-center justify-center transition-all shadow-lg cursor-pointer ${
                        isMuted
                          ? "bg-rose-950/80 border-2 border-rose-500 text-rose-400 hover:bg-rose-900/80"
                          : "bg-slate-900 border-2 border-emerald-500/60 text-emerald-400 hover:bg-slate-800 hover:border-emerald-400"
                      }`}
                      title={isMuted ? "Unmute Microphone" : "Mute Microphone"}
                    >
                      {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                    </button>

                    {/* Red Phone Hang Up Button */}
                    <button
                      type="button"
                      onClick={handleEndSimCall}
                      className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 hover:scale-105 transition-all cursor-pointer"
                      title="End Call / Hang Up"
                    >
                      <PhoneOff className="w-7 h-7" />
                    </button>

                    {/* Language Switcher Button */}
                    <button
                      type="button"
                      onClick={() => {
                        const cur = (activeLead.language || "Bengali").toLowerCase();
                        const nextL = cur.includes("bengali") ? "English" : "Bengali";
                        setSelectedSimLead((prev) => ({
                          ...(prev || DEFAULT_TEST_PROSPECT),
                          language: nextL,
                        }));
                      }}
                      className="w-14 h-14 rounded-full bg-slate-900 border border-slate-700 hover:border-cyan-500 text-cyan-400 flex flex-col items-center justify-center transition-all cursor-pointer shadow-lg hover:bg-slate-800"
                      title="Toggle Language"
                    >
                      <span className="text-xs font-bold font-mono">
                        {(activeLead.language || "Bengali").toLowerCase().includes("bengali") ? "বাংলা" : "ENG"}
                      </span>
                    </button>
                  </div>

                  {/* Collapsible Live Transcript Toggle (Hidden by default, zero clutter) */}
                  <div className="w-full z-10 pt-2 border-t border-slate-800/80">
                    <button
                      type="button"
                      onClick={() => setShowTranscript((prev) => !prev)}
                      className="w-full py-1 text-[11px] text-slate-500 hover:text-slate-300 font-medium flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <span>{showTranscript ? "Hide Live Transcript" : "Show Technical Transcript"}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
                    </button>

                    {showTranscript && (
                      <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 max-h-48 overflow-y-auto text-xs">
                        {simHistory.length === 0 ? (
                          <div className="text-slate-500 text-center py-2 text-[11px]">No speech turns logged yet...</div>
                        ) : (
                          simHistory.map((h, i) => (
                            <div key={i} className={`flex flex-col ${h.speaker === "agent" ? "items-start" : "items-end"}`}>
                              <span className="text-[10px] text-slate-500 font-mono mb-0.5">
                                {h.speaker === "agent" ? `🤖 ${kb?.agent_persona_name || "Agent"}` : "👤 You"} • {h.time}
                              </span>
                              <div
                                className={`px-3 py-1.5 rounded-xl max-w-[85%] ${
                                  h.speaker === "agent"
                                    ? "bg-slate-900 border border-cyan-500/30 text-slate-200"
                                    : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-100"
                                }`}
                              >
                                {h.text}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Idle Call Screen */
                simHistory.length > 0 && (
                  <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                      <span className="text-rose-400 font-bold">Previous Call Ended</span>
                      <span className="text-slate-500">•</span>
                      <span className="text-slate-400 font-mono">Duration: {callDuration}s</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowTranscript((prev) => !prev)}
                      className="text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer"
                    >
                      <span>{showTranscript ? "Hide Transcript" : "View Previous Transcript"}</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showTranscript ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                )
              )}

              {/* Collapsed Transcript when call is ended */}
              {!simActive && showTranscript && simHistory.length > 0 && (
                <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2 max-h-56 overflow-y-auto text-xs">
                  {simHistory.map((h, i) => (
                    <div key={i} className={`flex flex-col ${h.speaker === "agent" ? "items-start" : "items-end"}`}>
                      <span className="text-[10px] text-slate-500 font-mono mb-0.5">
                        {h.speaker === "agent" ? `🤖 ${kb?.agent_persona_name || "Agent"}` : "👤 You"} • {h.time}
                      </span>
                      <div
                        className={`px-3 py-1.5 rounded-xl max-w-[85%] ${
                          h.speaker === "agent"
                            ? "bg-slate-900 border border-cyan-500/30 text-slate-200"
                            : "bg-emerald-950/80 border border-emerald-500/40 text-emerald-100"
                        }`}
                      >
                        {h.text}
                      </div>
                    </div>
                  ))}
                </div>
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
              onSubmit={handleSaveLead}
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
                  disabled={isAddingLead}
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-lg disabled:opacity-50 hover:bg-slate-700 transition"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isAddingLead}
                  onClick={() => handleSaveLead()}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold transition flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950"
                >
                  {isAddingLead && <Loader2 className="w-4 h-4 animate-spin" />}
                  {isAddingLead ? "Saving Lead..." : "Save Lead"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
