import React, { useState, useEffect, useCallback } from "react";
import {
  Database, Zap, ShieldCheck, PanelLeftClose, PanelLeftOpen, Layers, Menu, X
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentModal } from "./components/DocumentModal";
import type { ConversationListItem, SystemInfoResponse } from "./types";
import { SignedIn, SignedOut, useAuth, useUser, UserButton } from "@clerk/clerk-react";
import { AuthPage } from "./components/AuthPage";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const MainApp: React.FC = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [conversations, setConversations] = useState<ConversationListItem[]>(() => {
    const cached = localStorage.getItem("nexus_conversations");
    return cached ? JSON.parse(cached) : [];
  });
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => {
    return localStorage.getItem("nexus_active_conversation_id") || null;
  });
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default false on mobile
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);

  // Sync state to localStorage for instantaneous UI updates on cold start
  useEffect(() => {
    localStorage.setItem("nexus_conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("nexus_active_conversation_id", activeConversationId);
    } else {
      localStorage.removeItem("nexus_active_conversation_id");
    }
  }, [activeConversationId]);

  // Authenticated Fetch wrapper
  const fetchAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    return fetch(url, { ...options, headers });
  }, [getToken]);

  // Fetch System Info
  useEffect(() => {
    fetchAuth(`${API_BASE_URL}/api/v1/system/info`)
      .then((r) => r.json())
      .then((d: SystemInfoResponse) => setSystemInfo(d))
      .catch(() => {});
  }, [fetchAuth]);

  // Fetch Document Count
  const fetchDocCount = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents`);
      if (res.ok) {
        const docs = await res.json();
        setDocCount(docs.length);
      }
    } catch {
      // ignore
    }
  }, [fetchAuth]);

  useEffect(() => {
    fetchDocCount();
  }, [fetchDocCount]);

  // Fetch Conversation List
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations`);
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
  }, [fetchAuth, activeConversationId]);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Handle screen resize to show/hide sidebar automatically on desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Create New Chat
  const handleNewChat = async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      const newConv: ConversationListItem = await res.json();
      setConversations((prev) => [newConv, ...prev]);
      setActiveConversationId(newConv.id);
      if (window.innerWidth < 768) setSidebarOpen(false);
    } catch {
      // ignore
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`, { method: "DELETE" });
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

  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  return (
    <div className="flex flex-col h-[100dvh] w-screen bg-[#050811] text-slate-100 font-sans overflow-hidden">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="h-14 border-b border-slate-800/60 bg-[#0a0f1c]/80 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors md:hidden"
            title={sidebarOpen ? "Close Menu" : "Open Menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden md:block p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 transition-colors"
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

        {/* System Badges & Auth */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300">
            <Database className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-semibold uppercase text-slate-400">{systemInfo?.vector_provider ?? "QDRANT"}</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-slate-400">Cohere Rerank</span>
          </div>

          {systemInfo?.hyde_enabled && (
            <div className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-semibold">HyDE Active</span>
            </div>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-slate-700/50">
             <div className="hidden md:flex flex-col items-end mr-1">
                 <span className="text-xs font-semibold text-slate-200">{user?.firstName || user?.username || 'User'}</span>
                 <span className="text-[10px] text-slate-500">{user?.primaryEmailAddress?.emailAddress}</span>
             </div>
             <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8 border-2 border-slate-800"
                  }
                }}
             />
          </div>
        </div>
      </header>

      {/* ── Body Layout ────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-20 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`absolute md:relative shrink-0 transition-all duration-300 ease-in-out h-full z-30 ${
            sidebarOpen ? "translate-x-0 w-[80%] sm:w-64" : "-translate-x-full md:translate-x-0 md:w-0"
          }`}
        >
          <Sidebar
            conversations={conversations}
            activeId={activeConversationId}
            docCount={docCount}
            onNewChat={handleNewChat}
            onSelect={selectConversation}
            onDelete={handleDeleteConversation}
            onRename={handleRenameConversation}
            onOpenDocs={() => {
              setDocModalOpen(true);
              if (window.innerWidth < 768) setSidebarOpen(false);
            }}
            fetchAuth={fetchAuth}
          />
        </aside>

        {/* Main Chat Interface */}
        <main className="flex-1 min-w-0 bg-[#050811] flex flex-col h-full overflow-hidden w-full relative z-10">
          <ChatInterface
            conversationId={activeConversationId}
            onDocUploaded={fetchDocCount}
            onConversationUpdated={fetchConversations}
            onNewChat={handleNewChat}
            fetchAuth={fetchAuth}
          />
        </main>
      </div>

      {/* Document Modal */}
      <DocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        onDocsChanged={fetchDocCount}
        fetchAuth={fetchAuth}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <>
      <SignedIn>
        <MainApp />
      </SignedIn>
      <SignedOut>
        <AuthPage mode="signin" />
      </SignedOut>
    </>
  );
};

export default App;
