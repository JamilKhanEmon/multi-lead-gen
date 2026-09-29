"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Compass,
  Megaphone,
  PhoneCall,
  ArrowRight,
  LogOut,
  AlertCircle,
  Check,
  Copy,
  Sparkles,
  RefreshCw,
  Save,
  PenTool,
  User as UserIcon,
  Phone as PhoneIcon,
  Globe,
} from "lucide-react";
import {
  loginUser,
  logoutUser,
  getStoredUser,
  fetchCurrentUser,
  fetchEmailTemplate,
  updateEmailTemplate,
  renderEmailTemplate,
  AuthUser,
  EmailTemplate,
} from "@/lib/api";

export default function AdminPortalPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Login form state (Email is auto-filled, password must be entered by admin)
  const [email, setEmail] = useState("admin@leadgen.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // Email template & signature management state
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplSuccess, setTplSuccess] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  // Form inputs
  const [subject, setSubject] = useState("Quick inquiry regarding your office in {{location}}");
  const [body, setBody] = useState("");
  const [senderName, setSenderName] = useState("Jamil Khan");
  const [senderTitle, setSenderTitle] = useState("Senior Solutions Consultant");
  const [senderCompany, setSenderCompany] = useState("Multi-Lead Gen AI");
  const [senderEmail, setSenderEmail] = useState("contact@leadgen.local");
  const [senderPhone, setSenderPhone] = useState("+880 1700-000000");
  const [senderWebsite, setSenderWebsite] = useState("https://leadgen.local");
  const [signOff, setSignOff] = useState("Sincerely,");
  const [signatureText, setSignatureText] = useState("");
  const [previewSample, setPreviewSample] = useState<"tropical" | "cafe" | "nowebsite">("tropical");
  const [copiedPreview, setCopiedPreview] = useState(false);

  // Initialize auth & template
  useEffect(() => {
    async function initAuth() {
      const stored = getStoredUser();
      if (stored) {
        setCurrentUser(stored);
      }
      try {
        const fresh = await fetchCurrentUser();
        if (fresh) {
          setCurrentUser(fresh);
        }
      } catch (e) {
        console.error("Auth check failed", e);
      } finally {
        setLoading(false);
      }
    }
    initAuth();

    const handleAuthChange = () => {
      const user = getStoredUser();
      setCurrentUser(user);
    };
    window.addEventListener("auth_change", handleAuthChange);
    return () => window.removeEventListener("auth_change", handleAuthChange);
  }, []);

  // Handle Login
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setLoginSubmitting(true);

    try {
      const result = await loginUser(email, password);
      if (result.user) {
        setCurrentUser(result.user);
      } else {
        const fresh = await fetchCurrentUser();
        setCurrentUser(fresh);
      }
    } catch (err: any) {
      setLoginError(err.message || "Invalid admin credentials");
    } finally {
      setLoginSubmitting(false);
    }
  };

  // Load active template when user is authenticated
  useEffect(() => {
    async function loadTemplate() {
      if (!currentUser) return;
      try {
        setTplLoading(true);
        const tpl = await fetchEmailTemplate();
        if (tpl) {
          setTemplate(tpl);
          setSubject(tpl.subject || "Quick inquiry regarding your office in {{location}}");
          setBody(tpl.body || "");
          setSenderName(tpl.sender_name || "Jamil Khan");
          setSenderTitle(tpl.sender_title || "Senior Solutions Consultant");
          setSenderCompany(tpl.sender_company || "Multi-Lead Gen AI");
          setSenderEmail(tpl.sender_email || "contact@leadgen.local");
          setSenderPhone(tpl.sender_phone || "+880 1700-000000");
          setSenderWebsite(tpl.sender_website || "https://leadgen.local");
          setSignOff(tpl.sign_off || "Sincerely,");
          setSignatureText(tpl.signature_text || "");
        }
      } catch (err: any) {
        console.warn("Could not load email template:", err);
      } finally {
        setTplLoading(false);
      }
    }
    loadTemplate();
  }, [currentUser]);

  // Handle Save Template & Signature
  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplError(null);
    setTplSuccess(null);
    setTplSaving(true);
    try {
      const updated = await updateEmailTemplate({
        subject,
        body,
        sender_name: senderName,
        sender_title: senderTitle,
        sender_company: senderCompany,
        sender_email: senderEmail,
        sender_phone: senderPhone,
        sender_website: senderWebsite,
        sign_off: signOff,
        signature_text: signatureText,
      });
      setTemplate(updated);
      setTplSuccess("Email format & signature updated globally for all users!");
      setTimeout(() => setTplSuccess(null), 4000);
    } catch (err: any) {
      setTplError(err.message || "Failed to update email template");
    } finally {
      setTplSaving(false);
    }
  };

  const handleResetDefault = () => {
    setSubject("Quick inquiry regarding your office in {{location}}");
    setBody(`Dear {{contact_person}},

I recently came across {{company_name}} located in {{location}}. You have an established local presence, but while researching your digital touchpoints online, I noticed key opportunities to improve your client acquisition pipeline{{primary_gap}}.

Today, over 70% of potential clients search and evaluate businesses on mobile devices before calling or visiting. Without an optimized, modern mobile presence and instant inquiry capture, many high-value leads contact competitors instead.

We help leading businesses like {{company_name}} resolve these technical gaps within 48 hours to significantly increase direct client inquiries. Would you be open to a brief 3-minute discussion or a quick preview of the tailored recommendations we prepared for you?

{{signature}}`);
    setSenderName("Jamil Khan");
    setSenderTitle("Senior Solutions Consultant");
    setSenderCompany("Multi-Lead Gen AI");
    setSenderEmail("contact@leadgen.local");
    setSenderPhone("+880 1700-000000");
    setSenderWebsite("https://leadgen.local");
    setSignOff("Sincerely,");
    setSignatureText("");
  };

  const insertVariable = (tag: string) => {
    setBody((prev) => (prev ? `${prev} ${tag}` : tag));
  };

  // Sample lead mockups for real-time live preview
  const sampleLeads = {
    tropical: {
      business_name: "Tropical Homes Ltd.",
      contact_person: "Managing Director",
      address: "Gulshan-2, Dhaka",
      domain: "tropicalhomesltd.com",
      phone: "+880 1711-223344",
      primary_gap_summary: "specifically mobile responsiveness and automated WhatsApp lead booking",
    },
    cafe: {
      business_name: "The Artisan Bistro",
      contact_person: "General Manager",
      address: "Banani, Dhaka",
      domain: "theartisanbistro.com",
      phone: "+880 1819-887766",
      primary_gap_summary: "specifically direct online reservation and menu catalog",
    },
    nowebsite: {
      business_name: "Dhaka Commercial Interiors",
      contact_person: "Operations Head",
      address: "Uttara Sector 3, Dhaka",
      domain: "",
      phone: "+880 1912-334455",
      primary_gap_summary: "specifically lack of an official web portal and customer inquiry automation",
    },
  };

  const currentPreviewLead = sampleLeads[previewSample];
  const renderedPreview = renderEmailTemplate(
    {
      id: "preview",
      name: "preview",
      subject: subject || "Quick inquiry regarding your office in {{location}}",
      body: body || "",
      sender_name: senderName || "Jamil Khan",
      sender_title: senderTitle || "Senior Solutions Consultant",
      sender_company: senderCompany || "Multi-Lead Gen AI",
      sender_email: senderEmail || "contact@leadgen.local",
      sender_phone: senderPhone || "+880 1700-000000",
      sender_website: senderWebsite || "https://leadgen.local",
      sign_off: signOff || "Sincerely,",
      signature_text: signatureText || "",
      is_active: true,
    },
    currentPreviewLead
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-sky-500/20 border-t-sky-500 rounded-full animate-spin" />
          <span className="text-xs font-mono text-slate-400">Verifying security credentials...</span>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // 1. ADMIN LOGIN SCREEN (If not logged in)
  // ==============================================================================
  if (!currentUser) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Brand & Security Header */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-sky-500/10 to-indigo-500/20 border border-sky-500/30 text-sky-400 mb-3 shadow-lg shadow-sky-500/10">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Admin Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Secure authentication required to access the B2B LeadGen platform.
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

            <form onSubmit={handleLoginSubmit} className="space-y-4 relative z-10">
              {loginError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              {/* Email Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Admin Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="admin@leadgen.local"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 transition"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Admin Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 transition"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-semibold rounded-xl text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {loginSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In to Admin Portal</span>
                  </>
                )}
              </button>
            </form>

            {/* Security Guarantee */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Argon2id Encrypted & Signed JWT</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==============================================================================
  // 2. ADMIN DASHBOARD: THE 3 CORE CARDS (EXACT ORIGINAL STYLE & SIZING)
  // ==============================================================================
  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Main Headline */}
      <div>
        <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
          <span>Enterprise Operations Center</span>
          <span className="text-xs font-mono font-normal px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Hostinger OpenClaw Active
          </span>
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Select one of the 3 core operational modules below to launch tasks or monitor live pipelines.
        </p>
      </div>

      {/* ========================================================================= */}
      {/* THE 3 CORE CARDS (Strict Feature Isolation: Lead, Ads, Voice Agent)        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CARD 1: Lead Generation & Research (LEAD FEATURES ONLY) */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-sky-500/60 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-sky-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-2xl pointer-events-none" />
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center shadow-md shadow-sky-500/10">
                <Compass className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/30 font-bold uppercase tracking-wider">
                01. LEADS & DISCOVERY
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Lead Generation & Research</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Dedicated strictly to discovering genuine B2B companies, verifying contacts, and scoring leads with 135 deterministic rules.
              </p>
            </div>

            {/* Exclusive Lead Features List */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="text-[11px] font-mono text-sky-400 font-semibold uppercase tracking-wider">
                LEAD FEATURES:
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-sky-400 font-bold mt-0.5">✓</span>
                  <span><strong>Autonomous Business Discovery:</strong> Multi-zone search across country, city, and sub-city via Hostinger OpenClaw.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sky-400 font-bold mt-0.5">✓</span>
                  <span><strong>Verified Contact Extraction:</strong> Official website domain, direct phone, and physical address.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sky-400 font-bold mt-0.5">✓</span>
                  <span><strong>Technical Website Audit:</strong> SSL validity, mobile responsiveness, WhatsApp buttons, and booking forms.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-sky-400 font-bold mt-0.5">✓</span>
                  <span><strong>135 Parameter Scoring:</strong> Instant mathematical qualification (Tier A / B / C) into local PostgreSQL.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Buttons for Leads */}
          <div className="pt-6 space-y-2">
            <Link
              href="/research"
              className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20"
            >
              <span>Launch New Lead Discovery</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/leads"
              className="w-full py-2 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition text-center"
            >
              <span>View Discovered Lead Pipeline</span>
            </Link>
          </div>
        </div>

        {/* CARD 2: Meta Ads & Marketing (ADS FEATURES ONLY) */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-pink-500/60 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-pink-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-400 flex items-center justify-center shadow-md shadow-pink-500/10">
                <Megaphone className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-pink-500/10 text-pink-300 border border-pink-500/30 font-bold uppercase tracking-wider">
                02. META ADS & MARKETING
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Meta Ads & Marketing Hub</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Dedicated strictly to B2B Facebook & Instagram marketing campaigns, audience targeting, and ad creative deployment.
              </p>
            </div>

            {/* Exclusive Ads Features List */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="text-[11px] font-mono text-pink-400 font-semibold uppercase tracking-wider">
                MARKETING FEATURES:
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-pink-400 font-bold mt-0.5">✓</span>
                  <span><strong>Live Campaign Orchestration:</strong> Create, schedule, activate, and pause Facebook & Instagram ad campaigns.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-400 font-bold mt-0.5">✓</span>
                  <span><strong>AI B2B Copywriter:</strong> Generates targeted headlines, primary ad copy, and client pain-point hooks.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-400 font-bold mt-0.5">✓</span>
                  <span><strong>Meta Pixel Audit:</strong> Detects whether client sites have tracking pixels installed for retargeting pitches.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-pink-400 font-bold mt-0.5">✓</span>
                  <span><strong>Budget & Spend Analytics:</strong> Track ad impressions, CTR, conversion rates, and ROAS.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Button for Ads */}
          <div className="pt-6">
            <Link
              href="/campaigns"
              className="w-full py-2.5 px-4 rounded-xl bg-pink-500 hover:bg-pink-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-pink-500/20"
            >
              <span>Open Meta Ads Manager</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>

        {/* CARD 3: Autonomous Voice Outreach (VOICE FEATURES ONLY) */}
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 hover:border-emerald-500/60 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl hover:shadow-emerald-500/10 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-md shadow-emerald-500/10">
                <PhoneCall className="w-6 h-6" />
              </div>
              <span className="text-[10px] font-mono px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 font-bold uppercase tracking-wider">
                03. VOICE OUTREACH
              </span>
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Autonomous Voice Outreach</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                Dedicated strictly to automated phone outreach, natural multi-turn conversations, objection handling, and appointment booking.
              </p>
            </div>

            {/* Exclusive Voice Features List */}
            <div className="pt-3 border-t border-slate-800/80 space-y-2">
              <div className="text-[11px] font-mono text-emerald-400 font-semibold uppercase tracking-wider">
                VOICE OUTREACH FEATURES:
              </div>
              <ul className="space-y-1.5 text-xs text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span><strong>Automated Phone Dialing:</strong> AI voice caller initiates cold outreach to qualified business phone numbers.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span><strong>Multi-Turn Voice Dialogue:</strong> Answers company questions and overcomes pricing/timeline objections dynamically.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span><strong>Meeting Booking:</strong> Direct calendar slot reservation when the decision maker shows positive buying intent.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-400 font-bold mt-0.5">✓</span>
                  <span><strong>Call Transcripts & Audio Playback:</strong> Full dialogue transcripts and audio review for every completed call.</span>
                </li>
              </ul>
            </div>
          </div>

          {/* Action Button for Voice Agent */}
          <div className="pt-6">
            <Link
              href="/voice-agent"
              className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-500/20"
            >
              <span>Open Voice Agent Console</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. GLOBAL EMAIL OUTREACH & SIGNATURE MANAGEMENT (APPLIES TO ALL USERS)    */}
      {/* ========================================================================= */}
      <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-sky-500/20 to-indigo-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                <PenTool className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Global Outreach Email & Signature Format</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Live Synced for All Users
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update the universal email outreach pitch and executive signature. Every lead dossier across the platform automatically uses this configuration.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleResetDefault}
              className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs font-medium flex items-center gap-1.5 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Standard Template</span>
            </button>
          </div>
        </div>

        {/* Feedback Alerts */}
        {tplSuccess && (
          <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs">
            <Check className="w-4 h-4 shrink-0" />
            <span>{tplSuccess}</span>
          </div>
        )}
        {tplError && (
          <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{tplError}</span>
          </div>
        )}

        {/* 2-Column Layout: Left = Editor, Right = Real-time Live Preview */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* LEFT: Editor Form (7 cols) */}
          <form onSubmit={handleSaveTemplate} className="lg:col-span-7 space-y-5">
            {/* Subject Input */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Email Subject Line
              </label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                required
                placeholder="Quick inquiry regarding your office in {{location}}"
                className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs sm:text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 font-mono"
              />
            </div>

            {/* Variable Pills Toolbar */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Click a variable to insert into email pitch:</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { tag: "{{company_name}}", desc: "Company Name" },
                  { tag: "{{contact_person}}", desc: "Contact / Owner" },
                  { tag: "{{location}}", desc: "Address / City" },
                  { tag: "{{website}}", desc: "Domain / Website" },
                  { tag: "{{phone}}", desc: "Phone Number" },
                  { tag: "{{primary_gap}}", desc: "Identified Gap" },
                  { tag: "{{signature}}", desc: "Full Signature Block" },
                ].map((item) => (
                  <button
                    key={item.tag}
                    type="button"
                    onClick={() => insertVariable(item.tag)}
                    title={item.desc}
                    className="px-2 py-1 bg-slate-800/80 hover:bg-sky-500/20 hover:border-sky-500/40 border border-slate-700/70 rounded-lg text-[10px] font-mono text-sky-300 transition flex items-center gap-1"
                  >
                    <span>{item.tag}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Body Textarea */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Email Pitch Content
              </label>
              <textarea
                rows={9}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                placeholder="Dear {{contact_person}}..."
                className="w-full p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 font-sans leading-relaxed resize-y"
              />
            </div>

            {/* Dedicated Signature Section */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserIcon className="w-3.5 h-3.5" /> Sender Signature Settings
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Variable: &#123;&#123;signature&#125;&#125;
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Sender Name</label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="e.g. Jamil Khan"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Professional Designation</label>
                  <input
                    type="text"
                    value={senderTitle}
                    onChange={(e) => setSenderTitle(e.target.value)}
                    placeholder="e.g. Senior Solutions Consultant"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Company / Agency Name</label>
                  <input
                    type="text"
                    value={senderCompany}
                    onChange={(e) => setSenderCompany(e.target.value)}
                    placeholder="e.g. Multi-Lead Gen AI"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Sign-off Greeting</label>
                  <input
                    type="text"
                    value={signOff}
                    onChange={(e) => setSignOff(e.target.value)}
                    placeholder="e.g. Sincerely, or Best regards,"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Sender Email</label>
                  <input
                    type="email"
                    value={senderEmail}
                    onChange={(e) => setSenderEmail(e.target.value)}
                    placeholder="e.g. contact@leadgen.local"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-400 mb-1">Phone / WhatsApp</label>
                  <input
                    type="text"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="e.g. +880 1700-000000"
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Sender Website / Portfolio URL</label>
                <input
                  type="text"
                  value={senderWebsite}
                  onChange={(e) => setSenderWebsite(e.target.value)}
                  placeholder="e.g. https://leadgen.local"
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Custom Multi-line Signature (Optional Override)
                </label>
                <textarea
                  rows={2}
                  value={signatureText}
                  onChange={(e) => setSignatureText(e.target.value)}
                  placeholder="Leave empty to use structured signature above, or type custom markdown..."
                  className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:border-sky-500/60 focus:outline-none resize-none font-mono"
                />
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={tplSaving}
                className="w-full py-3 px-5 bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 text-slate-950 font-bold rounded-xl text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {tplSaving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    <span>Saving & Deploying Globally...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save & Deploy Format for All Users</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* RIGHT: Real-time Live Preview Mockup (5 cols) */}
          <div className="lg:col-span-5 space-y-3 flex flex-col">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-sky-400" />
                Live Client Preview
              </span>
              <span className="text-[10px] text-slate-500">Real-time update</span>
            </div>

            {/* Sample Selector Buttons */}
            <div className="flex items-center gap-1 p-1 bg-slate-950/80 rounded-xl border border-slate-800 text-[11px]">
              <button
                type="button"
                onClick={() => setPreviewSample("tropical")}
                className={`flex-1 py-1 px-2 rounded-lg font-medium transition text-center truncate ${
                  previewSample === "tropical"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Tropical Homes
              </button>
              <button
                type="button"
                onClick={() => setPreviewSample("cafe")}
                className={`flex-1 py-1 px-2 rounded-lg font-medium transition text-center truncate ${
                  previewSample === "cafe"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Artisan Bistro
              </button>
              <button
                type="button"
                onClick={() => setPreviewSample("nowebsite")}
                className={`flex-1 py-1 px-2 rounded-lg font-medium transition text-center truncate ${
                  previewSample === "nowebsite"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                No-Website Lead
              </button>
            </div>

            {/* Simulated Email Client Container */}
            <div className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl p-4 flex flex-col justify-between shadow-2xl relative overflow-hidden">
              <div className="space-y-3 text-xs">
                {/* Simulated Email Header */}
                <div className="p-3 bg-slate-900/80 rounded-xl border border-slate-800/80 space-y-1.5 font-mono text-[11px]">
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-500 w-12">To:</span>
                    <span className="text-slate-200 truncate">{currentPreviewLead.contact_person} &lt;inquiry@{currentPreviewLead.domain || "business.com"}&gt;</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400">
                    <span className="text-slate-500 w-12">From:</span>
                    <span className="text-sky-300 truncate">{senderName || "Jamil Khan"} &lt;{senderEmail || "contact@leadgen.local"}&gt;</span>
                  </div>
                  <div className="flex items-center gap-2 text-slate-400 pt-1 border-t border-slate-800/60">
                    <span className="text-slate-500 w-12">Subject:</span>
                    <span className="text-slate-100 font-semibold truncate">{renderedPreview.subject}</span>
                  </div>
                </div>

                {/* Email Body & Signature Preview */}
                <div className="p-3 bg-slate-900/40 rounded-xl border border-slate-800/60 text-slate-200 text-xs font-sans leading-relaxed whitespace-pre-wrap max-h-[380px] overflow-y-auto">
                  {renderedPreview.body}
                </div>
              </div>

              {/* Copy Full Email Button */}
              <div className="pt-3 border-t border-slate-800/60 mt-3 flex items-center justify-between">
                <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                  {currentPreviewLead.address}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(renderedPreview.fullEmail);
                    setCopiedPreview(true);
                    setTimeout(() => setCopiedPreview(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-semibold flex items-center gap-1.5 transition shrink-0"
                >
                  {copiedPreview ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Sample Email</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
