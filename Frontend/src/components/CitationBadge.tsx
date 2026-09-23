import React, { useState } from "react";
import { FileText, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import type { Citation } from "../types";

interface Props { citations: Citation[]; }

export const CitationBadge: React.FC<Props> = ({ citations }) => {
  const [expanded, setExpanded] = useState(false);
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-[#E5E2D9]">
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 text-xs text-[#71717A] hover:text-[#18181B] transition-colors group mb-2 cursor-pointer"
      >
        <div className="flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5 text-[#FF5722]" />
          <span className="font-semibold text-[#18181B]">
            {citations.length} source{citations.length > 1 ? "s" : ""} retrieved
          </span>
        </div>
        {expanded ? <ChevronUp className="w-3 h-3 text-[#71717A]" /> : <ChevronDown className="w-3 h-3 text-[#71717A]" />}
      </button>

      {expanded && (
        <div className="space-y-2 mt-2">
          {citations.map((cite, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 bg-[#F8F6F0] border border-[#E5E2D9] rounded-xl px-3.5 py-2.5 hover:border-[#18181B]/20 transition-all group"
            >
              <span className="shrink-0 w-5 h-5 bg-[#FF5722]/10 border border-[#FF5722]/20 rounded-lg text-[#FF5722] text-[10px] font-bold flex items-center justify-center mt-0.5">
                {idx + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-[#18181B] truncate">{cite.source_file}</span>
                  <span className="shrink-0 text-[10px] text-[#71717A] bg-white border border-[#E5E2D9] px-1.5 py-0.5 rounded-md font-medium">
                    pg. {cite.page_number}
                  </span>
                </div>
                <p className="text-[11px] text-[#71717A] line-clamp-2 italic leading-relaxed">
                  &ldquo;{cite.content_snippet}&rdquo;
                </p>
              </div>
              <ExternalLink className="w-3 h-3 text-[#71717A] group-hover:text-[#FF5722] transition-colors shrink-0 mt-1" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
