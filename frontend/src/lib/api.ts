export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return "/api/v1";
  }
  const internal = process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000";
  return `${internal.replace(/\/+$/, "")}/api/v1`;
}

const API_BASE = typeof window !== "undefined"
  ? "/api/v1"
  : `${(process.env.BACKEND_INTERNAL_URL || "http://127.0.0.1:8000").replace(/\/+$/, "")}/api/v1`;

export interface ResearchRun {
  id: string;
  industry: string;
  location: string;
  depth: string;
  status: string;
  discovered_count: number;
  researched_count: number;
  qualified_count: number;
  rejected_count: number;
  failed_count: number;
  started_at: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  business_id: string;
  run_id?: string;
  tier: "Strong Potential" | "Review Needed" | "Rejected";
  final_score: number;
  is_qualified: boolean;
  primary_gap_summary: string;
  created_at: string;
  business_name?: string;
  domain?: string;
  business_type?: string;
  phone?: string;
  email?: string;
  email_status?: "VALID" | "NEEDS_REVIEW" | "INVALID" | "UNVERIFIED" | "VERIFIED" | "SUGGESTED" | "NOT_FOUND";
  verification_notes?: string;
  outreach_status?: "PENDING" | "READY_FOR_OUTREACH" | "NEEDS_REVIEW" | "SENT" | "FOLLOWUP_SENT" | "REPLIED_HOT" | "REPLIED_NEUTRAL" | "DISCARDED";
  deal_status?: "COLD" | "IN_PIPELINE" | "HOT_LEAD" | "CLOSED_WON" | "CLOSED_LOST";
  followup_step?: number;
  last_contacted_at?: string;
  outreach_notes?: string;
  contact_person?: string;
  contact_title?: string;
  address?: string;
  google_maps_url?: string;
  google_search_url?: string;
  facebook_url?: string;
  instagram_url?: string;
  linkedin_url?: string;
  city?: string;
  meta_ads_url?: string;
  phone_verified?: boolean;
  phone_sources?: string[];
  secondary_phone?: string;
  whatsapp_phone?: string;
  latitude?: number;
  longitude?: number;
  fit_tier?: "HOT" | "WARM" | "COLD" | "DROPPED" | string;
  why_they_need_us?: string;
  what_they_need?: string;
  discovery_call_script?: string;
  matched_service?: string;
  outreach_draft?: {
    subject: string;
    body: string;
    full_email?: string;
    is_llm_generated?: boolean;
    is_customized?: boolean;
  };
}

export interface ParameterCatalogItem {
  id: number;
  name: string;
  category: string;
  detection_type: string;
  default_weight: number;
  description: string;
}

export interface EvidenceDetail {
  parameter_id: number;
  parameter_name?: string;
  parameter_category?: string;
  parameter_description?: string;
  evidence_text: string;
  source_url?: string;
  source_type?: string;
  status: string;
  confidence: number;
  recency_weight: number;
  classification?: string;
}

export interface ResearchJobDetail {
  id: string;
  task_type: string;
  status: string;
  attempt: number;
  payload_json: Record<string, any>;
  result_json?: Record<string, any>;
  error_message?: string;
}

export interface SystemHealth {
  status: string;
  components: Record<string, { status: string; latency_ms?: number }>;
}

export async function fetchParameters(category?: string): Promise<ParameterCatalogItem[]> {
  try {
    const url = category ? `${API_BASE}/parameters?category=${encodeURIComponent(category)}` : `${API_BASE}/parameters`;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("fetchParameters error:", err);
    return [];
  }
}

export async function fetchHealth(): Promise<SystemHealth | null> {
  try {
    const res = await fetch(`${API_BASE}/admin/health`, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchRuns(): Promise<ResearchRun[]> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/research`, { cache: "no-store", headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.error("fetchRuns error:", err);
    return [];
  }
}

export async function fetchResearchRun(id: string): Promise<ResearchRun | null> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/research/${id}`, { cache: "no-store", headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("fetchResearchRun error:", err);
    return null;
  }
}

export async function cancelResearchRun(id: string): Promise<ResearchRun | null> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/research/${id}/cancel`, {
      method: "POST",
      headers,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("cancelResearchRun error:", err);
    return null;
  }
}

export async function fetchLeads(
  tier?: string,
  runId?: string,
  outreachStatus?: string,
  dealStatus?: string,
  fitTier?: string
): Promise<Lead[]> {
  try {
    const params = new URLSearchParams();
    if (tier && tier !== "ALL") params.append("tier", tier);
    if (runId && runId !== "ALL") params.append("run_id", runId);
    if (outreachStatus && outreachStatus !== "ALL") params.append("outreach_status", outreachStatus);
    if (dealStatus && dealStatus !== "ALL") params.append("deal_status", dealStatus);
    if (fitTier && fitTier !== "ALL") params.append("fit_tier", fitTier);
    const queryString = params.toString() ? `?${params.toString()}` : "";
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/leads${queryString}`, { cache: "no-store", headers });
    if (!res.ok) {
      console.warn("fetchLeads non-ok status:", res.status);
      return [];
    }
    return await res.json();
  } catch (err) {
    console.error("fetchLeads error:", err);
    return [];
  }
}

