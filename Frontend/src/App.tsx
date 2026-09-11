import React, { useState, useEffect, useCallback } from "react";
import {
  Database, Zap, ShieldCheck, PanelLeftClose, PanelLeftOpen, Layers, Menu, X
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentModal } from "./components/DocumentModal";
import type { ConversationListItem, SystemInfoResponse } from "./types";
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading, useAuth, useUser, UserButton } from "@clerk/clerk-react";
import { AuthPage } from "./components/AuthPage";
import { Toaster, toast } from "sonner";

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

  // Show login toast on mount
  useEffect(() => {
    if (user) {
      const name = user.firstName || user.username || user.primaryEmailAddress?.emailAddress || "User";
      toast.success(`Logged in successfully! Welcome back, ${name}.`);
    }
  }, [user]);

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

  // Silent early ping — fires immediately on page load to wake Render before user types
  useEffect(() => {
    fetch(`${API_BASE_URL}/api/v1/system/info`, { method: "GET", cache: "no-store" }).catch(() => {});
  }, []);

  // Fetch System Info & Health Check (with retry loop)
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

  // Create New Chat (Instant & Optimistic)
  const handleNewChat = async () => {
    // If active conversation is already empty, just select it instantly
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (activeConv && activeConv.message_count === 0 && !activeConv.source_file) {
      if (window.innerWidth < 768) setSidebarOpen(false);
      toast.info("Already on new chat");
      return;
    }

    const tempId = `conv-${Date.now()}`;
    const tempConv: ConversationListItem = {
      id: tempId,
      title: "New Conversation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
      source_file: undefined,
    };

    setConversations((prev) => [tempConv, ...prev]);
    setActiveConversationId(tempId);
    if (window.innerWidth < 768) setSidebarOpen(false);
    toast.success("New chat created");

    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "New Conversation" }),
      });
      if (res.ok) {
        const realConv: ConversationListItem = await res.json();
        setConversations((prev) =>
          prev.map((c) => (c.id === tempId ? realConv : c))
        );
        setActiveConversationId((current) => (current === tempId ? realConv.id : current));
      }
    } catch {
      // Keep optimistic conv in case of offline/transient error
    }
  };

  const handleDeleteConversation = async (id: string) => {
    try {
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeConversationId === id) {
        const remaining = conversations.filter((c) => c.id !== id);
        setActiveConversationId(remaining.length > 0 ? remaining[0].id : null);
      }
      toast.success("Conversation deleted");
      await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`, { method: "DELETE" });
    } catch {
      // ignore
    }
  };

  const handleRenameConversation = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
    toast.success("Conversation renamed");
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
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-zinc-950 text-zinc-100 font-sans z-50 overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-[100px] pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-500/10 rounded-full blur-[100px] pointer-events-none" />
        
        <div className="flex flex-col items-center justify-center gap-8 z-10 p-6 text-center">
          <div className="w-20 h-20 rounded-xl bg-zinc-900/80 border border-indigo-500/20 shadow-md flex items-center justify-center relative overflow-hidden group">
             <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/10 to-violet-500/10 animate-pulse" />
             <Layers className="w-10 h-10 text-indigo-400 relative z-10 animate-bounce" style={{ animationDuration: '2s' }} />
          </div>
          <div className="space-y-4 max-w-md">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Waking up Intelligence Engine...</h2>
            <div className="flex flex-col gap-2 text-sm text-zinc-400">
              <p>Since this project is hosted on a free Render instance, the backend sleeps after inactivity.</p>
              <p className="font-medium text-indigo-400/80">Please wait 1-2 minutes for the container to spin up.</p>
            </div>
            <div className="flex items-center justify-center mt-6">
              <div className="w-6 h-6 rounded-full border-2 border-zinc-800 border-t-indigo-500 animate-spin" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-zinc-950 text-zinc-100 font-sans overflow-hidden" style={{ touchAction: 'pan-y' }}>
      {/* ── Top Header ─────────────────────────────────────────── */}
      <header className="h-14 border-b border-zinc-800/60 bg-zinc-900/80 backdrop-blur-md px-4 flex items-center justify-between shrink-0 z-40 relative">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors md:hidden"
            title={sidebarOpen ? "Close Menu" : "Open Menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden md:block p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 transition-colors"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4 text-indigo-400" />}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-indigo-500/20 shadow-md">
              <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
            </div>
            <div>
              <h1 className="text-sm font-bold tracking-tight text-zinc-100 leading-none">Nexus-RAG</h1>
              <p className="text-[10px] text-zinc-400 leading-none mt-0.5 hidden sm:block">Agentic Document Intelligence</p>
            </div>
          </div>
        </div>

        {/* System Badges & Auth */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800/80 px-2.5 py-1 rounded-lg text-zinc-300">
            <Database className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-semibold uppercase text-zinc-400">{systemInfo?.vector_provider ?? "QDRANT"}</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800/80 px-2.5 py-1 rounded-lg text-zinc-300">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-zinc-400">Cohere Rerank</span>
          </div>

          {systemInfo?.hyde_enabled && (
            <div className="hidden sm:flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span className="text-[11px] text-amber-400 font-semibold">HyDE Active</span>
            </div>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-zinc-800/50">
             <div className="hidden md:flex flex-col items-end mr-1">
                 <span className="text-xs font-semibold text-zinc-200">{user?.firstName || user?.username || 'User'}</span>
                 <span className="text-[10px] text-zinc-500">{user?.primaryEmailAddress?.emailAddress}</span>
             </div>
             <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8 border-2 border-zinc-800"
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
        <main className="flex-1 min-w-0 bg-zinc-950 flex flex-col h-full overflow-hidden w-full relative z-10">
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
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: "#18181b",
            border: "1px solid #3f3f46",
            color: "#f4f4f5",
            fontSize: "13px",
          },
        }}
      />
      <ClerkLoading>
        <div className="flex flex-col h-screen w-screen bg-zinc-950 text-zinc-100 font-sans items-center justify-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
            <Layers className="w-6 h-6 animate-pulse" />
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <span>Authenticating with Nexus Engine...</span>
          </div>
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignedIn>
          <MainApp />
        </SignedIn>
        <SignedOut>
          <AuthPage mode="signin" />
        </SignedOut>
      </ClerkLoaded>
    </>
  );
};

export default App;
