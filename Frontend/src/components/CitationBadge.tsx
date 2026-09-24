import React, { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Citation } from "../types";

interface Props { citations: Citation[]; }

export const CitationBadge: React.FC<Props> = ({ citations }) => {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[#232F48]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-[#94A3B8] hover:text-[#00F0FF] transition-colors group mb-2 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-[#00F0FF]" />
          <span className="font-semibold text-[#00F0FF]">
            {citations.length} source{citations.length > 1 ? "s" : ""} retrieved
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-[#94A3B8]" /> : <ChevronDown className="w-3 h-3 text-[#94A3B8]" />}
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {citations.map((cite, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-[#0B0F19] border border-[#232F48] rounded-xl px-3.5 py-2.5 hover:border-[#00F0FF]/40 transition-all group"
            >
              <span className="shrink-0 w-5 h-5 bg-[#151C2C] border border-[#232F48] rounded-lg text-[#00F0FF] text-[10px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#F1F5F9] truncate">{cite.source_file}</span>
                  <span className="shrink-0 text-[10px] text-[#94A3B8] bg-[#151C2C] border border-[#232F48] px-1.5 py-0.5 rounded-md font-medium">
                    pg. {cite.page_number}
                  </span>
                </div>
                <p className="text-[11px] text-[#94A3B8] line-clamp-2 italic leading-relaxed">
                  &ldquo;{cite.content_snippet}&rdquo;
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-[#94A3B8] group-hover:text-[#00F0FF] transition-colors shrink-0 mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