export async function fetchLeadDetail(id: string): Promise<any> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/leads/${id}`, { cache: "no-store", headers });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error("fetchLeadDetail error:", err);
    return null;
  }
}

export async function evaluateLeadFitGate(id: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/leads/${id}/evaluate-fit`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to evaluate lead fit gate");
  return res.json();
}

export interface StrategyPreview {
  industry: string;
  target_location: string;
  analyze_website: boolean;
  mode_label: string;
  sub_areas: Array<{ name: string; checked: boolean }>;
  search_queries: string[];
  matched_services: Array<{ name: string; type: string; description: string; offer_hook: string }>;
  demo_offer: string;
  total_areas_count: number;
}

export async function previewResearchStrategy(data: {
  industry: string;
  location: string;
  country?: string;
  city?: string;
  analyze_website?: boolean;
  max_services?: number;
}): Promise<StrategyPreview> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/research/preview`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to generate strategy preview");
  return res.json();
}

export async function createResearchRun(data: {
  industry: string;
  country?: string;
  city?: string;
  sub_city?: string;
  location?: string;
  depth: string;
  company_limit?: number;
  business_type_override?: string;
  auto_mail_enabled?: boolean;
  use_company_kb?: boolean;
  analyze_website?: boolean;
  sub_areas?: string[];
  target_services?: string[];
}): Promise<ResearchRun> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/research`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...data,
      company_limit: data.company_limit ?? 0,
      auto_mail_enabled: data.auto_mail_enabled ?? true,
      use_company_kb: data.use_company_kb ?? true,
      analyze_website: data.analyze_website ?? false,
      sub_areas: data.sub_areas ?? [],
    }),
  });
  if (!res.ok) throw new Error("Failed to start research run");
  return res.json();
}

export async function dispatchStaggeredOutreach(data: {
  lead_ids?: string[];
  min_delay_sec?: number;
  max_delay_sec?: number;
}): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/leads/dispatch-staggered`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    const msg = errData.detail || errData.message || `Server error (${res.status} ${res.statusText})`;
    throw new Error(msg);
  }
  return res.json();
}

export async function submitLeadFeedback(leadId: string, action: string, notes?: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/leads/${leadId}/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify({ action, notes }),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to submit reviewer feedback");
  }
  return res.json();
}

export async function updateLeadDetails(leadId: string, data: {
  email?: string;
  phone?: string;
  contact_person?: string;
  contact_title?: string;
  address?: string;
  primary_gap_summary?: string;
  tier?: string;
  fit_tier?: string;
  why_they_need_us?: string;
  what_they_need?: string;
  discovery_call_script?: string;
  matched_service?: string;
  approve_for_outreach?: boolean;
  outreach_status?: string;
  custom_outreach_subject?: string;
  custom_outreach_body?: string;
}): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/leads/${leadId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to update lead details");
  }
  return res.json();
}

export async function regenerateLeadOutreach(leadId: string): Promise<{ subject: string; body: string; full_email: string; discovery_call_script?: string; is_llm_generated?: boolean }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/leads/${leadId}/regenerate-outreach`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to regenerate outreach email draft");
  }
  return res.json();
}

export async function deleteLead(leadId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/leads/${leadId}`, { method: "DELETE", headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to delete lead");
  }
  return res.json();
}

export async function clearAllLeads(tier?: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const url = tier && tier !== "ALL" ? `${API_BASE}/leads?tier=${encodeURIComponent(tier)}` : `${API_BASE}/leads`;
  const res = await fetch(url, { method: "DELETE", headers });
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.detail || "Failed to clear leads");
  }
  return res.json();
}

export async function deleteResearchRun(runId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/research/${runId}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Failed to delete research run");
  return res.json();
}

export async function clearAllResearchRuns(): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/research`, { method: "DELETE", headers });
  if (!res.ok) throw new Error("Failed to clear research runs");
  return res.json();
}

