import { API_BASE, getStoredToken } from "./common";
export { getStoredToken };

export interface ScriptQuestionItem {
  step: number;
  purpose: string;
  question: string;
  active: boolean;
}

export interface FaqKbItem {
  id: string;
  category: string;
  question: string;
  triggers: string;
  answer: string;
  active: boolean;
}

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
  calendly_url?: string;
  calendly_api_key?: string;
  calendly_api_key_configured?: boolean;
  office_hours_start: string;
  office_hours_end: string;
  is_active: boolean;
  objections_json: Array<{ trigger: string; counter: string }>;
  script_questions_json?: ScriptQuestionItem[];
  faq_kb_json?: FaqKbItem[];
  voice_provider?: string;
  gemini_api_key?: string;
  gemini_api_key_configured?: boolean;
  gemini_voice_name?: string;
  gemini_model_id?: string;
  twilio_configured?: boolean;
  twilio_account_sid?: string;
  twilio_auth_token?: string;
  twilio_from_phone?: string;
  twilio_webhook_base_url?: string;
  elevenlabs_api_key?: string;
  elevenlabs_api_key_configured?: boolean;
  elevenlabs_voice_id?: string;
  elevenlabs_model_id?: string;
  elevenlabs_agent_id?: string;
  elevenlabs_llm?: string;
  cloned_voice_id?: string;
  cloned_voice_name?: string;
  cloned_voice_sample_url?: string;
  auto_call_enabled?: boolean;
  max_daily_calls?: number;
  country_language_map?: Record<string, string>;
  interruptible?: boolean;
  voice_stability?: number;
  voice_similarity?: number;
  voice_speed?: number;
  agent_timezone?: string;
  whatsapp_prompt_question?: string;
  email_prompt_question?: string;
  meeting_confirmation_speech?: string;
  post_call_whatsapp_template?: string;
  post_call_email_subject?: string;
  post_call_email_template?: string;
  whatsapp_phone_number_id?: string;
  whatsapp_access_token?: string;
  whatsapp_configured?: boolean;
  active_smtp_sender?: string;
  active_smtp_name?: string;
  active_smtp_host?: string;
  total_smtp_inboxes?: number;
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
  email?: string;
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
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/voice-agent/kb`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error("Failed to fetch Voice Agent KB");
    return await res.json();
  } catch (err) {
    console.warn("fetchVoiceKB fallback:", err);
    return {
      name: "Sales Assistant",
      company_name: "Global Enterprise Solutions",
      agent_persona_name: "Alex",
      service_name: "Client Acquisition & Conversion Systems",
      service_description: "Automated buyer lead qualification and operational gap fixing.",
      core_offer: "100% Risk-Free 14-Day Pilot Implementation",
      first_message: "Hello {{client_name}}, this is {{agent_persona_name}} with {{my_company}}. Am I speaking with {{company_name}}?",
      system_prompt: "You are an elite, consultative B2B Sales Executive.",
      meeting_platform: "Google Meet",
      office_hours_start: "10:00",
      office_hours_end: "18:00",
      is_active: true,
      objections_json: [],
      script_questions_json: [],
      faq_kb_json: [],
    };
  }
}

export async function saveVoiceKB(payload: Partial<VoiceKnowledgeBase>): Promise<VoiceKnowledgeBase> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/kb`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `(Status ${res.status})`;
    try {
      const errData = await res.json();
      if (errData.detail) detail = typeof errData.detail === "string" ? errData.detail : JSON.stringify(errData.detail);
    } catch (e) {}
    throw new Error(`Failed to save Voice Agent KB: ${detail}`);
  }
  return res.json();
}

