"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createResearchRun } from "@/lib/api";
import {
  Compass,
  Sparkles,
  AlertCircle,
  Globe2,
  Building2,
  MapPin,
  Briefcase,
  Layers,
  X,
  CheckCircle2,
} from "lucide-react";

export default function ResearchInitiatorPage() {
  const router = useRouter();
  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [subCity, setSubCity] = useState("");
  const [industry, setIndustry] = useState("");
  const [depth, setDepth] = useState("DEEP");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const cleanOverride =
        industry
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "_")
          .replace(/^_+|_+$/g, "") || "general";

      const locationParts = [subCity.trim(), city.trim(), country.trim()].filter(Boolean);
      const computedLocation = locationParts.join(", ");

      await createResearchRun({
        country: country.trim(),
        city: city.trim(),
        sub_city: subCity.trim(),
        location: computedLocation,
        industry: industry.trim(),
        depth,
        company_limit: 0, // Auto-exhaustion loop (no artificial limit)
        business_type_override: cleanOverride,
      });

      router.push("/");
    } catch (err: any) {
      setError(err.message || "Failed to trigger research run");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-sky-400" />
          Launch Autonomous Research Run
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          OpenClaw autonomously discovers real local businesses, audits their live websites, and qualifies high-intent B2B leads.
        </p>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="glass-panel p-4 sm:p-6 rounded-2xl border border-slate-800 space-y-4 sm:space-y-5">
        {/* 1. Country Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Globe2 className="w-3.5 h-3.5 text-sky-400" />
              <span>Country</span>
              <span className="text-[10px] normal-case bg-sky-500/10 text-sky-400 border border-sky-500/30 px-2 py-0.5 rounded-full font-normal">
                Required
              </span>
            </label>
            {country && (
              <button
                type="button"
                onClick={() => setCountry("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              placeholder="e.g. United States, United Kingdom, Canada, Australia, UAE"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
            />
            {country && (
              <button
                type="button"
                onClick={() => setCountry("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 2. City Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>City</span>
              <span className="text-[10px] normal-case bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-normal">
                Required
              </span>
            </label>
            {city && (
              <button
                type="button"
                onClick={() => setCity("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              required
              placeholder="e.g. New York, London, Toronto, Sydney, Dubai"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
            {city && (
              <button
                type="button"
                onClick={() => setCity("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* 3. Sub-City / Area Field (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-amber-400" />
              <span>Sub-City / Area / District</span>
              <span className="text-[10px] normal-case bg-amber-500/10 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full font-normal">
                Optional
              </span>
            </label>
            {subCity && (
              <button
                type="button"
                onClick={() => setSubCity("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={subCity}
              onChange={(e) => setSubCity(e.target.value)}
              placeholder="e.g. Manhattan, Brooklyn, SoHo, Downtown, Marina (Leave empty to scan entire city)"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500 transition"
            />
            {subCity && (
              <button
                type="button"
                onClick={() => setSubCity("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500 mt-1.5">
            If left empty, OpenClaw will scan across all districts and neighborhoods of the target city.
          </p>
        </div>

        {/* 4. Business Type / Industry Field (Required) */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Briefcase className="w-3.5 h-3.5 text-indigo-400" />
              <span>Business Type / Industry</span>
              <span className="text-[10px] normal-case bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded-full font-normal">
                Any Business
              </span>
            </label>
            {industry && (
              <button
                type="button"
                onClick={() => setIndustry("")}
                className="text-xs text-slate-400 hover:text-slate-200 transition"
              >
                Clear
              </button>
            )}
          </div>
          <div className="relative">
            <input
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              required
              placeholder="e.g. Dental Clinic, Real Estate, Restaurant, Gym, Software Agency"
              className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
            />
            {industry && (
              <button
                type="button"
                onClick={() => setIndustry("")}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Research Depth Selector */}
        <div>
          <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5 mb-2">
            <Layers className="w-3.5 h-3.5 text-purple-400" />
            <span>Research Depth</span>
          </label>
          <select
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:border-purple-500 transition"
          >
            <option value="DEEP">DEEP (Recommended: Live Multi-page Website Crawl + Verified Contacts + Gap Analysis)</option>
            <option value="STANDARD">STANDARD (Website Crawl + Contacts)</option>
            <option value="QUICK">QUICK (Website Header & Status Check)</option>
          </select>
        </div>

        {/* Autonomous Exhaustion Loop Badge */}
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-2.5">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
          <div className="text-xs text-emerald-200 leading-relaxed">
            <span className="font-semibold text-emerald-300">Continuous Auto-Discovery:</span>
            {" "}No artificial candidate limits. OpenClaw will automatically loop and discover all genuine verified businesses found in your specified area.
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition shadow-lg shadow-sky-500/20 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Sparkles className="w-4 h-4" />
          {submitting ? "Initiating Research Run..." : "Start Autonomous Research"}
        </button>
      </form>
    </div>
  );
}