export async function resetDatabase(purgeBusinesses: boolean = true): Promise<any> {
  const res = await fetch(`${API_BASE}/admin/reset-database?purge_businesses=${purgeBusinesses}`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to reset database");
  return res.json();
}

export interface MetaCampaign {
  id: string;
  name: string;
  industry: string;
  target_location: string;
  service_name: string;
  pain_point?: string;
  core_offer?: string;
  targeting_config: {
    job_titles?: string[];
    behaviors?: string[];
    interests?: string[];
    exclusions?: string[];
    age_min?: number;
    age_max?: number;
  };
  competitor_insights?: {
    scraped_competitors?: Array<{
      brand_or_domain: string;
      headline: string;
      video_hook: string;
      core_offer: string;
      days_running?: number;
      engagement_signal?: string;
    }>;
    market_pain_points?: string[];
    winning_angles?: string[];
    recommended_positioning?: string;
  };
  post1_creative: {
    hooks?: string[];
    selected_hook?: string;
    cold_video_script?: string;
    primary_copy?: string;
    headline?: string;
    video_url?: string;
  };
  post2_creative: {
    retargeting_copy?: string;
    offer_headline?: string;
    offer_description?: string;
    whatsapp_cta_label?: string;
    whatsapp_number?: string;
    prefill_message?: string;
  };
  budget_daily_bdt: number;
  retargeting_enabled: boolean;
  retargeting_threshold_pct: number;
  meta_campaign_id?: string;
  status: string;
  metrics: {
    spend_usd?: number;
    spend_bdt?: number;
    impressions?: number;
    video_views: number;
    thruplays_15s: number;
    qualified_50pct_viewers: number;
    whatsapp_clicks: number;
    conversations_started: number;
    cost_per_whatsapp_lead: number;
  };

  created_at?: string;
  updated_at?: string;
}

export async function conductCampaignResearch(payload: {
  service_name: string;
  industry: string;
  target_location: string;
  pain_point?: string;
  core_offer?: string;
}): Promise<{ targeting: any; competitor_insights: any }> {
  const res = await fetch(`${API_BASE}/campaigns/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to conduct market intelligence research");
  return res.json();
}

export async function generateCampaignCreatives(payload: {
  service_name: string;
  industry: string;
  target_location: string;
  pain_point: string;
  core_offer: string;
  competitor_insights?: any;
}): Promise<{ post1: any; post2: any }> {
  const res = await fetch(`${API_BASE}/campaigns/generate-creatives`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to generate funnel creatives");
  return res.json();
}

export async function createMetaCampaign(payload: any): Promise<MetaCampaign> {
  const res = await fetch(`${API_BASE}/campaigns`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to save campaign");
  return res.json();
}

export async function fetchMetaCampaigns(): Promise<MetaCampaign[]> {
  try {
    const res = await fetch(`${API_BASE}/campaigns`, { cache: "no-store" });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn("fetchMetaCampaigns error:", err);
    return [];
  }
}

export async function fetchMetaCampaign(id: string): Promise<MetaCampaign> {
  const res = await fetch(`${API_BASE}/campaigns/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch campaign details");
  return res.json();
}

export async function publishMetaCampaign(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/publish`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to publish campaign to Meta");
  return res.json();
}

export async function toggleMetaCampaignStatus(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/toggle-status`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("Failed to toggle campaign status");
  return res.json();
}

export async function deleteMetaCampaign(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Failed to delete campaign");
  return res.json();
}

export async function fetchMetaCampaignMetrics(id: string): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/${id}/metrics`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch live campaign metrics");
  return res.json();
}

export async function generateVideoStoryboard(payload: {
  service_name: string;
  industry: string;
  selected_topic: string;
  reference_image_description?: string;
}): Promise<{ scenes: any[] }> {
  const res = await fetch(`${API_BASE}/campaigns/generate-storyboard`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to generate video storyboard");
  return res.json();
}

export async function renderSingleScene(payload: {
  scene_number: number;
  prompt: string;
  reference_image_url?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/render-scene`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to render video scene");
  return res.json();
}

export async function stitchScenesIntoVideo(payload: {
  scenes: any[];
  campaign_name?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/stitch-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to stitch scenes into video");
  return res.json();
}

export async function generateB2BPoster(payload: {
  service_name: string;
  industry: string;
  headline: string;
  offer: string;
  reference_image_url?: string;
}): Promise<any> {
  const res = await fetch(`${API_BASE}/campaigns/generate-poster`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to generate B2B promotional poster");
  return res.json();
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

export interface DashboardPermissions {
  can_view_dashboard?: boolean;
  can_view_leads?: boolean;
  can_delete_leads?: boolean;
  can_export_leads?: boolean;
  can_run_research?: boolean;
  can_access_autopilot?: boolean;
  can_create_autopilot_campaigns?: boolean;
  can_run_autopilot_cycle?: boolean;
  can_verify_autopilot_leads?: boolean;
  can_edit_campaigns?: boolean;
  can_access_voice?: boolean;
  can_manage_templates?: boolean;
  can_manage_users?: boolean;
  all?: boolean;
  [key: string]: any;
}

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: "super_admin" | "admin" | "member" | "sales" | "reviewer";
  is_active: boolean;
  permissions_json?: DashboardPermissions;
  created_by_id?: string;
  created_at?: string;
}

export interface AuthTokenResponse {
  access_token: string;
  token_type: string;
  role: string;
}

export function hasPermission(
  user: AuthUser | null,
  permissionKey: keyof DashboardPermissions,
  defaultValue = true
): boolean {
  if (!user) return false;
  if (user.role === "super_admin") return true;
  if (user.permissions_json?.all) return true;
  const val = user.permissions_json?.[permissionKey];
  if (val !== undefined) return Boolean(val);

  if (
    permissionKey === "can_access_autopilot" ||
    permissionKey === "can_create_autopilot_campaigns" ||
    permissionKey === "can_run_autopilot_cycle" ||
    permissionKey === "can_verify_autopilot_leads"
  ) {
    return false;
  }
  return defaultValue;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("leadgen_access_token");
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("leadgen_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function logoutUser(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("leadgen_access_token");
  localStorage.removeItem("leadgen_user");
  window.dispatchEvent(new Event("auth_change"));
}

export async function loginUser(email: string, password: string): Promise<{ token: string; role: string; user?: AuthUser }> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
  } catch (netErr: any) {
    throw new Error(`Cannot connect to Backend API (${API_BASE}). Please check if backend server is running.`);
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Login failed (${res.status}): ${res.statusText || "Incorrect credentials"}`);
  }

  const tokenData: AuthTokenResponse = await res.json();
  if (typeof window !== "undefined") {
    localStorage.setItem("leadgen_access_token", tokenData.access_token);
  }

  let profile: AuthUser | null = null;
  try {
    const meRes = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (meRes.ok) {
      profile = await meRes.json();
      if (typeof window !== "undefined") {
        localStorage.setItem("leadgen_user", JSON.stringify(profile));
      }
    }
  } catch (e) {
    console.warn("Could not fetch user profile after login", e);
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("auth_change"));
  }

  return { token: tokenData.access_token, role: tokenData.role, user: profile || undefined };
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      logoutUser();
      return null;
    }
    const user: AuthUser = await res.json();
    if (typeof window !== "undefined") {
      localStorage.setItem("leadgen_user", JSON.stringify(user));
    }
    return user;
  } catch {
    return null;
  }
}

export async function listTeamUsers(): Promise<AuthUser[]> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/auth/users`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to list team members");
  }
  return res.json();
}

export async function createTeamUser(payload: {
  email: string;
  password: string;
  full_name: string;
  role: "super_admin" | "admin" | "sales";
}): Promise<AuthUser> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/auth/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create team member");
  }
  return res.json();
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  sender_name: string;
  sender_title: string;
  sender_company: string;
  sender_email: string;
  sender_phone: string;
  sender_website?: string;
  sign_off: string;
  signature_text?: string;
  signature_rendered?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchEmailTemplate(): Promise<EmailTemplate> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}/admin/email-template`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load email template");
  }
  return res.json();
}

export async function updateEmailTemplate(
  data: Partial<EmailTemplate>
): Promise<EmailTemplate> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}/admin/email-template`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update email template");
  }
  return res.json();
}

