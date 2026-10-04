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
  updateMemberPermissions,
  fetchEmailTemplate,
  updateEmailTemplate,
  renderEmailTemplate,
  AuthUser,
  EmailTemplate,
  DashboardPermissions,
  hasPermission,
} from "@/lib/api";

export default function AdminPortalPage() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Active top navigation tab (defaults to Operations Modules)
  const [activeTab, setActiveTab] = useState<"users" | "modules" | "template">("modules");

  const handleSelectTab = (tab: "users" | "modules" | "template") => {
    setActiveTab(tab);
    if (typeof window !== "undefined") {
      sessionStorage.setItem("admin_active_tab", tab);
    }
  };

  // Login form state
  const [email, setEmail] = useState("superadmin@leadgen.local");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginSubmitting, setLoginSubmitting] = useState(false);

  // User Management state
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userActionError, setUserActionError] = useState<string | null>(null);
  const [userActionSuccess, setUserActionSuccess] = useState<string | null>(null);

  // Add User modal state
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

  // Edit Permissions modal state
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [editPermissions, setEditPermissions] = useState<DashboardPermissions>({});
  const [editSubmitting, setEditSubmitting] = useState(false);

  // Email template & signature management state
  const [template, setTemplate] = useState<EmailTemplate | null>(null);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSaving, setTplSaving] = useState(false);
  const [tplSuccess, setTplSuccess] = useState<string | null>(null);
  const [tplError, setTplError] = useState<string | null>(null);

  // Form inputs for template
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

  // Load team users
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

  // Restore active tab from URL or sessionStorage
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

  // Initialize auth
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

  // When logged in, fetch users list and template
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
    }
  }, [currentUser]);

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

  // Handle Logout
  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
  };

  // Handle Create User Submit
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

  // Handle Edit Permissions
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

  // Handle Delete User
  const handleDeleteUser = async (u: AuthUser) => {
    // Client-side guard: Admins cannot remove Super Admins
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

  // Handle Save Template
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

  // Sample leads for template preview
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
      signature_text: signatureText,
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
              Admin & Access Portal
            </h1>
            <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
              Secure role-based authentication for Super Admins and Operational Admins.
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

              {/* Quick Preset Selector Buttons */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-medium text-slate-400">Quick Test Credentials:</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEmail("superadmin@leadgen.local");
                      setPassword("SuperAdmin@2026!");
                    }}
                    className="p-2 rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-left transition"
                  >
                    <div className="flex items-center gap-1.5 text-purple-300 font-semibold text-xs">
                      <Crown className="w-3.5 h-3.5 text-amber-400" />
                      <span>Super Admin</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">superadmin@leadgen.local</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEmail("admin@leadgen.local");
                      setPassword("Admin@2026!");
                    }}
                    className="p-2 rounded-xl bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 text-left transition"
                  >
                    <div className="flex items-center gap-1.5 text-sky-300 font-semibold text-xs">
                      <Shield className="w-3.5 h-3.5 text-sky-400" />
                      <span>Admin</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono block truncate">admin@leadgen.local</span>
                  </button>
                </div>
              </div>

              {/* Email Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="superadmin@leadgen.local"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500/60 focus:ring-1 focus:ring-sky-500/60 transition"
                  />
                </div>
              </div>

              {/* Password Input */}
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Password
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

            {/* Security Guarantee */}
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-slate-500 font-mono">
              <ShieldCheck className="w-3 h-3 text-emerald-400" />
              <span>Argon2id Encrypted & Signed RBAC Tokens</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Calculate user counts
  const totalUsers = users.length;
  const superAdminCount = users.filter((u) => u.role === "super_admin").length;
  const adminCount = users.filter((u) => u.role === "admin").length;
  const memberCount = users.filter((u) => u.role !== "super_admin" && u.role !== "admin").length;

  const isSuperAdmin = currentUser.role === "super_admin";
  const isAdmin = currentUser.role === "admin";
  const isMember = !isSuperAdmin && !isAdmin;

  // ==============================================================================
  // 2. AUTHENTICATED ADMIN PORTAL
  // ==============================================================================
  return (
    <div className="max-w-6xl mx-auto space-y-6">

      {/* Top Tab Bar */}
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
      </div>

      {/* Global Action Messages */}
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

      {/* ========================================================================= */}
      {/* TAB 1: TEAM & ACCESS CONTROL (RBAC)                                       */}
      {/* ========================================================================= */}
      {activeTab === "users" && (
        <div className="space-y-6 animate-in fade-in duration-200">
          {/* Metrics KPIs & Add User Button */}
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

          {/* Action Toolbar */}
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

          {/* Users Table */}
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

                      return (
                        <tr key={u.id} className="hover:bg-slate-800/40 transition">
                          {/* Name & Email */}
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

                          {/* Role */}
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

                          {/* Dashboard Permissions */}
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

                          {/* Status */}
                          <td className="py-4 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
                              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                              Active
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="py-4 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {/* Edit Permissions Button */}
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

                              {/* Delete Button */}
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

      {/* ========================================================================= */}
      {/* CREATE NEW USER MODAL                                                     */}
      {/* ========================================================================= */}
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

              {/* Dashboard Permissions Checklist */}
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

                  {/* Granular Autopilot Permissions in Create Modal */}
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

      {/* ========================================================================= */}
      {/* EDIT PERMISSIONS MODAL                                                    */}
      {/* ========================================================================= */}
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

              {/* Granular Autopilot Sub-Permissions in Edit Modal */}
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

      {/* ========================================================================= */}
      {/* TAB 2: OPERATIONS MODULES (THE 3 CORE CARDS)                              */}
      {/* ========================================================================= */}
      {activeTab === "modules" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-200">
          {/* CARD 1: Lead Generation & Research */}
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

          {/* CARD 2: Meta Ads & Marketing Automation (LOCKED - COMING SOON) */}
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

              {/* Exclusive Meta Ads Features List */}
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

          {/* CARD 3: Autonomous Voice Outreach (LOCKED - COMING SOON) */}
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

              {/* Exclusive Voice Features List */}
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

      {/* ========================================================================= */}
      {/* TAB 3: GLOBAL EMAIL TEMPLATE & SIGNATURE MANAGEMENT                       */}
      {/* ========================================================================= */}
      {activeTab === "template" && (
        <div className="rounded-2xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-6 sm:p-7 shadow-xl space-y-6 relative overflow-hidden animate-in fade-in duration-200">
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

          {/* Form & Live Preview Grid */}
          <form onSubmit={handleSaveTemplate} className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Template Form */}
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

              {/* Sender Details */}
              <div className="pt-2 border-t border-slate-800 space-y-3">
                <span className="text-xs font-bold text-sky-400 uppercase tracking-wider block">
                  Sender Contact Information
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Sender Name</label>
                    <input
                      type="text"
                      value={senderName}
                      onChange={(e) => setSenderName(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Title / Designation</label>
                    <input
                      type="text"
                      value={senderTitle}
                      onChange={(e) => setSenderTitle(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Company Name</label>
                    <input
                      type="text"
                      value={senderCompany}
                      onChange={(e) => setSenderCompany(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Direct Phone</label>
                    <input
                      type="text"
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      className="w-full px-3 py-1.5 bg-slate-950/80 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                  </div>
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

            {/* Right Column: Live Rendered Preview */}
            <div className="lg:col-span-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Live Rendered Preview
                </span>
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

    </div>
  );
}
