import React, { useState, useEffect, useCallback } from "react";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw,
} from "lucide-react";
import type { IngestResponse, IngestedDocument } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface PdfUploaderProps {
  onIngestSuccess: (data: IngestResponse) => void;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({ onIngestSuccess }) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IngestResponse | null>(null);
  const [documents, setDocuments] = useState<IngestedDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const fetchDocuments = useCallback(async () => {
    setDocsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/documents`);
      if (res.ok) setDocuments(await res.json());
    } catch {
      // silently fail
    } finally {
      setDocsLoading(false);
    }
  }, []);

  useEffect(() => { fetchDocuments(); }, [fetchDocuments]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      const selected = e.target.files[0];
      if (selected.type === "application/pdf") {
        setFile(selected);
        setError(null);
        setLastResult(null);
      } else {
        setError("Please select a valid PDF file.");
        setFile(null);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") {
      setFile(dropped);
      setError(null);
      setLastResult(null);
    } else {
      setError("Only PDF files are supported.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/ingest`, {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error(`Upload failed: ${response.statusText}`);
      const result: IngestResponse = await response.json();
      setLastResult(result);
      if (!result.duplicate) {
        onIngestSuccess(result);
        await fetchDocuments();
      }
      setFile(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error processing document");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (filename: string) => {
    setDeletingFile(filename);
    try {
      await fetch(`${API_BASE_URL}/api/v1/documents/${encodeURIComponent(filename)}`, {
        method: "DELETE",
      });
      setDocuments((prev) => prev.filter((d) => d.filename !== filename));
    } catch {
      // silently ignore
    } finally {
      setDeletingFile(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload area */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-sky-500/10 rounded-lg border border-sky-500/20 text-sky-400">
              <Upload className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold text-zinc-100">Upload PDF</h2>
          </div>
        </div>

        <label
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 hover:border-sky-500/50 rounded-xl p-5 cursor-pointer transition-colors bg-zinc-950/40"
        >
          <FileText className="w-7 h-7 text-zinc-400 mb-2" />
          <span className="text-sm font-medium text-zinc-300 text-center">
            {file ? file.name : "Click or drag PDF here"}
          </span>
          <span className="text-xs text-zinc-500 mt-1">Multi-page financial & technical PDFs</span>
          <input type="file" accept=".pdf" className="hidden" onChange={handleFileChange} />
        </label>

        {error && (
          <div className="mt-3 flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {lastResult && (
          <div className={`mt-3 rounded-xl p-3 text-xs border space-y-1 ${lastResult.duplicate ? "bg-amber-500/10 border-amber-500/20 text-amber-300" : "bg-emerald-500/10 border-emerald-500/20 text-emerald-300"}`}>
            <div className="flex items-center space-x-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{lastResult.duplicate ? "Already Ingested" : `${lastResult.filename} Processed!`}</span>
            </div>
            {!lastResult.duplicate && (
              <div className="text-zinc-400 pl-5">
                Parents: <strong className="text-zinc-200">{lastResult.parent_chunks_created}</strong> | Children: <strong className="text-zinc-200">{lastResult.child_chunks_created}</strong>
              </div>
            )}
            {lastResult.duplicate && <p className="text-zinc-400 pl-5">{lastResult.message}</p>}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="mt-3 w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-zinc-100 rounded-xl font-medium text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /><span>Ingesting...</span></>
          ) : (
            <span>Process & Embed PDF</span>
          )}
        </button>
      </div>

      {/* Ingested documents list */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-zinc-100">Ingested Documents</h2>
          <button onClick={fetchDocuments} className="text-zinc-500 hover:text-zinc-300 transition-colors" title="Refresh">
            <RefreshCw className={`w-3.5 h-3.5 ${docsLoading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {documents.length === 0 ? (
          <p className="text-xs text-zinc-500 text-center py-3">No documents ingested yet.</p>
        ) : (
          <div className="space-y-1.5 max-h-48 overflow-y-auto no-scrollbar">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center justify-between bg-zinc-800/50 rounded-lg px-3 py-2 group">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-zinc-200 truncate" title={doc.filename}>{doc.filename}</p>
                    <p className="text-[10px] text-zinc-500">{doc.parent_chunks}P · {doc.child_chunks}C chunks</p>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(doc.filename)}
                  disabled={deletingFile === doc.filename}
                  className="shrink-0 ml-2 text-zinc-600 hover:text-rose-400 transition-colors disabled:opacity-50"
                  title="Remove document"
                >
                  {deletingFile === doc.filename
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
