import React, { useEffect } from "react";
import {
  Database, Zap, ShieldCheck, PanelLeftClose, PanelLeftOpen, Menu, X
} from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { ChatInterface } from "./components/ChatInterface";
import { DocumentModal } from "./components/DocumentModal";
import { SignedIn, SignedOut, ClerkLoaded, ClerkLoading, useUser, UserButton } from "@clerk/clerk-react";
import { AuthPage } from "./components/AuthPage";
import { Nexus3DLogo } from "./components/Nexus3DLogo";
import { Toaster } from "sonner";
import { ChatProvider, useChat } from "./context/ChatContext";

// Universal Single Splash Screen
const UniversalSplashScreen: React.FC<{
  title?: string;
  subtitle?: string;
  onSkip?: () => void;
}> = ({
  title = "Nexus Intelligence Engine",
  subtitle = "Connecting backend services...",
  onSkip,
}) => {
  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-[#000000] text-[#F5F5F7] font-sans z-50 overflow-hidden">
      <div className="flex flex-col items-center justify-center gap-5 z-10 p-6 text-center max-w-sm animate-in fade-in duration-300">
        <Nexus3DLogo size={76} interactive={true} />
        <div className="space-y-1.5">
          <h2 className="text-base font-bold tracking-tight text-[#E1DCC9]">{title}</h2>
          <p className="text-xs text-[#9E9EA8] leading-relaxed">{subtitle}</p>
        </div>
        <div className="w-40 h-1 bg-[#1E1E24] rounded-full overflow-hidden mt-1">
          <div className="h-full bg-gradient-to-r from-[#E1DCC9] via-[#9E9EA8] to-[#E1DCC9] animate-pulse w-full" />
        </div>
        {onSkip && (
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
  const { user } = useUser();
  const {
    conversations,
    activeConversationId,
    docCount,
    selectConversation,
    newChat,
    deleteConversation,
    renameConversation,
    sidebarOpen,
    setSidebarOpen,
    docModalOpen,
    setDocModalOpen,
    systemInfo,
    isLoadingConversations,
    fetchAuth,
    refreshDocuments,
  } = useChat();

  // Ensure root viewport never scrolls out of bounds
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Handle desktop vs mobile layout via matchMedia
  useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setSidebarOpen(e.matches);
    };
    setSidebarOpen(mql.matches);
    mql.addEventListener("change", handleMediaChange);
    return () => mql.removeEventListener("change", handleMediaChange);
  }, [setSidebarOpen]);

  return (
    <div
      className="fixed inset-0 flex flex-col bg-[#000000] text-[#F5F5F7] font-sans overflow-hidden"
      style={{ touchAction: "pan-y" }}
    >
      {/* ── Ambient Glowing Nodes ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-[#E1DCC9]/10 rounded-full blur-[140px]" />
        <div className="absolute top-1/3 -right-32 w-96 h-96 bg-[#44444E]/30 rounded-full blur-[160px]" />
        <div className="absolute -bottom-32 left-1/3 w-[500px] h-[500px] bg-[#E1DCC9]/8 rounded-full blur-[180px]" />
      </div>

      {/* ── Top Header ───────────── */}
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
            {sidebarOpen ? (
              <PanelLeftClose className="w-4 h-4" />
            ) : (
              <PanelLeftOpen className="w-4 h-4 text-[#E1DCC9]" />
            )}
          </button>

          <div className="flex items-center gap-2.5">
            <Nexus3DLogo size={36} interactive={false} />
            <div>
              <h1 className="text-sm font-bold tracking-tight text-[#E1DCC9] leading-none">Nexus-RAG</h1>
              <p className="text-[10px] text-[#9E9EA8] leading-none mt-0.5 hidden sm:block">
                Agentic Document Intelligence
              </p>
            </div>
          </div>
        </div>

        {/* System Badges & Auth */}
        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-1.5 bg-[#000000]/60 backdrop-blur-md border border-[#44444E]/60 px-2.5 py-1 rounded-lg text-[#E1DCC9] shadow-sm">
            <Database className="w-3.5 h-3.5 text-[#E1DCC9]" />
            <span className="text-[11px] font-semibold uppercase text-[#F5F5F7]">
              {systemInfo?.vector_provider ?? "QDRANT"}
            </span>
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
              <span className="text-xs font-semibold text-[#F5F5F7]">
                {user?.firstName || user?.username || "User"}
              </span>
              <span className="text-[10px] text-[#9E9EA8]">
                {user?.primaryEmailAddress?.emailAddress}
              </span>
            </div>
            <UserButton
              appearance={{
                elements: {
                  userButtonAvatarBox: "w-8 h-8 border-2 border-[#E1DCC9]",
                },
              }}
            />
          </div>
        </div>
      </header>

      {/* Universal Top Progress Line */}
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
            onNewChat={newChat}
            onSelect={selectConversation}
            onDelete={deleteConversation}
            onRename={renameConversation}
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
          <ChatInterface />
        </main>
      </div>

      {/* Document Modal */}
      <DocumentModal
        isOpen={docModalOpen}
        onClose={() => setDocModalOpen(false)}
        onDocsChanged={refreshDocuments}
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
          <ChatProvider>
            <MainApp />
          </ChatProvider>
        </SignedIn>
        <SignedOut>
          <AuthPage mode="signin" />
        </SignedOut>
      </ClerkLoaded>
    </>
  );
};

export default App;
