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
} from "lucide-react";
import { getStoredUser, logoutUser, AuthUser } from "@/lib/api";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    setCurrentUser(user);
    setAuthChecked(true);

    const isAuthRoute = pathname === "/login" || pathname === "/admin";

    // Strict Protection: If not logged in and not on login/admin page -> redirect to /login immediately
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

  const isHubPage = pathname === "/" || pathname === "/admin" || pathname === "/login";

  // Identify active module if on a sub-route
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

  // If on login/admin page and not logged in, render clean full-screen login without header/sidebar
  if (!currentUser && (pathname === "/login" || pathname === "/admin")) {
    return (
      <div className="min-h-screen w-full bg-background text-slate-100 flex items-center justify-center p-4">
        {children}
      </div>
    );
  }

  // If not logged in and on any other page, block and show access restricted lock screen
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

  return (
    <div className="min-h-screen w-full bg-background text-slate-100 flex flex-col">
      {/* Sleek Top Navigation Bar (Zero Clutter, No Sidebar Links) */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800/80 px-4 sm:px-6 py-3 shrink-0">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          {/* Left Brand & Hub Return */}
          <div className="flex items-center gap-4">
            <Link href="/admin" className="flex items-center gap-2.5 group">
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

            {/* If on a sub-route, show prominent 'Back to 3 Modules' button */}
            {!isHubPage && (
              <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-800">
                <Link
                  href="/admin"
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

          {/* Right Header Controls: Hostinger Gateway status + Admin info + Sign Out */}
          <div className="flex items-center gap-3">
            {/* Hostinger Gateway Status Pill */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400 text-[11px]">Hostinger OpenClaw</span>
              <span className="text-emerald-400 font-semibold text-[11px]">Active</span>
            </div>

            {/* Admin Profile Badge */}
            <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800">
              <div className="w-6 h-6 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold border border-sky-500/30">
                {currentUser.full_name?.charAt(0) || "A"}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-semibold text-slate-200 leading-tight">
                  {currentUser.email}
                </div>
                <div className="text-[9px] font-mono text-sky-400 font-bold uppercase tracking-wider">
                  Admin Active
                </div>
              </div>
            </div>

            {/* Sign Out Button */}
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

      {/* Main Full-Width Content View */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {children}
      </main>
    </div>
  );
}
