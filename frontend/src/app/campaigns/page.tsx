"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Megaphone,
  Compass,
  Sparkles,
  Search,
  CheckCircle2,
  Play,
  Pause,
  ArrowRight,
  ArrowLeft,
  MessageSquare,
  ShieldAlert,
  Users,
  Building2,
  DollarSign,
  TrendingUp,
  Flame,
  Smartphone,
  RefreshCw,
  Check,
  UploadCloud,
  Film,
  Image as ImageIcon,
  Camera,
  Layers,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Trash2,
  Lock,
  X,
  Globe,
  MapPin,
  Zap,
} from "lucide-react";
import {
  conductCampaignResearch,
  generateCampaignCreatives,
  generateVideoStoryboard,
  renderSingleScene,
  stitchScenesIntoVideo,
  generateB2BPoster,
  createMetaCampaign,
  fetchMetaCampaigns,
  publishMetaCampaign,
  toggleMetaCampaignStatus,
  fetchMetaCampaignMetrics,
  deleteMetaCampaign,
  MetaCampaign,
} from "@/lib/api";

const PRESET_INDUSTRIES = [
  "Professional & Legal Services",
  "Healthcare & Specialized Clinics",
  "Commercial Contracting & Engineering",
  "Software, SaaS & Digital Technology",
  "Manufacturing & Industrial Facilities",
  "Real Estate & Commercial Properties",
  "E-Commerce, Logistics & Retail",
];

interface SolutionPreset {
  id: string;
  label: string;
  industry: string;
  serviceName: string;
  painPoint: string;
  coreOffer: string;
}

const B2B_SOLUTION_PRESETS: SolutionPreset[] = [
  {
    id: "real-estate-erp",
    label: "Real Estate & Construction ERP (Installment & Buyer Inquiries)",
    industry: "Real Estate & Commercial Properties",
    serviceName: "Real Estate ERP & Property Sales Automation System",
    painPoint: "Buyer inquiries slipping through cracks, manual installment tracking confusion, missed follow-ups, and untracked unsold plot/flat inventory.",
    coreOffer: "Free 5-Minute Live Interactive Demo of Real Estate ERP & Installment Automation.",
  },
  {
    id: "enterprise-erp",
    label: "Enterprise Resource Planning (Manufacturing, Inventory & Supply Chain)",
    industry: "Manufacturing & Industrial Facilities",
    serviceName: "Enterprise Resource Planning (ERP) & Operations Workflow Tracker",
    painPoint: "Manual Excel registers, untracked warehouse stock shrinkage, billing delays, and lack of real-time multi-branch financial reports.",
    coreOffer: "Tailored Cloud ERP Architecture Preview & Operations Workflow Audit.",
  },
  {
    id: "pos-retail",
    label: "POS & Retail Management (Barcode Billing & Inventory Sync)",
    industry: "E-Commerce, Logistics & Retail",
    serviceName: "Cloud POS & Automated Inventory Sync System",
    painPoint: "Long customer queues at counter, untracked inventory shrinkage, and manual calculation errors during rush hours.",
    coreOffer: "Rapid POS Setup Demonstration with Automated Low-Stock Alert System.",
  },
  {
    id: "web-software-engineering",
    label: "Modern Web Engineering & High-Converting Corporate Portals",
    industry: "Software, SaaS & Digital Technology",
    serviceName: "High-Converting Corporate Web Engineering & Lead Capture Platform",
    painPoint: "Broken mobile layouts, slow website loading speed, outdated brand presence, and zero on-site lead capture.",
    coreOffer: "Free 15-Minute UX & Speed Audit + Interactive Prototype within 48 Hours.",
  },
  {
    id: "digital-ordering-ecommerce",
    label: "Digital Ordering & WhatsApp E-Commerce Platform",
    industry: "E-Commerce, Logistics & Retail",
    serviceName: "Digital Ordering & WhatsApp E-Commerce Platform",
    painPoint: "Phone order bottlenecks during rush hours, missed customer calls, and manual delivery dispatch confusion.",
    coreOffer: "Instant Digital Storefront Preview with Automated WhatsApp Ordering Flow.",
  },
  {
    id: "campus-management",
    label: "School, College & Campus Management Platform",
    industry: "Professional & Legal Services",
    serviceName: "Automated Campus Management & Student Billing Portal",
    painPoint: "Manual fee collection queues, delayed exam report cards, untracked student absences, and paper-heavy administration.",
    coreOffer: "Live Demonstration of Automated Fee Billing & Parent Notification Portal.",
  },
  {
    id: "healthcare-clinic",
    label: "Hospital, Clinic & Diagnostic Management System",
    industry: "Healthcare & Specialized Clinics",
    serviceName: "Clinic Appointment & Digital Diagnostic Management System",
    painPoint: "Front-desk phone chaos for doctor appointments, manual prescription errors, and delayed digital lab test deliveries.",
    coreOffer: "Risk-Free Outpatient Booking & Diagnostic Workflow Preview Demonstration.",
  },
  {
    id: "performance-tracking-seo",
    label: "B2B Conversion Tracking, Meta Pixel & Performance SEO",
    industry: "Software, SaaS & Digital Technology",
    serviceName: "Enterprise Conversion Tracking & Performance Marketing Optimization",
    painPoint: "Unmeasured advertising budgets, inability to retarget past website visitors, and low local search visibility.",
    coreOffer: "Free Digital Presence & Conversion Tracking Gap Audit Report.",
  },
  {
    id: "cloud-hosting-migration",
    label: "Managed Cloud Hosting & Infrastructure Migration",
    industry: "Commercial Contracting & Engineering",
    serviceName: "High-Speed Managed Cloud Hosting & Infrastructure Optimization",
    painPoint: "Slow page loading speeds, frequent server downtime, lack of automated daily backups, and unsecure business emails.",
    coreOffer: "Free Website Speed & Zero-Downtime Cloud Migration Assessment.",
  },
];

const PRESET_LOCATIONS = [
  "Global / Worldwide Multi-Region",
  "United States (Top Metro & Commercial Markets)",
  "United Kingdom & Western Europe",
  "Canada & Australia Metro Hubs",
  "United Arab Emirates & Gulf Commercial Freezones",
  "Southeast Asia & Asia-Pacific Hubs",
];

const PRESET_JOB_ROLES = [
  "Managing Director (MD)",
  "Founder & Chief Executive Officer (CEO)",
  "Chief Technology Officer (CTO)",
  "Chief Operating Officer (COO)",
  "Head of Quality Assurance (QA)",
  "Factory General Manager (GM)",
  "Head of Operations / Production Director",
  "Industrial Automation Engineer",
  "Plant Manager / Director",
  "Procurement & Supply Chain Director",
  "VP of Engineering / Technical Lead",
  "VP of Sales & Commercial Operations",
  "IT & Systems Infrastructure Director",
];

const PRESET_EXCLUSIONS = [
  "Students & Academic Candidates",
  "Job Seekers & Unpaid Interns",
  "Entry-Level & Non-Decision Makers",
  "Unrelated Retail & Consumers",
  "Unemployed Demographics",
  "Freelancers & Independent Contractors",
  "Digital Marketing Agencies & Media Buyers",
  "Direct Competitors & Vendors",
  "General Non-Management Staff",
  "Hobbies & Craft Interest Groups",
];