export function renderEmailTemplate(
  template: Partial<EmailTemplate>,
  lead: Partial<Lead>,
  personaSignatures?: PersonaSignatureItem[]
): { subject: string; body: string; fullEmail: string } {
  let sig = "";
  const activePersonas = (personaSignatures || []).filter((p) => p.is_active);
  if (activePersonas.length > 0) {
    const bizKey = lead.business_name || lead.domain || "company";
    let hash = 0;
    for (let i = 0; i < bizKey.length; i++) {
      hash = (hash << 5) - hash + bizKey.charCodeAt(i);
      hash |= 0;
    }
    const p = activePersonas[Math.abs(hash) % activePersonas.length];
    sig = (p.raw_content || "").trim();
  } else if (template.signature_text && template.signature_text.trim()) {
    sig = template.signature_text.trim();
  } else {
    const parts: string[] = [];
    if (template.sign_off) parts.push(template.sign_off);
    let nameLine = template.sender_name || "";
    if (template.sender_title) nameLine += (nameLine ? `\n${template.sender_title}` : template.sender_title);
    if (template.sender_company) nameLine += (nameLine ? `, ${template.sender_company}` : template.sender_company);
    if (nameLine) parts.push(nameLine);

    const contactParts: string[] = [];
    if (template.sender_email) contactParts.push(`Email: ${template.sender_email}`);
    if (template.sender_phone) contactParts.push(`Phone: ${template.sender_phone}`);
    if (contactParts.length) parts.push(contactParts.join(" | "));

    if (template.sender_website) parts.push(template.sender_website);
    sig = parts.join("\n").trim();
  }

  const sender_name = template.sender_name || "";
  const sender_title = template.sender_title || "";
  const sender_company = template.sender_company || "";
  const sender_email = template.sender_email || "";
  const sender_phone = template.sender_phone || "";

  const companyName = lead.business_name || "your company";
  const rawContact = (lead.contact_person || "").trim();
  const contactPerson = (rawContact && !["there", "sir", "madam", "n/a", "none", "unknown", "team"].includes(rawContact.toLowerCase()))
    ? rawContact
    : (lead.business_name ? `Team ${lead.business_name}` : "Team");
  const location = lead.address || "your city";
  const website = lead.domain || "official website";
  const phone = lead.phone || "";
  const rawGap = (lead.primary_gap_summary || "")
    .replace(/\[Proof Link:[^\]]*\]/gi, "")
    .replace(/\(Proof:[^\)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const primaryGap = rawGap ? ` (${rawGap})` : "";
  const whyTheyNeedUs = ((lead as any).why_they_need_us || rawGap || "")
    .replace(/\[Proof Link:[^\]]*\]/gi, "")
    .replace(/\(Proof:[^\)]*\)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const whatTheyNeed = (lead as any).what_they_need || "";
  const matchedService = (lead as any).matched_service || "";

  const replacements: Record<string, string> = {
    "{{company_name}}": companyName,
    "{{business_name}}": companyName,
    "{{contact_person}}": contactPerson,
    "{{location}}": location,
    "{{address}}": location,
    "{{website}}": website,
    "{{domain}}": website,
    "{{phone}}": phone,
    "{{primary_gap}}": primaryGap,
    "{{why_they_need_us}}": whyTheyNeedUs,
    "{{what_they_need}}": whatTheyNeed,
    "{{matched_service}}": matchedService,
    "{{signature}}": sig,
    "{{sender_name}}": sender_name,
    "{{sender_title}}": sender_title,
    "{{sender_company}}": sender_company,
    "{{sender_email}}": sender_email,
    "{{sender_phone}}": sender_phone,
    "{company_name}": companyName,
    "{contact_person}": contactPerson,
    "{city}": location,
    "{primary_gap}": lead.primary_gap_summary || "",
  };

  let renderedSubject = template.subject || "Quick inquiry regarding your office in {{location}}";
  let renderedBody = template.body || "";

  for (const [tag, val] of Object.entries(replacements)) {
    renderedSubject = renderedSubject.split(tag).join(val);
    renderedBody = renderedBody.split(tag).join(val);
  }

  renderedSubject = renderedSubject.replace(/\s*\(\s*\)/g, "").replace(/\s{2,}/g, " ").trim();
  renderedBody = renderedBody.replace(/\s*\(\s*\)/g, "").replace(/\s*\b(?:located\s+in|in)\s+and\b/gi, " and");

  if (sig && !renderedBody.includes(sig.trim())) {
    renderedBody = `${renderedBody.trim()}\n\n${sig.trim()}`;
  }

  const fullEmail = `Subject: ${renderedSubject}\n\n${renderedBody}`;
  return { subject: renderedSubject, body: renderedBody, fullEmail };
}

