import { API_BASE, getStoredToken } from "./common";

export interface VoiceKnowledgeBase {
  id?: string;
  name: string;
  company_name: string;
  agent_persona_name: string;
  service_name: string;
  service_description: string;
  core_offer: string;
  first_message: string;
  system_prompt: string;
  meeting_platform: string;
  office_hours_start: string;
  office_hours_end: string;
  is_active: boolean;
  objections_json: Array<{ trigger: string; counter: string }>;
  voice_provider?: string;
  elevenlabs_api_key?: string;
  elevenlabs_api_key_configured?: boolean;
  elevenlabs_voice_id?: string;
  elevenlabs_model_id?: string;
  cloned_voice_id?: string;
  cloned_voice_name?: string;
  cloned_voice_sample_url?: string;
  auto_call_enabled?: boolean;
  max_daily_calls?: number;
  country_language_map?: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

export interface VoiceCallQueueItem {
  id: string;
  lead_id?: string;
  contact_person: string;
  contact_title?: string;
  company_name: string;
  phone: string;
  country?: string;
  language?: string;
  exact_problem: string;
  status: "READY" | "IN_PROGRESS" | "MEETING_BOOKED" | "CALL_DONE" | "FAILED" | "INTERESTED" | string;
  selected_for_call: boolean;
  call_attempts?: number;
  meeting_link?: string;
  meeting_time?: string;
  last_called_at?: string;
  notes?: string;
  created_at?: string;
}

export interface VoiceCallLog {
  id: string;
  queue_item_id?: string;
  phone: string;
  company_name: string;
  contact_person: string;
  call_duration_seconds: number;
  language_used?: string;
  recording_url?: string;
  transcript_json: Array<{ speaker: string; text: string; timestamp_ms?: number }>;
  sentiment: string;
  meeting_booked: boolean;
  meeting_link?: string;
  summary?: string;
  created_at?: string;
}

export async function fetchVoiceKB(): Promise<VoiceKnowledgeBase> {
  const res = await fetch(`${API_BASE}/voice-agent/kb`);
  if (!res.ok) throw new Error("Failed to fetch Voice Agent KB");
  return res.json();
}

export async function saveVoiceKB(payload: Partial<VoiceKnowledgeBase>): Promise<VoiceKnowledgeBase> {
  const res = await fetch(`${API_BASE}/voice-agent/kb`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save Voice Agent KB");
  return res.json();
}

export async function fetchCallQueue(): Promise<VoiceCallQueueItem[]> {
  try {
    const res = await fetch(`${API_BASE}/voice-agent/queue`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn("fetchCallQueue error:", err);
    return [];
  }
}

export async function addLeadToQueue(payload: Partial<VoiceCallQueueItem>): Promise<VoiceCallQueueItem> {
  const res = await fetch(`${API_BASE}/voice-agent/queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to add lead to queue");
  return res.json();
}

export async function updateQueueItem(itemId: string, payload: Partial<VoiceCallQueueItem>): Promise<VoiceCallQueueItem> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update queue item");
  return res.json();
}

export async function deleteQueueItem(itemId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete queue item");
  return res.json();
}

export async function batchQueueAction(action: "select_all" | "deselect_all" | "sync_from_leads"): Promise<any> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
  if (!res.ok) throw new Error("Failed to execute batch queue action");
  return res.json();
}

export async function sendVoiceDialogueTurn(payload: {
  queue_item_id?: string;
  user_speech_text: string;
  conversation_history?: Array<{ speaker: string; text: string }>;
  client_name?: string;
  company_name?: string;
  exact_problem?: string;
  language?: string;
}): Promise<{
  agent_reply_text: string;
  meeting_booked: boolean;
  meeting_link?: string;
  meeting_time?: string;
  detected_intent: string;
  language?: string;
  audio_base64?: string;
}> {
  const res = await fetch(`${API_BASE}/voice-agent/dialogue-turn`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to process voice dialogue turn");
  return res.json();
}

export async function completeCallAndRecord(
  itemId: string,
  payload: {
    meeting_booked: boolean;
    meeting_link?: string;
    meeting_time?: string;
    transcript: Array<{ speaker: string; text: string }>;
    duration_seconds?: number;
    sentiment?: string;
    summary?: string;
  }
): Promise<any> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}/call-complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to complete call and record outcome");
  return res.json();
}

export async function fetchCallLogs(): Promise<VoiceCallLog[]> {
  try {
    const res = await fetch(`${API_BASE}/voice-agent/logs`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn("fetchCallLogs error:", err);
    return [];
  }
}

export async function checkOfficeHours(): Promise<{
  is_within_hours: boolean;
  message: string;
  office_hours_start: string;
  office_hours_end: string;
}> {
  const res = await fetch(`${API_BASE}/voice-agent/office-hours`);
  if (!res.ok) throw new Error("Failed to check office hours");
  return res.json();
}

export async function syncLeadsFromCard1(): Promise<{ success: boolean; synced_count: number; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/sync-card1-leads`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to sync leads from Card 1");
  return res.json();
}

export async function cloneUserVoice(voiceName: string, audioBlobOrFile: Blob | File): Promise<{
  success: boolean;
  voice_id: string;
  voice_name: string;
  message: string;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("voice_name", voiceName);
  formData.append("audio_file", audioBlobOrFile, "voice_sample.webm");

  const res = await fetch(`${API_BASE}/voice-agent/clone-voice`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Voice cloning failed");
  }
  return res.json();
}

export async function fetchAvailableVoices(): Promise<Array<{
  voice_id: string;
  name: string;
  category: string;
  labels: Record<string, any>;
  preview_url?: string;
}>> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/voices`, { headers, cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function synthesizeTTSAudio(text: string, voiceId?: string): Promise<Blob> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const formData = new FormData();
  formData.append("text", text);
  if (voiceId) formData.append("voice_id", voiceId);

  const res = await fetch(`${API_BASE}/voice-agent/tts`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!res.ok) throw new Error("TTS synthesis failed");
  return res.blob();
}
