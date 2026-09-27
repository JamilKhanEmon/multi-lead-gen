"use client";

import { useEffect, useState, useMemo } from "react";
import { fetchParameters, ParameterCatalogItem } from "@/lib/api";
import { Sliders, Search, Filter, ShieldCheck, Eye, Sparkles, Database, CheckCircle2 } from "lucide-react";

export default function ParametersPage() {
  const [parameters, setParameters] = useState<ParameterCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [selectedType, setSelectedType] = useState("ALL");

  useEffect(() => {
    fetchParameters()
      .then((data) => setParameters(data))
      .catch((err) => console.error("Error loading parameters:", err))
      .finally(() => setLoading(false));
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    parameters.forEach((p) => set.add(p.category));
    return Array.from(set).sort();
  }, [parameters]);

  const filteredParameters = useMemo(() => {
    return parameters.filter((p) => {
      const matchCategory = selectedCategory === "ALL" || p.category === selectedCategory;
      const matchType = selectedType === "ALL" || p.detection_type === selectedType;
      const query = searchQuery.toLowerCase().trim();
      const matchSearch =
        !query ||
        p.name.toLowerCase().includes(query) ||
        p.description.toLowerCase().includes(query) ||
        p.category.toLowerCase().includes(query) ||
        p.id.toString() === query;
      return matchCategory && matchType && matchSearch;
    });
  }, [parameters, selectedCategory, selectedType, searchQuery]);

  const stats = useMemo(() => {
    const total = parameters.length;
    const observable = parameters.filter((p) => p.detection_type === "OBSERVABLE").length;
    const inferable = parameters.filter((p) => p.detection_type === "INFERABLE").length;
    const internal = parameters.filter((p) => p.detection_type === "INTERNAL").length;
    return { total, observable, inferable, internal };
  }, [parameters]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-400 text-xs font-mono tracking-wider uppercase mb-1">
            <Sliders className="w-3.5 h-3.5" />
            PostgreSQL Parameter Catalog
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">135 Business Audit Parameters</h2>
          <p className="text-xs text-slate-400 mt-1">
            The deterministic evaluation criteria OpenClaw investigates across web, maps, ads, and digital footprints.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
            Total Seeded: <span className="text-violet-400 font-bold">{parameters.length || 135}</span>
          </div>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl glass-panel border border-slate-800">
          <div className="text-[11px] text-slate-400 uppercase tracking-wider font-mono">Total Matrix</div>
          <div className="text-2xl font-bold font-mono text-white mt-1">{stats.total || 135}</div>
          <div className="text-[10px] text-slate-400 mt-1">13 Categories (A through M)</div>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-emerald-500/20 bg-emerald-950/10">
          <div className="text-[11px] text-emerald-400 uppercase tracking-wider font-mono flex items-center gap-1">
            <Eye className="w-3 h-3" /> Observable
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-300 mt-1">{stats.observable}</div>
          <div className="text-[10px] text-slate-400 mt-1">Publicly verifiable by OpenClaw</div>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-sky-500/20 bg-sky-950/10">
          <div className="text-[11px] text-sky-400 uppercase tracking-wider font-mono flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Inferable
          </div>
          <div className="text-2xl font-bold font-mono text-sky-300 mt-1">{stats.inferable}</div>
          <div className="text-[10px] text-slate-400 mt-1">Derived from behavioural signals</div>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-amber-500/20 bg-amber-950/10">
          <div className="text-[11px] text-amber-400 uppercase tracking-wider font-mono flex items-center gap-1">
            <Database className="w-3 h-3" /> Internal
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300 mt-1">{stats.internal}</div>
          <div className="text-[10px] text-slate-400 mt-1">Requires customer consultation</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="glass-panel p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search parameters by name, description, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/80 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
            />
          </div>

          {/* Type Selector */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-mono">Type:</span>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-violet-500"
            >
              <option value="ALL">All Detection Types</option>
              <option value="OBSERVABLE">Observable</option>
              <option value="INFERABLE">Inferable</option>
              <option value="INTERNAL">Internal</option>
            </select>
          </div>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          <button
            onClick={() => setSelectedCategory("ALL")}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 ${
              selectedCategory === "ALL"
                ? "bg-violet-500 text-white shadow-sm shadow-violet-500/40"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            All Categories ({parameters.length})
          </button>
          {categories.map((cat) => {
            const count = parameters.filter((p) => p.category === cat).length;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition shrink-0 ${
                  selectedCategory === cat
                    ? "bg-violet-500 text-white shadow-sm shadow-violet-500/40"
                    : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
                }`}
              >
                {cat} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Parameter Cards Grid */}
      {loading ? (
        <div className="text-center py-16 text-slate-400 text-xs font-mono">
          Loading 135 parameters from PostgreSQL...
        </div>
      ) : filteredParameters.length === 0 ? (
        <div className="text-center py-16 glass-panel rounded-xl border border-slate-800 text-slate-400 text-xs">
          No parameters found matching your filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredParameters.map((param) => (
            <div
              key={param.id}
              className="p-4 rounded-xl glass-panel border border-slate-800 hover:border-slate-700 transition space-y-2.5 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-violet-950/80 text-violet-300 border border-violet-800/60 font-bold">
                      #{param.id}
                    </span>
                    <span
                      className={`text-[9px] font-mono font-semibold px-2 py-0.5 rounded uppercase ${
                        param.detection_type === "OBSERVABLE"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : param.detection_type === "INFERABLE"
                          ? "bg-sky-500/10 text-sky-400 border border-sky-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      }`}
                    >
                      {param.detection_type}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Weight {param.default_weight}x</span>
                </div>

                <h3 className="text-sm font-semibold text-white mt-2 leading-snug">{param.name}</h3>

                <p className="text-xs text-slate-400 mt-1.5 leading-relaxed font-sans">{param.description}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                <span className="text-slate-400 truncate max-w-[200px]">{param.category}</span>
                <span className="text-emerald-400 flex items-center gap-1 text-[10px] font-mono">
                  <CheckCircle2 className="w-3 h-3" /> Seeded
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
