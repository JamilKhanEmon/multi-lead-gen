"use client";

import Link from "next/link";
import { Lock, ArrowLeft, Bot, Megaphone } from "lucide-react";

export default function ConversationsPage() {
  return (
    <div className="max-w-4xl mx-auto py-12 px-4 space-y-6">
      <div className="p-10 rounded-3xl bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 border border-slate-800 text-center space-y-5 shadow-2xl relative overflow-hidden">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 shadow-xl shadow-amber-500/10 mb-2">
          <Lock className="w-8 h-8" />
        </div>
        
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold uppercase tracking-wider">
            <Lock className="w-3.5 h-3.5 text-amber-400" />
            <span>Feature Currently Locked</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Conversational Lead Qualification (AI Chatbot)
          </h1>
          <p className="text-sm text-slate-400 max-w-lg mx-auto leading-relaxed">
            This module is temporarily locked while undergoing feature refinements and updates.
            You can utilize the unlocked Meta Ads & Marketing Funnel module or Autonomous Lead Discovery.
          </p>
        </div>

        <div className="pt-4 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to Operations Center</span>
          </Link>
          <Link
            href="/campaigns"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 text-white font-bold text-xs transition shadow-lg shadow-pink-600/20"
          >
            <Megaphone className="w-4 h-4 text-white" />
            <span>Go to Meta Ads Funnel (Unlocked)</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
