"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ShieldCheck,
  Shield,
  ShieldAlert,
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
  Users,
  UserPlus,
  Phone as PhoneIcon,
  Globe,
  Sliders,
  Trash2,
  Crown,
  Key,
  CheckCircle2,
  XCircle,
  Zap,
  Inbox,
  Plus,
  Database,
  AlertTriangle,
  Server,
  Activity,
  RotateCcw,
  Edit3,
  Shuffle,
  Power,
  FileText,
  Layers,
  Building2,
  Briefcase,
} from "lucide-react";
import {
  loginUser,
  logoutUser,
  getStoredUser,
  fetchCurrentUser,
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  adminResetPassword,
  updateMemberPermissions,
  fetchEmailTemplate,
  updateEmailTemplate,
  renderEmailTemplate,
  fetchInboxMonitorStats,
  createSMTPInbox,
  deleteSMTPInbox,
  testSMTPInbox,
  createPersonaSignature,
  updatePersonaSignature,
  togglePersonaSignature,
  deletePersonaSignature,
  purgeDatabaseData,
  fetchCompanyKB,
  updateCompanyKB,
  resetCompanyKBDefaults,
  CompanyKB,
  ServiceCatalogItem,
  AuthUser,
  EmailTemplate,
  DashboardPermissions,
  hasPermission,
  SMTPInboxItem,
  PersonaSignatureItem,
} from "@/lib/api";