export async function fetchUsers(): Promise<AuthUser[]> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to load team users");
  }
  return res.json();
}

export async function createUser(data: {
  email: string;
  password: string;
  full_name: string;
  role: string;
  permissions_json?: DashboardPermissions;
}): Promise<AuthUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create user account");
  }
  return res.json();
}

export async function updateUser(
  userId: string,
  data: Partial<{
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
    password: string;
    permissions_json: DashboardPermissions;
  }>
): Promise<AuthUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update user account");
  }
  return res.json();
}

export async function changeEmail(
  newEmail: string,
  password: string
): Promise<{ status: string; message: string; email: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/change-email`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      new_email: newEmail,
      password: password,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to change email address");
  }
  const data = await res.json();
  const storedUser = getStoredUser();
  if (storedUser) {
    storedUser.email = data.email;
    localStorage.setItem("leadgen_user", JSON.stringify(storedUser));
    window.dispatchEvent(new Event("auth_change"));
  }
  return data;
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ status: string; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to change password");
  }
  return res.json();
}

export async function adminResetPassword(
  userId: string,
  newPassword: string
): Promise<{ status: string; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users/${userId}/reset-password`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      new_password: newPassword,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reset user password");
  }
  return res.json();
}

export async function updateMemberPermissions(
  userId: string,
  permissions_json: DashboardPermissions
): Promise<AuthUser> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users/${userId}/permissions`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ permissions_json }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update member permissions");
  }
  return res.json();
}

export async function deleteUser(userId: string): Promise<{ status: string; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/auth/users/${userId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete user account");
  }
  return res.json();
}

export interface AutopilotServiceCard {
  name: string;
  type?: "software" | "marketing" | string;
  description?: string;
  offer_hook?: string;
}

export interface AutopilotCampaign {
  id: string;
  name: string;
  keywords: string[];
  country: string;
  sub_cities: string[];
  target_services?: AutopilotServiceCard[] | any[];
  daily_lead_limit: number;
  daily_email_limit: number;
  is_unlimited_leads: boolean;
  auto_mail_enabled: boolean;
  use_global_template?: boolean;
  use_company_kb?: boolean;
  analyze_website?: boolean;
  max_services?: number;
  is_active: boolean;
  status: "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED";
  current_city_index: number;
  last_run_at: string | null;
  total_leads_found: number;
  total_emails_sent: number;
  total_replies_count: number;
  total_hot_deals_count: number;
  created_at: string;
}

export interface AutopilotAnalytics {
  total_leads: number;
  today_leads: number;
  ready_for_mail: number;
  needs_review: number;
  total_sent: number;
  sent_today: number;
  hot_deals: number;
  total_replies: number;
  response_rate: number;
  anti_spam_delay_seconds: string;
}

export interface AutopilotActivityItem {
  id: string;
  step: number;
  business_name: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  reply_sentiment?: string;
}

export async function fetchAutopilotCampaigns(): Promise<AutopilotCampaign[]> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns`, { headers, cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function createAutopilotCampaign(data: {
  name: string;
  keywords: string[];
  country: string;
  sub_cities: string[];
  daily_lead_limit: number;
  daily_email_limit: number;
  is_unlimited_leads: boolean;
  auto_mail_enabled: boolean;
  use_global_template?: boolean;
  use_company_kb?: boolean;
  analyze_website?: boolean;
  max_services?: number;
  target_services?: any[];
}): Promise<AutopilotCampaign> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to create autopilot campaign");
  }
  return res.json();
}

export async function toggleAutopilotCampaign(
  campaignId: string,
  isActive: boolean,
  status?: string
): Promise<AutopilotCampaign> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const payload: Record<string, any> = { is_active: isActive };
  if (status) payload.status = status;
  else if (!isActive) payload.status = "IDLE";

  const res = await fetch(`${API_BASE}/autopilot/campaigns/${campaignId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update campaign status");
  return res.json();
}

export async function updateAutopilotCampaign(
  campaignId: string,
  data: Partial<AutopilotCampaign>
): Promise<AutopilotCampaign> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns/${campaignId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update campaign");
  return res.json();
}

export async function runAutopilotBatch(campaignId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns/${campaignId}/run-now`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to trigger autopilot batch");
  }
  return res.json();
}

