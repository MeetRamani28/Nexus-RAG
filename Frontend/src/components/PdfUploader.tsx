import React, { useState } from "react";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import type { IngestResponse } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface PdfUploaderProps {
  onIngestSuccess: (data: IngestResponse) => void;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({ onIngestSuccess }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<IngestResponse | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selected = Array.from(e.target.files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
      if (selected.length > 0) {
        setFiles(selected);
        setError(null);
        setLastResult(null);
      } else {
        setError("Please select valid PDF file(s).");
        setFiles([]);
      }
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (dropped.length > 0) {
      setFiles(dropped);
      setError(null);
      setLastResult(null);
    } else {
      setError("Only PDF files are supported.");
    }
  };

  const handleCancel = () => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setFiles([]);
    setLoading(false);
    setUploadProgress(null);
    setError(null);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setLoading(true);
    setError(null);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    try {
      for (let i = 0; i < files.length; i++) {
        if (signal.aborted) break;
        const currentFile = files[i];
        setUploadProgress({ current: i + 1, total: files.length, name: currentFile.name });
        const formData = new FormData();
        formData.append("file", currentFile);

        const response = await fetch(`${API_BASE_URL}/api/v1/ingest`, {
          method: "POST",
          body: formData,
          signal,
        });

        if (signal.aborted) break;
        if (!response.ok) throw new Error(`Upload failed for ${currentFile.name}`);
        const result: IngestResponse = await response.json();
        setLastResult(result);
        if (!result.duplicate) {
          onIngestSuccess(result);
        }
      }
      if (!signal.aborted) {
        setFiles([]);
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") {
        setError("Upload canceled.");
      } else {
        setError(err instanceof Error ? err.message : "Error processing document");
      }
    } finally {
      setLoading(false);
      setUploadProgress(null);
      abortRef.current = null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Upload area */}
      <div className="bg-[#151C2C] border border-[#232F48] rounded-2xl p-5 shadow-md">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 bg-[#0B0F19] rounded-lg border border-[#232F48] text-[#00F0FF]">
              <Upload className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-bold text-[#00F0FF]">Upload PDF</h2>
          </div>
          {loading && (
            <button
              onClick={handleCancel}
              className="text-xs text-rose-400 font-semibold border border-rose-800/40 bg-rose-950/40 hover:bg-rose-950/60 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
            >
              Cancel Upload
            </button>
          )}
        </div>

        <label
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          className="flex flex-col items-center justify-center border-2 border-dashed border-[#232F48] hover:border-[#00F0FF] rounded-xl p-5 cursor-pointer transition-colors bg-[#0B0F19]"
        >
          <FileText className="w-7 h-7 text-[#00F0FF] mb-2" />
          <span className="text-sm font-semibold text-[#F1F5F9] text-center">
            {uploadProgress
              ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}: ${uploadProgress.name}`
              : files.length > 0
              ? `${files.length} PDF file(s) selected: ${files.map(f => f.name).join(", ")}`
              : "Click or drag single or multiple PDFs here"}
          </span>
          <span className="text-xs text-[#94A3B8] mt-1">Multi-page financial & technical PDFs</span>
          <input type="file" accept=".pdf" multiple className="hidden" onChange={handleFileChange} />
        </label>

        {error && (
          <div className="mt-3 flex items-center space-x-2 text-rose-300 text-xs bg-rose-950/40 p-3 rounded-lg border border-rose-800/50">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {lastResult && (
          <div className={`mt-3 rounded-xl p-3 text-xs border space-y-1 ${lastResult.duplicate ? "bg-[#0B0F19] border-amber-500/40 text-amber-300" : "bg-[#0B0F19] border-emerald-500/40 text-emerald-300"}`}>
            <div className="flex items-center space-x-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{lastResult.duplicate ? "Already Ingested" : `${lastResult.filename} Processed!`}</span>
            </div>
            {!lastResult.duplicate && (
              <div className="text-[#94A3B8] pl-5">
                Parents: <strong className="text-[#00F0FF]">{lastResult.parent_chunks_created}</strong> | Children: <strong className="text-[#00F0FF]">{lastResult.child_chunks_created}</strong>
              </div>
            )}
            {lastResult.duplicate && <p className="text-[#94A3B8] pl-5">{lastResult.message}</p>}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={files.length === 0 || loading}
          className="mt-3 w-full py-2.5 px-4 bg-[#00F0FF] hover:bg-[#66F6FF] disabled:bg-[#232F48] disabled:text-[#94A3B8]/40 text-[#0B0F19] rounded-xl font-extrabold text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:cursor-not-allowed shadow-md"
        >
          {loading ? (
            <><Loader2 className="w-4 h-4 animate-spin text-[#0B0F19]" /><span>Processing...</span></>
          ) : (
            <span>Upload Document(s)</span>
          )}
        </button>
      </div>
    </div>
  );
};
