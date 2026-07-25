import React from "react";
import { BookOpen } from "lucide-react";
import type { Citation } from "../types";

interface CitationBadgeProps {
  citations: Citation[];
}

export const CitationBadge: React.FC<CitationBadgeProps> = ({ citations }) => {
  if (!citations || citations.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-800/80">
      <div className="flex items-center space-x-1.5 text-xs text-sky-400 font-medium mb-2">
        <BookOpen className="w-3.5 h-3.5" />
        <span>Retrieved Context Sources:</span>
      </div>
      <div className="flex flex-wrap gap-2">
        {citations.map((cite, idx) => (
          <div
            key={idx}
            className="group relative bg-slate-900/90 border border-slate-800 hover:border-sky-500/40 rounded-lg px-2.5 py-1 text-xs text-slate-300 transition-all cursor-pointer"
          >
            <span className="font-semibold text-sky-400">
              {cite.source_file}
            </span>
            <span className="text-slate-500 ml-1">
              (Pg. {cite.page_number})
            </span>

            {/* Hover Tooltip showing content snippet */}
            <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block w-64 p-2.5 bg-slate-900 border border-slate-700 text-slate-300 text-[11px] rounded-lg shadow-2xl z-50 pointer-events-none">
              <p className="font-semibold text-sky-400 mb-1">
                {cite.source_file} - Page {cite.page_number}
              </p>
              <p className="line-clamp-3 text-slate-400 italic">
                "{cite.content_snippet}"
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
