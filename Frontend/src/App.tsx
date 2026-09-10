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
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isBackendWakingUp, setIsBackendWakingUp] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(true);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default false on mobile
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);

  // Authenticated Fetch wrapper
  const fetchAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
    // Disable caching for api calls to prevent fake "awake" responses
    headers.set("Cache-Control", "no-cache");
    return fetch(url, { ...options, headers });
  }, [getToken]);

  // Fetch System Info & Health Check
  useEffect(() => {
    let isMounted = true;
    const checkHealth = async () => {
      try {
        const r = await fetchAuth(`${API_BASE_URL}/api/v1/system/info`);
        if (r.ok) {
          const d: SystemInfoResponse = await r.json();
          if (isMounted) {
            setSystemInfo(d);
            setIsBackendWakingUp(false);
          }
        } else {
          if (isMounted) setTimeout(checkHealth, 3000);
        }
      } catch (err) {
        if (isMounted) setTimeout(checkHealth, 3000);
      }
    };
    checkHealth();
    return () => { isMounted = false; };
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
    if (!isBackendWakingUp) {
      fetchDocCount();
    }
  }, [fetchDocCount, isBackendWakingUp]);

  // Fetch Conversation List
  const fetchConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    let retries = 3;
    const tryFetch = async () => {
      try {
        const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations`);
        if (res.ok) {
          const list: ConversationListItem[] = await res.json();
          setConversations(list);
          if (list.length > 0 && !activeConversationId) {
            setActiveConversationId(list[0].id);
          }
          setIsLoadingConversations(false);
        } else {
          throw new Error("Failed to fetch");
        }
      } catch (e) {
        if (retries > 0) {
          retries--;
          setTimeout(tryFetch, 2000);
        } else {
          setIsLoadingConversations(false);
        }
      }
    };
    tryFetch();
  }, [fetchAuth, activeConversationId]);

  useEffect(() => {
    if (!isBackendWakingUp) {
      fetchConversations();
    }
  }, [fetchConversations, isBackendWakingUp]);

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
    // Clean up abandoned empty conversations
    const current = conversations.find(c => c.id === activeConversationId);
    if (current && current.message_count === 0 && !current.source_file && current.id !== id) {
      handleDeleteConversation(current.id);
    }
    
    setActiveConversationId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  }

  if (isBackendWakingUp) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#050811] text-slate-100 font-sans z-50 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col items-center justify-center gap-8 z-10 p-6 text-center">
          <div className="w-20 h-20 rounded-2xl bg-[#0a0f1c]/80 border border-blue-500/20 shadow-[0_0_40px_-10px_rgba(59,130,246,0.3)] flex items-center justify-center relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-tr from-blue-500/10 to-violet-500/10 animate-pulse" />
             <Layers className="w-10 h-10 text-blue-400 relative z-10 animate-bounce" style={{ animationDuration: '2s' }} />
          </div>
          <div className="space-y-4 max-w-md">
            <h2 className="text-2xl font-bold tracking-tight text-slate-100">Waking up Intelligence Engine...</h2>
            <div className="flex flex-col gap-2 text-sm text-slate-400">
              <p>Since this project is hosted on a free Render instance, the backend sleeps after inactivity.</p>
              <p className="font-medium text-blue-400/80">Please wait 1-2 minutes for the container to spin up.</p>
            </div>
            <div className="flex items-center justify-center mt-6">
              <div className="w-6 h-6 rounded-full border-2 border-slate-700 border-t-blue-500 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#050811] text-slate-100 font-sans overflow-hidden">
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="h-14 border-b border-slate-800/60 bg-[#0a0f1c]/80 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-40 relative">
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
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-blue-500/20 shadow-md">
              <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm z-30 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside
          className={`absolute md:relative shrink-0 transition-all duration-300 ease-in-out h-full z-40 overflow-hidden ${
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
            isLoading={isLoadingConversations}
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