export default function AdminPortalPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState<"users" | "modules" | "company_kb" | "template" | "inboxes">("modules");

  const [companyKb, setCompanyKb] = useState<CompanyKB | null>(null);
  const [kbLoading, setKbLoading] = useState(false);
  const [kbSaving, setKbSaving] = useState(false);
  const [kbResetting, setKbResetting] = useState(false);
  const [kbCompanyName, setKbCompanyName] = useState("");
  const [kbTagline, setKbTagline] = useState("");
  const [kbHeadquarters, setKbHeadquarters] = useState("");
  const [kbPhone, setKbPhone] = useState("");
  const [kbEmail, setKbEmail] = useState("");
  const [kbWebsite, setKbWebsite] = useState("");
  const [kbMasterNotes, setKbMasterNotes] = useState("");
  const [kbServices, setKbServices] = useState<ServiceCatalogItem[]>([]);
  const [kbIsActive, setKbIsActive] = useState(true);
  const [kbActionSuccess, setKbActionSuccess] = useState<string | null>(null);
  const [kbActionError, setKbActionError] = useState<string | null>(null);

  const loadCompanyKBData = async () => {
    try {
      setKbLoading(true);
      const data = await fetchCompanyKB();
      if (data) {
        setCompanyKb(data);
        setKbCompanyName(data.company_name || "");
        setKbTagline(data.tagline_experience || "");
        setKbHeadquarters(data.headquarters || "");
        setKbPhone(data.contact_phone || "");
        setKbEmail(data.contact_email || "");
        setKbWebsite(data.website_url || "");
        setKbMasterNotes(data.master_kb_notes || "");
        setKbServices(data.services_json || []);
        setKbIsActive(data.is_active ?? true);
      }
    } catch (e: any) {
      console.warn("Could not load Company KB:", e);
    } finally {
      setKbLoading(false);
    }
  };

  const handleSaveCompanyKB = async () => {
    try {
      setKbSaving(true);
      setKbActionError(null);
      const updated = await updateCompanyKB({
        company_name: kbCompanyName,
        tagline_experience: kbTagline,
        headquarters: kbHeadquarters,
        contact_phone: kbPhone,
        contact_email: kbEmail,
        website_url: kbWebsite,
        master_kb_notes: kbMasterNotes,
        services_json: kbServices,
        is_active: kbIsActive,
      });
      setCompanyKb(updated);
      setKbActionSuccess("✓ Company Knowledge Base saved successfully!");
      setTimeout(() => setKbActionSuccess(null), 4000);
    } catch (e: any) {
      setKbActionError(e.message || "Failed to update Company Knowledge Base");
      setTimeout(() => setKbActionError(null), 5000);
    } finally {
      setKbSaving(false);
    }
  };

  const handleResetKBDefaults = async () => {
    if (!confirm("Are you sure you want to clear and reset the knowledge base?")) return;
    try {
      setKbResetting(true);
      setKbActionError(null);
      const reset = await resetCompanyKBDefaults();
      setCompanyKb(reset);
      setKbCompanyName("");
      setKbTagline("");
      setKbHeadquarters("");
      setKbPhone("");
      setKbEmail("");
      setKbWebsite("");
      setKbMasterNotes("");
      setKbServices([]);
      setKbActionSuccess("✓ Knowledge Base reset to clean state.");
      setTimeout(() => setKbActionSuccess(null), 4000);
    } catch (e: any) {
      setKbActionError(e.message || "Failed to reset defaults");
    } finally {
      setKbResetting(false);
    }
  };

  const handleUpdateServiceField = (index: number, field: keyof ServiceCatalogItem, value: string) => {
    setKbServices((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const handleAddService = () => {
    const newKey = `service_${Date.now()}`;
    setKbServices((prev) => [
      ...prev,
      {
        key: newKey,
        name: "New Software / Service Solution",
        url: "",
        target_industries: "",
        wedge: "Free Initial Gap Audit & Workflow Demo",
        features: "",
        solves_problems: "",
        description: "Specialized service offering for businesses needing operational automation.",
      },
    ]);
  };

  const handleRemoveService = (index: number) => {
    setKbServices((prev) => prev.filter((_, i) => i !== index));
  };

  const [inboxMonitorData, setInboxMonitorData] = useState<{
    total_inboxes_configured: number;
    inboxes: SMTPInboxItem[];
    persona_signatures: PersonaSignatureItem[];
  } | null>(null);
  const [inboxLoading, setInboxLoading] = useState(false);

  const [showAddInboxModal, setShowAddInboxModal] = useState(false);
  const [inboxForm, setInboxForm] = useState({
    host: "",
    port: 587,
    username: "",
    password: "",
    from_email: "",
    from_name: "Growth Team",
    daily_limit: 30,
  });
  const [inboxSubmitting, setInboxSubmitting] = useState(false);
  const [testingInboxId, setTestingInboxId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({});

  const [showAddPersonaModal, setShowAddPersonaModal] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaForm, setPersonaForm] = useState({
    title: "Primary Signature",
    raw_content: `Sincerely,
test
Senior Solutions Consultant, Multi-Lead Gen AI
Email: contact@leadgen.local | Phone: +880 1700-000000
https://leadgen.local`,
    is_active: true,
  });
  const [personaSubmitting, setPersonaSubmitting] = useState(false);
  const [selectedPreviewSigIdx, setSelectedPreviewSigIdx] = useState<number>(0);
  const [copiedSigId, setCopiedSigId] = useState<string | null>(null);

  const [showPurgeModal, setShowPurgeModal] = useState(false);
  const [purgeTarget, setPurgeTarget] = useState<"rejected_leads" | "search_runs" | "all_leads" | "factory_reset">("rejected_leads");
  const [purgeSubmitting, setPurgeSubmitting] = useState(false);
  const [purgeSuccessMsg, setPurgeSuccessMsg] = useState<string | null>(null);

  const loadInboxMonitor = async () => {
    try {
      setInboxLoading(true);
      const data = await fetchInboxMonitorStats();
      setInboxMonitorData(data);
    } catch (e) {
      console.warn("Could not load inbox monitor stats:", e);
    } finally {
      setInboxLoading(false);
    }
  };

  const handleSelectTab = (tab: "users" | "modules" | "company_kb" | "template" | "inboxes") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("admin_active_tab", tab);
    }
    if (tab === "inboxes") {
      loadInboxMonitor();
    } else if (tab === "company_kb") {
      loadCompanyKBData();
    }
  };

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [userActionSuccess, setUserActionSuccess] = useState<string | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createRole, setCreateRole] = useState<"admin" | "member">("member");
  const [createPermissions, setCreatePermissions] = useState<DashboardPermissions>({
    can_view_dashboard: true,
    can_view_leads: true,
    can_export_leads: true,
    can_run_research: false,
    can_access_autopilot: false,
    can_create_autopilot_campaigns: false,
    can_run_autopilot_cycle: false,
    can_verify_autopilot_leads: false,
    can_edit_campaigns: false,
    can_access_voice: false,
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<DashboardPermissions>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Admin Reset User Password state
  const [resetUser, setResetUser] = useState<AuthUser | null>(null);
  const [resetPasswordVal, setResetPasswordVal] = useState("");
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState("");
  const [resetPasswordError, setResetPasswordError] = useState<string | null>(null);
  const [resetPasswordSuccess, setResetPasswordSuccess] = useState<string | null>(null);
  const [resetPasswordSubmitting, setResetPasswordSubmitting] = useState(false);
  const [showResetPassEye, setShowResetPassEye] = useState(false);

  // Admin Edit User Details (Email, Name, Role)
  const [editDetailsUser, setEditDetailsUser] = useState<AuthUser | null>(null);
  const [editDetailsForm, setEditDetailsForm] = useState({
    full_name: "",
    email: "",
    role: "member",
  });
  const [editDetailsSubmitting, setEditDetailsSubmitting] = useState(false);
  const [editDetailsError, setEditDetailsError] = useState<string | null>(null);
  const [editDetailsSuccess, setEditDetailsSuccess] = useState<string | null>(null);

  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplSuccess, setTplSuccess] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

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

  const loadUsersList = async () => {
    try {
      setUsersLoading(true);
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      console.warn("Could not load users list:", e);
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get("tab");
      if (tabParam === "users" || tabParam === "modules" || tabParam === "template") {
        setActiveTab(tabParam as any);
      } else {
        const savedTab = sessionStorage.getItem("admin_active_tab");
        if (savedTab === "users" || savedTab === "modules" || savedTab === "template") {
          setActiveTab(savedTab as any);
        }
      }
    }
  }, []);

  useEffect(() => {
    async function initAuth() {
      const stored = getStoredUser();
      if (stored) {
        setCurrentUser(stored);
        if (stored.role !== "super_admin" && stored.role !== "admin") {
          setActiveTab("modules");
        }
      }
      try {
        const fresh = await fetchCurrentUser();
        if (fresh) {
          setCurrentUser(fresh);
          if (fresh.role !== "super_admin" && fresh.role !== "admin") {
            setActiveTab("modules");
          }
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
      if (user && user.role !== "super_admin" && user.role !== "admin") {
        setActiveTab("modules");
      }
    };
    window.addEventListener("auth_change", handleAuthChange);
    return () => window.removeEventListener("auth_change", handleAuthChange);
  }, []);

  useEffect(() => {
    if (currentUser) {
      loadUsersList();

      async function loadTemplate() {
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
      loadCompanyKBData();
    }
  }, [currentUser]);

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

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  const handleCreateUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserActionError(null);
    setUserActionSuccess(null);
    setCreateSubmitting(true);

    try {
      await createUser({
        full_name: createName,
        email: createEmail,
        password: createPassword,
        role: createRole,
        permissions_json: createPermissions,
      });
      setUserActionSuccess(`Successfully created user '${createEmail}' with role '${createRole}'.`);
      setShowCreateModal(false);
      setCreateName("");
      setCreateEmail("");
      setCreatePassword("");
      setCreateRole("member");
      setCreatePermissions({
        can_view_dashboard: true,
        can_view_leads: true,
        can_export_leads: true,
        can_run_research: false,
        can_access_autopilot: false,
        can_create_autopilot_campaigns: false,
        can_run_autopilot_cycle: false,
        can_verify_autopilot_leads: false,
        can_edit_campaigns: false,
        can_access_voice: false,
      });
      await loadUsersList();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to create user account");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleOpenEditPermissions = (u: AuthUser) => {
    setEditingUser(u);
    setEditPermissions(u.permissions_json || {
      can_view_dashboard: true,
      can_view_leads: true,
      can_export_leads: true,
      can_run_research: false,
      can_access_autopilot: false,
      can_create_autopilot_campaigns: false,
      can_run_autopilot_cycle: false,
      can_verify_autopilot_leads: false,
      can_edit_campaigns: false,
      can_access_voice: false,
    });
  };

  const handleSavePermissions = async () => {
    if (!editingUser) return;
    setEditSubmitting(true);
    setUserActionError(null);
    setUserActionSuccess(null);

    try {
      const updated = await updateMemberPermissions(editingUser.id, editPermissions);
      setUserActionSuccess(`Updated dashboard permissions for ${editingUser.email}.`);
      if (currentUser && currentUser.id === editingUser.id) {
        setCurrentUser(updated);
        localStorage.setItem("leadgen_user", JSON.stringify(updated));
        window.dispatchEvent(new Event("auth_change"));
      }
      setEditingUser(null);
      await loadUsersList();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to update permissions");
    } finally {
      setEditSubmitting(false);
    }
  };

  const handleOpenResetPassword = (u: AuthUser) => {
    setResetUser(u);
    setResetPasswordVal("");
    setResetPasswordConfirm("");
    setResetPasswordError(null);
    setResetPasswordSuccess(null);
  };

  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUser) return;
    setResetPasswordError(null);
    setResetPasswordSuccess(null);

    if (resetPasswordVal.length < 6) {
      setResetPasswordError("Password must be at least 6 characters long.");
      return;
    }
    if (resetPasswordVal !== resetPasswordConfirm) {
      setResetPasswordError("New password and confirmation do not match.");
      return;
    }

    setResetPasswordSubmitting(true);
    try {
      await adminResetPassword(resetUser.id, resetPasswordVal);
      setResetPasswordSuccess(`Password successfully updated for ${resetUser.email}!`);
      setTimeout(() => {
        setResetUser(null);
        setResetPasswordSuccess(null);
      }, 1500);
    } catch (err: any) {
      setResetPasswordError(err.message || "Failed to reset password");
    } finally {
      setResetPasswordSubmitting(false);
    }
  };

  const handleOpenEditDetails = (u: AuthUser) => {
    setEditDetailsUser(u);
    setEditDetailsForm({
      full_name: u.full_name || "",
      email: u.email || "",
      role: u.role || "member",
    });
    setEditDetailsError(null);
    setEditDetailsSuccess(null);
  };

  const handleSaveUserDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editDetailsUser) return;
    setEditDetailsError(null);
    setEditDetailsSuccess(null);

    if (!editDetailsForm.email || !editDetailsForm.email.includes("@")) {
      setEditDetailsError("Please provide a valid email address.");
      return;
    }

    setEditDetailsSubmitting(true);
    try {
      const updated = await updateUser(editDetailsUser.id, {
        full_name: editDetailsForm.full_name,
        email: editDetailsForm.email,
        role: editDetailsForm.role,
      });
      setEditDetailsSuccess(`User details updated successfully for ${updated.email}!`);
      if (currentUser && currentUser.id === editDetailsUser.id) {
        setCurrentUser(updated);
        localStorage.setItem("leadgen_user", JSON.stringify(updated));
        window.dispatchEvent(new Event("auth_change"));
      }
      await loadUsersList();
      setTimeout(() => {
        setEditDetailsUser(null);
        setEditDetailsSuccess(null);
      }, 1200);
    } catch (err: any) {
      setEditDetailsError(err.message || "Failed to update user details");
    } finally {
      setEditDetailsSubmitting(false);
    }
  };

  const handleDeleteUser = async (u: AuthUser) => {

    if (u.role === "super_admin" && currentUser?.role !== "super_admin") {
      alert("Security Violation: Admins are strictly prohibited from removing Super Administrators.");
      return;
    }

    if (u.id === currentUser?.id) {
      alert("You cannot delete your own account.");
      return;
    }

    if (!confirm(`Are you sure you want to permanently delete user '${u.full_name}' (${u.email})?`)) {
      return;
    }

    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      await deleteUser(u.id);
      setUserActionSuccess(`User '${u.email}' removed from system.`);
      await loadUsersList();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to delete user");
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setTplSaving(true);
    setTplSuccess(null);
    setTplError(null);

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
        is_active: true,
      });
      setTemplate(updated);
      setTplSuccess("Universal email outreach template & signature updated successfully!");
    } catch (err: any) {
      setTplError(err.message || "Failed to update email template");
    } finally {
      setTplSaving(false);
    }
  };

  const handleOpenAddInbox = () => {
    setInboxForm({
      host: "",
      port: 587,
      username: "",
      password: "",
      from_email: "",
      from_name: "Growth Team",
      daily_limit: 30,
    });
    setShowAddInboxModal(true);
  };

  const handleAddInboxSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setInboxSubmitting(true);

    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      await createSMTPInbox(inboxForm);
      setUserActionSuccess("SMTP Sending Inbox added successfully!");
      setShowAddInboxModal(false);
      setInboxForm({
        host: "",
        port: 587,
        username: "",
        password: "",
        from_email: "",
        from_name: "Growth Team",
        daily_limit: 30,
      });
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to add SMTP inbox");
    } finally {
      setInboxSubmitting(false);
    }
  };

  const handleDeleteInbox = async (inboxId: string) => {
    if (!confirm("Are you sure you want to remove this SMTP Inbox?")) return;
    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      await deleteSMTPInbox(inboxId);
      setUserActionSuccess("SMTP Inbox removed.");
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to remove inbox");
    }
  };

  const handleTestInbox = async (inboxId: string) => {
    setTestingInboxId(inboxId);
    try {
      const res = await testSMTPInbox(inboxId);
      setTestResults((prev) => ({
        ...prev,
        [inboxId]: { ok: true, msg: res.message || "Connection Verified!" },
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [inboxId]: { ok: false, msg: err.message || "Connection Failed" },
      }));
    } finally {
      setTestingInboxId(null);
    }
  };

  const handleOpenAddPersona = () => {
    setEditingPersonaId(null);
    const count = (inboxMonitorData?.persona_signatures?.length || 0) + 1;
    setPersonaForm({
      title: `Signature Note #${count}`,
      raw_content: `Sincerely,
test
Senior Solutions Consultant, Multi-Lead Gen AI
Email: contact@leadgen.local | Phone: +880 1700-000000
https://leadgen.local`,
      is_active: true,
    });
    setShowAddPersonaModal(true);
  };

  const handleOpenEditPersona = (p: PersonaSignatureItem) => {
    setEditingPersonaId(p.id);
    setPersonaForm({
      title: p.title || "Signature Note",
      raw_content: p.raw_content || `${p.name || ''}\n${p.title || ''}\n${p.company || ''}`.trim(),
      is_active: p.is_active !== false,
    });
    setShowAddPersonaModal(true);
  };

  const handleAddOrEditPersonaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPersonaSubmitting(true);
    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      if (editingPersonaId) {
        await updatePersonaSignature(editingPersonaId, personaForm);
        setUserActionSuccess("Signature Note Card updated successfully!");
      } else {
        await createPersonaSignature(personaForm);
        setUserActionSuccess("Signature Note Card added to rotation pool!");
      }
      setShowAddPersonaModal(false);
      setEditingPersonaId(null);
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to save Signature Card");
    } finally {
      setPersonaSubmitting(false);
    }
  };

  const handleTogglePersona = async (personaId: string) => {
    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      const res = await togglePersonaSignature(personaId);
      setUserActionSuccess(res.message || "Signature Card status updated");
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to toggle Signature Card");
    }
  };

  const handleDeletePersona = async (personaId: string) => {
    if (!confirm("Are you sure you want to delete this Signature Note Card?")) return;
    setUserActionError(null);
    setUserActionSuccess(null);
    try {
      await deletePersonaSignature(personaId);
      setUserActionSuccess("Signature Note Card removed from rotation pool.");
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to remove Signature Card");
    }
  };

  const handlePurgeData = async () => {
    setPurgeSubmitting(true);
    setUserActionError(null);
    setPurgeSuccessMsg(null);
    try {
      const res = await purgeDatabaseData(purgeTarget);
      setPurgeSuccessMsg(res.message || "Operation completed successfully");
      setUserActionSuccess(res.message || "Database updated");
      setTimeout(() => {
        setShowPurgeModal(false);
        setPurgeSuccessMsg(null);
      }, 1500);
      await loadInboxMonitor();
    } catch (err: any) {
      setUserActionError(err.message || "Failed to purge database");
    } finally {
      setPurgeSubmitting(false);
    }
  };

  const sampleLeads = {
    tropical: {
      company_name: "Apex Global Dental Group",
      contact_person: "Dr. Sarah Miller",
      location: "San Francisco, CA",
      website: "apexdentalgroup.com",
      phone: "+1 415-555-0199",
      primary_gap: "Missing Meta advertising pixel and no Google Analytics tracking detected",
    },
    cafe: {
      company_name: "The Artisan Roast Café",
      contact_person: "David Clark",
      location: "Austin, TX",
      website: "artisanroast.com",
      phone: "+1 512-555-0144",
      primary_gap: "Missing mobile-responsive viewport and no direct online reservation system",
    },
    nowebsite: {
      company_name: "Bay Area Premier Roofing",
      contact_person: "Michael Johnson",
      location: "Oakland, CA",
      website: "",
      phone: "+1 510-555-0182",
      primary_gap: "Zero digital website infrastructure; operating only through directory listings",
    },
  };

  const activeSigs = inboxMonitorData?.persona_signatures?.filter((p) => p.is_active !== false) || [];
  const currentPreviewSig = activeSigs.length > 0
    ? (activeSigs[selectedPreviewSigIdx % activeSigs.length]?.raw_content || "")
    : (signatureText || `Sincerely,\ntest\nSenior Solutions Consultant, Multi-Lead Gen AI\nEmail: contact@leadgen.local | Phone: +880 1700-000000\nhttps://leadgen.local`);

  const currentPreviewLead = sampleLeads[previewSample];
  const renderedPreview = renderEmailTemplate(
    {
      subject,
      body,
      sender_name: senderName,
      sender_title: senderTitle,
      sender_company: senderCompany,
      sender_email: senderEmail,
      sender_phone: senderPhone,
      sender_website: senderWebsite,
      sign_off: signOff,
      signature_text: currentPreviewSig,
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

  if (!currentUser) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md">

          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500/20 via-sky-500/10 to-indigo-500/20 border border-sky-500/30 text-sky-400 mb-3 shadow-lg shadow-sky-500/10">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">
              Admin & Access Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Secure role-based authentication for Super Admins and Operational Admins.
            </p>
          </div>

          <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

            <form onSubmit={handleLoginSubmit} className="space-y-4 relative z-10" autoComplete="off">

              <input type="text" name="fake_username_autofill_blocker" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />
              <input type="password" name="fake_password_autofill_blocker" style={{ display: "none" }} tabIndex={-1} autoComplete="off" />

              {loginError && (
                <div className="flex items-center gap-2 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{loginError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    name="admin_user_email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    placeholder="Enter admin email address"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="password"
                    name="admin_user_password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="••••••••••••"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 transition"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginSubmitting}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-semibold rounded-xl text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 disabled:opacity-50 mt-2"
              >
                {loginSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950/40 border-t-slate-950 rounded-full animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" />
                    <span>Sign In to Admin Portal</span>
                  </>
                )}
              </button>
            </form>

            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Argon2id Encrypted & Signed RBAC Tokens</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalUsers = users.length;
  const superAdminCount = users.filter((u) => u.role === "super_admin").length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const memberCount = users.filter((u) => u.role !== "super_admin" && u.role !== "admin").length;

  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const isMember = !isSuperAdmin && !isAdmin;

  return (
    <div className="max-w-6xl mx-auto space-y-6">

      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        {!isMember && (
          <button
            type="button"
            onClick={() => handleSelectTab("users")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "users"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Team & Access Control (RBAC)</span>
            <span className="px-1.5 py-0.2 rounded-full bg-slate-800 text-[10px] text-slate-300 font-mono">
              {totalUsers}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={() => handleSelectTab("modules")}
          className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === "modules"
              ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Compass className="w-4 h-4" />
          <span>Operations Modules</span>
        </button>

        {!isMember && (
          <button
            type="button"
            onClick={() => handleSelectTab("company_kb")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "company_kb"
                ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Briefcase className="w-4 h-4 text-purple-400" />
            <span>Company KB & Service Catalog</span>
          </button>
        )}

        {!isMember && (
          <button
            type="button"
            onClick={() => handleSelectTab("template")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "template"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <PenTool className="w-4 h-4" />
            <span>Global Email Template</span>
          </button>
        )}

        {!isMember && (
          <button
            type="button"
            onClick={() => handleSelectTab("inboxes")}
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
              activeTab === "inboxes"
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-sm"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
            }`}
          >
            <Inbox className="w-4 h-4 text-emerald-400" />
            <span>Multi-SMTP 20x & Persona Monitor</span>
          </button>
        )}
      </div>

      {userActionSuccess && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{userActionSuccess}</span>
          </div>
          <button onClick={() => setUserActionSuccess(null)} className="text-emerald-400 hover:text-emerald-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {userActionError && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{userActionError}</span>
          </div>
          <button onClick={() => setUserActionError(null)} className="text-rose-400 hover:text-rose-300">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {activeTab === "users" && (
        <div className="space-y-6 animate-in fade-in duration-200">

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
              <span className="text-[11px] font-medium text-slate-400">Total Team Users</span>
              <div className="text-2xl font-bold text-white mt-1">{totalUsers}</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-amber-500/20">
              <span className="text-[11px] font-medium text-amber-300 flex items-center gap-1">
                <Crown className="w-3.5 h-3.5 text-amber-400" /> Super Admins
              </span>
              <div className="text-2xl font-bold text-amber-300 mt-1">{superAdminCount}</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-sky-500/20">
              <span className="text-[11px] font-medium text-sky-300 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-sky-400" /> Operational Admins
              </span>
              <div className="text-2xl font-bold text-sky-300 mt-1">{adminCount}</div>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/80 border border-emerald-500/20 flex flex-col justify-between">
              <div>
                <span className="text-[11px] font-medium text-emerald-300">Team Members</span>
                <div className="text-2xl font-bold text-emerald-300 mt-1">{memberCount}</div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-sky-400" />
                <span>Authorized Users & Dashboard Permissions</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage accounts, define role levels, and toggle dashboard permissions.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-sky-500/20"
            >
              <UserPlus className="w-4 h-4" />
              <span>Add New User</span>
            </button>
          </div>

          <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
            {usersLoading ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                Loading team members...
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm min-w-[750px]">
                  <thead className="bg-slate-900/90 text-xs text-slate-400 border-b border-slate-800 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3.5 px-4">User & Contact</th>
                      <th className="py-3.5 px-4">Role Level</th>
                      <th className="py-3.5 px-4">Dashboard Permissions</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-normal">
                    {users.map((u) => {
                      const isTargetSuper = u.role === "super_admin";
                      const isTargetAdmin = u.role === "admin";
                      const canDelete = isSuperAdmin ? u.id !== currentUser.id : !isTargetSuper && !isTargetAdmin && u.id !== currentUser.id;
                      const canEditPerms = isSuperAdmin || (!isTargetSuper && !isTargetAdmin);
                      const canResetPass = isSuperAdmin || (!isTargetSuper && !isTargetAdmin);
                      const canEditUser = isSuperAdmin || (!isTargetSuper && !isTargetAdmin);

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">

                          <td className="py-4 px-4">
                            <div className="flex items-center gap-3">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
                                isTargetSuper
                                  ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                                  : isTargetAdmin
                                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                                  : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                              }`}>
                                {u.full_name?.slice(0, 2).toUpperCase() || "US"}
                              </div>
                              <div>
                                <div className="font-semibold text-white flex items-center gap-1.5">
                                  <span>{u.full_name}</span>
                                  {u.id === currentUser.id && (
                                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-300 font-mono">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-400 font-mono">{u.email}</div>
                              </div>
                            </div>
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-0.5 rounded-full border ${
                              isTargetSuper
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                                : isTargetAdmin
                                ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                                : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                            }`}>
                              {isTargetSuper && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                              {isTargetAdmin && <Shield className="w-3.5 h-3.5 text-sky-400" />}
                              {!isTargetSuper && !isTargetAdmin && <UserIcon className="w-3 h-3 text-emerald-400" />}
                              <span>{isTargetSuper ? "Super Admin" : isTargetAdmin ? "Admin" : "Team Member"}</span>
                            </span>
                          </td>

                          <td className="py-4 px-4 text-xs">
                            {isTargetSuper ? (
                              <span className="text-xs font-mono text-purple-300 font-semibold">
                                ★ Full Master Access (All Modules)
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5 flex-wrap max-w-sm">
                                {u.permissions_json?.can_view_dashboard !== false && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                                    Dashboard
                                  </span>
                                )}
                                {u.permissions_json?.can_view_leads !== false && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                    Leads
                                  </span>
                                )}
                                {u.permissions_json?.can_export_leads !== false && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                                    Export
                                  </span>
                                )}
                                {u.permissions_json?.can_run_research && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                    Research
                                  </span>
                                )}
                                {u.permissions_json?.can_access_autopilot && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 font-bold">
                                    Autopilot {u.permissions_json?.can_create_autopilot_campaigns ? "• Search" : ""}
                                  </span>
                                )}
                                {u.permissions_json?.can_edit_campaigns && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500/10 text-pink-400 border border-pink-500/20">
                                    Campaigns
                                  </span>
                                )}
                                {u.permissions_json?.can_access_voice && (
                                  <span className="text-[10px] px-2 py-0.5 rounded bg-teal-500/10 text-teal-400 border border-teal-500/20">
                                    Voice
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              Active
                            </span>
                          </td>

                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">

                              {canEditUser && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditDetails(u)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                                  title={`Edit name, email, and role for ${u.email}`}
                                >
                                  <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                                  <span>Edit</span>
                                </button>
                              )}

                              {canEditPerms ? (
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditPermissions(u)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                                  title="Edit dashboard permissions"
                                >
                                  <Sliders className="w-3.5 h-3.5" />
                                  <span>Permissions</span>
                                </button>
                              ) : (
                                <span
                                  title="Super Admin permissions are permanently unlocked"
                                  className="px-2.5 py-1 rounded-lg bg-slate-900 text-slate-600 border border-slate-800 text-xs flex items-center gap-1 cursor-not-allowed"
                                >
                                  <Lock className="w-3 h-3" /> Locked
                                </span>
                              )}

                              {canResetPass && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenResetPassword(u)}
                                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700 text-xs font-medium flex items-center gap-1 transition cursor-pointer"
                                  title={`Reset password for ${u.email}`}
                                >
                                  <Key className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Reset Pass</span>
                                </button>
                              )}

                              {canDelete ? (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteUser(u)}
                                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition cursor-pointer"
                                  title={`Delete user account '${u.email}'`}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ) : (
                                <span
                                  title={
                                    isTargetSuper
                                      ? "Security Rule: Admins cannot remove Super Admins"
                                      : isTargetAdmin
                                      ? "Only Super Admins can remove Admin accounts"
                                      : "Cannot delete your own account"
                                  }
                                  className="p-1.5 rounded-lg bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed inline-flex items-center"
                                >
                                  <Lock className="w-3.5 h-3.5" />
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Create New Team Account</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUserSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Alex Vance"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="user@leadgen.local"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Temporary Password
                </label>
                <input
                  type="password"
                  required
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Account Role
                </label>
                {isSuperAdmin ? (
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as "admin" | "member")}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="member">Team Member / Reviewer</option>
                    <option value="admin">Operational Administrator</option>
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center justify-between">
                    <span className="font-semibold text-emerald-400">Team Member / Assigned User</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      (Only Super Admins can add Admins)
                    </span>
                  </div>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2">
                <span className="text-xs font-semibold text-slate-300 block">
                  Assign Dashboard Permissions:
                </span>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_view_dashboard !== false}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_view_dashboard: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">View Dashboard</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_view_leads !== false}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_view_leads: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">View Leads</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_export_leads !== false}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_export_leads: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">Download Sheets</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_run_research === true}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_run_research: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">Launch Research</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_edit_campaigns === true}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_edit_campaigns: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">Ad Campaigns</span>
                  </label>

                  <label className="flex items-center gap-2 p-2 rounded-lg bg-slate-950/60 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                    <input
                      type="checkbox"
                      checked={createPermissions.can_access_voice === true}
                      onChange={(e) =>
                        setCreatePermissions({ ...createPermissions, can_access_voice: e.target.checked })
                      }
                      className="rounded accent-sky-500"
                    />
                    <span className="text-slate-300">Voice Agent</span>
                  </label>

                  <div className="col-span-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/30 space-y-2.5">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                      <div className="flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
                        <span className="text-amber-300 font-bold text-xs">Autonomous Cold Email & Autopilot Suite</span>
                      </div>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={createPermissions.can_access_autopilot === true}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setCreatePermissions({
                              ...createPermissions,
                              can_access_autopilot: val,
                              can_create_autopilot_campaigns: val ? createPermissions.can_create_autopilot_campaigns : false,
                              can_run_autopilot_cycle: val ? createPermissions.can_run_autopilot_cycle : false,
                              can_verify_autopilot_leads: val ? createPermissions.can_verify_autopilot_leads : false,
                            });
                          }}
                          className="rounded accent-amber-500"
                        />
                        <span className="text-[11px] font-semibold text-amber-400">Enable Access</span>
                      </label>
                    </div>

                    {createPermissions.can_access_autopilot && (
                      <div className="space-y-1.5 pl-4 pt-1">
                        <label className="flex items-center justify-between text-xs cursor-pointer">
                          <span className="text-slate-300">Allow Search Input & Campaign Configuration</span>
                          <input
                            type="checkbox"
                            checked={createPermissions.can_create_autopilot_campaigns === true}
                            onChange={(e) =>
                              setCreatePermissions({ ...createPermissions, can_create_autopilot_campaigns: e.target.checked })
                            }
                            className="rounded accent-amber-500"
                          />
                        </label>
                        <label className="flex items-center justify-between text-xs cursor-pointer">
                          <span className="text-slate-300">Allow Triggering Search Runs & Batches</span>
                          <input
                            type="checkbox"
                            checked={createPermissions.can_run_autopilot_cycle === true}
                            onChange={(e) =>
                              setCreatePermissions({ ...createPermissions, can_run_autopilot_cycle: e.target.checked })
                            }
                            className="rounded accent-amber-500"
                          />
                        </label>
                        <label className="flex items-center justify-between text-xs cursor-pointer">
                          <span className="text-slate-300">Allow Quality Review & Email Approvals</span>
                          <input
                            type="checkbox"
                            checked={createPermissions.can_verify_autopilot_leads === true}
                            onChange={(e) =>
                              setCreatePermissions({ ...createPermissions, can_verify_autopilot_leads: e.target.checked })
                            }
                            className="rounded accent-amber-500"
                          />
                        </label>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {createSubmitting ? "Creating..." : "Confirm & Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Dashboard Permissions</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div>
              <p className="text-xs text-slate-300">
                Configure module and feature permissions for: <strong className="text-sky-400">{editingUser.email}</strong>
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">View Dashboard & Statistics</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_view_dashboard !== false}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_view_dashboard: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">View & Filter Qualified Leads</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_view_leads !== false}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_view_leads: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">Export Leads (Sheet & JSON)</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_export_leads !== false}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_export_leads: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">Launch OpenClaw Research</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_run_research === true}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_run_research: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">Manage Ad Campaigns</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_edit_campaigns === true}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_edit_campaigns: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800 cursor-pointer hover:bg-slate-800/40 transition">
                <span className="text-slate-200 font-medium">Access AI Voice Agent</span>
                <input
                  type="checkbox"
                  checked={editPermissions.can_access_voice === true}
                  onChange={(e) =>
                    setEditPermissions({ ...editPermissions, can_access_voice: e.target.checked })
                  }
                  className="rounded accent-sky-500 w-4 h-4"
                />
              </label>

              <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400 fill-current" />
                    <div>
                      <span className="text-amber-300 font-bold text-xs block">Autonomous Cold Email & Autopilot Suite</span>
                      <span className="text-[10px] text-slate-400">Granular controls (Super Admin Controlled)</span>
                    </div>
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editPermissions.can_access_autopilot === true}
                      onChange={(e) => {
                        const val = e.target.checked;
                        setEditPermissions({
                          ...editPermissions,
                          can_access_autopilot: val,
                          can_create_autopilot_campaigns: val ? editPermissions.can_create_autopilot_campaigns : false,
                          can_run_autopilot_cycle: val ? editPermissions.can_run_autopilot_cycle : false,
                          can_verify_autopilot_leads: val ? editPermissions.can_verify_autopilot_leads : false,
                        });
                      }}
                      className="rounded accent-amber-500 w-4 h-4"
                    />
                    <span className="text-[11px] font-semibold text-amber-400">Enable Module</span>
                  </label>
                </div>

                {editPermissions.can_access_autopilot && (
                  <div className="space-y-2 pt-1 pl-6">
                    <label className="flex items-center justify-between cursor-pointer text-xs">
                      <div>
                        <span className="text-slate-200 block font-medium">Configure Search Inputs & Campaigns</span>
                        <span className="text-[10px] text-slate-500">Allows adding keywords, country, subcities & daily limits</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editPermissions.can_create_autopilot_campaigns === true}
                        onChange={(e) =>
                          setEditPermissions({ ...editPermissions, can_create_autopilot_campaigns: e.target.checked })
                        }
                        className="rounded accent-amber-500 w-4 h-4"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer text-xs">
                      <div>
                        <span className="text-slate-200 block font-medium">Trigger Search & Batch Cycles</span>
                        <span className="text-[10px] text-slate-500">Allows clicking "Run Cycle Now" for discovery batches</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editPermissions.can_run_autopilot_cycle === true}
                        onChange={(e) =>
                          setEditPermissions({ ...editPermissions, can_run_autopilot_cycle: e.target.checked })
                        }
                        className="rounded accent-amber-500 w-4 h-4"
                      />
                    </label>

                    <label className="flex items-center justify-between cursor-pointer text-xs">
                      <div>
                        <span className="text-slate-200 block font-medium">Quality Verification & Email Approvals</span>
                        <span className="text-[10px] text-slate-500">Allows reviewing leads and approving into outreach queue</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editPermissions.can_verify_autopilot_leads === true}
                        onChange={(e) =>
                          setEditPermissions({ ...editPermissions, can_verify_autopilot_leads: e.target.checked })
                        }
                        className="rounded accent-amber-500 w-4 h-4"
                      />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSubmitting}
                onClick={handleSavePermissions}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {editSubmitting ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Reset User Password</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {resetUser.full_name} ({resetUser.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetUser(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {resetPasswordError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{resetPasswordError}</span>
              </div>
            )}

            {resetPasswordSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{resetPasswordSuccess}</span>
              </div>
            )}

            <form onSubmit={handleResetPasswordSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type={showResetPassEye ? "text" : "password"}
                    required
                    minLength={6}
                    value={resetPasswordVal}
                    onChange={(e) => setResetPasswordVal(e.target.value)}
                    placeholder="Enter new password (min. 6 chars)"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 pr-9 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPassEye(!showResetPassEye)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                  >
                    {showResetPassEye ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={resetPasswordConfirm}
                  onChange={(e) => setResetPasswordConfirm(e.target.value)}
                  placeholder="Repeat new password"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setResetUser(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resetPasswordSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-amber-500/20"
                >
                  {resetPasswordSubmitting ? "Resetting..." : "Confirm & Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editDetailsUser && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Edit User Profile</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    ID: {editDetailsUser.id.slice(0, 8)}...
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditDetailsUser(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            {editDetailsError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editDetailsError}</span>
              </div>
            )}

            {editDetailsSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>{editDetailsSuccess}</span>
              </div>
            )}

            <form onSubmit={handleSaveUserDetails} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={editDetailsForm.full_name}
                  onChange={(e) => setEditDetailsForm({ ...editDetailsForm, full_name: e.target.value })}
                  placeholder="e.g. Sarah Jenkins"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  value={editDetailsForm.email}
                  onChange={(e) => setEditDetailsForm({ ...editDetailsForm, email: e.target.value })}
                  placeholder="user@leadgen.local"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Role Level
                </label>
                <select
                  value={editDetailsForm.role}
                  onChange={(e) => setEditDetailsForm({ ...editDetailsForm, role: e.target.value })}
                  disabled={!isSuperAdmin && editDetailsUser.role === "admin"}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                >
                  {isSuperAdmin && <option value="super_admin">Super Admin (Master Access)</option>}
                  <option value="admin">Admin (Team & Settings)</option>
                  <option value="member">Team Member / Sales</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditDetailsUser(null)}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editDetailsSubmitting}
                  className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50 cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  {editDetailsSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {activeTab === "modules" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">

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

            <div className="pt-6 space-y-2">
              {hasPermission(currentUser, "can_run_research", false) ? (
                <Link
                  href="/research"
                  className="w-full py-2.5 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20"
                >
                  <span>Launch New Lead Discovery</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              ) : (
                <div
                  title="Your account does not have permission to launch new research runs"
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Launch Discovery (No Permission)</span>
                </div>
              )}

              {hasPermission(currentUser, "can_view_leads", true) ? (
                <Link
                  href="/leads"
                  className="w-full py-2 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs flex items-center justify-center gap-2 transition border border-slate-700"
                >
                  <span>View Qualified Leads Pipeline</span>
                </Link>
              ) : (
                <div
                  title="Your account does not have permission to view qualified leads"
                  className="w-full py-2 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>View Leads Pipeline (No Permission)</span>
                </div>
              )}

              {hasPermission(currentUser, "can_access_autopilot", false) ? (
                <Link
                  href="/autopilot"
                  className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-sky-600 to-indigo-600 hover:from-amber-400 hover:via-sky-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition shadow-lg shadow-sky-500/20"
                >
                  <Zap className="w-3.5 h-3.5 fill-current text-amber-300" />
                  <span>Autonomous Cold Email & Autopilot</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              ) : (
                <div
                  title="Restricted: Only Super Admin can access Autonomous Outreach by default. Can be enabled via permissions filter."
                  className="w-full py-2.5 px-4 rounded-xl bg-slate-900 border border-slate-800 text-slate-500 font-medium text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none"
                >
                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                  <span>Autonomous Outreach (Super Admin Only)</span>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/80 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-pink-500/10 border border-pink-500/30 text-pink-400 flex items-center justify-center shadow-md shadow-pink-500/10">
                  <Megaphone className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Coming Soon</span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Meta Ads & Marketing Automation</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Dedicated strictly to managing Facebook & Instagram marketing campaigns, ad sets, live pixel conversion tracking, and budgets.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="text-[11px] font-mono text-pink-400/90 font-semibold uppercase tracking-wider flex items-center justify-between">
                  <span>META ADS FEATURES:</span>
                  <span className="text-[10px] font-mono text-amber-400/90 font-normal flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" /> Module Locked
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Multi-Campaign Orchestration:</strong> Create and manage cold traffic, lead form, and conversion campaigns.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Target Audience Precision:</strong> Target by geographic coordinates, verified radius, and industry interest.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Live Conversion Tracking:</strong> Direct sync with Meta Marketing API v21.0 and Conversions API (CAPI).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-pink-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Dynamic Creative Generator:</strong> AI produces tailored ad copy based on verified solvable gap parameters.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6">
              <div className="w-full py-2.5 px-4 rounded-xl bg-slate-850/80 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none shadow-inner bg-slate-900">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono uppercase tracking-wider text-[11px]">Coming Soon</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-slate-900/90 to-slate-950 border border-slate-800/80 p-6 flex flex-col justify-between transition-all duration-300 shadow-xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center shadow-md shadow-emerald-500/10">
                  <PhoneCall className="w-6 h-6" />
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold uppercase tracking-wider">
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Coming Soon</span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span>Autonomous Voice Outreach</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  Dedicated strictly to automated phone outreach, natural multi-turn conversations, objection handling, and appointment booking.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-800/80 space-y-2">
                <div className="text-[11px] font-mono text-emerald-400/90 font-semibold uppercase tracking-wider flex items-center justify-between">
                  <span>VOICE OUTREACH FEATURES:</span>
                  <span className="text-[10px] font-mono text-amber-400/90 font-normal flex items-center gap-1">
                    <Lock className="w-2.5 h-2.5 text-amber-400" /> Module Locked
                  </span>
                </div>
                <ul className="space-y-1.5 text-xs text-slate-400">
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Automated Phone Dialing:</strong> AI voice caller initiates cold outreach to qualified business phone numbers.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Multi-Turn Voice Dialogue:</strong> Answers company questions and overcomes pricing/timeline objections dynamically.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Meeting Booking:</strong> Direct calendar slot reservation when the decision maker shows positive buying intent.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-emerald-400/60 font-bold mt-0.5">✓</span>
                    <span><strong>Call Transcripts & Audio Playback:</strong> Full dialogue transcripts and audio review for every completed call.</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="pt-6">
              <div className="w-full py-2.5 px-4 rounded-xl bg-slate-850/80 text-amber-300 border border-amber-500/30 font-semibold text-xs flex items-center justify-center gap-2 cursor-not-allowed select-none shadow-inner bg-slate-900">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-mono uppercase tracking-wider text-[11px]">Coming Soon</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "company_kb" && (
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden animate-in fade-in duration-200">
          <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-500/20 to-indigo-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Company Knowledge Base & Service Catalog</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                      Demand-Side Gate v2
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Configure your agency identity and custom software wedge offers. Used dynamically by Fit Gate and discovery call scripts.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleResetKBDefaults}
                disabled={kbResetting || kbLoading}
                className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold flex items-center gap-2 transition disabled:opacity-50 cursor-pointer"
                title="Reset service catalog to the 5 default core software offerings"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${kbResetting ? "animate-spin" : ""}`} />
                <span>Reset Defaults</span>
              </button>

              <button
                type="button"
                onClick={handleSaveCompanyKB}
                disabled={kbSaving || kbLoading}
                className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 transition disabled:opacity-50 cursor-pointer"
              >
                <Save className={`w-3.5 h-3.5 ${kbSaving ? "animate-spin" : ""}`} />
                <span>{kbSaving ? "Saving..." : "Save Knowledge Base"}</span>
              </button>
            </div>
          </div>

          {kbActionSuccess && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{kbActionSuccess}</span>
            </div>
          )}

          {kbActionError && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{kbActionError}</span>
            </div>
          )}

          <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                <Building2 className="w-4 h-4 text-purple-400" />
                <span>Agency / Company Identity & Credentials</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <span>Active Profile</span>
                <input
                  type="checkbox"
                  checked={kbIsActive}
                  onChange={(e) => setKbIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-purple-600 bg-slate-900 border-slate-700 cursor-pointer"
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Company / Agency Name <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  value={kbCompanyName}
                  onChange={(e) => setKbCompanyName(e.target.value)}
                  placeholder="e.g. Acme Software / Your Agency Name"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Experience & Value Tagline
                </label>
                <input
                  type="text"
                  value={kbTagline}
                  onChange={(e) => setKbTagline(e.target.value)}
                  placeholder="e.g. 10+ years in custom web & ERP software development"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Headquarters / Primary City
                </label>
                <input
                  type="text"
                  value={kbHeadquarters}
                  onChange={(e) => setKbHeadquarters(e.target.value)}
                  placeholder="e.g. Dhaka, Bangladesh or London, UK"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Official Website URL
                </label>
                <input
                  type="text"
                  value={kbWebsite}
                  onChange={(e) => setKbWebsite(e.target.value)}
                  placeholder="e.g. https://yourcompany.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Direct Contact Phone
                </label>
                <input
                  type="text"
                  value={kbPhone}
                  onChange={(e) => setKbPhone(e.target.value)}
                  placeholder="e.g. +880 1700-000000"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Direct Contact Email
                </label>
                <input
                  type="email"
                  value={kbEmail}
                  onChange={(e) => setKbEmail(e.target.value)}
                  placeholder="e.g. contact@yourcompany.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                />
              </div>
            </div>
          </div>

          {/* Master Knowledge Base (All-in-One Documentation Notebook) */}
          <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-purple-400" />
                <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Master Company Knowledge Base (All-in-One Documentation Notebook)
                </span>
              </div>
              <span className="text-[10px] text-purple-300 font-mono bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20 self-start sm:self-auto">
                Primary Master Document
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Write or paste all your company services, software features, landing links, pricing, and case studies here in plain text or bullet points. OpenClaw and the AI Decision Engine read this entire master document to ground cold pitch emails and match prospect weaknesses directly to your offerings.
            </p>
            <textarea
              rows={8}
              value={kbMasterNotes}
              onChange={(e) => setKbMasterNotes(e.target.value)}
              placeholder={`Write or paste all your services & business details here in one place...\n\nExample:\n• Real Estate Management Software (ERP): Complete solution with lead management, installment schedules, client portal, and automated SMS alerts. (Link: https://yourcompany.com/real-estate-software)\n• Custom CRM & Pipeline Automation: Captures leads directly from website into an active follow-up pipeline with WhatsApp notifications.\n• Modern Web & Mobile Development: Fast, mobile-responsive web portals launched in 7 days.\n• Cloud Accounting & Inventory ERP: End-to-end warehouse stock, billing, and financial reports.`}
              className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono transition leading-relaxed"
            />
          </div>

          <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-slate-200 uppercase tracking-wider">
                  <Layers className="w-4 h-4 text-purple-400" />
                  <span>Solutions & Value Wedge Catalog ({kbServices.length} Active Services)</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  When prospects have website friction or lack lead funnels, Fit Gate maps their specific gap to these offerings.
                </p>
              </div>

              <button
                type="button"
                onClick={handleAddService}
                className="px-3 py-1.5 rounded-lg bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Offering</span>
              </button>
            </div>

            <div className="space-y-3.5">
              {kbServices.map((svc, idx) => (
                <div
                  key={svc.key || idx}
                  className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition space-y-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 font-mono text-[10px] font-semibold border border-purple-500/30">
                        {svc.key}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">#{idx + 1} Offering</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveService(idx)}
                      className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                      title="Remove service offering"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Service / Software Name
                      </label>
                      <input
                        type="text"
                        value={svc.name}
                        onChange={(e) => handleUpdateServiceField(idx, "name", e.target.value)}
                        placeholder="e.g. Real Estate Management Software / ERP"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Landing Page / Direct URL
                      </label>
                      <input
                        type="url"
                        value={svc.url || ""}
                        onChange={(e) => handleUpdateServiceField(idx, "url", e.target.value)}
                        placeholder="e.g. https://yourcompany.com/real-estate-software/"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-sky-400 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Target Industries & Business Types
                      </label>
                      <input
                        type="text"
                        value={svc.target_industries || ""}
                        onChange={(e) => handleUpdateServiceField(idx, "target_industries", e.target.value)}
                        placeholder="e.g. Real Estate, Builders, Housing Agents, Construction"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-amber-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Value Wedge Offer (Free Demo / Hook)
                      </label>
                      <input
                        type="text"
                        value={svc.wedge}
                        onChange={(e) => handleUpdateServiceField(idx, "wedge", e.target.value)}
                        placeholder="e.g. Free 5-Minute Live Demo of Real Estate CRM & Installment Flow"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Core Features & Modules
                      </label>
                      <input
                        type="text"
                        value={svc.features || ""}
                        onChange={(e) => handleUpdateServiceField(idx, "features", e.target.value)}
                        placeholder="e.g. Lead Management, Installment Schedules, Property Syndication, SMS Alerts"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>

                    <div>
                      <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                        Problems Solved (Triggers)
                      </label>
                      <input
                        type="text"
                        value={svc.solves_problems || ""}
                        onChange={(e) => handleUpdateServiceField(idx, "solves_problems", e.target.value)}
                        placeholder="e.g. Manual buyer follow-up leakage, installment confusion, untracked stock"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-rose-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-semibold text-slate-400 block mb-1 uppercase tracking-wider">
                      Service Scope / Summary Description
                    </label>
                    <input
                      type="text"
                      value={svc.description}
                      onChange={(e) => handleUpdateServiceField(idx, "description", e.target.value)}
                      placeholder="e.g. Complete vertical software solution with automated workflows."
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-purple-500 transition"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-5 rounded-xl bg-purple-950/20 border border-purple-500/20 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-purple-300 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span>Live Pitch Preview & Discovery Script Sandbox</span>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              When sales representatives open any hot lead dossier, or when the system drafts cold outreach emails, this is how your Company KB dynamically armors them:
            </p>

            <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
              <div className="text-slate-400">
                <span className="text-purple-400 font-bold">1. OPENING EVIDENCE:</span> &quot;Hello, is this [Candidate Business]? I was reviewing your online presence in [City] and noticed orders and customer bookings are still being taken manually over phone calls...&quot;
              </div>
              <div className="text-slate-400">
                <span className="text-sky-400 font-bold">2. DISCOVERY QUESTION:</span> &quot;How are you currently managing daily order tracking and repeat customer notifications?&quot;
              </div>
              <div className="text-emerald-400">
                <span className="text-purple-400 font-bold">3. VALUE PITCH:</span> &quot;At <span className="text-white font-bold underline">{kbCompanyName || "our solutions team"}</span>, we specialize in solving this with our <span className="text-white font-bold underline">{kbServices[0]?.wedge || "High-Converting Solution"}</span>. Would you be open to a 5-minute preview of the custom audit report we prepared for [Candidate Business]?&quot;
              </div>
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 pt-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>
                <strong>Optional Per Batch:</strong> In both <strong>/research</strong> and <strong>/autopilot</strong>, you can toggle &quot;Use Company KB &amp; Branded Pitch&quot; ON or OFF. Turning it OFF switches the engine into <strong>Generic AI Mode</strong> with zero company branding.
              </span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "template" && (
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden animate-in fade-in duration-200">
          <div className="absolute top-0 right-0 w-80 h-80 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />

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

            {tplSuccess && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                <Check className="w-4 h-4" />
                <span>{tplSuccess}</span>
              </div>
            )}
            {tplError && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-medium">
                <AlertCircle className="w-4 h-4" />
                <span>{tplError}</span>
              </div>
            )}
          </div>

          <form onSubmit={handleSaveTemplate} className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            <div className="lg:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Subject Line
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  required
                  placeholder="Quick inquiry regarding your office in {{location}}"
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Email Body Content
                </label>
                <textarea
                  rows={8}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-sans leading-relaxed transition resize-y"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-sky-400 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" />
                    <span>Dynamic Signature Cards Rotation</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("inboxes");
                      handleOpenAddPersona();
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-semibold flex items-center gap-1 cursor-pointer bg-sky-500/10 hover:bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-500/30 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>+ Add Signature Note Card</span>
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      <span className="font-semibold text-slate-200">Active Multi-Signature Pool</span>
                    </div>
                    <span className="font-mono text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-bold">
                      {activeSigs.length} Note Card{activeSigs.length !== 1 ? "s" : ""} Active
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Whenever cold outreach emails are prepared across the platform, the <code className="text-amber-300 bg-amber-500/10 px-1 py-0.5 rounded font-mono">{"{{signature}}"}</code> placeholder automatically attaches one of your saved signature notes at random to guarantee human variance and prevent spam clustering.
                  </p>
                </div>
              </div>

              <div className="pt-3">
                <button
                  type="submit"
                  disabled={tplSaving}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-2 transition shadow-lg shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{tplSaving ? "Saving Configuration..." : "Save Universal Template"}</span>
                </button>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Live Rendered Preview
                </span>
                <div className="flex items-center gap-2">
                  {activeSigs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setSelectedPreviewSigIdx((prev) => (prev + 1) % activeSigs.length)}
                      className="text-[11px] text-amber-400 hover:text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 px-2 py-1 rounded-lg border border-amber-500/30 flex items-center gap-1 cursor-pointer transition font-mono"
                      title="Shuffle signature card to test variation"
                    >
                      <Shuffle className="w-3 h-3" />
                      <span>Shuffle Sig ({((selectedPreviewSigIdx % activeSigs.length) + 1)}/{activeSigs.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(renderedPreview.fullEmail);
                      setCopiedPreview(true);
                      setTimeout(() => setCopiedPreview(false), 2000);
                    }}
                    className="text-[11px] text-sky-400 hover:text-sky-300 font-mono flex items-center gap-1 cursor-pointer"
                  >
                    {copiedPreview ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedPreview ? "Copied!" : "Copy Full Email"}</span>
                  </button>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/90 border border-slate-800 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner max-h-[500px] overflow-y-auto">
                <div className="text-amber-300/90 pb-2 mb-2 border-b border-slate-800/80 font-bold">
                  {renderedPreview.subject}
                </div>
                {renderedPreview.body}
              </div>
            </div>
          </form>
        </div>
      )}

      {activeTab === "inboxes" && (
        <div className="space-y-6 animate-in fade-in duration-200">

          <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Inbox className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <span>Multi-SMTP 20x Inboxes & Persona Rotation Hub</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Anti-Spam Load Balanced
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Live telemetry across up to 20 rotating SMTP sending accounts and 10 executive persona signatures. Enforces 20-30 emails/day cap per inbox.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={loadInboxMonitor}
                  disabled={inboxLoading}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${inboxLoading ? "animate-spin" : ""}`} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddInbox}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add SMTP Inbox</span>
                </button>

                <button
                  type="button"
                  onClick={handleOpenAddPersona}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-sky-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Signature Card</span>
                </button>

                {isSuperAdmin && (
                  <button
                    type="button"
                    onClick={() => setShowPurgeModal(true)}
                    className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5" />
                    <span>Database Purge</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Configured SMTP Inboxes ({inboxMonitorData?.inboxes.length || 0} / 20 Active)</span>
              </h4>
              <span className="text-[11px] text-slate-400">
                Auto-rotates in round-robin sequence to preserve sender reputation
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-3.5 py-2.5">Inbox ID</th>
                    <th className="px-3.5 py-2.5">Sender Identity</th>
                    <th className="px-3.5 py-2.5">Host & Port</th>
                    <th className="px-3.5 py-2.5">Today Sent</th>
                    <th className="px-3.5 py-2.5">Daily Limit</th>
                    <th className="px-3.5 py-2.5">Remaining</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-sans">
                  {inboxMonitorData && inboxMonitorData.inboxes.length > 0 ? (
                    inboxMonitorData.inboxes.map((ib) => {
                      const isTesting = testingInboxId === String(ib.id);
                      const testRes = testResults[String(ib.id)];

                      return (
                        <tr key={ib.id} className="hover:bg-slate-800/30 transition">
                          <td className="px-3.5 py-3 font-mono font-bold text-sky-400">#{ib.index || ib.id}</td>
                          <td className="px-3.5 py-3">
                            <div className="font-semibold text-slate-200">{ib.from_name}</div>
                            <div className="text-[11px] font-mono text-slate-400">{ib.from_email}</div>
                          </td>
                          <td className="px-3.5 py-3 font-mono text-slate-400">
                            {ib.host}:{ib.port}
                          </td>
                          <td className="px-3.5 py-3 font-mono text-white font-bold">{ib.sent_today}</td>
                          <td className="px-3.5 py-3 font-mono text-slate-400">{ib.daily_limit} / day</td>
                          <td className="px-3.5 py-3 font-mono text-emerald-400 font-bold">{ib.remaining}</td>
                          <td className="px-3.5 py-3">
                            <div>
                              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border ${
                                ib.status === "HEALTHY"
                                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                  : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                              }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current" />
                                {ib.status}
                              </span>
                              {testRes && (
                                <div className={`mt-1 text-[10px] font-mono ${testRes.ok ? "text-emerald-400" : "text-rose-400"}`}>
                                  {testRes.msg}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-3.5 py-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleTestInbox(String(ib.id))}
                                disabled={isTesting}
                                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-300 border border-slate-700 text-xs flex items-center gap-1 transition cursor-pointer"
                                title="Verify SMTP credentials"
                              >
                                <Activity className={`w-3 h-3 ${isTesting ? "animate-spin text-sky-400" : ""}`} />
                                <span>{isTesting ? "Testing..." : "Test"}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteInbox(String(ib.id))}
                                className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700 transition cursor-pointer"
                                title="Remove SMTP Inbox"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8} className="px-3.5 py-6 text-center text-slate-500 italic">
                        No custom SMTP Inboxes configured yet. Default Hostinger SMTP is active.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/90 border border-slate-800 p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <span>Multi-Card Signature Notes Pool ({inboxMonitorData?.persona_signatures?.length || 0} Cards)</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/30">
                    Random Outreach Delivery
                  </span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Verbatim note cards attached randomly to each lead's cold outreach to bypass AI spam detectors.
                </p>
              </div>

              <button
                type="button"
                onClick={handleOpenAddPersona}
                className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-lg shadow-sky-500/20 self-start sm:self-auto"
              >
                <Plus className="w-4 h-4" />
                <span>+ Add Signature Card</span>
              </button>
            </div>

            {inboxMonitorData && inboxMonitorData.persona_signatures && inboxMonitorData.persona_signatures.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {inboxMonitorData.persona_signatures.map((p, idx) => {
                  const content = p.raw_content || `${p.name || ''}\n${p.title || ''}\n${p.company || ''}`.trim();
                  const isCopied = copiedSigId === p.id;
                  const isActive = p.is_active !== false;

                  return (
                    <div
                      key={p.id || idx}
                      className={`p-4 rounded-xl border transition relative flex flex-col justify-between space-y-3 ${
                        isActive
                          ? "bg-slate-950/80 border-slate-800 hover:border-sky-500/50"
                          : "bg-slate-950/40 border-slate-800/40 opacity-70"
                      }`}
                    >

                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs font-bold text-white truncate">
                            {p.title || `Signature Card #${idx + 1}`}
                          </span>
                          <span
                            className={`text-[9px] font-mono px-2 py-0.5 rounded-full uppercase font-bold border ${
                              isActive
                                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                                : "bg-slate-800 text-slate-400 border-slate-700"
                            }`}
                          >
                            {isActive ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard.writeText(content);
                              setCopiedSigId(p.id);
                              setTimeout(() => setCopiedSigId(null), 1800);
                            }}
                            className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Copy Signature Note"
                          >
                            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePersona(p.id)}
                            className={`p-1 rounded transition cursor-pointer ${
                              isActive
                                ? "text-emerald-400 hover:bg-emerald-500/10"
                                : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                            }`}
                            title={isActive ? "Deactivate Card" : "Activate Card"}
                          >
                            <Power className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenEditPersona(p)}
                            className="p-1 rounded text-slate-400 hover:text-sky-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Edit Card Note"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeletePersona(p.id)}
                            className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                            title="Delete Card"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3 rounded-lg bg-slate-900/90 border border-slate-800/80 font-mono text-[11px] text-slate-300 whitespace-pre-wrap leading-relaxed shadow-inner max-h-44 overflow-y-auto select-text">
                        {content || <span className="text-slate-600 italic">No signature note content</span>}
                      </div>

                      <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono pt-1 border-t border-slate-800/50">
                        <span>Card #{idx + 1}</span>
                        <span>{isActive ? "Included in rotation" : "Excluded"}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-center space-y-2">
                <div className="text-xs text-slate-400 font-medium">No custom signature cards registered yet.</div>
                <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                  Click <strong>"+ Add Signature Card"</strong> above to write or paste your freeform signature note box.
                </p>
              </div>
            )}
          </div>

          {isSuperAdmin && (
            <div className="rounded-2xl bg-gradient-to-b from-rose-950/20 to-slate-950 border border-rose-500/20 p-6 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Super Admin Database Control & Clean Storage</span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 font-bold">
                        Master Access Only
                      </span>
                    </h4>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Perform instant maintenance to clean rejected leads, reset test runs, or purge database to keep storage clean with zero fake data.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="font-semibold text-xs text-white">Purge Rejected Leads</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Deletes all leads categorized as "Rejected" to free up storage space.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPurgeTarget("rejected_leads");
                      setShowPurgeModal(true);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer border border-slate-700"
                  >
                    Purge Rejected Leads
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="font-semibold text-xs text-white">Clear Search Runs & History</div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Removes historical OpenClaw research runs and execution logs.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPurgeTarget("search_runs");
                      setShowPurgeModal(true);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer border border-slate-700"
                  >
                    Clear Search Runs
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-900/90 border border-rose-500/30 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="font-semibold text-xs text-rose-300 flex items-center gap-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                      <span>Factory Database Reset</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Wipes all discovered leads, campaigns, and queues. Keeps accounts and configurations intact.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setPurgeTarget("factory_reset");
                      setShowPurgeModal(true);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold text-xs transition cursor-pointer border border-rose-500/40"
                  >
                    Factory Reset Database
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {showAddInboxModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Inbox className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Add New SMTP Sending Inbox</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddInboxModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddInboxSubmit} className="space-y-4" autoComplete="off">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SMTP Host / Server
                  </label>
                  <input
                    type="text"
                    name="smtp_server_host"
                    autoComplete="off"
                    required
                    value={inboxForm.host}
                    onChange={(e) => setInboxForm({ ...inboxForm, host: e.target.value })}
                    placeholder="smtp.hostinger.com or smtp.titan.email"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Port
                  </label>
                  <input
                    type="number"
                    name="smtp_server_port"
                    autoComplete="off"
                    required
                    value={inboxForm.port}
                    onChange={(e) => setInboxForm({ ...inboxForm, port: parseInt(e.target.value) || 587 })}
                    placeholder="587"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SMTP Username / Email
                  </label>
                  <input
                    type="text"
                    name="smtp_account_username"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    required
                    value={inboxForm.username}
                    onChange={(e) => setInboxForm({ ...inboxForm, username: e.target.value })}
                    placeholder="alex@outreach-leadgen.com"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    SMTP Password / App Password
                  </label>
                  <input
                    type="password"
                    name="smtp_account_credential_secret"
                    autoComplete="new-password"
                    required
                    value={inboxForm.password}
                    onChange={(e) => setInboxForm({ ...inboxForm, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Sender Display Name
                  </label>
                  <input
                    type="text"
                    required
                    value={inboxForm.from_name}
                    onChange={(e) => setInboxForm({ ...inboxForm, from_name: e.target.value })}
                    placeholder="Alex Morgan"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    From Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={inboxForm.from_email}
                    onChange={(e) => setInboxForm({ ...inboxForm, from_email: e.target.value })}
                    placeholder="alex@outreach-leadgen.com"
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Daily Sending Quota / Limit (Max emails per 24 hours)
                </label>
                <input
                  type="number"
                  min="5"
                  max="100"
                  required
                  value={inboxForm.daily_limit}
                  onChange={(e) => setInboxForm({ ...inboxForm, daily_limit: parseInt(e.target.value) || 30 })}
                  className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Recommended: 25-30 emails/day per inbox to maintain 100% inbox placement and avoid spam clustering.
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddInboxModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={inboxSubmitting}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {inboxSubmitting ? "Adding Inbox..." : "Save SMTP Inbox"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showAddPersonaModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">
                  {editingPersonaId ? "Edit Signature Note Card" : "Add New Signature Card"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddPersonaModal(false);
                  setEditingPersonaId(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddOrEditPersonaSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Card Label / Reference Name
                </label>
                <input
                  type="text"
                  required
                  value={personaForm.title}
                  onChange={(e) => setPersonaForm({ ...personaForm, title: e.target.value })}
                  placeholder="e.g. Lead Gen AI Main, Senior Consultant Note"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-sans"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-300">
                    Verbatim Signature Note Box
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Replaces <code className="text-amber-300">{"{{signature}}"}</code> verbatim
                  </span>
                </div>
                <textarea
                  rows={8}
                  required
                  value={personaForm.raw_content}
                  onChange={(e) => setPersonaForm({ ...personaForm, raw_content: e.target.value })}
                  placeholder={`Sincerely,\ntest\nSenior Solutions Consultant, Multi-Lead Gen AI\nEmail: contact@leadgen.local | Phone: +880 1700-000000\nhttps://leadgen.local`}
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono leading-relaxed resize-y"
                />
                <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                  Type or paste whatever signature format you want. Line breaks, URLs, phone numbers, and job titles are preserved exactly as written.
                </p>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="card_is_active"
                  checked={personaForm.is_active}
                  onChange={(e) => setPersonaForm({ ...personaForm, is_active: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0 w-4 h-4 cursor-pointer"
                />
                <label htmlFor="card_is_active" className="text-xs text-slate-300 cursor-pointer select-none">
                  Active in Rotation (Automatically included when cold outreach emails are dispatched)
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPersonaModal(false);
                    setEditingPersonaId(null);
                  }}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={personaSubmitting}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow-lg shadow-sky-500/20 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>
                    {personaSubmitting
                      ? "Saving Card..."
                      : editingPersonaId
                      ? "Update Signature Card"
                      : "Save Signature Card"}
                  </span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showPurgeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-5 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="text-base font-bold text-white">Confirm Database Purge Action</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 font-medium">
                You are about to execute:{" "}
                <strong className="text-white uppercase font-mono">
                  {purgeTarget.replace("_", " ")}
                </strong>
              </div>

              <p className="text-slate-300 leading-relaxed">
                {purgeTarget === "rejected_leads" && "This will permanently remove all leads that were scored as 'Rejected'. Qualified Tier A/B leads and campaigns remain intact."}
                {purgeTarget === "search_runs" && "This will permanently clear all completed and historical search execution runs and logs."}
                {purgeTarget === "factory_reset" && "This will perform a clean factory purge: wiping all leads, runs, and autopilot queue logs. User accounts and configurations will be preserved."}
              </p>

              {purgeSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{purgeSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowPurgeModal(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurgeData}
                disabled={purgeSubmitting}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-50"
              >
                {purgeSubmitting ? "Purging..." : "Confirm & Execute Purge"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
