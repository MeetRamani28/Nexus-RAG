import React, { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Citation } from "../types";

interface Props { citations: Citation[]; }

export const CitationBadge: React.FC<Props> = ({ citations }) => {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[#44444E]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-[#9E9EA8] hover:text-[#E1DCC9] transition-colors group mb-2 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-[#E1DCC9]" />
          <span className="font-semibold text-[#E1DCC9]">
            {citations.length} source{citations.length > 1 ? "s" : ""} retrieved
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-[#9E9EA8]" /> : <ChevronDown className="w-3 h-3 text-[#9E9EA8]" />}
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {citations.map((cite, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-[#000000]/60 backdrop-blur-md border border-[#44444E]/60 rounded-xl px-3.5 py-2.5 hover:border-[#E1DCC9]/40 transition-all group shadow-sm"
            >
              <span className="shrink-0 w-5 h-5 bg-[#1E1E24]/80 border border-[#44444E]/60 rounded-lg text-[#E1DCC9] text-[10px] font-bold flex items-center justify-center mt-0.5 shadow-sm">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#F5F5F7] truncate">{cite.source_file}</span>
                  <span className="shrink-0 text-[10px] text-[#9E9EA8] bg-[#1E1E24]/70 border border-[#44444E]/50 px-1.5 py-0.5 rounded-md font-medium">
                    pg. {cite.page_number}
                  </span>
                </div>
                <p className="text-[11px] text-[#9E9EA8]/90 line-clamp-2 italic leading-relaxed">
                  &ldquo;{cite.content_snippet}&rdquo;
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-[#9E9EA8] group-hover:text-[#E1DCC9] transition-colors shrink-0 mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
