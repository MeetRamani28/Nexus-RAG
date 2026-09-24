import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Database, Zap, ShieldCheck, PanelLeftClose, PanelLeftOpen, Menu, X
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentModal } from "./components/DocumentModal";
import type { ConversationListItem, SystemInfoResponse } from "./types";
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading, useAuth, useUser, UserButton } from "@clerk/clerk-react";
import { AuthPage } from "./components/AuthPage";
import { Nexus3DLogo } from "./components/Nexus3DLogo";
import { Toaster } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

// Universal Single Splash Screen for pure consistent loading experience
const UniversalSplashScreen: React.FC<{
  title?: string;
  subtitle?: string;
  onSkip?: () => void;
}> = ({
  title = "Nexus Intelligence Engine",
  subtitle = "Connecting backend services...",
  onSkip,
}) => {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#000000] text-[#F5F5F7] font-sans z-50 overflow-hidden">
      <div className="flex flex-col items-center justify-center gap-5 z-10 p-6 text-center max-w-sm animate-in fade-in duration-300">
        <Nexus3DLogo size={76} interactive={true} />
        <div className="space-y-1.5">
          <h2 className="text-base font-bold tracking-tight text-[#E1DCC9]">{title}</h2>
          <p className="text-xs text-[#9E9EA8] leading-relaxed">
            {seconds > 8
              ? `Spooling cloud container... (${seconds}s elapsed)`
              : subtitle}
          </p>
        </div>
        <div className="w-40 h-1 bg-[#1E1E24] rounded-full overflow-hidden mt-1">
          <div className="h-full bg-gradient-to-r from-[#E1DCC9] via-[#9E9EA8] to-[#E1DCC9] animate-pulse w-full" />
        </div>
        {onSkip && seconds >= 6 && (
          <button
            type="button"
            onClick={onSkip}
            className="mt-2 px-3.5 py-1.5 bg-[#1E1E24]/80 hover:bg-[#1E1E24] border border-[#44444E]/60 hover:border-[#E1DCC9]/60 text-xs font-semibold text-[#E1DCC9] rounded-xl transition-all cursor-pointer shadow-md"
          >
            Enter Workspace (Offline Demo) →
          </button>
        )}
      </div>
    </div>
  );
};