function getAuthHeaders(contentType: boolean = true): Record<string, string> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (contentType) headers["Content-Type"] = "application/json";
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export async function fetchCallQueue(): Promise<VoiceCallQueueItem[]> {
  try {
    const res = await fetch(`${API_BASE}/voice-agent/queue`, {
      headers: getAuthHeaders(false),
      cache: "no-store",
    });
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
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `(Status ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(`Failed to add lead to queue: ${detail}`);
  }
  return res.json();
}

export async function updateQueueItem(itemId: string, payload: Partial<VoiceCallQueueItem>): Promise<VoiceCallQueueItem> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}`, {
    method: "PUT",
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `(Status ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(`Failed to update queue item: ${detail}`);
  }
  return res.json();
}

export async function deleteQueueItem(itemId: string): Promise<any> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}`, {
    method: "DELETE",
    headers: getAuthHeaders(false),
  });
  if (!res.ok) throw new Error("Failed to delete queue item");
  return res.json();
}

export async function batchQueueAction(
  action: "select_all" | "deselect_all" | "sync_from_leads" | "delete_selected",
  item_ids?: string[]
): Promise<any> {
  const res = await fetch(`${API_BASE}/voice-agent/queue/batch`, {
    method: "POST",
    headers: getAuthHeaders(true),
    body: JSON.stringify({ action, item_ids }),
  });
  if (!res.ok) {
    let detail = `(Status ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(`Failed to execute batch queue action: ${detail}`);
  }
  return res.json();
}

export async function sendVoiceDialogueTurn(payload: {
  queue_item_id?: string;
  session_id?: string;
  user_speech_text: string;
  conversation_history?: Array<{ speaker: string; text: string }>;
  client_name?: string;
  company_name?: string;
  exact_problem?: string;
  language?: string;
  client_email?: string;
  phone?: string;
}): Promise<{
  agent_reply_text: string;
  meeting_booked: boolean;
  meeting_link?: string;
  meeting_time?: string;
  detected_intent: string;
  conversation_stage?: string;
  session_id?: string;
  language?: string;
  audio_base64?: string;
  should_hangup?: boolean;
}> {
  const res = await fetch(`${API_BASE}/voice-agent/dialogue-turn`, {
    method: "POST",
    headers: getAuthHeaders(true),
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
    headers: getAuthHeaders(true),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to complete call and record outcome");
  return res.json();
}

export async function fetchCallLogs(): Promise<VoiceCallLog[]> {
  try {
    const res = await fetch(`${API_BASE}/voice-agent/logs`, {
      headers: getAuthHeaders(false),
      cache: "no-store",
    });
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
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${API_BASE}/voice-agent/office-hours`, { headers, cache: "no-store" });
    if (!res.ok) throw new Error("Failed to check office hours");
    return await res.json();
  } catch (err) {
    console.warn("checkOfficeHours notice:", err);
    return {
      is_within_hours: true,
      message: "Active Office Hours",
      office_hours_start: "10:00",
      office_hours_end: "18:00",
    };
  }
}

export async function syncLeadsFromCard1(): Promise<{ success: boolean; synced_count: number; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/sync-card1-leads`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    let detail = `(Status ${res.status})`;
    try {
      const err = await res.json();
      if (err.detail) detail = typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail);
    } catch {}
    throw new Error(`Failed to sync leads: ${detail}`);
  }
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

export async function syncElevenLabsAgent(): Promise<{
  success: boolean;
  agent_id: string;
  status: string;
  llm: string;
  message: string;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/sync-elevenlabs-agent`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to deploy Agent to ElevenLabs");
  }
  return res.json();
}

export async function fetchElevenLabsSignedUrl(): Promise<{
  signed_url: string | null;
  agent_id: string | null;
  has_agent: boolean;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/signed-url`, { headers, cache: "no-store" });
  if (!res.ok) return { signed_url: null, agent_id: null, has_agent: false };
  return res.json();
}

export async function testWhatsAppConnection(data: {
  phone_number_id?: string;
  access_token?: string;
  target_phone: string;
  message?: string;
}): Promise<{
  success: boolean;
  message_id?: string;
  recipient?: string;
  error?: string;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/test-whatsapp`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to send test WhatsApp message");
  }
  return res.json();
}

export async function testEmailConnection(data: {
  target_email: string;
  subject?: string;
  body?: string;
  client_name?: string;
  company_name?: string;
  my_company?: string;
  agent_persona_name?: string;
}): Promise<{
  success: boolean;
  note: string;
  sender_email?: string;
  recipient: string;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/test-email`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to send test email");
  }
  return res.json();
}

export async function triggerOutboundCall(itemId: string): Promise<{
  success: boolean;
  message: string;
  call_sid?: string;
  queue_item?: VoiceCallQueueItem;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/voice-agent/queue/${itemId}/call`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to dispatch outbound call");
  }
  return res.json();
}

export async function getAvailableGeminiModels(apiKey?: string): Promise<{
  success: boolean;
  models: Array<{ id: string; name: string; supports_live: boolean }>;
  from_google: boolean;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const qs = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : "";
  try {
    const res = await fetch(`${API_BASE}/voice-agent/gemini-models${qs}`, {
      method: "GET",
      headers,
    });
    if (!res.ok) {
      return {
        success: false,
        models: [
          { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Recommended)", supports_live: true },
          { id: "gemini-3.8-live", name: "Gemini 3.8 Live (Native Audio)", supports_live: true },
        ],
        from_google: false,
      };
    }
    return res.json();
  } catch (e) {
    return {
      success: false,
      models: [
        { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash (Recommended)", supports_live: true },
        { id: "gemini-3.8-live", name: "Gemini 3.8 Live (Native Audio)", supports_live: true },
      ],
      from_google: false,
    };
  }
}