export async function deleteAutopilotCampaign(campaignId: string): Promise<void> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns/${campaignId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) throw new Error("Failed to delete campaign");
}

export async function fetchAutopilotAnalytics(): Promise<AutopilotAnalytics> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/analytics`, { headers, cache: "no-store" });
  if (!res.ok) {
    return {
      total_leads: 0,
      today_leads: 0,
      ready_for_mail: 0,
      needs_review: 0,
      total_sent: 0,
      sent_today: 0,
      hot_deals: 0,
      total_replies: 0,
      response_rate: 0,
      anti_spam_delay_seconds: "120-240s",
    };
  }
  return res.json();
}

export async function fetchAutopilotActivity(): Promise<AutopilotActivityItem[]> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/activity`, { headers, cache: "no-store" });
  if (!res.ok) return [];
  return res.json();
}

export async function humanVerifyLeadEmail(
  leadId: string,
  data: { new_email?: string; approve_for_outreach?: boolean; notes?: string }
): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/leads/${leadId}/verify-email`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to verify lead email");
  }
  return res.json();
}

export async function markLeadHotDeal(leadId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/leads/${leadId}/mark-hot`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to mark lead as hot deal");
  return res.json();
}

export interface SMTPInboxItem {
  id: string;
  index?: number;
  host: string;
  port: number;
  user?: string;
  username?: string;
  from_email: string;
  from_name: string;
  daily_limit: number;
  sent_today: number;
  remaining: number;
  is_active: boolean;
  status: string;
}

export interface PersonaSignatureItem {
  id: string;
  title: string;
  raw_content: string;
  name?: string;
  company?: string;
  is_active?: boolean;
  created_at?: string;
}

export async function fetchInboxMonitorStats(): Promise<{
  total_inboxes_configured: number;
  inboxes: SMTPInboxItem[];
  persona_signatures: PersonaSignatureItem[];
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/inbox-monitor`, { headers });
  if (!res.ok) throw new Error("Failed to fetch inbox monitor stats");
  return res.json();
}

export async function fetchPersonaSignatures(): Promise<PersonaSignatureItem[]> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/persona-signatures`, { headers });
  if (!res.ok) throw new Error("Failed to fetch persona signatures");
  return res.json();
}

export async function createSMTPInbox(data: {
  host: string;
  port: number;
  username: string;
  password: string;
  from_email: string;
  from_name: string;
  daily_limit: number;
  is_active?: boolean;
}): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/smtp-inboxes`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to add SMTP Inbox");
  }
  return res.json();
}

export async function deleteSMTPInbox(inboxId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/smtp-inboxes/${inboxId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete SMTP Inbox");
  }
  return res.json();
}

export async function testSMTPInbox(inboxId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/smtp-inboxes/${inboxId}/test`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "SMTP Connection Test Failed");
  }
  return res.json();
}

export async function createPersonaSignature(data: {
  title: string;
  raw_content: string;
  is_active?: boolean;
}): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/persona-signatures`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to add Signature Card");
  }
  return res.json();
}

export async function updatePersonaSignature(
  personaId: string,
  data: {
    title?: string;
    raw_content?: string;
    is_active?: boolean;
  }
): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/persona-signatures/${personaId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update Signature Card");
  }
  return res.json();
}

export async function togglePersonaSignature(personaId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/persona-signatures/${personaId}/toggle`, {
    method: "PATCH",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to toggle Signature Card");
  }
  return res.json();
}

export async function deletePersonaSignature(personaId: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/persona-signatures/${personaId}`, {
    method: "DELETE",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to delete Signature Card");
  }
  return res.json();
}

export async function purgeDatabaseData(target: "rejected_leads" | "search_runs" | "all_leads" | "factory_reset"): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/purge-data`, {
    method: "POST",
    headers,
    body: JSON.stringify({ target }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to purge database data");
  }
  return res.json();
}

export async function simulateLeadReply(leadId: string, replyText: string): Promise<any> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/leads/${leadId}/simulate-reply`, {
    method: "POST",
    headers,
    body: JSON.stringify({ reply_text: replyText }),
  });
  if (!res.ok) throw new Error("Failed to simulate reply");
  return res.json();
}

export async function triggerInboxSync(): Promise<{ status: string; processed_count?: number; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/inbox/sync`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to sync inbox");
  return res.json();
}

export interface ServiceCatalogItem {
  key: string;
  name: string;
  url?: string;
  target_industries?: string;
  wedge: string;
  features?: string;
  solves_problems?: string;
  description: string;
}

export interface CompanyKB {
  id: string;
  company_name: string;
  tagline_experience: string;
  headquarters?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  website_url?: string | null;
  master_kb_notes?: string | null;
  services_json: ServiceCatalogItem[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export async function fetchCompanyKB(): Promise<CompanyKB> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/company-kb`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch Company Knowledge Base");
  }
  return res.json();
}

export async function updateCompanyKB(data: Partial<CompanyKB>): Promise<CompanyKB> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/company-kb`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update Company Knowledge Base");
  }
  return res.json();
}

