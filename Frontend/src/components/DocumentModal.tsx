import React, { useState, useEffect } from "react";
import { FileText, Trash2, X, RefreshCw, Loader2, Database } from "lucide-react";
import type { IngestedDocument } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDocsChanged: (deletedFilename?: string) => void;
  fetchAuth?: (url: string, options?: RequestInit) => Promise<Response>;
}

export const DocumentModal: React.FC<Props> = ({ isOpen, onClose, onDocsChanged, fetchAuth = fetch }) => {
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        setDocuments(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchDocs();
  }, [isOpen]);

  const handleDelete = async (filename: string) => {
    setDeletingFile(filename);
    try {
      await fetchAuth(`${API_BASE_URL}/api/v1/documents/${encodeURIComponent(filename)}`, {
        method: "DELETE",
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
      onDocsChanged(filename);
    } catch {
      // ignore
    } finally {
      setDeletingFile(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="bg-[#1E1E24]/85 backdrop-blur-2xl border border-[#44444E]/60 rounded-3xl w-full max-w-lg shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[80vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#44444E]/40 bg-[#000000]/60 backdrop-blur-md">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#1E1E24]/80 border border-[#44444E]/60 rounded-xl text-[#E1DCC9]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#E1DCC9]">Knowledge Base Documents</h3>
              <p className="text-[11px] text-[#9E9EA8]">Ingested PDFs indexed in Qdrant Vector Store</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocs}
              className="p-1.5 rounded-lg text-[#9E9EA8] hover:text-[#E1DCC9] hover:bg-[#1E1E24]/70 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#9E9EA8] hover:text-[#E1DCC9] hover:bg-[#1E1E24]/70 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
          {loading && documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#9E9EA8] space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#E1DCC9]" />
              <p className="text-xs">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-[#9E9EA8]">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#9E9EA8]" />
              <p className="text-xs font-medium text-[#E1DCC9]">No documents uploaded yet.</p>
              <p className="text-[11px] text-[#9E9EA8]/80 mt-1">Upload a PDF inside any chat to build your knowledge base.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between bg-[#000000]/50 backdrop-blur-md border border-[#44444E]/50 rounded-2xl p-3.5 hover:border-[#E1DCC9]/40 transition-all shadow-sm group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-[#1E1E24]/80 border border-[#44444E]/60 rounded-xl text-[#E1DCC9] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#F5F5F7] truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-[10px] text-[#9E9EA8] mt-0.5">
                      {doc.parent_chunks} Parent Chunks · {doc.child_chunks} Vector Embeddings
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="p-2 text-[#9E9EA8]/70 hover:text-rose-400 hover:bg-rose-950/40 rounded-lg transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  title="Delete Document"
                >
                  {deletingFile === doc.filename ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#44444E]/40 bg-[#000000]/60 backdrop-blur-md flex items-center justify-between text-xs text-[#9E9EA8]">
          <span>Total Documents: <strong className="text-[#E1DCC9] font-semibold">{documents.length}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#E1DCC9] hover:bg-[#EDE8D6] text-[#1E1E24] font-extrabold rounded-xl transition-all shadow-[0_2px_12px_rgba(225,220,201,0.25)] cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
