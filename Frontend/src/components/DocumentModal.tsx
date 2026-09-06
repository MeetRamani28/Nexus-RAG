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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Knowledge Base Documents</h3>
              <p className="text-[11px] text-slate-400">Ingested PDFs indexed in Qdrant Vector Store</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchDocs}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-3 no-scrollbar">
          {loading && documents.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-slate-500 space-y-2">
              <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
              <p className="text-xs">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No documents uploaded yet.</p>
              <p className="text-[11px] text-slate-600 mt-1">Upload a PDF inside any chat to build your knowledge base.</p>
            </div>
          ) : (
            documents.map((doc) => (
              <div
                key={doc.id}
                className="flex items-center justify-between bg-slate-900/60 border border-slate-800/80 rounded-xl p-3.5 hover:border-slate-700/60 transition-all group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-400 shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-200 truncate" title={doc.filename}>
                      {doc.filename}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {doc.parent_chunks} Parent Chunks · {doc.child_chunks} Vector Embeddings
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="p-2 text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors shrink-0 disabled:opacity-50"
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
        <div className="px-6 py-3 border-t border-slate-800/80 bg-slate-900/30 flex items-center justify-between text-xs text-slate-400">
          <span>Total Documents: {documents.length}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition-colors font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