export async function resetCompanyKBDefaults(): Promise<CompanyKB> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/company-kb/reset-defaults`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reset Company KB defaults");
  }
  return res.json();
}

// Conversational Lead Qualification & Meta Chatbot API

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_type: "USER" | "AI" | "HUMAN_AGENT";
  sender_name?: string;
  message_type: string;
  content: string;
  media_url?: string;
  detected_sentiment?: string;
  created_at: string;
}

export interface ConversationItem {
  id: string;
  platform: "whatsapp" | "messenger" | "instagram" | "web_widget" | string;
  external_sender_id: string;
  sender_name?: string;
  sender_phone?: string;
  sender_email?: string;
  detected_language?: string;
  status: "ACTIVE" | "QUALIFIED" | "DISQUALIFIED" | "HUMAN_TAKEOVER" | "CLOSED" | string;
  ai_enabled: boolean;
  qualification_score: number;
  extracted_data: Record<string, any>;
  lead_id?: string;
  last_message_text?: string;
  last_message_at?: string;
  unread_count: number;
  is_favorite: boolean;
  created_at: string;
}

export interface ConversationDetail extends ConversationItem {
  messages: ConversationMessage[];
}

export interface ChatbotConfig {
  id: string;
  business_name: string;
  industry: string;
  country: string;
  currency_symbol: string;
  currency_code: string;
  tagline: string;
  description: string;
  services_json: Array<{ name: string; description: string; price?: string }>;
  faqs_json: Array<{ question: string; answer: string }>;
  qualification_fields_json: Array<{ key: string; label: string; prompt: string; required: boolean }>;
  master_ai_enabled: boolean;
  auto_detect_language: boolean;
  ai_tone: string;
  custom_instructions?: string;
  meta_verify_token?: string;
  meta_page_access_token?: string;
  whatsapp_phone_number_id?: string;
  updated_at?: string;
}

export async function fetchConversations(
  statusFilter?: string,
  platformFilter?: string,
  search?: string
): Promise<ConversationItem[]> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const params = new URLSearchParams();
  if (statusFilter && statusFilter !== "ALL") params.append("status", statusFilter);
  if (platformFilter && platformFilter !== "ALL") params.append("platform", platformFilter);
  if (search && search.trim()) params.append("search", search.trim());

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${API_BASE}/conversations${query}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

export async function fetchConversationDetail(id: string): Promise<ConversationDetail> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/${id}`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load conversation details");
  return res.json();
}

export async function sendHumanMessage(
  id: string,
  content: string,
  senderName: string = "Agent"
): Promise<{ status: string; message_id: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/${id}/messages`, {
    method: "POST",
    headers,
    body: JSON.stringify({ content, sender_name: senderName }),
  });
  if (!res.ok) throw new Error("Failed to send message");
  return res.json();
}

export async function toggleHumanTakeover(
  id: string,
  aiEnabled: boolean
): Promise<{ ai_enabled: boolean; status: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/${id}/takeover`, {
    method: "POST",
    headers,
    body: JSON.stringify({ ai_enabled: aiEnabled }),
  });
  if (!res.ok) throw new Error("Failed to toggle takeover");
  return res.json();
}

export async function updateConversationStatus(
  id: string,
  newStatus: string
): Promise<{ status: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/${id}/status`, {
    method: "POST",
    headers,
    body: JSON.stringify({ status: newStatus }),
  });
  if (!res.ok) throw new Error("Failed to update status");
  return res.json();
}

export async function convertConversationToLead(
  id: string
): Promise<{ message: string; lead_id: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/${id}/convert-lead`, {
    method: "POST",
    headers,
  });
  if (!res.ok) throw new Error("Failed to convert to lead");
  return res.json();
}

export async function fetchChatbotConfig(): Promise<ChatbotConfig> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/config`, { headers, cache: "no-store" });
  if (!res.ok) throw new Error("Failed to fetch chatbot config");
  return res.json();
}

export async function updateChatbotConfig(
  payload: Partial<ChatbotConfig>
): Promise<{ message: string; master_ai_enabled: boolean }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/config`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to update chatbot config");
  return res.json();
}

