"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchLeadDetail, submitLeadFeedback, deleteLead, fetchEmailTemplate, renderEmailTemplate, EmailTemplate } from "@/lib/api";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ShieldCheck,
  ExternalLink,
  ThumbsUp,
  ThumbsDown,
  Mail,
  Phone,
  MapPin,
  User,
  Linkedin,
  Globe,
  Code2,
  Cpu,
  Eye,
  Megaphone,
  Check,
  X,
  Sliders,
  ChevronDown,
  ChevronRight,
  Copy,
  FileJson,
  Terminal,
  Search,
  Database,
  Sparkles,
  Download,
  Trash2,
  Send,
  Edit3,
} from "lucide-react";

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = (params?.id as string) || "";

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  // Global email template & personalized outreach state
  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [customDraftSubject, setCustomDraftSubject] = useState("");
  const [customDraftBody, setCustomDraftBody] = useState("");

  // OpenClaw parameter inspection state
  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [matrixViewMode, setMatrixViewMode] = useState<"gaps" | "all135">("gaps");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [copiedFullJson, setCopiedFullJson] = useState(false);

  useEffect(() => {
    fetchLeadDetail(leadId)
      .then((data) => setLead(data))
      .catch((e) => console.error("Error loading dossier:", e))
      .finally(() => setLoading(false));

    fetchEmailTemplate()
      .then((tpl) => setEmailTemplate(tpl))
      .catch((e) => console.warn("Could not fetch global email template:", e));
  }, [leadId]);

  const handleFeedback = async (action: string) => {
    try {
      await submitLeadFeedback(leadId, action);
      setFeedbackSuccess(`Feedback '${action}' recorded.`);
    } catch (e: any) {
      alert("Failed to submit feedback: " + e.message);
    }
  };

  const toggleJobExpand = (jobId: string) => {
    setExpandedJobs((prev) => ({ ...prev, [jobId]: !prev[jobId] }));
  };

  const copyToClipboard = (text: string, jobId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedJobId(jobId);
    setTimeout(() => setCopiedJobId(null), 2000);
  };

  const copyFullJson = () => {
    if (!lead) return;
    navigator.clipboard.writeText(JSON.stringify(lead, null, 2));
    setCopiedFullJson(true);
    setTimeout(() => setCopiedFullJson(false), 2000);
  };

  const downloadJson = () => {
    if (!lead) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(lead, null, 2));
    const downloadAnchor = document.createElement("a");
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `${(lead.business_name || "lead").replace(/[^a-zA-Z0-9]/g, "_")}_full_135_parameters.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleDeleteLead = async () => {
    if (!lead) return;
    if (!confirm(`Are you sure you want to permanently delete "${lead.business_name}" from the database?`)) return;
    setIsDeleting(true);
    try {
      await deleteLead(leadId);
      router.push("/leads");
    } catch (err: any) {
      alert("Failed to delete lead: " + err.message);
      setIsDeleting(false);
    }
  };

  // Computed dynamic email outreach draft from Admin template + verified lead data
  const renderedOutreach = emailTemplate && lead
    ? renderEmailTemplate(emailTemplate, lead)
    : {
        subject: `Quick inquiry regarding your office in ${lead?.address || "your area"}`,
        body: `Dear Sir,\n\nI recently came across ${lead?.business_name || "your business"} located in ${lead?.address || "your area"}. I noticed you do not currently have an official corporate website or modern client booking portal.\n\nWould you be open to a quick 3-minute discussion or a sample preview prepared for your business?\n\nSincerely,\nGrowth Team`,
        fullEmail: "",
      };

  const activeSubject = isEditingDraft ? customDraftSubject : renderedOutreach.subject;
  const activeBody = isEditingDraft ? customDraftBody : renderedOutreach.body;

  const handleToggleEditDraft = () => {
    if (!isEditingDraft) {
      setCustomDraftSubject(activeSubject);
      setCustomDraftBody(activeBody);
    }
    setIsEditingDraft(!isEditingDraft);
  };

  const handleCopyOutreachEmail = () => {
    const textToCopy = `Subject: ${activeSubject}\n\n${activeBody}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedEmail(true);
    setTimeout(() => setCopiedEmail(false), 2000);
  };

  const targetEmail = lead?.email || "";
  const mailtoHref = `mailto:${encodeURIComponent(targetEmail)}?subject=${encodeURIComponent(activeSubject)}&body=${encodeURIComponent(activeBody)}`;

  if (loading) {
    return <div className="p-8 text-slate-400 text-sm">Loading lead intelligence dossier...</div>;
  }

  if (!lead) {
    return (
      <div className="max-w-xl mx-auto my-12 glass-panel p-8 rounded-2xl border border-slate-800 text-center space-y-4">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mx-auto text-xl font-bold">
          !
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Lead Dossier Not Found</h3>
          <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
            The requested lead ID <code className="text-sky-400 font-mono text-[11px] bg-slate-900 px-1.5 py-0.5 rounded">{leadId}</code> is not in the active database. If services were restarted, please view the active pipeline or run a new research run.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            href="/leads"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Go to Lead Pipeline
          </Link>
          <Link
            href="/research"
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5"
          >
            Launch New Research
          </Link>
        </div>
      </div>
    );
  }

  const scores = lead.scores && lead.scores.length > 0 ? lead.scores[0] : null;
  const explanation = lead.explanation_json || {};

  const targetDataset = matrixViewMode === "all135" ? (lead.all_parameters_matrix || []) : (lead.evidence || []);

  const filteredEvidence = targetDataset.filter((ev: any) => {
    const matchStatus =
      selectedStatusFilter === "ALL" ||
      ev.status === selectedStatusFilter ||
      (selectedStatusFilter === "GAP" && (ev.status === "STRONG" || ev.status === "WEAK"));

    const q = evidenceSearch.toLowerCase().trim();
    const matchQuery =
      !q ||
      (ev.name && ev.name.toLowerCase().includes(q)) ||
      (ev.parameter_name && ev.parameter_name.toLowerCase().includes(q)) ||
      (ev.category && ev.category.toLowerCase().includes(q)) ||
      (ev.parameter_category && ev.parameter_category.toLowerCase().includes(q)) ||
      (ev.evidence_text && ev.evidence_text.toLowerCase().includes(q)) ||
      (ev.parameter_id && ev.parameter_id.toString() === q);
    return matchStatus && matchQuery;
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Back button & Action Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Lead Pipeline
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowJsonModal(true)}
            className="px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1.5 transition shadow-sm"
          >
            <FileJson className="w-3.5 h-3.5" /> View Full A-Z JSON (135 Params)
          </button>
          <button
            onClick={downloadJson}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
          >
            <Download className="w-3.5 h-3.5" /> Export JSON
          </button>
          <button
            onClick={handleDeleteLead}
            disabled={isDeleting}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-semibold flex items-center gap-1.5 transition disabled:opacity-50"
            title="Delete this lead permanently from the database"
          >
            <Trash2 className="w-3.5 h-3.5" /> {isDeleting ? "Deleting..." : "Delete Lead"}
          </button>
          <Link
            href="/parameters"
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition px-2.5 py-1.5 rounded-lg bg-violet-950/30 border border-violet-800/40"
          >
            <Sliders className="w-3.5 h-3.5" /> 135 Catalog
          </Link>
        </div>
      </div>

      {/* Header Dossier Card */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-bold text-white">{lead.business_name}</h2>
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                lead.tier === "Strong Potential"
                  ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                  : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
              }`}>
                {lead.tier}
              </span>
            </div>
            {lead.domain && (
              <a
                href={`https://${lead.domain}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-sky-400 font-mono hover:underline inline-flex items-center gap-1 mt-1"
              >
                https://{lead.domain} <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 font-medium">Final Qualification Score</div>
            <div className="text-3xl font-extrabold text-white font-mono">{lead.final_score}</div>
          </div>
        </div>

        {/* Company Contact & Decision Maker Intelligence */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-sky-400" /> Phone
            </span>
            <div className="text-slate-200 font-mono">
              {lead.phone ? (
                <a href={`tel:${lead.phone}`} className="hover:text-sky-400 hover:underline">{lead.phone}</a>
              ) : (
                <span className="text-slate-500">Not public</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3 h-3 text-emerald-400" /> Email
            </span>
            <div className="text-slate-200 truncate flex items-center gap-1.5 flex-wrap">
              {lead.email ? (
                <>
                  <a href={`mailto:${lead.email}`} className="hover:text-emerald-400 hover:underline">{lead.email}</a>
                  {lead.email_status === "SUGGESTED" && (
                    <span
                      title="Inferred from corporate domain. Please verify before sending cold outreach."
                      className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-mono font-medium"
                    >
                      Domain Suggested
                    </span>
                  )}
                </>
              ) : (
                <span className="text-slate-500">Not public on website</span>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <User className="w-3 h-3 text-purple-400" /> Key Contact
            </span>
            <div className="text-slate-200 truncate">
              {lead.contact_person ? (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold text-purple-300">{lead.contact_person}</span>
                  {lead.contact_title && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/40">
                      {lead.contact_title}
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-slate-400">Executive / Director</span>
              )}
            </div>
            {lead.linkedin_url && (
              <a
                href={lead.linkedin_url}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-sky-400 hover:underline inline-flex items-center gap-1"
              >
                <Linkedin className="w-2.5 h-2.5" /> LinkedIn Profile
              </a>
            )}
          </div>

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <MapPin className="w-3 h-3 text-amber-400" /> Location & Maps
            </span>
            <div className="text-slate-200 truncate" title={lead.address || "Target Metro Market"}>
              {lead.address || "Target Metro Market"}
            </div>
            <div className="flex items-center gap-2 pt-0.5 flex-wrap">
              <a
                href={lead.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.business_name || ''} ${lead.address || ''}`)}`}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1 font-medium"
              >
                <MapPin className="w-2.5 h-2.5" /> View on Maps <ExternalLink className="w-2.5 h-2.5" />
              </a>
              {lead.latitude && lead.longitude && (
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20">
                  {lead.latitude.toFixed(4)}, {lead.longitude.toFixed(4)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Explainability Summary Box */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-400" /> Explainability & Evidence Rationale
          </div>
          <p className="leading-relaxed text-slate-300">{explanation.summary || lead.primary_gap_summary}</p>
        </div>

        {/* Reviewer Feedback Action Toolbar */}
        <div className="pt-2 flex items-center justify-between border-t border-slate-800/60">
          <span className="text-xs text-slate-400">Human-In-The-Loop Review:</span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleFeedback("APPROVED")}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <ThumbsUp className="w-3.5 h-3.5" /> Approve Lead
            </button>
            <button
              onClick={() => handleFeedback("REJECTED")}
              className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <ThumbsDown className="w-3.5 h-3.5" /> Reject
            </button>
          </div>
        </div>
        {feedbackSuccess && (
          <div className="text-xs text-emerald-400 font-medium">{feedbackSuccess}</div>
        )}
      </div>

      {/* Interactive Map & Manual Outreach Discovery Hub */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <MapPin className="w-4 h-4 text-amber-400" />
              Physical Location & Manual Verification
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Verify the exact business location, customer reviews, owner contact, and physical presence on Google Maps.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <a
              href={lead.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.business_name || ''} ${lead.address || ''}`)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-400 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <MapPin className="w-3.5 h-3.5" /> Open in Google Maps <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={lead.google_search_url || `https://www.google.com/search?q=${encodeURIComponent(`${lead.business_name || ''} ${lead.address || ''}`)}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Search className="w-3.5 h-3.5" /> Search Google <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href={`https://www.facebook.com/search/top?q=${encodeURIComponent(lead.business_name || '')}`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 border border-blue-500/30 text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Globe className="w-3.5 h-3.5" /> Find Facebook <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>

        {/* Embedded Interactive Google Map */}
        <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative shadow-inner">
          <iframe
            title={`${lead.business_name} Google Map Location`}
            width="100%"
            height="260"
            style={{ border: 0, filter: "invert(90%) hue-rotate(180deg) brightness(95%) contrast(90%)" }}
            loading="lazy"
            src={`https://maps.google.com/maps?q=${encodeURIComponent(
              lead.latitude && lead.longitude
                ? `${lead.latitude},${lead.longitude}`
                : `${lead.business_name || ''} ${lead.address || ''}`
            )}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
          />
          <div className="absolute bottom-2 left-2 right-2 px-3 py-1.5 rounded-lg bg-slate-900/90 backdrop-blur border border-slate-800 flex items-center justify-between text-[11px] text-slate-300">
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-white truncate">{lead.business_name}</span>
              {lead.address && <span className="text-slate-400 truncate">• {lead.address}</span>}
            </div>
            {lead.latitude && lead.longitude && (
              <span className="font-mono text-amber-400 shrink-0">
                GPS: {lead.latitude.toFixed(5)}, {lead.longitude.toFixed(5)}
              </span>
            )}
          </div>
        </div>

        {/* Missing Website Outreach Guidance if Lead has No Domain */}
        {!lead.domain && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-amber-950/30 via-slate-900/60 to-rose-950/30 border border-amber-500/30 space-y-3">
            <div className="space-y-1">
              <div className="text-xs font-bold text-amber-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                Top Web Agency Opportunity: No Official Website Found
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                This business is physically established and visible on Google Maps, but has no official web portal. 
                They are the <strong>highest conversion candidates for website design, digital menus, online booking, and local SEO services</strong>.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-xs">
              <a
                href={lead.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lead.business_name || ''} ${lead.address || ''}`)}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-amber-400 shrink-0" />
                <div>
                  <div className="font-semibold text-[11px]">1. Inspect Google Maps</div>
                  <div className="text-[10px] text-slate-400">Verify customer reviews & photos</div>
                </div>
              </a>

              <a
                href={`https://www.facebook.com/search/top?q=${encodeURIComponent(lead.business_name || '')}`}
                target="_blank"
                rel="noreferrer"
                className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition flex items-center gap-2"
              >
                <Globe className="w-4 h-4 text-blue-400 shrink-0" />
                <div>
                  <div className="font-semibold text-[11px]">2. Search Facebook Page</div>
                  <div className="text-[10px] text-slate-400">Check active social messages & posts</div>
                </div>
              </a>

              {lead.phone ? (
                <a
                  href={`tel:${lead.phone}`}
                  className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition flex items-center gap-2"
                >
                  <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-[11px]">3. Call / WhatsApp</div>
                    <div className="text-[10px] text-slate-400 font-mono truncate">{lead.phone}</div>
                  </div>
                </a>
              ) : (
                <a
                  href={`https://www.google.com/search?q=${encodeURIComponent(`${lead.business_name || ''} phone number ${lead.address || ''}`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-slate-200 transition flex items-center gap-2"
                >
                  <Phone className="w-4 h-4 text-sky-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-[11px]">3. Find Phone via Search</div>
                    <div className="text-[10px] text-slate-400">Look up phone number online</div>
                  </div>
                </a>
              )}
            </div>

            {/* Quick Pitch Copy Template */}
            <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-sky-400" />
                  Admin-Synced B2B Cold Outreach Draft
                </span>
                <span className="text-[10px] text-sky-400 bg-sky-500/10 border border-sky-500/30 px-2 py-0.5 rounded font-mono truncate max-w-[200px]">
                  Subject: {activeSubject}
                </span>
              </div>
              <div className="text-[11px] text-slate-200 font-sans bg-slate-900/80 p-3 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                <div className="text-slate-400 font-mono text-[10px] pb-2 border-b border-slate-800/80 mb-2">
                  Subject: {activeSubject}
                </div>
                {activeBody}
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-slate-500">
                  Global template configured by Admin &bull; Signature included
                </span>
                <button
                  type="button"
                  onClick={handleCopyOutreachEmail}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition border border-slate-700"
                >
                  {copiedEmail ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span className="text-emerald-400">Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Email</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Real-World Digital Footprint & Marketing Intelligence */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <Globe className="w-4 h-4 text-sky-400" />
            Live Technical & Advertising Audit
          </h3>
          <span className="text-[11px] text-slate-400 font-mono">
            Source: Live Web & Ad Transparency
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* CMS Platform */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-sky-400" /> CMS & Web Stack
            </span>
            <div className="font-semibold text-slate-200 text-sm">
              {lead.metadata_json?.cms_platform || "Custom Web App"}
            </div>
            <p className="text-[10px] text-slate-500">Framework / Tech platform</p>
          </div>

          {/* Meta Pixel Retargeting */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-rose-400" /> Meta Retargeting Pixel
            </span>
            <div>
              {lead.metadata_json?.has_meta_pixel ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Check className="w-3 h-3" /> Installed & Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  <X className="w-3 h-3" /> Missing (No Pixel)
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">Facebook/Instagram tracking</p>
          </div>

          {/* Google Analytics */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-amber-400" /> Analytics & GTM
            </span>
            <div>
              {lead.metadata_json?.has_google_analytics ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  <Check className="w-3 h-3" /> GTM / GA Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                  Not Detected
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-500">Visitor event analytics</p>
          </div>

          {/* Crawler Mode */}
          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-purple-400" /> Audit Engine
            </span>
            <div className="font-semibold text-slate-200 text-sm">
              {lead.metadata_json?.rendered_by === "playwright" ? "Playwright Headless" : "Multi-Page Parser"}
            </div>
            <p className="text-[10px] text-slate-500">Live DOM extraction</p>
          </div>
        </div>

        {/* 1-Click Meta Ad Library Verification Banner */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-sky-950/40 to-blue-950/40 border border-sky-800/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-semibold text-white">Meta Ad Library Transparency</div>
              <div className="text-[11px] text-slate-400">Directly inspect active and inactive paid campaigns on Facebook & Instagram</div>
            </div>
          </div>
          <a
            href={lead.metadata_json?.meta_ads_url || `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=ALL&q=${encodeURIComponent(lead.business_name)}`}
            target="_blank"
            rel="noreferrer"
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-sky-500/10"
          >
            Check Meta Ads <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 6-Factor Breakdown Grid */}
      {scores && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider">
            Deterministic 6-Factor Score Breakdown
          </h3>
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Evidence Quality (25%)", val: scores.evidence_quality },
              { label: "Problem Relevance (20%)", val: scores.problem_relevance },
              { label: "Problem Repetition (15%)", val: scores.problem_repetition },
              { label: "Recency Decay (15%)", val: scores.recency },
              { label: "Business Impact (10%)", val: scores.business_impact },
              { label: "Service Fit (15%)", val: scores.service_fit },
            ].map((f, i) => (
              <div key={i} className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800">
                <div className="text-[11px] text-slate-400">{f.label}</div>
                <div className="text-xl font-bold font-mono text-slate-100 mt-1">{f.val}</div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                  <div className="bg-sky-400 h-full rounded-full" style={{ width: `${Math.min(100, f.val)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verified Evidence & Parameter Findings Collected by OpenClaw */}
      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              {matrixViewMode === "all135"
                ? `Complete 135-Parameter A-to-Z Matrix (${lead.all_parameters_matrix?.length || 135} Parameters)`
                : `Audited Weaknesses & Active Gaps (${lead.evidence?.length || 0} Gaps Detected)`}
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              {matrixViewMode === "all135"
                ? "Every standard evaluation parameter from Category A through I mapped for this business."
                : "Observable deficiencies, missing digital infrastructure, and service opportunities identified by OpenClaw."}
            </p>
          </div>
          
          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Toggle */}
            <div className="inline-flex rounded-lg bg-slate-900 border border-slate-800 p-0.5 text-xs">
              <button
                onClick={() => {
                  setMatrixViewMode("gaps");
                  setSelectedStatusFilter("ALL");
                }}
                className={`px-3 py-1.5 rounded-md font-semibold transition ${
                  matrixViewMode === "gaps"
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Gaps & Weaknesses ({lead.evidence?.length || 0})
              </button>
              <button
                onClick={() => {
                  setMatrixViewMode("all135");
                  setSelectedStatusFilter("ALL");
                }}
                className={`px-3 py-1.5 rounded-md font-semibold transition flex items-center gap-1.5 ${
                  matrixViewMode === "all135"
                    ? "bg-violet-600/30 text-violet-300 border border-violet-500/40 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Sliders className="w-3 h-3" /> Full 135 Matrix
              </button>
            </div>

            <button
              onClick={() => setShowJsonModal(true)}
              className="px-2.5 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-xs font-semibold flex items-center gap-1 transition"
            >
              <FileJson className="w-3.5 h-3.5" /> Raw JSON
            </button>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
          <div className="relative flex-1 w-full">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search parameter findings, names, or IDs (e.g. 1, 34, meta, phone)..."
              value={evidenceSearch}
              onChange={(e) => setEvidenceSearch(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500"
            />
          </div>
          <div className="flex items-center gap-1 shrink-0 flex-wrap">
            {(matrixViewMode === "all135"
              ? ["ALL", "STRONG", "WEAK", "PASS", "NOT_DETECTED", "INTERNAL_CONFIDENTIAL"]
              : ["ALL", "STRONG", "WEAK", "PASS"]
            ).map((st) => (
              <button
                key={st}
                onClick={() => setSelectedStatusFilter(st)}
                className={`px-2 py-1 rounded-md text-[10px] font-mono font-medium transition ${
                  selectedStatusFilter === st
                    ? "bg-slate-700 text-white font-bold"
                    : "bg-slate-900/80 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                {st === "INTERNAL_CONFIDENTIAL" ? "INTERNAL" : st === "NOT_DETECTED" ? "NO GAP" : st}
              </button>
            ))}
          </div>
        </div>

        {/* Evidence & Parameter List */}
        {filteredEvidence.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-1">
            <div className="font-semibold text-slate-300">No parameters matching filter</div>
            <p className="text-slate-500">Try changing status filter or clear the search term.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEvidence.map((ev: any, idx: number) => {
              const paramId = ev.parameter_id;
              const paramName = ev.name || ev.parameter_name || `Parameter #${paramId}`;
              const paramCategory = ev.category || ev.parameter_category;
              const paramDesc = ev.description || ev.parameter_description;
              const isGap = ev.status === "STRONG" || ev.status === "WEAK";

              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl bg-slate-900/60 border transition space-y-2 ${
                    ev.status === "STRONG"
                      ? "border-rose-900/40 hover:border-rose-700/60"
                      : ev.status === "WEAK"
                      ? "border-amber-900/40 hover:border-amber-700/60"
                      : ev.status === "PASS"
                      ? "border-emerald-900/30 hover:border-emerald-700/50"
                      : "border-slate-800/80 hover:border-slate-700/80"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/60 font-bold">
                        Param #{paramId}
                      </span>
                      <span className="text-xs font-semibold text-white">
                        {paramName}
                      </span>
                      {paramCategory && (
                        <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/60 font-mono">
                          {paramCategory}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded uppercase ${
                          ev.status === "STRONG"
                            ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                            : ev.status === "WEAK"
                            ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                            : ev.status === "PASS"
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            : ev.status === "INTERNAL_CONFIDENTIAL"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-slate-800 text-slate-400 border border-slate-700"
                        }`}
                      >
                        {ev.status === "STRONG" ? "STRONG GAP" : ev.status === "WEAK" ? "WEAK GAP" : ev.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      Confidence: <span className="text-slate-200 font-bold">{Math.round((ev.confidence || 0) * 100)}%</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-200 leading-relaxed font-sans">{ev.evidence_text}</p>

                  {paramDesc && (
                    <p className="text-[11px] text-slate-400 italic bg-slate-950/40 p-2 rounded-lg border border-slate-800/40">
                      Rule: {paramDesc}
                    </p>
                  )}

                  {ev.source_url && (
                    <div className="text-[11px] text-slate-400 truncate pt-1 flex items-center gap-1.5">
                      <Globe className="w-3 h-3 text-sky-400 shrink-0" />
                      Source:{" "}
                      <a
                        href={ev.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:underline truncate"
                      >
                        {ev.source_url}
                      </a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Raw OpenClaw Research Jobs & JSON Output Inspection */}
      {lead.research_jobs && lead.research_jobs.length > 0 && (
        <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Terminal className="w-4 h-4 text-emerald-400" />
              OpenClaw Scraper Execution & Raw Output ({lead.research_jobs.length} Jobs)
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">Immutable Scrape History</span>
          </div>
          <p className="text-xs text-slate-400">
            Inspect the exact scraping payload, task parameters, and structured JSON output captured by OpenClaw for this business.
          </p>

          <div className="space-y-3">
            {lead.research_jobs.map((job: any) => {
              const isExpanded = !!expandedJobs[job.id];
              const jsonString = JSON.stringify(job.result_json || job.payload_json || {}, null, 2);

              return (
                <div key={job.id} className="rounded-xl bg-slate-900/80 border border-slate-800 overflow-hidden">
                  <div
                    onClick={() => toggleJobExpand(job.id)}
                    className="p-3.5 flex items-center justify-between cursor-pointer hover:bg-slate-800/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-slate-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-white uppercase tracking-wide">
                            {job.task_type}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.2 rounded ${
                              job.status === "COMPLETED"
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-sky-500/20 text-sky-300"
                            }`}
                          >
                            {job.status}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">Job ID: {job.id}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyToClipboard(jsonString, job.id);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-mono flex items-center gap-1 transition"
                      >
                        <Copy className="w-3 h-3" />
                        {copiedJobId === job.id ? "Copied!" : "Copy JSON"}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-slate-800 bg-slate-950 font-mono text-[11px] overflow-x-auto space-y-3">
                      <div>
                        <div className="text-slate-400 font-bold mb-1 flex items-center gap-1.5">
                          <FileJson className="w-3 h-3 text-sky-400" /> OpenClaw Extracted Output:
                        </div>
                        <pre className="text-emerald-400 bg-slate-900/90 p-3 rounded-lg overflow-x-auto leading-relaxed max-h-80 scrollbar-thin">
                          {jsonString}
                        </pre>
                      </div>

                      {job.payload_json && (
                        <div>
                          <div className="text-slate-400 font-bold mb-1 flex items-center gap-1.5">
                            <Sliders className="w-3 h-3 text-violet-400" /> Job Parameters Payload:
                          </div>
                          <pre className="text-sky-300 bg-slate-900/90 p-3 rounded-lg overflow-x-auto leading-relaxed max-h-48 scrollbar-thin">
                            {JSON.stringify(job.payload_json, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommended Agency Solution & Client Outreach Pitch */}
      <div className="glass-panel p-6 rounded-2xl border border-sky-500/30 bg-sky-950/10 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            Recommended Agency Solution & Outreach Pitch
          </h3>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20">
              Admin-Synced Outreach Template
            </span>
          </div>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          <strong>Strategic Offer:</strong> {explanation.recommended_solution || "Full-stack digital presence modernization & customer inquiry automation."}
        </p>

        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800/80 space-y-3">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-200">
              <Mail className="w-4 h-4 text-sky-400" /> Ready-to-Send Executive Outreach Draft
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleToggleEditDraft}
                className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-[10px] font-semibold transition flex items-center gap-1"
              >
                <Edit3 className="w-3 h-3 text-sky-400" />
                <span>{isEditingDraft ? "Done Editing" : "Customize for this Lead"}</span>
              </button>
            </div>
          </div>

          {/* Subject Line Bar */}
          <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg flex items-center gap-2 text-xs">
            <span className="text-slate-500 font-mono text-[11px] shrink-0">Subject:</span>
            {isEditingDraft ? (
              <input
                type="text"
                value={customDraftSubject}
                onChange={(e) => setCustomDraftSubject(e.target.value)}
                className="flex-1 bg-transparent border-none text-slate-100 font-medium focus:outline-none"
              />
            ) : (
              <span className="text-slate-100 font-medium">{activeSubject}</span>
            )}
          </div>

          {/* Email Body & Signature */}
          {isEditingDraft ? (
            <textarea
              rows={8}
              value={customDraftBody}
              onChange={(e) => setCustomDraftBody(e.target.value)}
              className="w-full p-3 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 leading-relaxed focus:outline-none focus:border-sky-500/50 resize-y font-sans"
            />
          ) : (
            <div className="text-xs text-slate-200 font-sans bg-slate-900/80 p-3.5 rounded-lg border border-slate-800 whitespace-pre-wrap leading-relaxed select-all">
              {activeBody}
            </div>
          )}

          {/* Outreach Actions Bar */}
          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-t border-slate-800/80">
            <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Universal enterprise template configured by Admin &bull; Signature included</span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleCopyOutreachEmail}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700 shadow-sm"
              >
                {copiedEmail ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="text-emerald-400">Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-300" />
                    <span>Copy Full Email</span>
                  </>
                )}
              </button>

              <a
                href={mailtoHref}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm shadow-sky-500/20"
              >
                <Send className="w-3.5 h-3.5 text-slate-950" />
                <span>Send via Email Client</span>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Full 135-Parameter A-Z JSON Modal Overlay */}
      {showJsonModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowJsonModal(false)}
        >
          <div
            className="glass-panel bg-slate-950/95 border border-slate-700/80 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-500/20 border border-sky-500/30 flex items-center justify-center text-sky-400">
                  <FileJson className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                    Complete A-to-Z Intelligence Dossier (135 Parameters)
                  </h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-md">
                    {lead.business_name} &bull; Final Score: {lead.final_score} &bull; Tier: {lead.tier}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={copyFullJson}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition border border-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedFullJson ? "Copied!" : "Copy JSON"}
                </button>
                <button
                  onClick={downloadJson}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
                >
                  <Download className="w-3.5 h-3.5" /> Export JSON
                </button>
                <button
                  onClick={() => setShowJsonModal(false)}
                  className="w-8 h-8 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition border border-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal JSON Body */}
            <div className="p-4 sm:p-5 overflow-auto flex-1 bg-slate-950 font-mono text-[11px] sm:text-xs leading-relaxed">
              <pre className="text-emerald-400 select-all whitespace-pre-wrap word-break bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                {JSON.stringify(lead, null, 2)}
              </pre>
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 border-t border-slate-800/80 bg-slate-900/40 flex items-center justify-between text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>
                  Profile contains {lead.all_parameters_matrix?.length || 135} evaluated parameters & {lead.evidence?.length || 0} active gaps
                </span>
              </div>
              <button
                onClick={() => setShowJsonModal(false)}
                className="px-3 py-1 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