export default function MetaCampaignsPage() {

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [researching, setResearching] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const [serviceName, setServiceName] = useState("");
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [industry, setIndustry] = useState("");
  const [customIndustry, setCustomIndustry] = useState("");
  const [targetLocation, setTargetLocation] = useState("");
  const [customLocation, setCustomLocation] = useState("");
  const [locationMode, setLocationMode] = useState<"preset" | "manual">("preset");
  const [painPoint, setPainPoint] = useState("");
  const [coreOffer, setCoreOffer] = useState("");

  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [selectedExclusions, setSelectedExclusions] = useState<string[]>([]);
  const [customRoleInput, setCustomRoleInput] = useState<string>("");
  const [customExclusionInput, setCustomExclusionInput] = useState<string>("");

  const [competitorIntel, setCompetitorIntel] = useState<any>(null);
  const [post1, setPost1] = useState<any>({
    hooks: [],
    selected_hook: "",
    cold_video_script: "",
    primary_copy: "",
    headline: "",
    video_url: "",
  });

  const [post2, setPost2] = useState<any>({
    retargeting_copy: "",
    offer_headline: "",
    offer_description: "",
    whatsapp_cta_label: "Send WhatsApp Message",
    whatsapp_number: "",
    prefill_message: "",
    poster_url: "",
  });

  const [researchLogs, setResearchLogs] = useState<string[]>([]);
  const [showRawIntel, setShowRawIntel] = useState<boolean>(false);
  const [mediaMode, setMediaMode] = useState<"ai_video" | "ai_poster" | "manual_upload">("manual_upload");
  const [manualUploadedFile, setManualUploadedFile] = useState<string | null>(null);
  const [manualFileName, setManualFileName] = useState<string>("");

  const [referenceImageDescription, setReferenceImageDescription] = useState<string>("");
  const [referenceImageFile, setReferenceImageFile] = useState<string | null>(null);

  const [storyboardTopic, setStoryboardTopic] = useState<string>("roi_breakdown");
  const [customTopicText, setCustomTopicText] = useState<string>("");
  const [storyboardScenes, setStoryboardScenes] = useState<any[]>([]);

  const [generatingStoryboard, setGeneratingStoryboard] = useState<boolean>(false);
  const [stitchingVideo, setStitchingVideo] = useState<boolean>(false);
  const [renderingSceneNum, setRenderingSceneNum] = useState<number | null>(null);
  const [generatingPoster, setGeneratingPoster] = useState<boolean>(false);

  const [budgetDaily, setBudgetDaily] = useState<number>(30);
  const [retargetingThreshold, setRetargetingThreshold] = useState<number>(50);

  const [activeCampaign, setActiveCampaign] = useState<MetaCampaign | null>(null);
  const [campaignHistory, setCampaignHistory] = useState<MetaCampaign[]>([]);
  const [previewTab, setPreviewTab] = useState<"post1" | "post2">("post1");

  useEffect(() => {
    loadCampaigns();
  }, []);

  useEffect(() => {
    if (!activeCampaign || activeCampaign.status !== "ACTIVE") return;
    const interval = setInterval(async () => {
      try {
        const metrics = await fetchMetaCampaignMetrics(activeCampaign.id);
        setActiveCampaign((prev) => (prev ? { ...prev, metrics } : null));
      } catch (err) {
      }
    }, 6000);
    return () => clearInterval(interval);
  }, [activeCampaign]);

  const loadCampaigns = async () => {
    try {
      const list = await fetchMetaCampaigns();
      setCampaignHistory(list);
    } catch (err) {
      console.warn("Could not load campaigns:", err);
    }
  };

  const handleDeleteCampaign = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this campaign?")) return;
    try {
      await deleteMetaCampaign(id);
      setCampaignHistory((prev) => prev.filter((c) => c.id !== id));
      if (activeCampaign?.id === id) {
        setActiveCampaign(null);
      }
      setFeedbackMsg({ type: "success", text: "Campaign deleted successfully." });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: `Failed to delete campaign: ${err.message}` });
    }
  };

  const handleToggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(selectedRoles.filter((r) => r !== role));
    } else {
      setSelectedRoles([...selectedRoles, role]);
    }
  };

  const handleAddCustomRole = () => {
    const trimmed = customRoleInput.trim();
    if (!trimmed) return;
    if (!selectedRoles.includes(trimmed)) {
      setSelectedRoles([...selectedRoles, trimmed]);
    }
    setCustomRoleInput("");
  };

  const handleToggleExclusion = (item: string) => {
    if (selectedExclusions.includes(item)) {
      setSelectedExclusions(selectedExclusions.filter((x) => x !== item));
    } else {
      setSelectedExclusions([...selectedExclusions, item]);
    }
  };

  const handleAddCustomExclusion = () => {
    const trimmed = customExclusionInput.trim();
    if (!trimmed) return;
    if (!selectedExclusions.includes(trimmed)) {
      setSelectedExclusions([...selectedExclusions, trimmed]);
    }
    setCustomExclusionInput("");
  };

  const handleRunOpenClawAndLLM = async () => {
    if (!serviceName.trim()) {
      setFeedbackMsg({
        type: "error",
        text: "Please enter your B2B Service or Solution Name in Step 2 before executing market research.",
      });
      return;
    }
    setResearching(true);
    setFeedbackMsg(null);
    const finalIndustry = customIndustry.trim() || industry || "B2B & Enterprise";
    const finalLocation =
      locationMode === "manual"
        ? customLocation.trim() || targetLocation || "Global / Worldwide"
        : targetLocation || customLocation.trim() || "Global / Worldwide";

    setResearchLogs([
      `[Initiating] Connecting to OpenClaw Intelligence Gateway...`,
      `[Querying] Web scraping competitor ad angles for "${serviceName}" in "${finalIndustry}"...`,
    ]);
    try {
      const res = await conductCampaignResearch({
        service_name: serviceName,
        industry: finalIndustry,
        target_location: finalLocation,
        pain_point: painPoint,
        core_offer: coreOffer,
      });

      if (res.competitor_insights) {
        setCompetitorIntel(res.competitor_insights);
      }
      if (res.targeting?.job_titles) {
        setSelectedRoles(res.targeting.job_titles);
      }

      setResearchLogs((prev) => [
        ...prev,
        `[Scraped] Extracted ${res.competitor_insights?.scraped_competitors?.length || 0} active competitor campaigns and market angles.`,
        `[Synthesizing] Generating 3-second video hooks and WhatsApp retargeting copy...`,
      ]);

      const creativeRes = await generateCampaignCreatives({
        service_name: serviceName,
        industry: finalIndustry,
        target_location: finalLocation,
        pain_point: painPoint,
        core_offer: coreOffer,
        competitor_insights: res.competitor_insights,
      });

      if (creativeRes.post1) setPost1(creativeRes.post1);
      if (creativeRes.post2) setPost2(creativeRes.post2);

      setResearchLogs((prev) => [
        ...prev,
        `[Complete] 3-Second Hooks, Cold Video Script, and WhatsApp Offer created.`,
        `[Ready] Advancing to Step 3: Ads Card Preview and Media Studio.`,
      ]);

      setFeedbackMsg({
        type: "success",
        text: "Market intelligence researched via OpenClaw and high-converting creatives successfully generated.",
      });
      setCurrentStep(3);
    } catch (err: any) {
      setResearchLogs((prev) => [
        ...prev,
        `[Error] Research error: ${err.message}`,
      ]);
      setFeedbackMsg({ type: "error", text: `Research error: ${err.message}` });
    } finally {
      setResearching(false);
    }
  };

  const handleGenerateStoryboard = async () => {
    setFeedbackMsg({
      type: "error",
      text: "AI Video Storyboard generation is locked by administrator. Please use Manual Upload to upload your video directly.",
    });
  };

  const handleRegenerateScene = async (sceneNumber: number) => {
    setFeedbackMsg({
      type: "error",
      text: "AI Scene generation is locked by administrator. Please use Manual Upload.",
    });
  };

  const handleStitchVideo = async () => {
    setFeedbackMsg({
      type: "error",
      text: "AI Video stitching is locked by administrator. Please use Manual Upload.",
    });
  };

  const handleGeneratePoster = async () => {
    setFeedbackMsg({
      type: "error",
      text: "AI Poster generation is locked by administrator. Please use Manual Upload to upload your poster directly.",
    });
  };

  const handleManualFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setManualFileName(file.name);
      const url = URL.createObjectURL(file);
      setManualUploadedFile(url);
      if (file.type.includes("video")) {
        setPost1((prev: any) => ({ ...prev, video_url: url }));
      } else {
        setPost2((prev: any) => ({ ...prev, poster_url: url }));
      }
      setFeedbackMsg({
        type: "success",
        text: `Uploaded "${file.name}" successfully! Preview updated in live feed mockup.`,
      });
    }
  };

  const handleReferenceImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setReferenceImageFile(url);
      setReferenceImageDescription(`Custom user hardware/character: ${file.name}`);
      setFeedbackMsg({
        type: "success",
        text: `Reference anchor "${file.name}" locked! All AI video scenes will preserve this visual identity.`,
      });
    }
  };

  const handleSaveAndDeploy = async () => {
    setPublishing(true);
    setFeedbackMsg(null);
    const finalIndustry = customIndustry.trim() || industry || "B2B & Enterprise";
    const finalLocation =
      locationMode === "manual"
        ? customLocation.trim() || targetLocation || "Global / Worldwide"
        : targetLocation || customLocation.trim() || "Global / Worldwide";

    try {
      const campaignPayload = {
        name: `${serviceName} - ${finalIndustry} [2-Step Funnel]`,
        industry: finalIndustry,
        target_location: finalLocation,
        service_name: serviceName,
        pain_point: painPoint,
        core_offer: coreOffer,
        targeting_config: {
          job_titles: selectedRoles,
          behaviors: ["Facebook Business Page Admins", "Business Page Admins"],
          interests: [finalIndustry, "Industrial Automation", "Quality Control"],
          exclusions: selectedExclusions,
          age_min: 25,
          age_max: 65,
        },
        competitor_insights: competitorIntel || {},
        post1_creative: post1,
        post2_creative: post2,
        budget_daily_bdt: budgetDaily,
        retargeting_enabled: true,
        retargeting_threshold_pct: retargetingThreshold,
      };

      const saved = await createMetaCampaign(campaignPayload);
      const publishRes = await publishMetaCampaign(saved.id);
      setActiveCampaign(publishRes.campaign);
      await loadCampaigns();

      setCurrentStep(5);
      setFeedbackMsg({
        type: "success",
        text: "Success! Your 2-Step B2B Meta Ads Funnel is now LIVE on Meta.",
      });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: `Failed to deploy campaign: ${err.message}` });
    } finally {
      setPublishing(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!activeCampaign) return;
    try {
      const res = await toggleMetaCampaignStatus(activeCampaign.id);
      setActiveCampaign((prev) => (prev ? { ...prev, status: res.status } : null));
      await loadCampaigns();
      setFeedbackMsg({
        type: "success",
        text: `Campaign status changed to ${res.status}`,
      });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: "Failed to toggle status: " + err.message });
    }
  };

  const handleToggleAnyCampaignStatus = async (cmpId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await toggleMetaCampaignStatus(cmpId);
      setCampaignHistory((prev) =>
        prev.map((c) => (c.id === cmpId ? { ...c, status: res.status } : c))
      );
      if (activeCampaign?.id === cmpId) {
        setActiveCampaign((prev) => (prev ? { ...prev, status: res.status } : null));
      }
      setFeedbackMsg({
        type: "success",
        text: `Campaign status changed to ${res.status}`,
      });
    } catch (err: any) {
      setFeedbackMsg({ type: "error", text: "Failed to toggle status: " + err.message });
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition relative overflow-hidden group">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-400">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-sky-400 font-semibold">
                  Card 1: Organic Discovery
                </span>
                <h3 className="text-base font-bold text-white">Autonomous Lead Finder</h3>
              </div>
            </div>
            <span className="text-xs bg-slate-800 text-slate-400 px-2 py-1 rounded-full font-mono">
              Organic $0
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-400 leading-relaxed">
            Crawls OpenStreetMap, verified business directories, and corporate websites to build enriched databases with 135 technical audit parameters.
          </p>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-slate-800/80">
            <span className="text-xs text-slate-500">Autonomous Web Auditing</span>
            <Link
              href="/research"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-400 hover:text-sky-300 transition"
            >
              <span>Launch Lead Discovery</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-gradient-to-br from-pink-950/40 via-purple-950/20 to-slate-900/80 border-2 border-pink-500/40 shadow-lg shadow-pink-500/10 relative overflow-hidden">
          <div className="absolute -top-12 -right-12 w-32 h-32 bg-pink-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Megaphone className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-mono uppercase tracking-wider text-pink-400 font-semibold flex items-center gap-1.5">
                  <Flame className="w-3.5 h-3.5 text-pink-400 animate-pulse" />
                  Card 2: Custom B2B Ads (Active)
                </span>
                <h3 className="text-base font-bold text-white">B2B Meta Ads & Retargeting Hub</h3>
              </div>
            </div>
            <span className="text-xs bg-pink-500/20 border border-pink-500/30 text-pink-300 px-2.5 py-0.5 rounded-full font-semibold">
              2-Step Funnel
            </span>
          </div>
          <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
            Zero reliance on static contact lists. Targets custom B2B audiences with high-impact problem-solving video ads and auto-retargets 50%+ viewers to WhatsApp.
          </p>
          <div className="mt-4 flex items-center justify-between pt-3 border-t border-pink-500/20">
            <div className="flex items-center gap-2 text-xs text-pink-300/80 font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              OpenClaw Intel + LLM + Google Video AI
            </div>
            <button
              onClick={() => setCurrentStep(1)}
              className="inline-flex items-center gap-1 text-xs font-semibold text-pink-300 hover:text-white transition"
            >
              <span>5-Step Workflow</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-3 sm:p-4 backdrop-blur-md">
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
          {[
            { num: 1, label: "Audience & Territory", icon: Users },
            { num: 2, label: "Service & Offer", icon: Building2 },
            { num: 3, label: "Media & Creatives", icon: Sparkles },
            { num: 4, label: "Budget & Funnel", icon: DollarSign },
            { num: 5, label: "Live Tracking", icon: TrendingUp },
          ].map((s) => {
            const Icon = s.icon;
            const isCompleted = currentStep > s.num;
            const isCurrent = currentStep === s.num;
            return (
              <button
                key={s.num}
                onClick={() => setCurrentStep(s.num)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2 px-1 sm:px-3 rounded-xl transition text-center ${
                  isCurrent
                    ? "bg-pink-500 text-white font-bold shadow-md shadow-pink-500/20"
                    : isCompleted
                    ? "bg-slate-800/80 text-emerald-400 font-medium"
                    : "bg-slate-950/40 text-slate-500 hover:text-slate-300"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                    isCurrent
                      ? "bg-white text-slate-950 font-black"
                      : isCompleted
                      ? "bg-emerald-400 text-slate-950 font-bold"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {isCompleted ? <Check className="w-3 h-3 stroke-[3]" /> : s.num}
                </div>
                <span className="text-[10px] sm:text-xs truncate max-w-[85px] sm:max-w-none">
                  {s.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border text-xs sm:text-sm flex items-center justify-between ${
            feedbackMsg.type === "success"
              ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-300"
              : "bg-rose-950/40 border-rose-500/30 text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className="text-slate-400 hover:text-white p-1 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {currentStep === 1 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-pink-400 text-xs font-mono uppercase tracking-wider">
              <span>Step 1 of 5</span> | <span>Custom B2B Audience Configuration</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Who are your corporate decision makers & where are they located?
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Configure precision Meta targeting using executive job titles, business page admin behaviors, and strict negative exclusions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                1. Target Industry
              </label>
              <div className="space-y-2">
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-pink-500 transition"
                >
                  <option value="">-- Select Target Industry --</option>
                  {PRESET_INDUSTRIES.map((ind) => (
                    <option key={ind} value={ind}>
                      {ind}
                    </option>
                  ))}
                  <option value="custom">-- Custom Industry (Type your own) --</option>
                </select>

                {industry === "custom" && (
                  <input
                    type="text"
                    placeholder="e.g. Precision CNC Machining, Cold Storage Logistics, FinTech SaaS..."
                    value={customIndustry}
                    onChange={(e) => setCustomIndustry(e.target.value)}
                    className="w-full bg-slate-950 border border-pink-500/50 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-pink-400"
                  />
                )}
              </div>

              <div className="pt-2 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    2. Geography & Industrial Territory
                  </label>
                  <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setLocationMode("preset")}
                      className={`px-2 py-0.5 rounded-md transition ${
                        locationMode === "preset"
                          ? "bg-pink-500/20 text-pink-300 font-medium"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Dropdown Presets
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocationMode("manual")}
                      className={`px-2 py-0.5 rounded-md transition ${
                        locationMode === "manual"
                          ? "bg-pink-500/20 text-pink-300 font-medium"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Manual Input
                    </button>
                  </div>
                </div>

                {locationMode === "preset" ? (
                  <div className="space-y-1.5">
                    <select
                      value={targetLocation}
                      onChange={(e) => {
                        if (e.target.value === "custom") {
                          setLocationMode("manual");
                        } else {
                          setTargetLocation(e.target.value);
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-pink-500 transition"
                    >
                      <option value="">-- Select Target Territory / Location --</option>
                      {PRESET_LOCATIONS.map((loc) => (
                        <option key={loc} value={loc}>
                          {loc}
                        </option>
                      ))}
                      <option value="custom">-- Custom Territory (Type your own manually) --</option>
                    </select>
                    <div className="flex justify-between items-center text-[11px] text-slate-500 px-1">
                      <span>Choose from high-performing B2B economic regions</span>
                      <button
                        type="button"
                        onClick={() => setLocationMode("manual")}
                        className="text-pink-400 hover:text-pink-300 font-medium transition"
                      >
                        + Type Manually
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <input
                      type="text"
                      placeholder="e.g. United States (California & Texas), Germany, Dubai Industrial City, London..."
                      value={customLocation}
                      onChange={(e) => setCustomLocation(e.target.value)}
                      className="w-full bg-slate-950 border border-pink-500/50 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-pink-400"
                    />
                    <div className="flex justify-between items-center text-[11px] text-slate-500 px-1">
                      <span>Specify any city, state, country, or custom industrial trade cluster</span>
                      <button
                        type="button"
                        onClick={() => setLocationMode("preset")}
                        className="text-slate-400 hover:text-slate-200 underline transition"
                      >
                        Switch to Dropdown
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-5">

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                    3. Executive & Decision Maker Job Titles
                  </label>
                  <span className="text-[11px] text-pink-400 font-mono">
                    {selectedRoles.length} Selected
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value && !selectedRoles.includes(e.target.value)) {
                        setSelectedRoles([...selectedRoles, e.target.value]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-pink-500 transition"
                  >
                    <option value="">-- Add Job Title from Dropdown --</option>
                    {PRESET_JOB_ROLES.map((role) => (
                      <option key={role} value={role} disabled={selectedRoles.includes(role)}>
                        {role} {selectedRoles.includes(role) ? "(Added)" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Type custom title (e.g. Chief Architect)..."
                      value={customRoleInput}
                      onChange={(e) => setCustomRoleInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomRole();
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomRole}
                      className="px-3.5 py-2 bg-pink-500 hover:bg-pink-600 text-white rounded-xl text-xs font-semibold shrink-0 transition"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  {selectedRoles.map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className="text-xs px-2.5 py-1.5 rounded-lg border bg-pink-500/20 border-pink-500 text-pink-300 font-medium hover:bg-rose-500/20 hover:border-rose-500 hover:text-rose-300 transition flex items-center gap-1.5 group"
                      title="Click to remove"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-400 group-hover:bg-rose-400" />
                      <span>{role}</span>
                      <X className="w-3 h-3 text-pink-400 group-hover:text-rose-300 ml-0.5" />
                    </button>
                  ))}
                  {selectedRoles.length === 0 && (
                    <span className="text-xs text-slate-500 italic">
                      No job roles selected yet. Add from dropdown or type custom title above.
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-amber-500/20 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>Smart Exclusions (Eliminates Wasted Ad Spend)</span>
                  </div>
                  <span className="text-[11px] text-rose-400 font-mono">
                    {selectedExclusions.length} Excluded
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select
                    onChange={(e) => {
                      if (e.target.value && !selectedExclusions.includes(e.target.value)) {
                        setSelectedExclusions([...selectedExclusions, e.target.value]);
                      }
                      e.target.value = "";
                    }}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-amber-500 transition"
                  >
                    <option value="">-- Add Exclusion Category from Dropdown --</option>
                    {PRESET_EXCLUSIONS.map((ex) => (
                      <option key={ex} value={ex} disabled={selectedExclusions.includes(ex)}>
                        {ex} {selectedExclusions.includes(ex) ? "(Added)" : ""}
                      </option>
                    ))}
                  </select>

                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder="Type custom exclusion (e.g. Freelancers)..."
                      value={customExclusionInput}
                      onChange={(e) => setCustomExclusionInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddCustomExclusion();
                        }
                      }}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-rose-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomExclusion}
                      className="px-3.5 py-2 bg-rose-500/80 hover:bg-rose-600 text-white rounded-xl text-xs font-semibold shrink-0 transition"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1">
                  {selectedExclusions.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => handleToggleExclusion(ex)}
                      className="text-[11px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md hover:bg-rose-500/25 transition flex items-center gap-1 group"
                      title="Click to remove exclusion"
                    >
                      <X className="w-3 h-3" />
                      <span>{ex}</span>
                    </button>
                  ))}
                  {selectedExclusions.length === 0 && (
                    <span className="text-xs text-slate-500 italic">
                      No exclusions configured. All audiences eligible.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs pb-2 border-b border-slate-800">
              <span className="font-bold text-slate-300 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-pink-400" />
                <span>Step 1 Live Output: Targeting Specification</span>
              </span>
              <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded">
                Targeting Ready
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Industry & Geo</div>
                <div className="font-semibold text-white truncate mt-0.5">
                  {customIndustry.trim() || industry || "B2B & Enterprise"}
                </div>
                <div className="text-[10px] text-pink-400 truncate mt-0.5 flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-pink-400 inline shrink-0" />
                  <span>{locationMode === "manual" ? customLocation.trim() || "Global" : targetLocation || "Global"}</span>
                </div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Decision Maker Roles</div>
                <div className="font-bold text-emerald-400 text-sm mt-0.5">
                  {selectedRoles.length} Roles Active
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  {selectedRoles.slice(0, 2).join(", ")} {selectedRoles.length > 2 ? `+${selectedRoles.length - 2} more` : ""}
                </div>
              </div>
              <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/80">
                <div className="text-[10px] text-slate-400 uppercase font-mono">Negative Filter / Shield</div>
                <div className="font-bold text-rose-400 text-sm mt-0.5">
                  {selectedExclusions.length} Negative Groups
                </div>
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  Budget saved from non-buyers
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-800">
            <button
              onClick={() => setCurrentStep(2)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs shadow-lg shadow-pink-500/20 transition"
            >
              <span>Next: Service & Value Proposition</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {currentStep === 2 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-pink-400 text-xs font-mono uppercase tracking-wider">
              <span>Step 2 of 5</span> | <span>Service & Irresistible Offer</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              What corporate bottleneck do you solve and why should they book a demo?
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              State your core B2B service and customer pain points. OpenClaw uses this to scrape winning competitor ad hooks in Meta Ad Library.
            </p>
          </div>

          {/* Quick-Fill Preset Dropdown */}
          <div className="bg-slate-950/80 border border-purple-500/30 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-purple-300 uppercase tracking-wide flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                <span>Quick-Fill Solution Preset (Optional)</span>
              </label>
              {selectedPresetId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPresetId("");
                    setServiceName("");
                    setPainPoint("");
                    setCoreOffer("");
                  }}
                  className="text-[10px] text-slate-400 hover:text-rose-400 transition"
                >
                  Clear Fields
                </button>
              )}
            </div>
            <select
              value={selectedPresetId}
              onChange={(e) => {
                const pId = e.target.value;
                setSelectedPresetId(pId);
                const found = B2B_SOLUTION_PRESETS.find((p) => p.id === pId);
                if (found) {
                  setServiceName(found.serviceName);
                  setPainPoint(found.painPoint);
                  setCoreOffer(found.coreOffer);
                  if (!customIndustry && (!industry || industry === "B2B & Enterprise")) {
                    setIndustry(found.industry);
                  }
                }
              }}
              className="w-full bg-slate-900 border border-slate-700 hover:border-purple-500/50 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-pink-500 transition cursor-pointer"
            >
              <option value="">-- Choose a Solution Template to Auto-Fill (or Type Custom Below) --</option>
              {B2B_SOLUTION_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-0.5">
              <span>Selecting a template auto-populates the 3 fields below. You can freely edit them anytime.</span>
              {selectedPresetId && (
                <span className="text-emerald-400 font-mono text-[10px] flex items-center gap-1">
                  <Check className="w-3 h-3" /> Auto-filled
                </span>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                B2B Service or Solution Name
              </label>
              <input
                type="text"
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="e.g. Enterprise Automation / Cloud Cost Optimization / Industrial Inspection"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-pink-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                Client&apos;s Core Bottleneck & Financial Loss (Pain Point)
              </label>
              <textarea
                rows={2}
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
                placeholder="e.g. What operational friction, manual bottlenecks, or revenue leaks does your solution solve?"
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                Irresistible B2B Offer & Guarantee
              </label>
              <textarea
                rows={2}
                value={coreOffer}
                onChange={(e) => setCoreOffer(e.target.value)}
                placeholder="e.g. Free 14-Day Pilot / Live On-Site Proof of Concept / Risk-Free Assessment..."
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setCurrentStep(1)}
              className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous Step</span>
            </button>
            <button
              onClick={handleRunOpenClawAndLLM}
              disabled={researching}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold text-xs shadow-lg shadow-pink-500/20 transition disabled:opacity-50"
            >
              {researching ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>OpenClaw scraping competitor ad angles & synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Run OpenClaw Spy & Generate Creatives</span>
                </>
              )}
            </button>
          </div>

          {(researching || researchLogs.length > 0) && (
            <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/30 space-y-3 font-mono">
              <div className="flex items-center justify-between pb-2 border-b border-purple-500/20">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${researching ? "bg-emerald-400" : "bg-purple-400"} opacity-75`}></span>
                    <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${researching ? "bg-emerald-500" : "bg-purple-500"}`}></span>
                  </span>
                  <span className="text-xs font-bold text-white tracking-wide">
                    {researching ? "OpenClaw Live Research in Progress..." : "OpenClaw Live Output Stream"}
                  </span>
                </div>
                <span className="text-[10px] text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  Protocol: Gateway WebSocket & Live Web Spy
                </span>
              </div>

              <div className="space-y-1.5 text-[11px] max-h-48 overflow-y-auto pr-1">
                {researchLogs.map((log, i) => (
                  <div key={i} className="text-slate-300 flex items-start gap-2">
                    <span className="text-purple-400 select-none">&gt;</span>
                    <span className={log.includes("Complete") || log.includes("Ready") || log.includes("Scraped") ? "text-emerald-400 font-semibold" : "text-slate-300"}>
                      {log}
                    </span>
                  </div>
                ))}
              </div>

              {!researching && competitorIntel && (
                <div className="pt-2 border-t border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400 inline" />
                    <span>Intelligence Pulled: {competitorIntel?.scraped_competitors?.length || 0} competitors, {competitorIntel?.winning_angles?.length || 0} angles</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    <span>Inspect Output in Ads Card (Step 3)</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {currentStep === 3 && (
        <div className="space-y-6">

          <div className="bg-slate-900/90 border border-purple-500/30 rounded-2xl p-5 sm:p-6 relative overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-purple-500/20">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
                  <Search className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    OpenClaw Competitor & Ad Library Intelligence
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full font-mono">
                      Live Intelligence
                    </span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Real-time market intelligence scraped from active competitor campaigns in this vertical:
                  </p>
                </div>
              </div>

              {competitorIntel && (
                <button
                  type="button"
                  onClick={() => setShowRawIntel(!showRawIntel)}
                  className="text-[11px] bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 px-3 py-1.5 rounded-lg transition font-mono flex items-center gap-1.5 cursor-pointer"
                >
                  <Search className="w-3 h-3 text-purple-400" />
                  <span>{showRawIntel ? "Hide Raw Data" : "Inspect Raw Scraped JSON"}</span>
                </button>
              )}
            </div>

            {showRawIntel && competitorIntel && (
              <div className="mt-4 p-3.5 rounded-xl bg-slate-950 border border-purple-500/30 space-y-1.5">
                <div className="flex items-center justify-between text-[11px] font-mono text-purple-300 border-b border-purple-500/20 pb-1.5">
                  <span className="font-bold uppercase tracking-wider">Raw OpenClaw Intelligence Payload:</span>
                  <span className="text-slate-500">Live JSON Feed</span>
                </div>
                <pre className="text-[10px] text-slate-300 font-mono leading-relaxed max-h-60 overflow-y-auto whitespace-pre-wrap pr-1">
                  {JSON.stringify(competitorIntel, null, 2)}
                </pre>
              </div>
            )}

            {competitorIntel ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                    Active Competitor Ads & Tested Hooks:
                  </h4>
                  <div className="space-y-2">
                    {(competitorIntel?.scraped_competitors || []).map((comp: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{comp.brand_or_domain}</span>
                          <span className="text-[10px] text-emerald-400 font-mono">
                            Active for {comp.days_running} days
                          </span>
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          <strong className="text-slate-300">Hook:</strong> &ldquo;{comp.video_hook}&rdquo;
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          <strong className="text-slate-300">Offer:</strong> {comp.core_offer}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-semibold text-purple-300 uppercase tracking-wide">
                    Proven Market Winning Angles:
                  </h4>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2 text-xs">
                    {(competitorIntel?.winning_angles || []).map((angle: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-slate-300 text-[11px]">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                        <span>{angle}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="mt-4 p-5 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center">
                <Sparkles className="w-5 h-5 text-purple-400 mx-auto mb-1.5 opacity-70" />
                <p className="text-xs text-slate-300 font-medium">No Competitor Intel Scraped Yet</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Run Step 2 &ldquo;Run OpenClaw Spy &amp; Generate Creatives&rdquo; to pull real-time competitor angles and hooks for your business.
                </p>
              </div>
            )}
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Film className="w-4 h-4 text-pink-400" />
                  <span>Media Production Studio (Video / Image Asset)</span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Select how you want to produce your Post 1 video and Post 2 creative asset:
                </p>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
                <button
                  type="button"
                  onClick={() =>
                    setFeedbackMsg({
                      type: "error",
                      text: "AI Video (Google Veo) generation is locked by administrator. Please use Manual Upload below.",
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-900/50 border border-slate-800 cursor-not-allowed opacity-60 hover:border-amber-500/30 transition"
                  title="AI Video generation is locked by administrator"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Video (Veo)</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-mono">Locked</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setFeedbackMsg({
                      type: "error",
                      text: "AI Poster (Imagen 3) generation is locked by administrator. Please use Manual Upload below.",
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 bg-slate-900/50 border border-slate-800 cursor-not-allowed opacity-60 hover:border-amber-500/30 transition"
                  title="AI Poster generation is locked by administrator"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>AI Poster (Imagen)</span>
                  <span className="text-[9px] bg-amber-500/20 text-amber-300 px-1 py-0.5 rounded font-mono">Locked</span>
                </button>

                <button
                  type="button"
                  onClick={() => setMediaMode("manual_upload")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/20"
                >
                  <UploadCloud className="w-3.5 h-3.5" />
                  <span>Manual Upload (Active)</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  <strong>AI Media Generation Locked:</strong> AI Video and Poster generation has been locked by administrator. Please upload your custom MP4 video or PNG/JPG creative banner below.
                </span>
              </div>
            </div>

            {mediaMode === "manual_upload" && (
              <div className="p-6 rounded-2xl bg-slate-950/80 border-2 border-dashed border-slate-800 hover:border-slate-700 transition text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-white">Upload Your Own Video (MP4) or Poster (PNG/JPG)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Drag and drop your camera recording, demo clip, or graphic banner here
                  </p>
                </div>
                <div>
                  <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold cursor-pointer shadow-lg shadow-pink-500/20 transition">
                    <UploadCloud className="w-4 h-4" />
                    <span>Choose File from Computer</span>
                    <input
                      type="file"
                      accept="video/mp4,image/png,image/jpeg,image/webp"
                      onChange={handleManualFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                {manualFileName && (
                  <div className="text-xs text-emerald-400 font-mono mt-2 flex items-center justify-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Active file: {manualFileName}</span>
                  </div>
                )}
              </div>
            )}

            {mediaMode === "ai_video" && (
              <div className="space-y-4">

                <div className="p-4 rounded-xl bg-slate-950 border border-purple-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 shrink-0">
                      <Camera className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white flex items-center gap-2">
                        Character & Hardware Consistency Anchor
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded font-mono">
                          Image-to-Video
                        </span>
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        Upload a photo of your actual product, hardware, or spokesperson to lock 100% visual consistency across all video scenes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium border border-slate-700 cursor-pointer transition">
                      <Camera className="w-3.5 h-3.5 text-purple-400" />
                      <span>{referenceImageFile ? "Change Anchor Photo" : "Upload Anchor Photo"}</span>
                      <input type="file" accept="image/*" onChange={handleReferenceImageUpload} className="hidden" />
                    </label>
                    {referenceImageFile && (
                      <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1">
                        <Lock className="w-3 h-3 text-emerald-400" />
                        <span>Locked</span>
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-slate-300 uppercase tracking-wide">
                      Select Video Storyline Topic
                    </label>
                    <span className="text-[10px] text-slate-500">
                      OpenClaw market-tested angles vs custom
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { id: "roi_breakdown", label: "Financial Loss & ROI Breakdown", badge: "Highest ROI" },
                      { id: "speed_challenge", label: "Manual vs Automated Speed Challenge", badge: "High Engagement" },
                      { id: "zero_chargeback", label: "Quality Assurance & Risk Elimination", badge: "Compliance" },
                    ].map((top) => (
                      <label
                        key={top.id}
                        className={`flex flex-col p-3 rounded-xl border cursor-pointer transition text-xs ${
                          storyboardTopic === top.id
                            ? "bg-pink-500/10 border-pink-500 text-white font-medium"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <input
                            type="radio"
                            name="storyboard_top"
                            checked={storyboardTopic === top.id}
                            onChange={() => setStoryboardTopic(top.id)}
                            className="accent-pink-500"
                          />
                          <span className="text-[9px] bg-slate-800 text-slate-300 px-1.5 py-0.5 rounded font-mono">
                            {top.badge}
                          </span>
                        </div>
                        <span>{top.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="pt-1 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStoryboardTopic("custom")}
                      className={`text-xs ${
                        storyboardTopic === "custom" ? "text-pink-400 font-bold" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      + Or write your own custom storyline topic
                    </button>
                    <button
                      type="button"
                      onClick={handleGenerateStoryboard}
                      disabled={generatingStoryboard}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold text-xs transition disabled:opacity-50"
                    >
                      {generatingStoryboard ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Generating 4-Scene Storyboard...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5" />
                          <span>Generate 4 Scenes with Google AI</span>
                        </>
                      )}
                    </button>
                  </div>

                  {storyboardTopic === "custom" && (
                    <input
                      type="text"
                      placeholder="e.g. Demonstration of operational efficiency, cost reduction, or live software demo..."
                      value={customTopicText}
                      onChange={(e) => setCustomTopicText(e.target.value)}
                      className="w-full bg-slate-900 border border-pink-500/50 rounded-xl px-3 py-2 text-xs text-white"
                    />
                  )}
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide flex items-center gap-2">
                      <Layers className="w-4 h-4 text-pink-400" />
                      <span>Scene-by-Scene Multi-Part Commercial Storyboard</span>
                    </h4>
                    <button
                      type="button"
                      onClick={handleStitchVideo}
                      disabled={stitchingVideo || storyboardScenes.length === 0}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-pink-500 to-purple-600 text-white font-bold text-xs shadow-md shadow-pink-500/20 transition disabled:opacity-50"
                    >
                      {stitchingVideo ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Stitching Scenes via FFmpeg...</span>
                        </>
                      ) : (
                        <>
                          <Film className="w-3.5 h-3.5" />
                          <span>Stitch & Render Master Ad Video</span>
                        </>
                      )}
                    </button>
                  </div>

                  {storyboardScenes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {storyboardScenes.map((scene) => (
                        <div
                          key={scene.scene_number}
                          className="bg-slate-950 border border-slate-800 rounded-xl p-3 flex flex-col justify-between space-y-2 relative group hover:border-slate-700 transition"
                        >
                          <div>
                            <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                              <span className="text-[10px] font-mono text-pink-400 font-bold">
                                Scene {scene.scene_number} ({scene.duration_seconds}s)
                              </span>
                              <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded font-mono">
                                {scene.status}
                              </span>
                            </div>
                            <h5 className="text-xs font-semibold text-white mt-1 line-clamp-1">{scene.scene_name}</h5>
                            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 italic">
                              &ldquo;{scene.narration}&rdquo;
                            </p>
                          </div>

                          <div className="space-y-2 pt-2 border-t border-slate-800/80">
                            <button
                              type="button"
                              onClick={() =>
                                setStoryboardScenes((prev) =>
                                  prev.map((s) =>
                                    s.scene_number === scene.scene_number ? { ...s, show_prompt: !s.show_prompt } : s
                                  )
                                )
                              }
                              className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center justify-between w-full"
                            >
                              <span>View / Edit Prompt</span>
                              {scene.show_prompt ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                            </button>

                            {scene.show_prompt && (
                              <textarea
                                rows={3}
                                value={scene.prompt}
                                onChange={(e) =>
                                  setStoryboardScenes((prev) =>
                                    prev.map((s) =>
                                      s.scene_number === scene.scene_number ? { ...s, prompt: e.target.value } : s
                                    )
                                  )
                                }
                                className="w-full bg-slate-900 border border-slate-800 rounded p-1.5 text-[9px] text-slate-300 font-mono"
                              />
                            )}

                            <button
                              type="button"
                              onClick={() => handleRegenerateScene(scene.scene_number)}
                              disabled={renderingSceneNum === scene.scene_number}
                              className="w-full py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 font-medium border border-slate-800 flex items-center justify-center gap-1 transition"
                            >
                              {renderingSceneNum === scene.scene_number ? (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                                  <span>Rendering...</span>
                                </>
                              ) : (
                                <>
                                  <RefreshCw className="w-2.5 h-2.5" />
                                  <span>Regenerate Scene {scene.scene_number}</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-6 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 text-center">
                      <Film className="w-6 h-6 text-pink-500/50 mx-auto mb-2" />
                      <p className="text-xs text-slate-300 font-semibold">No Storyboard Scenes Generated Yet</p>
                      <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        Select a storyline topic above and click &ldquo;Generate 4 Scenes with Google AI&rdquo; to build your commercial storyboard.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {mediaMode === "ai_poster" && (
              <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-white flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-sky-400" />
                      <span>Google Imagen 3 Promotional Poster Generator</span>
                    </h4>
                    <p className="text-[11px] text-slate-400">
                      Creates an ultra-crisp, high-converting B2B promotional poster image for Post 2 (WhatsApp CTA).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleGeneratePoster}
                    disabled={generatingPoster}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-semibold text-xs shadow-md transition disabled:opacity-50"
                  >
                    {generatingPoster ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Rendering Imagen 3 Poster...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Generate Poster with Google Imagen</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                      Poster Headline
                    </label>
                    <input
                      type="text"
                      value={post2.offer_headline}
                      onChange={(e) => setPost2({ ...post2, offer_headline: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
                      Offer Description
                    </label>
                    <input
                      type="text"
                      value={post2.offer_description}
                      onChange={(e) => setPost2({ ...post2, offer_description: e.target.value })}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-white"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            <div className="lg:col-span-7 bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPreviewTab("post1")}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                      previewTab === "post1"
                        ? "bg-pink-500 text-white"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Post 1 (Cold Video Hook - Awareness)
                  </button>
                  <button
                    onClick={() => setPreviewTab("post2")}
                    className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition ${
                      previewTab === "post2"
                        ? "bg-emerald-500 text-slate-950"
                        : "bg-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    Post 2 (50%+ Retargeting - WhatsApp CTA)
                  </button>
                </div>
              </div>

              {previewTab === "post1" ? (
                <div className="space-y-4 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                      Select Top 3-Second Hook
                    </label>
                    <div className="space-y-2">
                      {post1.hooks && post1.hooks.length > 0 ? (
                        post1.hooks.map((hook: string, idx: number) => (
                          <label
                            key={idx}
                            className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                              post1.selected_hook === hook
                                ? "bg-pink-500/10 border-pink-500 text-white font-medium"
                                : "bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700"
                            }`}
                          >
                            <input
                              type="radio"
                              name="hook"
                              checked={post1.selected_hook === hook}
                              onChange={() => setPost1({ ...post1, selected_hook: hook })}
                              className="mt-0.5 accent-pink-500"
                            />
                            <span>{hook}</span>
                          </label>
                        ))
                      ) : (
                        <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-400 text-xs text-center">
                          Hooks will be generated once you run Step 2 research, or you can write a custom primary copy below.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                      Primary Feed Copy
                    </label>
                    <textarea
                      rows={3}
                      value={post1.primary_copy}
                      onChange={(e) => setPost1({ ...post1, primary_copy: e.target.value })}
                      placeholder="e.g. Streamline your operations with our high-precision enterprise solution..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                      Visual Video Script (45-60s)
                    </label>
                    <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap">
                      {post1.cold_video_script || "No video script generated yet. Run Step 2 to generate tailored script or build scenes above."}
                    </pre>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-[11px]">
                    <strong>Smart Retargeting Rule:</strong> This offer ad is displayed only to prospects who watched 50%+ of Post 1 video.
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                      Retargeting Copy
                    </label>
                    <textarea
                      rows={3}
                      value={post2.retargeting_copy}
                      onChange={(e) => setPost2({ ...post2, retargeting_copy: e.target.value })}
                      placeholder="e.g. You saw how our solution works. Now experience it directly inside your workflow..."
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                      Offer Headline
                    </label>
                    <input
                      type="text"
                      value={post2.offer_headline}
                      onChange={(e) => setPost2({ ...post2, offer_headline: e.target.value })}
                      placeholder="e.g. Free 14-Day Live Proof-of-Concept Pilot"
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                        Business WhatsApp Number
                      </label>
                      <input
                        type="text"
                        value={post2.whatsapp_number}
                        onChange={(e) => setPost2({ ...post2, whatsapp_number: e.target.value })}
                        placeholder="e.g. +14155552671"
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white font-mono focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-slate-300 uppercase tracking-wide mb-1.5">
                        Pre-typed WhatsApp Prompt
                      </label>
                      <input
                        type="text"
                        value={post2.prefill_message}
                        onChange={(e) => setPost2({ ...post2, prefill_message: e.target.value })}
                        placeholder="e.g. Hello, I watched your demo and want to request a free pilot."
                        className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-[11px] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  onClick={() => setCurrentStep(2)}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Previous Step</span>
                </button>
                <button
                  onClick={() => setCurrentStep(4)}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs shadow-lg shadow-pink-500/20"
                >
                  <span>Next: Budget & Funnel</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 flex flex-col items-center">
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Smartphone className="w-4 h-4 text-pink-400" />
                <span>Live Meta Mobile Feed Preview</span>
              </div>

              <div className="w-full max-w-[340px] bg-slate-950 border-4 border-slate-800 rounded-[36px] p-3 shadow-2xl shadow-black/80 relative overflow-hidden">

                <div className="w-20 h-3 bg-slate-800 rounded-full mx-auto mb-3" />

                <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden text-xs">

                  <div className="p-3 flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center font-bold text-white text-xs">
                      AI
                    </div>
                    <div>
                      <div className="font-bold text-white flex items-center gap-1">
                        <span>{(serviceName?.trim() ? serviceName.trim().split(" ")[0] : "B2B")} Solutions</span>
                        <Check className="w-3 h-3 text-sky-400" />
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                        <span>Sponsored</span>
                        <span>-</span>
                        <Globe className="w-2.5 h-2.5 text-slate-400" />
                      </div>
                    </div>
                  </div>

                  <div className="px-3 pb-2 text-[11px] text-slate-200 line-clamp-3 leading-relaxed">
                    {(previewTab === "post1" ? post1.primary_copy : post2.retargeting_copy) ||
                      "Enter your campaign copy or generate with AI to preview in live mobile feed..."}
                  </div>

                  <div className="relative aspect-video bg-slate-950 flex flex-col items-center justify-center overflow-hidden border-y border-slate-800">
                    {previewTab === "post1" ? (
                      post1.video_url ? (
                        <video
                          src={post1.video_url}
                          controls
                          autoPlay
                          muted
                          loop
                          playsInline
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="p-4 text-center">
                          <Play className="w-10 h-10 text-pink-500 mx-auto mb-2" />
                          <span className="text-[11px] font-bold text-white">
                            &ldquo;{post1.selected_hook || "3-Second Video Hook"}&rdquo;
                          </span>
                        </div>
                      )
                    ) : post2.poster_url ? (
                      <div className="relative w-full h-full">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={post2.poster_url}
                          alt="B2B Offer Poster"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex flex-col justify-end p-2.5">
                          <span className="text-xs font-bold text-white">
                            {post2.offer_headline || "B2B Offer"}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center">
                        <MessageSquare className="w-8 h-8 text-emerald-400 mx-auto mb-1" />
                        <span className="text-xs font-bold text-emerald-400">
                          {post2.offer_headline || "Connect on WhatsApp"}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="p-3 bg-slate-950/80 flex items-center justify-between">
                    <div className="text-[11px] truncate max-w-[150px]">
                      <div className="text-[9px] uppercase tracking-wider text-slate-500 font-mono">
                        {previewTab === "post1" ? "Video View Ad" : "WhatsApp Direct"}
                      </div>
                      <div className="font-bold text-white truncate">
                        {(previewTab === "post1" ? post1.headline : post2.offer_headline) || "B2B Campaign"}
                      </div>
                    </div>

                    {previewTab === "post1" ? (
                      <span className="px-3 py-1.5 rounded-lg bg-slate-800 text-white font-semibold text-[10px]">
                        Watch Video
                      </span>
                    ) : (
                      <button className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-[10px] flex items-center gap-1 shadow-md shadow-emerald-500/30">
                        <MessageSquare className="w-3 h-3 fill-slate-950" />
                        <span>WhatsApp</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {currentStep === 4 && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 sm:p-7 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-pink-400 text-xs font-mono uppercase tracking-wider">
              <span>Step 4 of 5</span> | <span>Budget & 2-Step Funnel Configuration</span>
            </div>
            <h2 className="text-xl font-bold text-white mt-1">
              Daily Advertising Budget & 2-Step Video Retargeting Rules
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Allocate your budget between cold video awareness and high-converting WhatsApp lead retargeting.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <div className="space-y-4">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide">
                Daily Budget (USD $)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[15, 30, 50].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setBudgetDaily(amt)}
                    className={`py-3 rounded-xl border text-center transition ${
                      budgetDaily === amt
                        ? "bg-pink-500/20 border-pink-500 text-pink-300 font-bold"
                        : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                    }`}
                  >
                    <div className="text-sm font-mono">${amt}</div>
                    <div className="text-[10px] text-slate-500">per day</div>
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Or enter custom daily budget ($):</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-2 text-slate-500 font-mono text-xs">$</span>
                  <input
                    type="number"
                    value={budgetDaily}
                    onChange={(e) => setBudgetDaily(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3.5 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="pt-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wide mb-2">
                  Retargeting Watch Threshold (% of Post 1 watched)
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[50, 75, 95].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setRetargetingThreshold(pct)}
                      className={`py-2 rounded-xl border text-xs font-medium transition ${
                        retargetingThreshold === pct
                          ? "bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold"
                          : "bg-slate-950 border-slate-800 text-slate-400"
                      }`}
                    >
                      {pct}%+ Viewed
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-2">
                  (Recommended: 50% threshold isolates high-intent corporate decision makers)
                </p>
              </div>
            </div>

            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4">
              <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-pink-400" />
                <span>Automated 2-Step Budget Allocation:</span>
              </h4>

              <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-pink-400">Step 1: Cold Video ThruPlay Awareness</span>
                  <span className="text-[11px] font-mono text-slate-300">60% Budget (${(budgetDaily * 0.6).toFixed(1)}/day)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Meta reaches corporate decision makers at low cost (~$0.02 - $0.05 per 15s ThruPlay view).
                </p>
              </div>

              <div className="flex items-center justify-center gap-2 text-xs font-mono text-emerald-400">
                <span>Automatic Retargeting Filter: {retargetingThreshold}%+ Video Watchers</span>
              </div>

              <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400">Step 2: WhatsApp Lead Retargeting</span>
                  <span className="text-[11px] font-mono text-slate-300">40% Budget (${(budgetDaily * 0.4).toFixed(1)}/day)</span>
                </div>
                <p className="text-[11px] text-slate-300">
                  Only engaged viewers see the &ldquo;Free Live Trial&rdquo; offer and direct WhatsApp chat button.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <button
              onClick={() => setCurrentStep(3)}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous Step</span>
            </button>
            <button
              onClick={handleSaveAndDeploy}
              disabled={publishing}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-emerald-500 hover:from-pink-600 hover:to-emerald-600 text-white font-bold text-xs shadow-lg shadow-pink-500/30 disabled:opacity-50 transition"
            >
              {publishing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Publishing to Meta Ad Account...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Deploy 2-Step Funnel to Meta</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {currentStep === 5 && (
        <div className="space-y-6">

          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`w-2.5 h-2.5 rounded-full ${
                    activeCampaign?.status === "ACTIVE"
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-amber-400"
                  }`}
                />
                <span className="text-xs font-mono font-semibold uppercase tracking-wider text-slate-400">
                  Campaign Status:
                </span>
                <span
                  className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    activeCampaign?.status === "ACTIVE"
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                  }`}
                >
                  {activeCampaign?.status || "ACTIVE"}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                {activeCampaign?.name || `${serviceName} - ${industry}`}
              </h2>
              <div className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                <span>
                  Territory:{" "}
                  {activeCampaign?.target_location ||
                    (locationMode === "manual" ? customLocation : targetLocation) ||
                    "Global"}
                </span>
                <span className="text-slate-500">|</span>
                <span>Budget: ${activeCampaign?.budget_daily_bdt || budgetDaily}/day</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleToggleStatus}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs border border-slate-700 transition"
              >
                {activeCampaign?.status === "ACTIVE" ? (
                  <>
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Campaign</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-white" />
                    <span>Resume Campaign</span>
                  </>
                )}
              </button>
              <button
                onClick={() => setCurrentStep(1)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white font-semibold text-xs shadow-md shadow-pink-500/20 transition"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>New Campaign</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Total Spent</span>
              <div className="text-2xl font-black text-white font-mono">
                ${activeCampaign?.metrics?.spend_usd ?? activeCampaign?.metrics?.spend_bdt ?? "0.00"}
              </div>
              <div className="text-[10px] text-slate-500">
                Daily Budget: ${activeCampaign?.budget_daily_bdt || budgetDaily}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase">Video ThruPlays</span>
              <div className="text-2xl font-black text-pink-400 font-mono">
                {activeCampaign?.metrics?.video_views || "0"}
              </div>
              <div className="text-[10px] text-pink-400/80">
                {activeCampaign?.metrics?.thruplays_15s || "0"} watched 15s+
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-[11px] font-mono text-slate-400 uppercase">50%+ Qualified Viewers</span>
              <div className="text-2xl font-black text-purple-400 font-mono">
                {activeCampaign?.metrics?.qualified_50pct_viewers || "0"}
              </div>
              <div className="text-[10px] text-purple-400/80">
                Added to custom retargeting audience
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-950/40 to-slate-900 border border-emerald-500/40 space-y-1">
              <span className="text-[11px] font-mono text-emerald-400 uppercase">WhatsApp Inquiries</span>
              <div className="text-2xl font-black text-emerald-400 font-mono flex items-center gap-1.5">
                <MessageSquare className="w-5 h-5 fill-emerald-400 text-emerald-400" />
                <span>{activeCampaign?.metrics?.whatsapp_clicks || "0"}</span>
              </div>
              <div className="text-[10px] text-emerald-400/80">
                Cost per inquiry: ${activeCampaign?.metrics?.cost_per_whatsapp_lead || "0.00"}
              </div>
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-white">Campaign Funnel Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-pink-400">Step 1: Cold Video Hook Ad</div>
                <div className="text-slate-300 font-medium">
                  &ldquo;{activeCampaign?.post1_creative?.selected_hook || post1.selected_hook}&rdquo;
                </div>
                <p className="text-slate-400 text-[11px]">
                  {activeCampaign?.post1_creative?.primary_copy || post1.primary_copy}
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1.5">
                <div className="font-bold text-emerald-400">Step 2: Retargeting Offer Ad (WhatsApp CTA)</div>
                <div className="text-slate-300 font-medium">
                  {activeCampaign?.post2_creative?.offer_headline || post2.offer_headline}
                </div>
                <p className="text-slate-400 text-[11px]">
                  {activeCampaign?.post2_creative?.retargeting_copy || post2.retargeting_copy}
                </p>
                <div className="text-[10px] text-emerald-400 font-mono">
                  CTA Button: [ Send WhatsApp Message ]
                </div>
              </div>
            </div>
          </div>

          {campaignHistory.length > 0 && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-white">Historical Meta Campaigns</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/80 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Name & Service</th>
                      <th className="py-2.5 px-3">Industry</th>
                      <th className="py-2.5 px-3">Daily Budget</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">WhatsApp Inquiries</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {campaignHistory.map((cmp) => (
                      <tr key={cmp.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3 font-medium text-white">{cmp.name}</td>
                        <td className="py-3 px-3 text-slate-400">{cmp.industry}</td>
                        <td className="py-3 px-3 font-mono text-slate-300">${cmp.budget_daily_bdt}</td>
                        <td className="py-3 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              cmp.status === "ACTIVE"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-slate-800 text-slate-400"
                            }`}
                          >
                            {cmp.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-emerald-400">
                          {cmp.metrics?.whatsapp_clicks || 0}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              onClick={(e) => handleToggleAnyCampaignStatus(cmp.id, e)}
                              className={`flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold transition ${
                                cmp.status === "ACTIVE"
                                  ? "bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                              }`}
                              title={cmp.status === "ACTIVE" ? "Click to Pause" : "Click to Resume"}
                            >
                              {cmp.status === "ACTIVE" ? (
                                <>
                                  <Pause className="w-2.5 h-2.5" />
                                  <span>Pause</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-2.5 h-2.5 fill-emerald-300" />
                                  <span>Resume</span>
                                </>
                              )}
                            </button>
                            <button
                              onClick={() => setActiveCampaign(cmp)}
                              className="text-pink-400 hover:text-pink-300 font-semibold text-[11px]"
                            >
                              View
                            </button>
                            <button
                              onClick={(e) => handleDeleteCampaign(cmp.id, e)}
                              className="text-slate-500 hover:text-rose-400 p-1 transition"
                              title="Delete campaign"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
