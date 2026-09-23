import React, { useState, useEffect } from "react";
import { FileText, Trash2, X, RefreshCw, Loader2, Database } from "lucide-react";
import type { IngestedDocument } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onDocsChanged: () => void;
  fetchAuth?: (url: string, options?: RequestInit) => Promise<Response>;
}

export const DocumentModal: React.FC<Props> = ({ isOpen, onClose, onDocsChanged, fetchAuth = fetch }) => {
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const fetchDocs = async () => {
    setLoading(true);
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents`);
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
      });
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
      onDocsChanged();
    } catch {
      // ignore
    } finally {
      setDeletingFile(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#F8F6F0] border border-[#E5E2D9] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E2D9] bg-white">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-[#FF5722]/10 border border-[#FF5722]/20 rounded-xl text-[#FF5722]">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[#18181B]">Knowledge Base Documents</h3>
              <p className="text-[11px] text-[#71717A]">Ingested PDFs indexed in Qdrant Vector Store</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocs}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-black/5 transition-colors cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-black/5 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
          {loading && documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-[#71717A] space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-[#FF5722]" />
              <p className="text-xs">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-[#71717A]">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#71717A]" />
              <p className="text-xs font-medium text-[#18181B]">No documents uploaded yet.</p>
              <p className="text-[11px] text-[#71717A] mt-1">Upload a PDF inside any chat to build your knowledge base.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between bg-white border border-[#E5E2D9] rounded-xl p-3.5 hover:border-[#18181B]/20 transition-all shadow-sm group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-[#FF5722]/10 border border-[#FF5722]/20 rounded-lg text-[#FF5722] shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#18181B] truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-[10px] text-[#71717A] mt-0.5">
                      {doc.parent_chunks} Parent Chunks · {doc.child_chunks} Vector Embeddings
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="p-2 text-[#71717A] hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors shrink-0 disabled:opacity-50 cursor-pointer"
                  title="Delete Document"
                >
                  {deletingFile === doc.filename ? (
                    <Loader2 className="w-4 h-4 animate-spin text-rose-600" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#E5E2D9] bg-white flex items-center justify-between text-xs text-[#71717A]">
          <span>Total Documents: <strong className="text-[#18181B] font-semibold">{documents.length}</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#18181B] hover:bg-[#27272A] text-white rounded-xl transition-colors font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