const MainApp: React.FC = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [isBackendWakingUp, setIsBackendWakingUp] = useState(true);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);
  const [docCount, setDocCount] = useState(0);
  const [docsVersion, setDocsVersion] = useState(0);

  // Ensure root viewport never scrolls out of bounds (before any conditional returns)
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Authenticated Fetch wrapper
  const fetchAuth = useCallback(async (url: string, options: RequestInit = {}) => {
    const token = await getToken();
    const headers = new Headers(options.headers || {});
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
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
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (res.ok) {
        const docs = await res.json();
        setDocCount(docs.length);
      }
    } catch {
      // ignore
    }
  }, [fetchAuth]);

  const handleDocsChanged = useCallback((deletedFilename?: string) => {
    fetchDocCount();
    setDocsVersion((v) => v + 1);
    if (deletedFilename) {
      setConversations((prev) =>
        prev.map((c) =>
          c.source_file === deletedFilename ? { ...c, source_file: undefined } : c
        )
      );
    }
  }, [fetchDocCount]);

  useEffect(() => {
    if (!isBackendWakingUp) {
      fetchDocCount();
    }
  }, [fetchDocCount, isBackendWakingUp]);

  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;

  // Fetch Conversation List (cache-busted, clean, zero ghost chats)
  const fetchConversations = useCallback(async () => {
    let retries = 2;
    const tryFetch = async () => {
      try {
        const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (res.ok) {
          const list: ConversationListItem[] = await res.json();
          // Filter out any ghost empty items (0 messages and no attached file)
          const validList = list.filter((c) => c.message_count > 0 || c.source_file);
          setConversations(validList);
          if (validList.length > 0 && !activeConversationIdRef.current) {
            setActiveConversationId(validList[0].id);
          } else if (validList.length === 0 && !activeConversationIdRef.current) {
            setActiveConversationId(`conv-${Date.now()}`);
          }
          setIsLoadingConversations(false);
        } else {
          throw new Error("Failed to fetch");
        }
      } catch {
        if (retries > 0) {
          retries--;
          setTimeout(tryFetch, 1500);
        } else {
          setIsLoadingConversations(false);
        }
      }
    };
    tryFetch();
  }, [fetchAuth]);

  useEffect(() => {
    if (!isBackendWakingUp) {
      fetchConversations();
    }
  }, [fetchConversations, isBackendWakingUp]);

  // Handle desktop vs mobile layout via matchMedia (never closes on mobile keyboard open)
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 768px)');
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSidebarOpen(e.matches);
    };
    setSidebarOpen(mql.matches);
    mql.addEventListener('change', handleMediaChange);
    return () => mql.removeEventListener('change', handleMediaChange);
  }, []);

  // Create New Chat (Purely local draft until user sends first message or attaches doc)
  const handleNewChat = () => {
    // If already in an empty new chat draft, stay there
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (!activeConv && activeConversationId?.startsWith("conv-")) {
      if (window.innerWidth < 768) setSidebarOpen(false);
      return;
    }

    // Clean up empty ghost conversations from local state
    setConversations((prev) => prev.filter((c) => c.message_count > 0 || c.source_file));

    const tempId = `conv-${Date.now()}`;
    setActiveConversationId(tempId);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  // Instant 1-Click Conversation Deletion (Silent, immediate & robustly deleted)
  const handleDeleteConversation = async (id: string) => {
    // 1. Immediately remove from local list
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);

    // 2. If the deleted conversation was active, switch to next available or new draft
    if (activeConversationId === id) {
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        setActiveConversationId(`conv-${Date.now()}`);
      }
    }

    // 3. Immediately delete from backend database
    if (!id.startsWith("conv-") && !id.startsWith("temp-")) {
      try {
        await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`, {
          method: "DELETE",
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    }
  };

  const handleRenameConversation = (id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
  };

  const handleConversationDocChanged = (id: string, filename: string | null) => {
    setConversations((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, source_file: filename || undefined } : c
      )
    );
  };

  const selectConversation = (id: string) => {
    if (id === activeConversationId) {
      if (window.innerWidth < 768) setSidebarOpen(false);
      return;
    }

    // Auto-clean any empty abandoned draft before switching
    const current = conversations.find((c) => c.id === activeConversationId);
    if (current && current.message_count === 0 && !current.source_file) {
      handleDeleteConversation(current.id);
    }
    
    setActiveConversationId(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  if (isBackendWakingUp) {
    return (
      <UniversalSplashScreen
        title="Waking up Intelligence Engine..."
        subtitle="Since this project is hosted on Render free tier, please wait while container spins up."
        onSkip={() => setIsBackendWakingUp(false)}
      />
    );
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-[#000000] text-[#F5F5F7] font-sans overflow-hidden" style={{ touchAction: 'pan-y' }}>
      {/* ── Ambient Glowing Nodes (Clipped within viewport so it never forces scroll) ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#E1DCC9]/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-[#44444E]/30 rounded-full blur-[160px]" />
        <div className="absolute -bottom-32 left-1/3 w-[500px] h-[500px] bg-[#E1DCC9]/8 rounded-full blur-[180px]" />
      </div>

      {/* ── Top Header (Glassmorphic Dark Slate & Warm Cream Accent) ───────────── */}
      <header className="h-14 border-b border-[#44444E]/40 bg-[#1E1E24]/70 backdrop-blur-xl px-4 flex items-center justify-between shrink-0 z-40 relative shadow-[0_4px_24px_rgba(0,0,0,0.4)]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-1.5 rounded-lg text-[#E1DCC9] hover:text-white hover:bg-[#000000]/60 transition-colors md:hidden"
            title={sidebarOpen ? "Close Menu" : "Open Menu"}
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="hidden md:block p-1.5 rounded-lg text-[#E1DCC9] hover:text-white hover:bg-[#000000]/60 transition-colors"
            title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeftOpen className="w-4 h-4 text-[#E1DCC9]" />}
          </button>

          <div className="flex items-center gap-2.5">
            <Nexus3DLogo size={36} interactive={false} />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#E1DCC9] leading-none">Nexus-RAG</h1>
              <p className="text-[10px] text-[#9E9EA8] leading-none mt-0.5 hidden sm:block">Agentic Document Intelligence</p>
            </div>
          </div>
        </div>

        {/* System Badges & Auth */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 bg-[#000000]/60 backdrop-blur-md border border-[#44444E]/60 px-2.5 py-1 rounded-lg text-[#E1DCC9] shadow-sm">
            <Database className="w-3.5 h-3.5 text-[#E1DCC9]" />
            <span className="text-[11px] font-semibold uppercase text-[#F5F5F7]">{systemInfo?.vector_provider ?? "QDRANT"}</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 bg-[#000000]/60 backdrop-blur-md border border-[#44444E]/60 px-2.5 py-1 rounded-lg text-[#F5F5F7] shadow-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] text-[#F5F5F7] font-medium">Cohere Rerank</span>
          </div>

          {systemInfo?.hyde_enabled && (
            <div className="hidden sm:flex items-center gap-1.5 bg-[#000000]/60 backdrop-blur-md border border-[#9E9EA8]/40 px-2 py-1 rounded-lg">
              <Zap className="w-3.5 h-3.5 text-[#E1DCC9]" />
              <span className="text-[11px] text-[#E1DCC9] font-semibold">HyDE Active</span>
            </div>
          )}

          <div className="flex items-center gap-2 pl-2 border-l border-[#44444E]/50">
             <div className="hidden md:flex flex-col items-end mr-1">
                 <span className="text-xs font-semibold text-[#F5F5F7]">{user?.firstName || user?.username || 'User'}</span>
                 <span className="text-[10px] text-[#9E9EA8]">{user?.primaryEmailAddress?.emailAddress}</span>
             </div>
             <UserButton 
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8 border-2 border-[#E1DCC9]"
                  }
                }}
             />
          </div>
        </div>
      </header>

      {/* Universal Top Progress Line when fetching data */}
      {isLoadingConversations && (
        <div className="h-0.5 w-full bg-[#E1DCC9] animate-pulse shrink-0 z-50" />
      )}

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
        <main className="flex-1 min-w-0 bg-[#000000] flex flex-col h-full overflow-hidden w-full relative z-10">
          <ChatInterface
            conversationId={activeConversationId}
            docsVersion={docsVersion}
            onDocUploaded={handleDocsChanged}
            onConversationUpdated={fetchConversations}
            onConversationDocChanged={handleConversationDocChanged}
            onNewChat={handleNewChat}
            fetchAuth={fetchAuth}
          />
        </main>
      </div>

      {/* Document Modal */}
      <DocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        onDocsChanged={handleDocsChanged}
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
            background: "rgba(30, 30, 36, 0.8)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            border: "1px solid rgba(68, 68, 78, 0.6)",
            color: "#F5F5F7",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.5)",
          },
        }}
      />
      <ClerkLoading>
        <UniversalSplashScreen
          title="Authenticating with Nexus Engine..."
          subtitle="Verifying credentials & initializing workspace..."
        />
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
