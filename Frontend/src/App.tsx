import React, { useState, useEffect, useCallback } from "react";
import {
  Database, Zap, ShieldCheck, PanelLeftClose, PanelLeftOpen, Layers
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentModal } from "./components/DocumentModal";
import type { ConversationListItem, SystemInfoResponse } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const App: React.FC = () => {
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);

  // Fetch System Info
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/system/info`)
      .then((r) => r.json())
      .then((d: SystemInfoResponse) => setSystemInfo(d))
      .catch(() => {});
  }, []);

  // Fetch Document Count
  const fetchDocCount = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/documents`);
      if (res.ok) {
        const docs = await res.json();
        setDocCount(docs.length);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchDocCount();
  }, [fetchDocCount]);

  // Fetch Conversation List
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/conversations`);
      if (res.ok) {
        const list: ConversationListItem[] = await res.json();
        setConversations(list);
        if (list.length > 0 && !activeConversationId) {
          setActiveConversationId(list[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Create New Chat
  const handleNewChat = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      const newConv: ConversationListItem = await res.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
    } catch {
      // ignore
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetch(`${API_BASE_URL}/api/v1/conversations/${id}`, { method: "DELETE" });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
    } catch {
      // ignore
    }
  };

  const handleRenameConversation = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#050811] text-slate-100 font-sans overflow-hidden">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="h-14 border-b border-slate-800/60 bg-[#0a0f1c]/80 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4 text-blue-400" />}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-slate-100 leading-none">Nexus-RAG</h1>
              <p className="text-[10px] text-slate-400 leading-none mt-0.5 hidden sm:block">Agentic Document Intelligence</p>
            </div>
          </div>
        </div>

        {/* System Badges */}
        <div className="flex items-center gap-2">
          <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300">
            <Database className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-semibold uppercase text-slate-400">{systemInfo?.vector_provider ?? "QDRANT"}</span>
          </div>

          <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-slate-400">Cohere Rerank</span>
          </div>

          {systemInfo?.hyde_enabled && (
            <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-semibold">HyDE Active</span>
            </div>
          )}
        </div>
      </header>

      {/* ── Body Layout ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`shrink-0 transition-all duration-300 ease-in-out overflow-hidden z-10 ${
            sidebarOpen ? "w-64" : "w-0"
          }`}
        >
          <Sidebar
            conversations={conversations}
            activeId={activeConversationId}
            docCount={docCount}
            onNewChat={handleNewChat}
            onSelect={(id) => setActiveConversationId(id)}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onOpenDocs={() => setDocModalOpen(true)}
          />
        </aside>

        {/* Main Chat Interface */}
        <main className="flex-1 min-w-0 bg-[#050811] flex flex-col h-full overflow-hidden">
          <ChatInterface
            conversationId={activeConversationId}
            onDocUploaded={fetchDocCount}
            onConversationUpdated={fetchConversations}
          />
        </main>
      </div>

      {/* Document Modal */}
      <DocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        onDocsChanged={fetchDocCount}
      />
    </div>
  );
};

export default App;
