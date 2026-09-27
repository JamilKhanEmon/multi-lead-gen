import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { LayoutDashboard, Compass, Users, Sliders, Activity, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "LeadGen Intelligence | Autonomous B2B Platform",
  description: "Local-first autonomous B2B lead discovery and deterministic qualification platform.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="flex h-screen overflow-hidden bg-background text-slate-100">
        {/* Sidebar */}
        <aside className="w-64 glass-panel border-r border-slate-800/80 flex flex-col justify-between p-4 shrink-0">
          <div>
            {/* Logo */}
            <div className="flex items-center gap-3 px-2 py-4 mb-6">
              <div className="w-8 h-8 rounded-lg bg-sky-500 flex items-center justify-center font-bold text-slate-950 text-lg shadow-lg shadow-sky-500/30">
                Ω
              </div>
              <div>
                <h1 className="font-bold text-sm tracking-wide text-white">LeadGen AI</h1>
                <span className="text-[10px] text-sky-400 font-mono tracking-wider uppercase block">Local-First M5</span>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1">
              <Link
                href="/"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              >
                <LayoutDashboard className="w-4 h-4 text-sky-400" />
                Dashboard
              </Link>
              <Link
                href="/research"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              >
                <Compass className="w-4 h-4 text-emerald-400" />
                New Research
              </Link>
              <Link
                href="/leads"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              >
                <Users className="w-4 h-4 text-amber-400" />
                Lead Pipeline
              </Link>
              <Link
                href="/parameters"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition"
              >
                <Sliders className="w-4 h-4 text-violet-400" />
                135 Parameters
              </Link>
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

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-8">{children}</main>
      </body>
    </html>
  );
}
