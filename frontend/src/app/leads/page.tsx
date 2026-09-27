"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fetchLeads, deleteLead, clearAllLeads, Lead } from "@/lib/api";
import { Users, Filter, ArrowUpRight, Search, Phone, Mail, Globe, ExternalLink, User, Trash2 } from "lucide-react";

export default function LeadsPipelinePage() {
  const router = useRouter();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activeTier, setActiveTier] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  const loadLeads = () => {
    setLoading(true);
    fetchLeads()
      .then((data) => setLeads(data))
      .catch((e) => console.error("Error loading leads:", e))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadLeads();
  }, []);

  const handleDeleteSingle = async (leadId: string) => {
    if (!confirm("Are you sure you want to remove this lead?")) return;
    try {
      await deleteLead(leadId);
      setLeads((prev) => prev.filter((l) => l.id !== leadId));
    } catch (err: any) {
      alert("Failed to delete lead: " + err.message);
    }
  };

  const handleClearAll = async () => {
    const tierMsg = activeTier === "ALL" ? "all leads" : `all '${activeTier}' leads`;
    if (!confirm(`Are you sure you want to delete ${tierMsg}? This action cannot be undone.`)) return;
    try {
      await clearAllLeads(activeTier);
      loadLeads();
    } catch (err: any) {
      alert("Failed to clear leads: " + err.message);
    }
  };

  const filtered = leads.filter((lead) => {
    const matchesTier = activeTier === "ALL" || lead.tier === activeTier;
    const matchesSearch =
      searchTerm === "" ||
      (lead.business_name && lead.business_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (lead.primary_gap_summary && lead.primary_gap_summary.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesTier && matchesSearch;
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-amber-400" />
            Qualified Lead Pipeline
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Deterministically scored and gate-validated prospective clients with corroborated solvable gaps.
          </p>
        </div>
        {leads.length > 0 && (
          <button
            onClick={handleClearAll}
            className="px-3.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear Pipeline
          </button>
        )}
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 p-1 rounded-xl bg-slate-900 border border-slate-800">
          {["ALL", "Strong Potential", "Review Needed", "Rejected"].map((tier) => (
            <button
              key={tier}
              onClick={() => setActiveTier(tier)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition ${
                activeTier === tier
                  ? "bg-slate-800 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {tier}
            </button>
          ))}
        </div>

        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search company or gap..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
          />
        </div>
      </div>

      {/* Pipeline Table */}
      <div className="glass-panel rounded-2xl border border-slate-800 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">
            {loading ? "Loading prospective leads..." : "No leads match the selected criteria."}
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-900/90 text-xs text-slate-400 border-b border-slate-800 font-semibold tracking-wider uppercase">
              <tr>
                <th className="py-3.5 px-4">Score & Tier</th>
                <th className="py-3.5 px-4">Company & Lead</th>
                <th className="py-3.5 px-4">Website</th>
                <th className="py-3.5 px-4">Contact Info</th>
                <th className="py-3.5 px-4">Detected Solvable Gap</th>
                <th className="py-3.5 px-4 text-right">Dossier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-normal">
              {filtered.map((lead) => (
                <tr
                  key={lead.id}
                  onClick={() => router.push(`/leads/${lead.id}`)}
                  className="hover:bg-slate-800/50 transition cursor-pointer group"
                >
                  <td className="py-4 px-4 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full ${
                        lead.tier === "Strong Potential"
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : lead.tier === "Review Needed"
                          ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}>
                        {lead.tier}
                      </span>
                      <span className="font-mono text-xs font-bold text-white">{lead.final_score}</span>
                    </div>
                  </td>
                  <td className="py-4 px-4 font-semibold text-slate-100 max-w-xs">
                    <div className="group-hover:text-sky-400 transition truncate">{lead.business_name || "Commercial Candidate"}</div>
                    {lead.contact_person && (
                      <div className="text-[11px] text-purple-300 flex items-center gap-1 font-normal mt-0.5">
                        <User className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="truncate">{lead.contact_person} {lead.contact_title ? `(${lead.contact_title})` : ""}</span>
                      </div>
                    )}
                    {lead.address && (
                      <div className="text-[10px] text-slate-500 font-normal truncate mt-0.5">{lead.address}</div>
                    )}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap">
                    {lead.domain ? (
                      <a
                        href={`https://${lead.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-sky-400 font-mono hover:underline inline-flex items-center gap-1"
                      >
                        <Globe className="w-3 h-3" /> {lead.domain} <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-rose-500/15 text-rose-300 border border-rose-500/25">
                        Missing Website (Gap)
                      </span>
                    )}
                  </td>
                  <td className="py-4 px-4 whitespace-nowrap text-xs">
                    <div>
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline text-sky-300 font-mono flex items-center gap-1.5"
                        >
                          <Phone className="w-3 h-3 text-sky-400 shrink-0" /> {lead.phone}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-600 shrink-0" /> No direct phone
                        </span>
                      )}
                    </div>
                    <div className="mt-1">
                      {lead.email ? (
                        <a
                          href={`mailto:${lead.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="hover:underline text-emerald-300 flex items-center gap-1.5 truncate max-w-[180px]"
                        >
                          <Mail className="w-3 h-3 text-emerald-400 shrink-0" /> {lead.email}
                        </a>
                      ) : (
                        <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-slate-600 shrink-0" /> No direct email
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="py-4 px-4 text-xs text-slate-300 max-w-sm">
                    {lead.primary_gap_summary}
                  </td>
                  <td className="py-4 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-2">
                      <Link
                        href={`/leads/${lead.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 font-medium text-xs transition border border-sky-500/20"
                      >
                        View Dossier <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSingle(lead.id);
                        }}
                        title="Delete lead from pipeline"
                        className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/60 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
