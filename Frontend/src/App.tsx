import React, { useState, useEffect } from "react";
import {
  Layers,
  ShieldCheck,
  Cpu,
  PanelLeftClose,
  PanelLeftOpen,
  Database,
  Zap,
} from "lucide-react";
import { PdfUploader } from "./components/PdfUploader";
import { ChatInterface } from "./components/ChatInterface";
import type { SystemInfoResponse } from "./types";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const App: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [resetKey, setResetKey] = useState(0);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/system/info`)
      .then((res) => res.json())
      .then((data: SystemInfoResponse) => setSystemInfo(data))
      .catch((err) => console.error("Failed to fetch system info:", err));
  }, []);

  const handleIngestSuccess = () => {
    localStorage.removeItem("nexus_rag_chat_history");
    setResetKey((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen no-scrollbar bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="h-16 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setIsSidebarOpen((prev) => !prev)}
            title={isSidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-all cursor-pointer"
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="w-5 h-5" />
            ) : (
              <PanelLeftOpen className="w-5 h-5 text-sky-400" />
            )}
          </button>

          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-sky-500/10 rounded-xl border border-sky-500/20 text-sky-400">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-50 flex items-center gap-2">
                Nexus-RAG
              </h1>
              <p className="text-[10px] text-slate-400 hidden sm:block">
                Enterprise Document Intelligence Engine
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 text-xs">
          <div className="flex items-center space-x-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span className="hidden md:inline">Groq</span>
            <span className="text-slate-400 font-mono text-[11px]">
              {systemInfo?.active_llm_model || "Loading..."}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300">
            <Database className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
            <span className="hidden md:inline">Vector DB</span>
            <span className="text-slate-400 uppercase text-[11px] font-semibold">
              {systemInfo?.vector_provider || "QDRANT"}
            </span>
          </div>

          <div className="flex items-center space-x-1.5 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-xl text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="hidden md:inline">Cohere</span>
            <span className="text-slate-400">Rerank v3</span>
          </div>

          {systemInfo?.hyde_enabled && (
            <div className="flex items-center space-x-1.5 bg-slate-900/80 border border-amber-500/30 px-3 py-1.5 rounded-xl text-slate-300">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span className="hidden md:inline text-amber-400 text-[11px] font-semibold">HyDE</span>
              <span className="text-slate-400 text-[11px]">ON</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden p-4 md:p-6 gap-6 max-w-[1800px] w-full mx-auto">
        <aside
          className={`transition-all duration-300 ease-in-out shrink-0 flex flex-col ${
            isSidebarOpen
              ? "w-full lg:w-80 opacity-100"
              : "w-0 lg:w-0 opacity-0 overflow-hidden pointer-events-none"
          }`}
        >
          <PdfUploader onIngestSuccess={handleIngestSuccess} />
        </aside>

        <main className="flex-1 min-w-0 flex flex-col transition-all duration-300">
          <ChatInterface key={resetKey} />
        </main>
      </div>
    </div>
  );
};

export default App;
