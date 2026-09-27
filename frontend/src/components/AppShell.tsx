"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Compass,
  Users,
  Sliders,
  ShieldCheck,
  Menu,
  X,
  Zap,
} from "lucide-react";

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", href: "/", icon: LayoutDashboard, color: "text-sky-400" },
    { label: "New Research", href: "/research", icon: Compass, color: "text-emerald-400" },
    { label: "Lead Pipeline", href: "/leads", icon: Users, color: "text-amber-400" },
    { label: "135 Parameters", href: "/parameters", icon: Sliders, color: "text-violet-400" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-background text-slate-100">
      {/* 1. Mobile Top Header (Visible only on < md screens) */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 sticky top-0 z-40 shrink-0">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-slate-950 text-sm shadow-md shadow-sky-500/30">
            Ω
          </div>
          <div>
            <h1 className="font-bold text-sm tracking-wide text-white">LeadGen AI</h1>
            <span className="text-[9px] text-sky-400 font-mono tracking-wider uppercase block -mt-0.5">
              Autonomous
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2">
          <Link
            href="/research"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-semibold"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>Launch</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* 2. Mobile Drawer Navigation Overlay (Collapsible) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm md:hidden flex flex-col justify-between p-6 animate-fadeIn"
          onClick={() => setMobileMenuOpen(false)}
        >
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-slate-950 text-base shadow-md shadow-sky-500/30">
                  Ω
                </div>
                <div>
                  <h2 className="font-bold text-sm text-white">LeadGen Intelligence</h2>
                  <span className="text-[10px] text-sky-400 font-mono">Mobile Control</span>
                </div>
              </div>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav className="space-y-1.5 py-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                      active
                        ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                        : "text-slate-300 hover:text-white hover:bg-slate-800/60"
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${active ? "text-sky-400" : item.color}`} />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="pt-3 border-t border-slate-800">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> System Gateway
                </span>
                <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-mono">
                  Online
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Desktop Persistent Sidebar (Hidden on mobile) */}
      <aside className="hidden md:flex w-64 glass-panel border-r border-slate-800/80 flex-col justify-between p-4 shrink-0">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 px-2 py-4 mb-6">
            <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg shadow-sky-500/30">
              Ω
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-white">LeadGen AI</h1>
              <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">
                Autonomous M5
              </span>
            </div>
          </div>

          {/* Navigation links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                    active
                      ? "bg-slate-800/90 text-white border border-slate-700/60 shadow-sm"
                      : "text-slate-300 hover:text-white hover:bg-slate-800/50"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? "text-sky-400" : item.color}`} />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Bottom System Status Badge */}
        <div className="p-3 rounded-lg bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Security
            </span>
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/20 font-mono">
              Loopback
            </span>
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Gateway: <span className="text-slate-200">127.0.0.1:18789</span>
          </div>
        </div>
      </aside>

      {/* 4. Main Content Area */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden p-3.5 sm:p-6 lg:p-8 pb-20 md:pb-8 w-full max-w-full">
        {children}
      </main>

      {/* 5. Mobile Fixed Bottom Navigation Bar (Ultra convenient touch controls) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 flex items-center justify-around py-2 px-2 shadow-2xl">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center py-1 px-3 rounded-lg text-[10px] font-medium transition ${
                active ? "text-sky-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Icon className={`w-5 h-5 mb-0.5 ${active ? "text-sky-400" : "text-slate-400"}`} />
              <span className="truncate max-w-[70px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
