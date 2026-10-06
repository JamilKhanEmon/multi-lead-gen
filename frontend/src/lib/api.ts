/**
 * Typed API Client for FastAPI backend
 */

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
  contact_person?: string;
  contact_title?: string;
  address?: string;
  google_maps_url?: string;
  google_search_url?: string;
  latitude?: number;
  longitude?: number;
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
  dealStatus?: string
): Promise<Lead[]> {
  try {
    const params = new URLSearchParams();
    if (tier && tier !== "ALL") params.append("tier", tier);
    if (runId && runId !== "ALL") params.append("run_id", runId);
    if (outreachStatus && outreachStatus !== "ALL") params.append("outreach_status", outreachStatus);
    if (dealStatus && dealStatus !== "ALL") params.append("deal_status", dealStatus);
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
  if (!res.ok) throw new Error("Failed to dispatch staggered outreach emails");
  return res.json();
}

export async function submitLeadFeedback(leadId: string, action: string, notes?: string): Promise<any> {
  const res = await fetch(`${API_BASE}/leads/${leadId}/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, notes }),
  });
  if (!res.ok) throw new Error("Failed to submit reviewer feedback");
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
  approve_for_outreach?: boolean;
  outreach_status?: string;
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

// ==========================================
// B2B Meta Ads Campaigns & Retargeting Funnel
// ==========================================

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

// ==============================================================================
// B2B VOICE CALLING AGENT & INTERACTIVE SHEET VIEW API
// ==============================================================================

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
  exact_problem: string;
  status: "READY" | "IN_PROGRESS" | "MEETING_BOOKED" | "CALL_DONE" | "FAILED";
  selected_for_call: boolean;
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
}): Promise<{
  agent_reply_text: string;
  meeting_booked: boolean;
  meeting_link?: string;
  meeting_time?: string;
  detected_intent: string;
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

// ==============================================================================
// Authentication & Role-Based Access Control (Super Admin, Admin, Sales)
// ==============================================================================

export interface DashboardPermissions {
  can_view_dashboard?: boolean;
  can_view_leads?: boolean;
  can_delete_leads?: boolean;               // Human sales/QA team lead deletion
  can_export_leads?: boolean;
  can_run_research?: boolean;
  can_access_autopilot?: boolean;
  can_create_autopilot_campaigns?: boolean; // Controls search input & campaign configuration
  can_run_autopilot_cycle?: boolean;        // Controls manual trigger of discovery/outreach batches
  can_verify_autopilot_leads?: boolean;     // Controls human quality verification & email approvals
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
  // Autonomous Cold Email & Autopilot search/cycle/verification permissions are strictly Super Admin controlled
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

  // Fetch full user profile using the new token
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
  lead: Partial<Lead>
): { subject: string; body: string; fullEmail: string } {
  const sender_name = template.sender_name || "Growth Advisory Team";
  const sender_title = template.sender_title || "Solutions Specialist";
  const sender_company = template.sender_company || "Multi-Lead Gen AI";
  const sender_email = template.sender_email || "contact@leadgen.local";
  const sender_phone = template.sender_phone || "+880 1700-000000";
  const sender_website = template.sender_website || "https://leadgen.local";
  const sign_off = template.sign_off || "Sincerely,";

  let sig = "";
  if (template.signature_text && template.signature_text.trim()) {
    sig = template.signature_text.trim();
  } else {
    const parts = [sign_off];
    let nameLine = sender_name;
    if (sender_title) nameLine += `\n${sender_title}`;
    if (sender_company) nameLine += `, ${sender_company}`;
    parts.push(nameLine);

    const contactParts: string[] = [];
    if (sender_email) contactParts.push(`Email: ${sender_email}`);
    if (sender_phone) contactParts.push(`Phone: ${sender_phone}`);
    if (contactParts.length) parts.push(contactParts.join(" | "));

    if (sender_website) parts.push(sender_website);
    sig = parts.join("\n");
  }

  const companyName = lead.business_name || "your company";
  const contactPerson = lead.contact_person || "Sir/Madam";
  const location = lead.address || "your city";
  const website = lead.domain || "official website";
  const phone = lead.phone || "";
  const primaryGap = lead.primary_gap_summary ? ` (${lead.primary_gap_summary})` : "";

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
    "{{signature}}": sig,
    "{{sender_name}}": sender_name,
    "{{sender_title}}": sender_title,
    "{{sender_company}}": sender_company,
    "{{sender_email}}": sender_email,
    "{{sender_phone}}": sender_phone,
  };

  let renderedSubject = template.subject || "Quick inquiry regarding your office in {{location}}";
  let renderedBody = template.body || "";

  for (const [tag, val] of Object.entries(replacements)) {
    renderedSubject = renderedSubject.split(tag).join(val);
    renderedBody = renderedBody.split(tag).join(val);
  }

  const fullEmail = `Subject: ${renderedSubject}\n\n${renderedBody}`;
  return { subject: renderedSubject, body: renderedBody, fullEmail };
}

// ==============================================================================
// User Management & Role-Based Access Control API Functions
// ==============================================================================

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

// ============================================================================
// AUTOPILOT CAMPAIGNS & AUTONOMOUS COLD EMAIL OUTREACH
// ============================================================================

export interface AutopilotCampaign {
  id: string;
  name: string;
  keywords: string[];
  country: string;
  sub_cities: string[];
  daily_lead_limit: number;
  daily_email_limit: number;
  is_unlimited_leads: boolean;
  auto_mail_enabled: boolean;
  use_global_template?: boolean;
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
  isActive: boolean
): Promise<AutopilotCampaign> {
  const token = getStoredToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/autopilot/campaigns/${campaignId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ is_active: isActive }),
  });
  if (!res.ok) throw new Error("Failed to update campaign status");
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
  name: string;
  title: string;
  company: string;
  is_active?: boolean;
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
  name: string;
  title: string;
  company: string;
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
    throw new Error(err.detail || "Failed to add Persona Signature");
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
    throw new Error(err.detail || "Failed to delete Persona Signature");
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