export async function simulateChatMessage(payload: {
  platform: string;
  external_sender_id?: string;
  sender_name?: string;
  message_text: string;
}): Promise<{
  conversation_id: string;
  detected_language: string;
  status: string;
  qualification_score: number;
  extracted_data: Record<string, any>;
  lead_id?: string;
  ai_reply: string | null;
}> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/conversations/simulate`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Simulation failed");
  return res.json();
}

export interface ReplyEntry {
  id: string;
  lead_id: string | null;
  company_name: string;
  contact_person: string | null;
  client_email: string;
  campaign_subject: string;
  reply_text: string;
  reply_snippet: string;
  ai_label: "HOT_LEAD" | "NEUTRAL" | "REJECTED" | string;
  analyzed_by?: "OPENCLAW" | "RULE_LOGIC" | string;
  deal_status: string | null;
  outreach_status: string | null;
  replied_at: string | null;
  step: number;
}

export async function fetchReplies(filter?: "hot" | "neutral" | "rejected"): Promise<ReplyEntry[]> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const url = filter
      ? `${API_BASE}/autopilot/replies?filter=${filter}`
      : `${API_BASE}/autopilot/replies`;
    const res = await fetch(url, { cache: "no-store", headers });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn("fetchReplies error:", err);
    return [];
  }
}

export interface InboxMessage {
  id: string;
  imap_seq: string;
  account_email: string;
  account_id: string;
  from_email: string;
  from_raw: string;
  to: string;
  subject: string;
  body: string;
  snippet: string;
  date: string | null;
  is_unread: boolean;
  in_reply_to: string;
  is_reply: boolean;
  direction?: "inbound" | "outbound";
  status?: string;
}

export async function fetchInboxMessages(limit = 50): Promise<{
  status: string;
  accounts: string[];
  total: number;
  messages: InboxMessage[];
}> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/autopilot/inbox/messages?limit=${limit}`, {
      cache: "no-store",
      headers,
    });
    if (!res.ok) return { status: "error", accounts: [], total: 0, messages: [] };
    return await res.json();
  } catch (err) {
    console.warn("fetchInboxMessages error:", err);
    return { status: "error", accounts: [], total: 0, messages: [] };
  }
}

export async function deleteInboxMessage(accountId: string, imapSeq: string): Promise<{ status: string; message: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/autopilot/inbox/delete`, {
    method: "POST",
    headers,
    body: JSON.stringify({ account_id: accountId, imap_seq: imapSeq }),
  });
  if (!res.ok) throw new Error("Failed to delete email");
  return res.json();
}

export async function sendManualReply(payload: {
  to_email: string;
  subject: string;
  body: string;
  account_id?: string;
}): Promise<{ status: string; message: string; note: string }> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}/autopilot/inbox/reply`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to send reply");
  }
  return res.json();
}

export interface ThreadMessage {
  direction: "inbound" | "outbound";
  from?: string;
  to?: string;
  subject: string;
  body: string;
  snippet: string;
  sent_at: string | null;
  ai_label?: string;
  analyzed_by?: "OPENCLAW" | "RULE_LOGIC" | string;
  status?: string;
  step: number;
  company_name?: string;
}

export async function fetchEmailThread(clientEmail: string): Promise<{
  client_email: string;
  total: number;
  thread: ThreadMessage[];
}> {
  try {
    const token = getStoredToken();
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Bearer ${token}`;
    const res = await fetch(
      `${API_BASE}/autopilot/inbox/thread?client_email=${encodeURIComponent(clientEmail)}`,
      { cache: "no-store", headers }
    );
    if (!res.ok) return { client_email: clientEmail, total: 0, thread: [] };
    return await res.json();
  } catch {
    return { client_email: clientEmail, total: 0, thread: [] };
  }
}

export interface AIUsageModelStat {
  provider: string;
  model: string;
  is_free: boolean;
  tier_label: string;
  calls: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cost_usd: number;
  last_used_at?: string;
}

export interface AIUsageStats {
  total_calls?: number;
  total_tokens?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_cost_usd?: number;
  last_call_at?: string;
  by_model?: Record<string, AIUsageModelStat>;
}

export interface AISettings {
  id?: string;
  primary_provider: string;
  primary_model: string;
  enable_fallback: boolean;
  fallback_provider?: string | null;
  fallback_model?: string | null;
  groq_api_key_masked?: string | null;
  openrouter_api_key_masked?: string | null;
  openai_api_key_masked?: string | null;
  custom_api_key_masked?: string | null;
  custom_base_url?: string | null;
  has_groq_key: boolean;
  has_openrouter_key: boolean;
  has_openai_key: boolean;
  has_custom_key: boolean;
  max_tokens: number;
  temperature: number;
  usage_stats_json?: AIUsageStats;
  is_active: boolean;
}

export interface AISettingsUpdatePayload {
  primary_provider: string;
  primary_model: string;
  enable_fallback: boolean;
  fallback_provider?: string | null;
  fallback_model?: string | null;
  groq_api_key?: string | null;
  openrouter_api_key?: string | null;
  openai_api_key?: string | null;
  custom_api_key?: string | null;
  custom_base_url?: string | null;
  max_tokens?: number;
  temperature?: number;
}

export interface AITestResult {
  success: boolean;
  latency_ms: number;
  provider: string;
  model: string;
  message: string;
  response_sample?: any;
}

export async function fetchAISettings(): Promise<AISettings> {
  const token = getStoredToken();
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/ai-settings`, {
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error("Failed to fetch AI Settings");
  }
  return res.json();
}

export async function updateAISettings(data: AISettingsUpdatePayload): Promise<AISettings> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/ai-settings`, {
    method: "PUT",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to update AI Settings");
  }
  return res.json();
}

export async function resetAIUsageStats(): Promise<AISettings> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/ai-settings/reset-usage`, {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to reset AI usage metrics");
  }
  return res.json();
}

export async function testAIConnection(data: {
  provider: string;
  model: string;
  api_key?: string;
  custom_base_url?: string;
}): Promise<AITestResult> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/admin/ai-settings/test`, {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Failed to test AI connection");
  }
  return res.json();
}


