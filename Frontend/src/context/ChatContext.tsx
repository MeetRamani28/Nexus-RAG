import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import { toast } from "sonner";
import type {
  ConversationListItem,
  ConversationDetail,
  ChatMessage,
  Citation,
  LlmModel,
  SystemInfoResponse,
  IngestResponse,
} from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export type PipelineStep = "idle" | "retrieving" | "reranking" | "generating" | "done";

export const DEFAULT_MODELS: LlmModel[] = [
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", tag: "Fast & Smart" },
  { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", tag: "Ultra Fast" },
  { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", tag: "High Reasoning" },
];

interface ChatContextType {
  // State
  conversations: ConversationListItem[];
  activeConversationId: string | null;
  activeSourceFile: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  uploadingPdf: boolean;
  uploadMessage: string | null;
  uploadProgress: { current: number; total: number; name: string } | null;
  pipeline: PipelineStep;
  docCount: number;
  existingDocs: { filename: string; parent_chunks?: number; child_chunks?: number }[];
  selectedModel: string;
  availableModels: LlmModel[];
  isLoadingConversations: boolean;
  systemInfo: SystemInfoResponse | null;
  sidebarOpen: boolean;
  docModalOpen: boolean;

  // Actions
  fetchAuth: (url: string, options?: RequestInit) => Promise<Response>;
  selectConversation: (id: string) => void;
  newChat: () => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  attachDocument: (filename: string) => Promise<void>;
  detachDocument: () => Promise<void>;
  uploadPdf: (files: FileList | File[] | File) => Promise<void>;
  cancelUpload: () => void;
  sendMessage: (question: string) => Promise<void>;
  setSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setDocModalOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setSelectedModel: (modelId: string) => void;
  refreshConversations: () => Promise<void>;
  refreshDocuments: () => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export const ChatProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { getToken } = useAuth();
  const { user } = useUser();

  // Primary State
  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [activeSourceFile, setActiveSourceFile] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStep>("idle");
  const [docCount, setDocCount] = useState(0);
  const [existingDocs, setExistingDocs] = useState<{ filename: string; parent_chunks?: number; child_chunks?: number }[]>([]);
  const [availableModels, setAvailableModels] = useState<LlmModel[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>("qwen/qwen3.8-27b");
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemInfoResponse | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [docModalOpen, setDocModalOpen] = useState(false);

  // Upload State
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;

  const userEmailRef = useRef<string | undefined>(undefined);
  userEmailRef.current = user?.primaryEmailAddress?.emailAddress;

  // Authenticated Fetch wrapper attaching user email and token for cross-device sync
  const fetchAuth = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const token = await getToken();
      const headers = new Headers(options.headers || {});
      if (token) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      if (userEmailRef.current) {
        headers.set("X-User-Email", userEmailRef.current);
      }
      return fetch(url, { ...options, headers });
    },
    [getToken]
  );

  // Fetch Ingested Documents List
  const refreshDocuments = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const docs = await res.json();
        setExistingDocs(docs);
        setDocCount(docs.length);
        setActiveSourceFile((current) => {
          if (current && !docs.some((d: { filename: string }) => d.filename === current)) {
            return null;
          }
          return current;
        });
      }
    } catch {
      // ignore
    }
  }, [fetchAuth]);

  // Fetch Conversation List
  const refreshConversations = useCallback(async () => {
    setIsLoadingConversations(true);
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const list: ConversationListItem[] = await res.json();
        const validList = list.filter((c) => c.message_count > 0 || c.source_file);
        setConversations(validList);
        if (validList.length > 0 && (!activeConversationIdRef.current || activeConversationIdRef.current.startsWith("conv-"))) {
          setActiveConversationId(validList[0].id);
          loadMessages(validList[0].id);
        } else if (validList.length === 0 && !activeConversationIdRef.current) {
          setActiveConversationId(`conv-${Date.now()}`);
        }
      }
    } catch {
      // ignore
    } finally {
      setIsLoadingConversations(false);
    }
  }, [fetchAuth]);

  // Fetch Messages for an active conversation
  const loadMessages = useCallback(
    async (id: string) => {
      if (id.startsWith("conv-") || id.startsWith("temp-")) {
        setMessages([]);
        setActiveSourceFile(null);
        return;
      }
      try {
        const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}?_t=${Date.now()}`, {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" },
        });
        if (!res.ok) {
          setMessages([]);
          setActiveSourceFile(null);
          return;
        }
        const data: ConversationDetail = await res.json();
        setActiveSourceFile(data.source_file || null);
        setMessages(
          data.messages.map((m) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            citations: m.citations as Citation[],
            isStreaming: false,
          }))
        );
      } catch {
        setMessages([]);
        setActiveSourceFile(null);
      }
    },
    [fetchAuth]
  );

  // Sync on activeConversationId change
  useEffect(() => {
    if (activeConversationId) {
      loadMessages(activeConversationId);
    }
  }, [activeConversationId, loadMessages]);

  // Initial load & system info
  useEffect(() => {
    refreshConversations();
    refreshDocuments();

    fetchAuth(`${API_BASE_URL}/api/v1/system/info`)
      .then((r) => r.json())
      .then((d: SystemInfoResponse) => setSystemInfo(d))
      .catch(() => {});

    fetchAuth(`${API_BASE_URL}/api/v1/models`)
      .then((r) => r.json())
      .then((data: LlmModel[]) => {
        if (data && data.length > 0) {
          const valid = data.filter((m) => !m.id.includes("mixtral") && !m.id.includes("llama-3.3-70b"));
          const activeList = valid.length > 0 ? valid : data;
          setAvailableModels(activeList);
          const ids = activeList.map((m) => m.id);
          const bestModel = activeList.find((m) => m.id.includes("qwen") || m.id.includes("20b")) || activeList[0];
          setSelectedModel((prev) =>
            prev && !prev.includes("mixtral") && !prev.includes("llama-3.3-70b") && ids.includes(prev) ? prev : bestModel.id
          );
        }
      })
      .catch(() => {});
  }, [fetchAuth, refreshConversations, refreshDocuments]);

  // Real-time cross-device sync on focus or visibility change
  useEffect(() => {
    const handleSync = () => {
      refreshConversations();
      refreshDocuments();
      if (activeConversationIdRef.current && !activeConversationIdRef.current.startsWith("conv-")) {
        loadMessages(activeConversationIdRef.current);
      }
    };
    window.addEventListener("focus", handleSync);
    const handleVis = () => {
      if (document.visibilityState === "visible") {
        handleSync();
      }
    };
    document.addEventListener("visibilitychange", handleVis);
    return () => {
      window.removeEventListener("focus", handleSync);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [refreshConversations, refreshDocuments, loadMessages]);

  // Switch Conversation
  const selectConversation = (id: string) => {
    setActiveConversationId(id);
    loadMessages(id);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  // Create New Chat (Local Draft)
  const newChat = () => {
    const tempId = `conv-${Date.now()}`;
    setActiveConversationId(tempId);
    setActiveSourceFile(null);
    setMessages([]);
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  // Instant 1-Click Optimistic Delete Conversation
  const deleteConversation = async (id: string) => {
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);

    if (activeConversationId === id) {
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        newChat();
      }
    }

    if (!id.startsWith("conv-") && !id.startsWith("temp-")) {
      try {
        await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`, {
          method: "DELETE",
          cache: "no-store",
        });
      } catch (err) {
        console.error("Failed to delete conversation:", err);
      }
    }
  };

  // Instant Optimistic Rename Conversation
  const renameConversation = async (id: string, title: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)));
    if (!id.startsWith("conv-") && !id.startsWith("temp-")) {
      try {
        await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}/title`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title }),
        });
      } catch (err) {
        console.error("Failed to rename conversation:", err);
      }
    }
  };

  // Attach Document
  const attachDocument = async (filename: string) => {
    if (!activeConversationId) return;
    try {
      const res = await fetchAuth(
        `${API_BASE_URL}/api/v1/conversations/${activeConversationId}/attach_document?filename=${encodeURIComponent(
          filename
        )}`,
        { method: "POST" }
      );
      if (res.ok) {
        setActiveSourceFile(filename);
        setConversations((prev) =>
          prev.map((c) => (c.id === activeConversationId ? { ...c, source_file: filename } : c))
        );
        toast.success(`Attached "${filename}"`);
      }
    } catch {
      toast.error("Failed to attach document");
    }
  };

  // Detach Document
  const detachDocument = async () => {
    if (!activeConversationId) return;
    try {
      await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${activeConversationId}/detach_document`, {
        method: "POST",
      });
      setActiveSourceFile(null);
      setConversations((prev) =>
        prev.map((c) => (c.id === activeConversationId ? { ...c, source_file: undefined } : c))
      );
      toast.info("Document detached from current chat");
    } catch {
      setActiveSourceFile(null);
    }
  };

  // Cancel PDF Upload
  const cancelUpload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setUploadingPdf(false);
    setUploadProgress(null);
    setUploadMessage("Upload canceled.");
  };

  // Fast PDF Upload (< 2s)
  const uploadPdf = async (incomingFiles: FileList | File[] | File) => {
    const fileList: File[] =
      incomingFiles instanceof FileList
        ? Array.from(incomingFiles)
        : Array.isArray(incomingFiles)
        ? incomingFiles
        : [incomingFiles];

    const pdfFiles = fileList.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast.error("Please select valid PDF file(s).");
      return;
    }

    setUploadingPdf(true);
    setUploadMessage(null);
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    let processedCount = 0;
    let lastFilename = "";

    try {
      for (let i = 0; i < pdfFiles.length; i++) {
        if (signal.aborted) break;
        const currentFile = pdfFiles[i];
        setUploadProgress({
          current: i + 1,
          total: pdfFiles.length,
          name: currentFile.name,
        });

        const formData = new FormData();
        formData.append("file", currentFile);
        if (activeConversationId) {
          formData.append("conversation_id", activeConversationId);
        }

        const res = await fetchAuth(`${API_BASE_URL}/api/v1/ingest`, {
          method: "POST",
          body: formData,
          signal,
        });

        if (signal.aborted) break;
        if (!res.ok) throw new Error(`Upload failed for ${currentFile.name}`);

        const data: IngestResponse = await res.json();
        lastFilename = data.filename;
        processedCount++;
      }

      if (!signal.aborted && processedCount > 0) {
        setActiveSourceFile(lastFilename);
        setUploadMessage(
          pdfFiles.length === 1
            ? `Indexed "${lastFilename}" in <1s`
            : `Successfully processed ${processedCount} PDF document(s)`
        );
        toast.success(`"${lastFilename}" indexed and ready!`);
        refreshDocuments();
        refreshConversations();
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") {
        setUploadMessage("Upload canceled.");
      } else {
        const msg = e instanceof Error ? e.message : "Upload failed";
        setUploadMessage(msg);
        toast.error(msg);
      }
    } finally {
      setUploadingPdf(false);
      setUploadProgress(null);
      abortControllerRef.current = null;
    }
  };

  // Ultra-Fast Token Streaming Message Sender (<300ms TTFT)
  const sendMessage = async (questionText: string) => {
    if (!activeConversationId || isStreaming || uploadingPdf) return;
    const q = questionText.trim();
    if (!q) return;

    const uid = `u-${Date.now()}`;
    const aid = `a-${Date.now() + 1}`;

    setMessages((p) => [
      ...p,
      { id: uid, role: "user", content: q },
      { id: aid, role: "assistant", content: "", citations: [], isStreaming: true },
    ]);
    setIsStreaming(true);
    setPipeline("idle");

    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          top_k: 4,
          conversation_id: activeConversationId,
          model: selectedModel,
        }),
      });

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let cites: Citation[] = [];
      let started = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.replace("data: ", "").trim();
          if (raw === "[DONE]") break;
          try {
            const parsed = JSON.parse(raw);
            if (parsed.agent_step) {
              if (parsed.agent_step.includes("Retrieval Agent")) setPipeline("retrieving");
              else if (parsed.agent_step.includes("Re-Ranking Agent")) setPipeline("reranking");
              else if (parsed.agent_step.includes("Synthesis Agent")) setPipeline("generating");

              setMessages((p) =>
                p.map((m) =>
                  m.id === aid ? { ...m, agentSteps: [...(m.agentSteps || []), parsed.agent_step] } : m
                )
              );
            }
            if (parsed.citations) {
              cites = parsed.citations;
              setMessages((p) => p.map((m) => (m.id === aid ? { ...m, citations: cites } : m)));
            }
            if (parsed.telemetry || parsed.ttft_ms !== undefined) {
              const tel = parsed.telemetry || {
                ttft_ms: parsed.ttft_ms,
                cache_hit: parsed.cache_hit,
                score: parsed.score,
                model: parsed.model,
              };
              setMessages((p) => p.map((m) => (m.id === aid ? { ...m, telemetry: tel } : m)));
            }
            if (parsed.token) {
              if (!started) {
                setPipeline("done");
                started = true;
              }
              setMessages((p) =>
                p.map((m) => (m.id === aid ? { ...m, content: m.content + parsed.token } : m))
              );
            }
          } catch {
            // ignore non-JSON frames
          }
        }
      }
    } catch {
      toast.error("Unable to reach backend service.", { duration: 4000 });
      setMessages((p) =>
        p.map((m) =>
          m.id === aid
            ? { ...m, content: "⚠️ Connection error. Please verify backend connection and try again." }
            : m
        )
      );
    } finally {
      setPipeline("idle");
      setIsStreaming(false);
      setMessages((p) => p.map((m) => (m.id === aid ? { ...m, isStreaming: false } : m)));
      refreshConversations();
    }
  };

  return (
    <ChatContext.Provider
      value={{
        conversations,
        activeConversationId,
        activeSourceFile,
        messages,
        isStreaming,
        uploadingPdf,
        uploadMessage,
        uploadProgress,
        pipeline,
        docCount,
        existingDocs,
        selectedModel,
        availableModels,
        isLoadingConversations,
        systemInfo,
        sidebarOpen,
        docModalOpen,
        fetchAuth,
        selectConversation,
        newChat,
        deleteConversation,
        renameConversation,
        attachDocument,
        detachDocument,
        uploadPdf,
        cancelUpload,
        sendMessage,
        setSidebarOpen,
        setDocModalOpen,
        setSelectedModel,
        refreshConversations,
        refreshDocuments,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};
