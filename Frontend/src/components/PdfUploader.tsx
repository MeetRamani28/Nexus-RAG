import React, { useState, useEffect } from "react";
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import type { IngestResponse } from "../types";

interface PdfUploaderProps {
  onIngestSuccess: (data: IngestResponse) => void;
}

export const PdfUploader: React.FC<PdfUploaderProps> = ({
  onIngestSuccess,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const API_BASE_URL =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
  const [successData, setSuccessData] = useState<IngestResponse | null>(null);

  useEffect(() => {
    const savedIngestData = localStorage.getItem("nexus_rag_ingest_data");
    if (savedIngestData) {
      try {
        const parsed: IngestResponse = JSON.parse(savedIngestData);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSuccessData(parsed);
        onIngestSuccess(parsed);
      } catch (err) {
        console.error("Failed to parse saved document data", err);
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      if (selected.type === "application/pdf") {
        setFile(selected);
        setError(null);
      } else {
        setError("Please select a valid PDF file.");
        setFile(null);
      }
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

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.statusText}`);
      }

      const result: IngestResponse = await response.json();
      setSuccessData(result);

      // 2. સક્સેસફુલ ઇનજેસ્ટ થતાં જ localStorage માં સેવ કરી લો
      localStorage.setItem("nexus_rag_ingest_data", JSON.stringify(result));

      onIngestSuccess(result);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      setError(err.message || "Error processing document");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl">
      <div className="flex items-center space-x-3 mb-4">
        <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20 text-sky-400">
          <Upload className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-slate-100">
          Document Ingestion
        </h2>
      </div>

      <div className="space-y-4">
        <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700 hover:border-sky-500/50 rounded-xl p-6 cursor-pointer transition-colors bg-slate-950/40">
          <FileText className="w-8 h-8 text-slate-400 mb-2" />
          <span className="text-sm font-medium text-slate-300">
            {file ? file.name : "Click or drag PDF here"}
          </span>
          <span className="text-xs text-slate-500 mt-1">
            Supports multi-page financial/technical PDFs
          </span>
          <input
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />
        </label>

        {error && (
          <div className="flex items-center space-x-2 text-rose-400 text-xs bg-rose-500/10 p-3 rounded-lg border border-rose-500/20">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successData && (
          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-xs text-emerald-300 space-y-1">
            <div className="flex items-center space-x-1.5 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successData.filename} Processed!</span>
            </div>
            <div className="text-slate-400 pl-5">
              Parents:{" "}
              <strong className="text-slate-200">
                {successData.parent_chunks_created}
              </strong>{" "}
              | Children:{" "}
              <strong className="text-slate-200">
                {successData.child_chunks_created}
              </strong>
            </div>
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!file || loading}
          className="w-full py-2.5 px-4 bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-500 text-slate-100 rounded-xl font-medium text-sm transition-all flex items-center justify-center space-x-2 shadow-lg shadow-sky-900/20 cursor-pointer disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Ingesting & Indexing...</span>
            </>
          ) : (
            <span>Process & Embed PDF</span>
          )}
        </button>
      </div>
    </div>
  );
};
