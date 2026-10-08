"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { fetchLeadDetail, submitLeadFeedback, updateLeadDetails, deleteLead, fetchEmailTemplate, renderEmailTemplate, EmailTemplate, evaluateLeadFitGate, fetchPersonaSignatures, PersonaSignatureItem } from "@/lib/api";
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
  MessageSquare,
  Flame,
  PhoneCall,
  Quote,
  RefreshCw,
} from "lucide-react";

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams();
  const leadId = (params?.id as string) || "";

  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [feedbackSuccess, setFeedbackSuccess] = useState<string | null>(null);

  const [emailTemplate, setEmailTemplate] = useState<EmailTemplate | null>(null);
  const [personaSignatures, setPersonaSignatures] = useState<PersonaSignatureItem[]>([]);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [isEditingDraft, setIsEditingDraft] = useState(false);
  const [customDraftSubject, setCustomDraftSubject] = useState("");
  const [customDraftBody, setCustomDraftBody] = useState("");

  const [evidenceSearch, setEvidenceSearch] = useState("");
  const [selectedStatusFilter, setSelectedStatusFilter] = useState("ALL");
  const [expandedJobs, setExpandedJobs] = useState<Record<string, boolean>>({});
  const [copiedJobId, setCopiedJobId] = useState<string | null>(null);
  const [matrixViewMode, setMatrixViewMode] = useState<"gaps" | "all135">("gaps");
  const [showJsonModal, setShowJsonModal] = useState(false);
  const [copiedFullJson, setCopiedFullJson] = useState(false);

  const [copiedEvidence, setCopiedEvidence] = useState(false);
  const [copiedScript, setCopiedScript] = useState(false);
  const [isEvaluatingFit, setIsEvaluatingFit] = useState(false);

  const handleEvaluateFit = async () => {
    if (!lead) return;
    setIsEvaluatingFit(true);
    try {
      const updated = await evaluateLeadFitGate(lead.id);
      setLead(updated);
    } catch (err: any) {
      alert("Fit Gate evaluation failed: " + err.message);
    } finally {
      setIsEvaluatingFit(false);
    }
  };

  const copyEvidenceToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedEvidence(true);
    setTimeout(() => setCopiedEvidence(false), 2000);
  };

  const copyScriptToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedScript(true);
    setTimeout(() => setCopiedScript(false), 2000);
  };

  const [showEditModal, setShowEditModal] = useState(false);
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editContactTitle, setEditContactTitle] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editPrimaryGap, setEditPrimaryGap] = useState("");
  const [editWhyUs, setEditWhyUs] = useState("");
  const [editWhatNeed, setEditWhatNeed] = useState("");
  const [editMatchedService, setEditMatchedService] = useState("");
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);

  const openEditModal = () => {
    if (!lead) return;
    setEditEmail(lead.email || "");
    setEditPhone(lead.phone || "");
    setEditContactPerson(lead.contact_person || "");
    setEditContactTitle(lead.contact_title || "");
    setEditAddress(lead.address || "");
    setEditPrimaryGap(lead.primary_gap_summary || "");
    setEditWhyUs(lead.why_they_need_us || "");
    setEditWhatNeed(lead.what_they_need || "");
    setEditMatchedService(lead.matched_service || "");
    setShowEditModal(true);
  };

  const handleSaveLeadEdit = async (approveForOutreach: boolean = false) => {
    if (!lead) return;
    setIsSubmittingEdit(true);
    try {
      const updated = await updateLeadDetails(lead.id, {
        email: editEmail,
        phone: editPhone,
        contact_person: editContactPerson,
        contact_title: editContactTitle,
        address: editAddress,
        primary_gap_summary: editPrimaryGap,
        why_they_need_us: editWhyUs,
        what_they_need: editWhatNeed,
        matched_service: editMatchedService,
        approve_for_outreach: approveForOutreach,
      });
      setLead(updated);
      setShowEditModal(false);
      alert(approveForOutreach ? "✓ Lead updated and approved for Outreach Queue!" : "✓ Lead details updated successfully!");
    } catch (err: any) {
      alert("Failed to update lead: " + err.message);
    } finally {
      setIsSubmittingEdit(false);
    }
  };

  useEffect(() => {
    fetchLeadDetail(leadId)
      .then((data) => setLead(data))
      .catch((e) => console.error("Error loading dossier:", e))
      .finally(() => setLoading(false));

    fetchEmailTemplate()
      .then((tpl) => setEmailTemplate(tpl))
      .catch((e) => console.warn("Could not fetch global email template:", e));

    fetchPersonaSignatures()
      .then((p) => setPersonaSignatures(p || []))
      .catch((e) => console.warn("Could not fetch persona signatures:", e));
  }, [leadId]);

  const handleFeedback = async (action: string) => {
    try {
      await submitLeadFeedback(leadId, action);
      setFeedbackSuccess(`Feedback '${action}' recorded.`);
      const updated = await fetchLeadDetail(leadId);
      setLead(updated);
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

  const leadGapText = lead?.why_they_need_us || lead?.primary_gap_summary || "growth opportunities in your digital client acquisition";
  const renderedOutreach = emailTemplate && lead
    ? renderEmailTemplate(emailTemplate, lead, personaSignatures)
    : {
        subject: `Quick inquiry regarding ${lead?.business_name || "your office"} in ${lead?.address || "your area"}`,
        body: `Hello ${lead?.contact_person || lead?.business_name || "there"},\n\nI recently came across ${lead?.business_name || "your business"} located in ${lead?.address || "your area"}. We noticed ${leadGapText}.\n\nWould you be open to a quick 3-minute discussion or a sample preview prepared for your business?`,
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <Link href="/leads" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Lead Pipeline
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={openEditModal}
            className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 text-xs font-bold flex items-center gap-1.5 transition shadow-sm"
          >
            <Edit3 className="w-3.5 h-3.5 text-emerald-400" /> Edit Lead Details
          </button>
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
          <Link
            href="/parameters"
            className="inline-flex items-center gap-1.5 text-xs text-violet-400 hover:text-violet-300 font-medium transition px-2.5 py-1.5 rounded-lg bg-violet-950/30 border border-violet-800/40"
          >
            <Sliders className="w-3.5 h-3.5" /> 135 Catalog
          </Link>
        </div>
      </div>

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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs">
          <div className="space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3 h-3 text-sky-400" /> Phone
            </span>
            <div className="text-slate-200 font-mono">
              {lead.phone ? (
                <div className="space-y-1">
                  <a href={`tel:${lead.phone}`} className="hover:text-sky-400 hover:underline">{lead.phone}</a>
                  <div>
                    <a
                      href={`https://wa.me/${lead.phone.replace(/[^0-9]/g, "")}?text=${encodeURIComponent(
                        `Hello ${lead.contact_person || lead.business_name}, I am reaching out regarding your business.`
                      )}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-500/30 transition"
                    >
                      <MessageSquare className="w-2.5 h-2.5" /> WhatsApp
                    </a>
                  </div>
                </div>
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

        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300 space-y-2">
          <div className="font-semibold text-slate-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-sky-400" /> Explainability & Evidence Rationale
          </div>
          <p className="leading-relaxed text-slate-300">{explanation.summary || lead.primary_gap_summary}</p>
        </div>

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

      <div className="glass-panel p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950 to-slate-900/90 space-y-5 shadow-xl shadow-amber-500/5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Flame className="w-5 h-5 fill-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Demand-Side Sales Intelligence & Call Pitch</h3>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-mono uppercase tracking-wider font-semibold">
                  Evidence-First Framework
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Live buying signals matched to solution catalog. Sales representatives pitch only verified client bottlenecks.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">

            <div className={`px-3 py-1.5 rounded-xl border font-bold text-xs flex items-center gap-1.5 ${
              lead.fit_tier === "HOT"
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-sm shadow-rose-500/20"
                : lead.fit_tier === "WARM"
                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                : lead.fit_tier === "DROPPED"
                ? "bg-slate-800 text-slate-400 border-slate-700"
                : "bg-sky-500/20 text-sky-300 border-sky-500/40"
            }`}>
              {lead.fit_tier === "HOT" && <Flame className="w-3.5 h-3.5 fill-rose-400" />}
              {lead.fit_tier === "WARM" && <Sparkles className="w-3.5 h-3.5 text-amber-400" />}
              <span>{lead.fit_tier || "HOT"} LEAD</span>
            </div>

            <button
              onClick={handleEvaluateFit}
              disabled={isEvaluatingFit}
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
              title="Re-run Fit Gate Evaluation against live website & footprint"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isEvaluatingFit ? "animate-spin text-amber-400" : ""}`} />
              <span>{isEvaluatingFit ? "Scanning..." : "Re-Scan Fit Gate"}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <div className="p-4 rounded-xl bg-gradient-to-br from-amber-950/30 to-slate-900/80 border border-amber-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                <Quote className="w-3.5 h-3.5 text-amber-400" /> Why They Need Us (Live Evidence)
              </span>
              <button
                onClick={() => copyEvidenceToClipboard(lead.why_they_need_us || lead.primary_gap_summary)}
                className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-[10px] font-semibold transition border border-amber-500/30 flex items-center gap-1 cursor-pointer"
              >
                {copiedEvidence ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedEvidence ? "Copied!" : "Copy Proof"}</span>
              </button>
            </div>
            <blockquote className="text-xs text-amber-100/90 leading-relaxed italic bg-black/30 p-3 rounded-lg border border-amber-500/20 select-all">
              "{lead.why_they_need_us || lead.primary_gap_summary}"
            </blockquote>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
              Sales rule: Open the call with this exact observed proof to disarm skepticism.
            </div>
          </div>

          <div className="p-4 rounded-xl bg-gradient-to-br from-sky-950/30 to-slate-900/80 border border-sky-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-sky-400" /> Solution & Recommended Service
              </span>
              <span className="text-[10px] bg-sky-500/20 text-sky-300 px-2 py-0.5 rounded-full border border-sky-500/30 font-medium">
                Wedge Strategy
              </span>
            </div>
            <div className="p-3 rounded-lg bg-black/30 border border-sky-500/20 space-y-1.5">
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>🎯 Matched Service:</span>
                <span className="text-sky-300">{lead.matched_service || "Web Design & Digital Growth Pipeline"}</span>
              </div>
              <div className="text-xs text-slate-300 leading-relaxed">
                <span className="font-semibold text-slate-400">What They Need: </span>
                {lead.what_they_need || "Modern digital presence with automated lead capture and customer inquiry management."}
              </div>
            </div>
            <div className="text-[10px] text-slate-400 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              Pitch low-friction wedge product first before proposing large enterprise systems.
            </div>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
              <PhoneCall className="w-3.5 h-3.5 text-emerald-400" /> Discovery-First Sales Call Script (30-Sec Opener)
            </span>
            <button
              onClick={() => copyScriptToClipboard(lead.discovery_call_script || "")}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold transition border border-emerald-500/30 flex items-center gap-1.5 cursor-pointer"
            >
              {copiedScript ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedScript ? "Copied Script!" : "Copy Call Script"}</span>
            </button>
          </div>
          <div className="text-xs text-slate-200 font-mono bg-slate-900/90 p-3.5 rounded-lg border border-slate-800/80 whitespace-pre-wrap leading-relaxed select-all">
            {lead.discovery_call_script || (
              `1. OPENING EVIDENCE:\n   "Hello, is this ${lead.business_name}? I was reviewing your online presence and noticed: ${lead.why_they_need_us || lead.primary_gap_summary || "solvable gaps in online visibility"}.\n\n2. DISCOVERY QUESTION (Wait for their answer):\n   "How are you currently handling inbound client acquisition and follow-ups right now?"\n\n3. VALUE PITCH (${lead.matched_service || ""}):\n   "We specialize in solving this with quick setup. Would you be open to a 5-minute preview of the custom audit report we prepared for ${lead.business_name}?"`
            )}
          </div>
        </div>
      </div>

      <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-emerald-400" />
              Outreach Activity & Inbound Client Replies ({lead.outreach_logs?.length || 0} Records)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Live audit history of sent cold emails and direct client replies with AI sentiment classification.
            </p>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
            lead.deal_status === "HOT_LEAD" || lead.outreach_status === "REPLIED_HOT"
              ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1.5"
              : "bg-sky-500/20 text-sky-300 border border-sky-500/30"
          }`}>
            {(lead.deal_status === "HOT_LEAD" || lead.outreach_status === "REPLIED_HOT") && (
              <Flame className="w-3.5 h-3.5 text-rose-400 fill-rose-400 animate-pulse" />
            )}
            {lead.outreach_status || "PENDING"}
          </span>
        </div>

        {!lead.outreach_logs || lead.outreach_logs.length === 0 ? (
          <div className="p-4 rounded-xl bg-slate-900/50 border border-slate-800/80 text-xs text-slate-400 text-center space-y-1">
            <div className="font-semibold text-slate-300">No email outreach logs sent yet for this lead.</div>
            <p className="text-[11px] text-slate-500">When an outreach email is sent or a client replies, the complete message transcript will appear here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {lead.outreach_logs.map((log: any, idx: number) => {
              const isReply = Boolean(log.reply_content || log.status?.startsWith("REPLIED"));

              return (
                <div
                  key={log.id || idx}
                  className={`p-4 rounded-xl border transition space-y-2.5 ${
                    isReply
                      ? "bg-gradient-to-r from-emerald-950/40 via-slate-900/90 to-slate-900/70 border-emerald-500/40 shadow-lg shadow-emerald-500/5"
                      : "bg-slate-900/60 border-slate-800"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      {isReply ? (
                        <span className="px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] flex items-center gap-1.5">
                          <Flame className="w-3 h-3 fill-emerald-400 text-emerald-400" /> INBOUND CLIENT REPLY ({log.reply_sentiment || "POSITIVE"})
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-mono">
                          OUTBOUND EMAIL (STEP {log.step || 1})
                        </span>
                      )}
                      <span className="text-slate-300 font-mono text-[11px] truncate">
                        Recipient: {log.recipient_email}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {log.sent_at ? new Date(log.sent_at).toLocaleString() : "Recently"}
                    </span>
                  </div>

                  <div className="text-xs font-semibold text-white font-sans">
                    Subject: {log.subject}
                  </div>

                  {isReply ? (
                    <div className="p-3.5 rounded-xl bg-slate-950/90 border border-emerald-500/30 space-y-2 text-xs">
                      <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                        <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                        Received Client Response Message:
                      </div>
                      <div className="text-slate-100 font-sans text-xs leading-relaxed whitespace-pre-wrap select-all font-medium bg-slate-900/90 p-3 rounded-lg border border-emerald-900/50 shadow-inner">
                        "{log.reply_content || log.body_snippet}"
                      </div>
                      {log.reply_sentiment && (
                        <div className="text-[11px] text-emerald-300 font-mono pt-1 flex items-center gap-1.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>AI Sentiment: <strong>{log.reply_sentiment}</strong> — Automated sequence paused. Moved to Hot Deals CRM.</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-[11px] text-slate-300 font-mono bg-slate-950/60 p-3 rounded-lg border border-slate-800/80 whitespace-pre-wrap leading-relaxed select-all">
                      {log.body_snippet}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

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

          <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5 text-sky-400" /> CMS & Web Stack
            </span>
            <div className="font-semibold text-slate-200 text-sm">
              {lead.metadata_json?.cms_platform || "Custom Web App"}
            </div>
            <p className="text-[10px] text-slate-500">Framework / Tech platform</p>
          </div>

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

            <div className="p-4 sm:p-5 overflow-auto flex-1 bg-slate-950 font-mono text-[11px] sm:text-xs leading-relaxed">
              <pre className="text-emerald-400 select-all whitespace-pre-wrap word-break bg-slate-900/60 p-4 rounded-xl border border-slate-800/80">
                {JSON.stringify(lead, null, 2)}
              </pre>
            </div>

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

      {showEditModal && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
          onClick={() => setShowEditModal(false)}
        >
          <div
            className="glass-panel bg-slate-950/95 border border-slate-700/80 rounded-2xl w-full max-w-xl flex flex-col shadow-2xl overflow-hidden space-y-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Edit Lead Dossier & Contact Information</h3>
                  <p className="text-[11px] text-slate-400">{lead.business_name}</p>
                </div>
              </div>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Target Contact Email:</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="e.g. contact@company.com"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Direct Phone Number / WhatsApp:</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="e.g. +1 555-0199"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Key Decision Maker Name:</label>
                  <input
                    type="text"
                    value={editContactPerson}
                    onChange={(e) => setEditContactPerson(e.target.value)}
                    placeholder="e.g. Tanvir Ahmed"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">Designation / Title:</label>
                  <input
                    type="text"
                    value={editContactTitle}
                    onChange={(e) => setEditContactTitle(e.target.value)}
                    placeholder="e.g. Managing Director"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Address / Metro Location:</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="e.g. Gulshan 1, Dhaka"
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-300 mb-1">Primary Gap / Opportunity Summary:</label>
                <textarea
                  rows={2}
                  value={editPrimaryGap}
                  onChange={(e) => setEditPrimaryGap(e.target.value)}
                  placeholder="Summarize the core weakness or service gap..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 resize-y font-sans"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-amber-300 mb-1">Why They Need Us (Live Evidence Quote):</label>
                <textarea
                  rows={2}
                  value={editWhyUs}
                  onChange={(e) => setEditWhyUs(e.target.value)}
                  placeholder="Live observable proof on website/digital touchpoints..."
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 resize-y font-sans"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-sky-300 mb-1">Matched Service:</label>
                  <input
                    type="text"
                    value={editMatchedService}
                    onChange={(e) => setEditMatchedService(e.target.value)}
                    placeholder="e.g. Web Design & Development (Site in 7 Days)"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-300 mb-1">What They Need (Solution):</label>
                  <input
                    type="text"
                    value={editWhatNeed}
                    onChange={(e) => setEditWhatNeed(e.target.value)}
                    placeholder="e.g. Modern web presence with WhatsApp booking"
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSubmittingEdit}
                  onClick={() => handleSaveLeadEdit(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-white transition border border-slate-700"
                >
                  Save Changes
                </button>

                <button
                  type="button"
                  disabled={isSubmittingEdit}
                  onClick={() => handleSaveLeadEdit(true)}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20"
                >
                  <Send className="w-3.5 h-3.5 text-slate-950" />
                  Approve for Outreach Queue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
