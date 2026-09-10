import React, { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Citation } from "../types";

interface Props { citations: Citation[]; }

export const CitationBadge: React.FC<Props> = ({ citations }) => {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-zinc-800/60">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 transition-colors group mb-2"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span className="font-medium text-zinc-400">
            {citations.length} source{citations.length > 1 ? "s" : ""} retrieved
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {citations.map((cite, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-zinc-800/40 border border-zinc-800/50 rounded-lg px-3 py-2.5 hover:border-indigo-500/30 transition-all group"
            >
              <span className="shrink-0 w-5 h-5 bg-indigo-500/10 border border-indigo-500/20 rounded text-indigo-400 text-[10px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-zinc-300 truncate">{cite.source_file}</span>
                  <span className="shrink-0 text-[10px] text-zinc-500 bg-zinc-800/50 px-1.5 py-0.5 rounded">
                    pg. {cite.page_number}
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 line-clamp-2 italic leading-relaxed">
                  &ldquo;{cite.content_snippet}&rdquo;
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-zinc-600 group-hover:text-indigo-400 transition-colors shrink-0 mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
