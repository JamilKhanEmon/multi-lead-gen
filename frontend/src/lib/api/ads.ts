import { API_BASE } from "./common";

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

export async function renderFinalCampaignVideo(payload: {
  scenes: any[];
  audio_url?: string;
  bgm_url?: string;
}): Promise<{ video_url: string }> {
  const res = await fetch(`${API_BASE}/campaigns/render-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Failed to render campaign video");
  return res.json();
}
