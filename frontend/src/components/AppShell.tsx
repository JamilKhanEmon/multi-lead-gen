"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShieldCheck,
  Zap,
  Lock,
  LogOut,
  ArrowLeft,
  Compass,
  Megaphone,
  PhoneCall,
  LayoutGrid,
  Key,
  Eye,
  EyeOff,
  Check,
  AlertCircle,
  X,
  Mail,
  Bot,
  MessageSquare,
} from "lucide-react";
import { getStoredUser, logoutUser, AuthUser, hasPermission, changePassword, changeEmail } from "@/lib/api";
import NotificationCenter from "@/components/NotificationCenter";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  // Account Settings Modal tab & state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [modalTab, setModalTab] = useState<"password" | "email">("password");

  // Change Password state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);

  // Change Email state
  const [newEmail, setNewEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [showEmailPass, setShowEmailPass] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setCurrentUser(user);
    setAuthChecked(true);

    const isAuthRoute = pathname === "/login" || pathname === "/admin";

    if (!user && !isAuthRoute) {
      router.replace("/login");
      return;
    }

    const handleAuthChange = () => {
      const updatedUser = getStoredUser();
      setCurrentUser(updatedUser);
      if (!updatedUser && pathname !== "/login" && pathname !== "/admin") {
        router.replace("/login");
      }
    };
    window.addEventListener("auth_change", handleAuthChange);
    return () => window.removeEventListener("auth_change", handleAuthChange);
  }, [pathname, router]);

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (newPassword.length < 6) {
      setPasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("New password and confirm password do not match.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordSuccess("Password successfully changed!");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(null);
      }, 1500);
    } catch (err: any) {
      setPasswordError(err.message || "Failed to change password");
    } finally {
      setPasswordSubmitting(false);
    }
  };

  const handleChangeEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    const clean = newEmail.toLowerCase().trim();
    if (!clean || !clean.includes("@") || !clean.includes(".")) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setEmailSubmitting(true);
    try {
      const res = await changeEmail(clean, emailPassword);
      setEmailSuccess(`Account email updated to ${res.email}!`);
      setCurrentUser((prev) => (prev ? { ...prev, email: res.email } : prev));
      setNewEmail("");
      setEmailPassword("");
      setTimeout(() => {
        setShowPasswordModal(false);
        setEmailSuccess(null);
      }, 1500);
    } catch (err: any) {
      setEmailError(err.message || "Failed to update email address");
    } finally {
      setEmailSubmitting(false);
    }
  };

  const isHubPage = pathname === "/" || pathname === "/admin" || pathname === "/login";

  const getSubRouteModule = () => {

    if (pathname.startsWith("/research") || pathname.startsWith("/leads") || pathname.startsWith("/parameters")) {
      return {
        id: "leads",
        label: "Module 01: Lead Generation & Research",
        icon: Compass,
        color: "text-sky-400 bg-sky-500/10 border-sky-500/30",
      };
    }
    if (pathname.startsWith("/campaigns")) {
      return {
        id: "ads",
        label: "Module 02: Meta Ads & Marketing",
        icon: Megaphone,
        color: "text-pink-400 bg-pink-500/10 border-pink-500/30",
      };
    }
    if (pathname.startsWith("/conversations")) {
      return {
        id: "conversations",
        label: "Direct Inbound Conversations",
        icon: Bot,
        color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
      };
    }
    if (pathname.startsWith("/voice-agent")) {
      return {
        id: "voice",
        label: "Module 03: Autonomous Voice Outreach",
        icon: PhoneCall,
        color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
      };
    }
    return null;
  };

  const activeModule = getSubRouteModule();

  if (!currentUser && (pathname === "/login" || pathname === "/admin")) {
    return (
      <div className="min-h-screen w-full bg-background text-slate-100 flex items-center justify-center p-4">
        {children}
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="min-h-screen w-full bg-background text-slate-100 flex flex-col items-center justify-center p-6 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-xl shadow-rose-500/10">
          <Lock className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white">Platform Authentication Required</h2>
          <p className="text-xs text-slate-400 max-w-sm mt-1">
            Access to this system is strictly protected. Please sign in with your authorized email and password to continue.
          </p>
        </div>
        <Link
          href="/login"
          className="px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-sky-500/20"
        >
          Sign In to Access Platform
        </Link>
      </div>
    );
  }

  const checkRoutePermission = (): { allowed: boolean; reason?: string } => {
    if (!currentUser) return { allowed: true };
    if (currentUser.role === "super_admin") return { allowed: true };
    if (currentUser.permissions_json?.all) return { allowed: true };

    if (pathname.startsWith("/inbox")) {
      const allowed = hasPermission(currentUser, "can_view_inbox", true) || hasPermission(currentUser, "can_access_autopilot", false);
      if (!allowed) {
        return {
          allowed: false,
          reason: "Permission Denied: Your account does not have permission to access the Mail Inbox. Please contact Admin."
        };
      }
    }
    if (pathname.startsWith("/replies")) {
      const allowed = hasPermission(currentUser, "can_view_replies", true) || hasPermission(currentUser, "can_access_autopilot", false);
      if (!allowed) {
        return {
          allowed: false,
          reason: "Permission Denied: Your account does not have permission to view Client Replies. Please contact Admin."
        };
      }
    }
    if (pathname.startsWith("/autopilot")) {
      if (!hasPermission(currentUser, "can_access_autopilot", false)) {
        return {
          allowed: false,
          reason: "Permission Denied: Autonomous Cold Email & Autopilot Outreach is strictly restricted. Please contact Admin to request access."
        };
      }
    }
    if (pathname.startsWith("/leads")) {
      if (currentUser.permissions_json?.can_view_leads === false) {
        return { allowed: false, reason: "Your account does not have permission to view the Qualified Leads Pipeline." };
      }
    }
    if (pathname.startsWith("/research")) {
      if (currentUser.permissions_json?.can_run_research === false) {
        return { allowed: false, reason: "Your account does not have permission to launch Autonomous Lead Discovery." };
      }
    }
    if (pathname.startsWith("/campaigns")) {
      if (currentUser.permissions_json?.can_edit_campaigns === false) {
        return { allowed: false, reason: "Your account does not have permission to manage Meta Ads and Marketing Campaigns." };
      }
    }
    if (pathname.startsWith("/voice-agent")) {
      if (currentUser.permissions_json?.can_access_voice === false) {
        return { allowed: false, reason: "Your account does not have permission to access Autonomous Voice Outreach." };
      }
    }
    return { allowed: true };
  };

  const routePerm = checkRoutePermission();

  return (
    <div className="min-h-screen w-full bg-background text-slate-100 flex flex-col">

      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">

          <div className="flex items-center gap-4">
            <Link href="/admin?tab=modules" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-xl bg-sky-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-lg shadow-sky-500/20 group-hover:scale-105 transition">
                Ω
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="font-bold text-sm tracking-wide text-white">LeadGen AI</h1>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 font-semibold border border-sky-500/30">
                    M5
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono tracking-wider block">
                  Enterprise Operations
                </span>
              </div>
            </Link>

            {!isHubPage && (
              <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-800">
                <Link
                  href="/admin?tab=modules"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700/80 text-xs font-semibold text-sky-400 hover:text-sky-300 transition shadow-sm"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to 3 Modules</span>
                </Link>

                {activeModule && (
                  <span
                    className={`hidden md:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-mono font-medium border ${activeModule.color}`}
                  >
                    <activeModule.icon className="w-3.5 h-3.5" />
                    <span>{activeModule.label}</span>
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-[11px]">Hostinger OpenClaw</span>
              <span className="text-emerald-400 font-semibold text-[11px]">Active</span>
            </div>

            {/* Real-Time Lead Notification Bell & Live Alerts */}
            <NotificationCenter />

            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold border ${
                currentUser.role === "super_admin"
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/30"
                  : currentUser.role === "admin"
                  ? "bg-sky-500/20 text-sky-400 border-sky-500/30"
                  : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              }`}>
                {currentUser.full_name?.charAt(0) || "U"}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-200 leading-tight">
                  {currentUser.email}
                </div>
                <div className={`text-[9px] font-mono font-bold uppercase tracking-wider ${
                  currentUser.role === "super_admin"
                    ? "text-amber-400"
                    : currentUser.role === "admin"
                    ? "text-sky-400"
                    : "text-emerald-400"
                }`}>
                  {currentUser.role === "super_admin"
                    ? "Super Admin"
                    : currentUser.role === "admin"
                    ? "Admin"
                    : "Member"}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setPasswordError(null);
                setPasswordSuccess(null);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
                setShowPasswordModal(true);
              }}
              title="Change Account Password"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-sky-950/40 border border-slate-800 hover:border-sky-500/40 text-slate-400 hover:text-sky-300 text-xs font-medium transition cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Password</span>
            </button>

            <button
              onClick={() => {
                logoutUser();
                setCurrentUser(null);
                router.push("/login");
              }}
              title="Sign Out"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-rose-950/30 border border-slate-800 hover:border-rose-500/40 text-slate-400 hover:text-rose-300 text-xs font-medium transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {!routePerm.allowed ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-xl shadow-amber-500/10">
              <Lock className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-bold text-white">Module Access Restricted</h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                {routePerm.reason || "Your assigned account permissions do not grant access to this module."}
              </p>
            </div>
            <Link
              href="/admin"
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sky-400 text-xs font-semibold transition border border-slate-700 flex items-center gap-1.5 shadow-sm"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Return to Modules Hub
            </Link>
          </div>
        ) : (
          children
        )}
      </main>

      {showPasswordModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                  {modalTab === "password" ? <Key className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Account Security & Settings</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{currentUser.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex items-center gap-2 p-1 bg-slate-950 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setModalTab("password");
                  setPasswordError(null);
                  setPasswordSuccess(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalTab === "password"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Key className="w-3.5 h-3.5" />
                <span>Change Password</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setModalTab("email");
                  setEmailError(null);
                  setEmailSuccess(null);
                }}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                  modalTab === "email"
                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/30 shadow-sm"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Change Email</span>
              </button>
            </div>

            {/* Tab 1: Password Form */}
            {modalTab === "password" && (
              <>
                {passwordError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{passwordError}</span>
                  </div>
                )}

                {passwordSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleChangePasswordSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Current Password
                    </label>
                    <div className="relative">
                      <input
                        type={showCurrentPass ? "text" : "password"}
                        required
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Enter current password"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCurrentPass(!showCurrentPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showCurrentPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showNewPass ? "text" : "password"}
                        required
                        minLength={6}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Minimum 6 characters"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPass(!showNewPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showNewPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
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
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={passwordSubmitting}
                      className="px-4 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-sky-500/20"
                    >
                      {passwordSubmitting ? "Updating..." : "Update Password"}
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* Tab 2: Email Form */}
            {modalTab === "email" && (
              <>
                {emailError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{emailError}</span>
                  </div>
                )}

                {emailSuccess && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    <span>{emailSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleChangeEmailSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Current Email Address
                    </label>
                    <input
                      type="text"
                      disabled
                      value={currentUser.email}
                      className="w-full px-3 py-2 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-400 font-mono cursor-not-allowed"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      New Email Address
                    </label>
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="e.g. admin@company.com"
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Confirm Account Password
                    </label>
                    <div className="relative">
                      <input
                        type={showEmailPass ? "text" : "password"}
                        required
                        value={emailPassword}
                        onChange={(e) => setEmailPassword(e.target.value)}
                        placeholder="Enter your current password to verify"
                        className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-sky-500 pr-9 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowEmailPass(!showEmailPass)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                      >
                        {showEmailPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowPasswordModal(false)}
                      className="px-3.5 py-1.5 rounded-xl text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={emailSubmitting}
                      className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-400 hover:to-indigo-500 text-slate-950 font-bold text-xs transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-lg shadow-sky-500/20"
                    >
                      {emailSubmitting ? "Updating..." : "Update Email Address"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
