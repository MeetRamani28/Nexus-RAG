import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, User, Loader2, Copy, Check, FileText,
  Sparkles, FileSearch, BrainCircuit, Layers,
  X, Plus, ChevronDown, Cpu, Download,
  FolderOpen, Search
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage, Citation, ConversationDetail, IngestResponse, LlmModel } from "../types";
import { CitationBadge } from "./CitationBadge";
import { Nexus3DLogo } from "./Nexus3DLogo";
import { toast } from "sonner";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const DEFAULT_MODELS: LlmModel[] = [
  { id: "llama-3.3-70b-versatile", name: "Llama 3.3 70B", tag: "Recommended" },
  { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", tag: "High Reasoning" },
  { id: "mixtral-8x7b-32768", name: "Mixtral 8x7B", tag: "Long Context" },
  { id: "llama-3.1-8b-instant", name: "Llama 3.1 8B", tag: "Ultra Fast" },
];

const SUGGESTIONS = [
  "Summarize the key financial highlights and revenue figures",
  "What are the primary operational risks mentioned?",
  "List the core product features and architecture details",
  "Compare performance metrics across the report periods",
];

type PipelineStep = "idle" | "retrieving" | "reranking" | "generating" | "done";

interface Props {
  conversationId: string | null;
  docsVersion?: number;
  onDocUploaded: () => void;
  onConversationUpdated?: () => void;
  onConversationDocChanged?: (id: string, filename: string | null) => void;
  onNewChat?: () => void;
  fetchAuth: (url: string, options?: RequestInit) => Promise<Response>;
}

// ─── Copy Button ─────────────────────────────────────────────────────────────
const CopyButton: React.FC<{ text: string }> = ({ text }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <button
      onClick={handleCopy}
      className="p-1.5 rounded-lg text-[#9E9EA8] hover:text-[#E1DCC9] hover:bg-[#000000] transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// ─── Agent Pipeline Execution Toast ──────────────────────────────────────────
const AgentPipelineToast: React.FC<{ step: PipelineStep; modelName: string; agentDesc?: string }> = ({ step, modelName, agentDesc }) => {
  if (step === "idle" || step === "done") return null;

  const stepDetails = {
    retrieving: {
      title: "Step 1/3: Vector Search",
      desc: "Embedding query & retrieving dense context from Qdrant...",
      icon: FileSearch,
      color: "text-[#E1DCC9] bg-[#000000]/60 backdrop-blur-md border-[#44444E]/60",
    },
    reranking: {
      title: "Step 2/3: Cohere Rerank",
      desc: "Cross-encoder scoring top candidate passages...",
      icon: Layers,
      color: "text-[#E1DCC9] bg-[#000000]/60 backdrop-blur-md border-[#44444E]/60",
    },
    generating: {
      title: "Step 3/3: LLM Generation",
      desc: `Synthesizing answer with ${modelName}...`,
      icon: BrainCircuit,
      color: "text-emerald-400 bg-[#000000]/60 backdrop-blur-md border-[#44444E]/60",
    },
  };

  const curr = stepDetails[step as keyof typeof stepDetails] || stepDetails.retrieving;
  const Icon = curr.icon;

  return (
    <div className="mx-auto max-w-xl mb-4 p-3.5 rounded-2xl bg-[#1E1E24]/75 border border-[#44444E]/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl border ${curr.color} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#E1DCC9]">{curr.title}</p>
            <div className="flex items-center gap-1 text-[10px] text-[#9E9EA8]">
              <Loader2 className="w-3 h-3 animate-spin text-[#E1DCC9]" />
              <span className="font-medium">Processing</span>
            </div>
          </div>
          <p className="text-[11px] text-[#9E9EA8] truncate mt-0.5">{agentDesc || curr.desc}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-[#000000]/60 rounded-full mt-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#E1DCC9] via-[#9E9EA8] to-[#E1DCC9] transition-all duration-500"
          style={{
            width: step === "retrieving" ? "33%" : step === "reranking" ? "66%" : "95%",
          }}
        />
      </div>
    </div>
  );
};

// ─── Process Content to hide/style <think> tags ──────────────────────────────
const processMessageContent = (content: string) => {
  if (!content) return "";
  let processed = content;
  
  // Replace fully closed <think>...</think> blocks
  processed = processed.replace(/<think>([\s\S]*?)<\/think>/gi, (_match, p1) => {
    return `> **🤔 Thinking Process:**\n${p1.trim().split('\n').map((line: string) => `> ${line}`).join('\n')}\n\n`;
  });
  
  // Replace unclosed <think> blocks (during streaming)
  if (processed.includes("<think>") && !processed.includes("</think>")) {
    const parts = processed.split("<think>");
    const thinkContent = parts[1] || "";
    processed = `${parts[0]}> **🤔 Thinking Process:**\n${thinkContent.trim().split('\n').map((line: string) => `> ${line}`).join('\n')}`;
  }

  return processed;
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const ChatInterface: React.FC<Props> = ({
  conversationId,
  docsVersion = 0,
  onDocUploaded,
  onConversationUpdated,
  onConversationDocChanged,
  onNewChat,
  fetchAuth,
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [pipeline, setPipeline] = useState<PipelineStep>("idle");
  
  // Models & Selection
  const [availableModels, setAvailableModels] = useState<LlmModel[]>(DEFAULT_MODELS);
  const [selectedModel, setSelectedModel] = useState<string>("llama-3.3-70b-versatile");
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Ingest upload state inside input bar
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; name: string } | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [docPickerOpen, setDocPickerOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [docFilterQuery, setDocFilterQuery] = useState("");

  // Fetch Available Models from Groq via backend
  useEffect(() => {
    fetchAuth(`${API_BASE_URL}/api/v1/models`)
      .then((r) => r.json())
      .then((data: LlmModel[]) => {
        if (data && data.length > 0) {
          setAvailableModels(data);
          const ids = data.map((m) => m.id);
          setSelectedModel((prev) => (ids.includes(prev) ? prev : data[0].id));
        }
      })
      .catch(() => {});
  }, [fetchAuth]);

  // Close model & attach dropdowns on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [activeSourceFile, setActiveSourceFile] = useState<string | null>(null);
  const [existingDocs, setExistingDocs] = useState<{ filename: string; parent_chunks?: number; child_chunks?: number }[]>([]);

  // Fetch ingested docs list for selection
  const fetchExistingDocs = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents?_t=${Date.now()}`, {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" },
      });
      if (res.ok) {
        const docs = await res.json();
        setExistingDocs(docs);
        // If current attached file was deleted from knowledge base, detach it locally immediately!
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

  useEffect(() => {
    fetchExistingDocs();
  }, [fetchExistingDocs, docsVersion]);

  // Load Messages for active conversation
  const loadMessages = useCallback(async (id: string) => {
    if (id.startsWith("conv-") || id.startsWith("temp-")) {
      setMessages([]);
      setActiveSourceFile(null);
      return;
    }
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`);
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
  }, [fetchAuth]);

  // Instant Reset on active conversation change
  useEffect(() => {
    setAttachedFile(null);
    setUploadMessage(null);
    setMessages([]);
    setActiveSourceFile(null);
    if (conversationId) loadMessages(conversationId);
  }, [conversationId, loadMessages]);

  // Safe container-only scrolling (never scrolls window or page ancestors)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages, pipeline]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  // Export Chat to Markdown
  const exportChat = () => {
    if (messages.length === 0) return;
    const content = messages.map(m => `**${m.role === 'user' ? 'User' : 'Nexus-RAG Agent'}**:\n${m.content}\n\n`).join("---\n\n");
    const blob = new Blob([content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nexus_chat_${new Date().getTime()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Cancel / Abort PDF upload & detach current PDF
  const handleCancelUpload = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setAttachedFile(null);
    setUploadingPdf(false);
    setUploadProgress(null);
    setUploadMessage(null);
    setActiveSourceFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (conversationId && !conversationId.startsWith("conv-")) {
      try {
        await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${conversationId}/detach_document`, {
          method: "POST",
        });
        if (conversationId && onConversationDocChanged) {
          onConversationDocChanged(conversationId, null);
        }
      } catch {
        // ignore
      }
    }
  };

  // Handle PDF Upload
  const handlePdfUpload = async (incomingFiles: FileList | File[] | File) => {
    const fileList: File[] = incomingFiles instanceof FileList 
      ? Array.from(incomingFiles) 
      : Array.isArray(incomingFiles) 
      ? incomingFiles 
      : [incomingFiles];

    const pdfFiles = fileList.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (pdfFiles.length === 0) {
      toast.error("Please select valid PDF file(s).");
      return;
    }

    setAttachedFile(pdfFiles[0]);
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
        setAttachedFile(currentFile);
        setUploadProgress({
          current: i + 1,
          total: pdfFiles.length,
          name: currentFile.name,
        });

        const formData = new FormData();
        formData.append("file", currentFile);
        if (conversationId) {
          formData.append("conversation_id", conversationId);
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
            ? `Processed "${lastFilename}"`
            : `Successfully processed ${processedCount} PDF document(s)`
        );
        onDocUploaded();
        if (conversationId && onConversationDocChanged) {
          onConversationDocChanged(conversationId, lastFilename);
        }
        fetchExistingDocs();
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === "AbortError") {
        setUploadMessage("Upload canceled.");
      } else {
        setUploadMessage(e instanceof Error ? e.message : "Upload failed");
        toast.error(e instanceof Error ? e.message : "Upload failed");
      }
    } finally {
      setUploadingPdf(false);
      setUploadProgress(null);
      abortControllerRef.current = null;
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Attach existing ingested document to this conversation session
  const handleAttachExistingDoc = async (filename: string) => {
    if (!conversationId) return;
    try {
      const res = await fetchAuth(
        `${API_BASE_URL}/api/v1/conversations/${conversationId}/attach_document?filename=${encodeURIComponent(filename)}`,
        { method: "POST" }
      );
      if (res.ok) {
        setActiveSourceFile(filename);
        setAttachedFile(null);
        setUploadMessage(`Attached document "${filename}"`);
        setDocPickerOpen(false);
        setAttachMenuOpen(false);
        if (onConversationDocChanged) {
          onConversationDocChanged(conversationId, filename);
        }
      }
    } catch {
      toast.error("Failed to attach document");
    }
  };

  // Check if a document is bound to this conversation session
  const hasDocument = Boolean(activeSourceFile || attachedFile);
  const isInputDisabled = isStreaming || uploadingPdf;

  // Send Message (Fast path or RAG - works seamlessly with or without document)
  const sendMessage = async (questionText: string) => {
    if (!conversationId || isStreaming) return;
    const q = questionText.trim();
    if (!q) return;
    setInput("");

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
          top_k: 5,
          conversation_id: conversationId,
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
              else if (parsed.agent_step.includes("Web Search") || parsed.agent_step.includes("Synthesis Agent")) setPipeline("generating");

              setMessages((p) =>
                p.map((m) =>
                  m.id === aid
                    ? { ...m, agentSteps: [...(m.agentSteps || []), parsed.agent_step] }
                    : m
                )
              );
            }
            if (parsed.citations) {
              cites = parsed.citations;
              setMessages((p) =>
                p.map((m) => (m.id === aid ? { ...m, citations: cites } : m))
              );
            }
            if (parsed.telemetry || parsed.ttft_ms !== undefined) {
              const tel = parsed.telemetry || {
                ttft_ms: parsed.ttft_ms,
                cache_hit: parsed.cache_hit,
                score: parsed.score,
                model: parsed.model,
              };
              setMessages((p) =>
                p.map((m) => (m.id === aid ? { ...m, telemetry: tel } : m))
              );
            }
            if (parsed.token) {
              const tokenText: string = parsed.token;
              const isModelError =
                tokenText.includes("model_not_found") ||
                tokenText.includes("does not exist") ||
                (tokenText.includes("Error code: 404") && tokenText.includes("model"));

              if (isModelError) {
                fetchAuth(`${API_BASE_URL}/api/v1/models`)
                  .then((r) => r.json())
                  .then((freshModels: LlmModel[]) => {
                    if (freshModels && freshModels.length > 0) {
                      setAvailableModels(freshModels);
                      setSelectedModel(freshModels[0].id);
                      toast.error(
                        `⚠️ Model not available. Auto-switched to "${freshModels[0].name}". Please try your question again.`,
                        { duration: 8000 }
                      );
                    } else {
                      toast.error("⚠️ Selected model is not available. Please select another model from the dropdown.", { duration: 8000 });
                    }
                  })
                  .catch(() => {
                    toast.error("⚠️ Selected model is not available. Please select another model from the dropdown.", { duration: 8000 });
                  });
              }

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
      toast.error("Cannot reach backend server. Please verify backend connection.", { duration: 5000 });
      setMessages((p) =>
        p.map((m) =>
          m.id === aid
            ? { ...m, content: "⚠️ Connection error. Unable to reach backend service. Please check backend connection and try again." }
            : m
        )
      );
    } finally {
      setPipeline("idle");
      setIsStreaming(false);
      setMessages((p) =>
        p.map((m) => (m.id === aid ? { ...m, isStreaming: false } : m))
      );
      onConversationUpdated?.();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const selectedModelObj =
    availableModels.find((m) => m.id === selectedModel) || availableModels[0];

  // ─── No Conversation State ───────────────────────────────────────────
  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-6 bg-[#000000]">
        <div className="flex items-center justify-center mb-3">
          <Nexus3DLogo size={46} interactive={true} />
        </div>
        <h2 className="text-2xl font-bold text-[#E1DCC9] mb-2">Nexus Intelligence Engine</h2>
        <p className="text-[#9E9EA8] text-xs max-w-md leading-relaxed mb-6">
          Select a conversation from the sidebar or start a new chat to analyze PDF documents with Qdrant Vector Search & Cohere Reranking.
        </p>
        <button
          onClick={onNewChat}
          className="px-6 py-2.5 bg-[#E1DCC9] hover:bg-[#EDE8D6] text-[#1E1E24] rounded-xl text-sm font-extrabold shadow-lg transition-all flex items-center gap-2 cursor-pointer group"
        >
          <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-[#1E1E24]" />
          Start New Chat
        </button>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#000000] relative">
      {/* Hidden File Input (Multiple PDF Support) */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            handlePdfUpload(e.target.files);
          }
        }}
      />

      {/* ── Messages Container ───────────────────────────────────────────── */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-8">
            {/* Header */}
            <div className="text-center mb-5">
              <div className="flex items-center justify-center mb-2">
                <Nexus3DLogo size={42} interactive={true} />
              </div>
              <h3 className="text-2xl font-bold text-[#E1DCC9] mb-1.5">Nexus Document Intelligence</h3>
              <p className="text-xs text-[#9E9EA8] max-w-md mx-auto leading-relaxed">
                {activeSourceFile
                  ? `Active Document: "${activeSourceFile}". Ask any question below to begin retrieval!`
                  : "Upload a PDF to start a fresh analysis session, or select an existing document from your Knowledge Base."}
              </p>
            </div>

            {/* If PDF is already attached to this session */}
            {activeSourceFile ? (
              <div className="w-full max-w-xl mb-6 p-4 rounded-2xl bg-[#1E1E24]/70 backdrop-blur-xl border border-emerald-500/40 text-center animate-in fade-in duration-300 shadow-[0_8px_32px_rgba(0,0,0,0.4)]">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-bold text-sm mb-1">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Session PDF Ready: {activeSourceFile}</span>
                </div>
                <p className="text-xs text-[#9E9EA8]">You can now ask questions about this document using the prompt bar below.</p>
              </div>
            ) : (
              /* Central Drag & Drop PDF Upload Box */
              <div className="w-full max-w-xl mb-6 space-y-4">
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const files = Array.from(e.dataTransfer.files).filter(
                      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")
                    );
                    if (files.length > 0) handlePdfUpload(files);
                  }}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-[#44444E]/60 hover:border-[#E1DCC9]/80 rounded-3xl p-8 cursor-pointer transition-all duration-300 bg-[#1E1E24]/60 backdrop-blur-xl hover:bg-[#1E1E24]/80 group shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#000000]/70 border border-[#44444E]/60 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shadow-inner">
                    <FileText className="w-6 h-6 text-[#E1DCC9]" />
                  </div>
                  <p className="text-sm font-semibold text-[#E1DCC9] mb-1">
                    {uploadProgress
                      ? `Uploading PDF ${uploadProgress.current} of ${uploadProgress.total}: ${uploadProgress.name}`
                      : attachedFile
                      ? attachedFile.name
                      : "Drop single or multiple PDFs here or click to browse"}
                  </p>
                  <p className="text-[11px] text-[#9E9EA8]">Upload PDF documents to start analyzing</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPdf}
                    className="mt-4 px-4 py-2 bg-[#E1DCC9] hover:bg-[#EDE8D6] disabled:bg-[#44444E]/40 disabled:text-[#9E9EA8]/40 text-[#1E1E24] rounded-xl text-xs font-extrabold shadow-[0_4px_16px_rgba(225,220,201,0.25)] transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {uploadingPdf ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin text-[#1E1E24]" /><span>Processing PDF(s)...</span></>
                    ) : (
                      <><Plus className="w-3.5 h-3.5 text-[#1E1E24]" /><span>Select PDF Document(s)</span></>
                    )}
                  </button>
                </label>

                {/* Existing Ingested Docs Selector */}
                {existingDocs.length > 0 && (
                  <div className="bg-[#1E1E24]/60 backdrop-blur-xl border border-[#44444E]/50 rounded-2xl p-4 text-left shadow-[0_8px_24px_rgba(0,0,0,0.3)]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#9E9EA8] mb-2">
                      Or select a document from Knowledge Base:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {existingDocs.map((doc) => (
                        <button
                          key={doc.filename}
                          type="button"
                          onClick={() => handleAttachExistingDoc(doc.filename)}
                          className="px-3 py-1.5 bg-[#000000]/60 backdrop-blur-md hover:bg-[#000000]/80 border border-[#44444E]/60 hover:border-[#E1DCC9]/70 rounded-xl text-xs text-[#E1DCC9] font-medium transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#E1DCC9]" />
                          <span className="truncate max-w-[180px]">{doc.filename}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Starter Suggestion Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  className="p-3.5 bg-[#1E1E24]/50 backdrop-blur-md hover:bg-[#1E1E24]/80 border border-[#44444E]/50 hover:border-[#E1DCC9]/50 rounded-2xl text-left text-xs text-[#F5F5F7] transition-all duration-200 group flex items-start justify-between shadow-[0_4px_16px_rgba(0,0,0,0.25)] cursor-pointer"
                >
                  <span className="line-clamp-2 leading-relaxed font-medium">{s}</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#9E9EA8] group-hover:text-[#E1DCC9] shrink-0 ml-2 mt-0.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-2 sm:px-4 pt-6 pb-6 space-y-6 max-w-3xl mx-auto w-full min-w-0">
            <div className="flex items-center gap-2 mb-4">
              {activeSourceFile ? (
                <button
                  onClick={exportChat}
                  title="Click to Export Chat as Markdown"
                  className="flex-1 flex items-center justify-between px-3.5 py-2.5 bg-[#1E1E24]/60 backdrop-blur-md border border-[#44444E]/50 hover:border-[#E1DCC9]/40 rounded-2xl text-xs text-[#9E9EA8] hover:text-[#F5F5F7] transition-all group cursor-pointer shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-[#E1DCC9] shrink-0" />
                    <span className="truncate">
                      Session Document: <strong className="text-[#E1DCC9] font-semibold">{activeSourceFile}</strong>
                    </span>
                    <span className="text-[10px] text-emerald-400 bg-[#000000]/60 px-2 py-0.5 rounded border border-emerald-500/30 shrink-0 hidden sm:block font-medium">
                      Isolated Vector Retrieval
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2 text-[#9E9EA8] group-hover:text-[#E1DCC9] transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold hidden sm:inline">Export MD</span>
                  </div>
                </button>
              ) : <div />}
              {messages.length > 0 && !activeSourceFile && (
                <button
                  onClick={exportChat}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#E1DCC9] bg-[#1E1E24]/60 backdrop-blur-md hover:bg-[#1E1E24]/90 rounded-2xl transition-colors border border-[#44444E]/50 shadow-md cursor-pointer"
                  title="Export Chat to Markdown"
                >
                  <Download className="w-3.5 h-3.5 text-[#E1DCC9]" />
                  <span className="hidden sm:inline">Export MD</span>
                </button>
              )}
            </div>
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={`flex gap-3 min-w-0 animate-slide-up ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-[#1E1E24]/80 backdrop-blur-md border border-[#44444E]/60 flex items-center justify-center shrink-0 mt-1 text-[#E1DCC9] shadow-md">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div className={`group relative min-w-0 max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Copy Button */}
                  {msg.role === "assistant" && msg.content && (
                    <div className="absolute -top-2.5 right-0 z-10">
                      <CopyButton text={msg.content} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-5 py-4 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#E1DCC9] text-[#1E1E24] rounded-br-sm shadow-[0_4px_24px_rgba(225,220,201,0.25)] font-bold"
                        : "bg-[#1E1E24]/70 backdrop-blur-md text-[#F5F5F7] border border-[#44444E]/50 shadow-[0_8px_32px_rgba(0,0,0,0.5)]"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-invert prose-sm max-w-none break-words overflow-x-auto
                          prose-p:leading-relaxed prose-p:my-1.5 prose-p:text-[#F5F5F7]
                          prose-ul:my-2 prose-li:my-0.5 prose-ul:list-disc prose-ul:pl-5
                          prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5
                          prose-headings:text-[#E1DCC9] prose-headings:font-bold
                          prose-strong:text-[#E1DCC9] prose-strong:font-bold
                          prose-a:text-[#E1DCC9] prose-a:no-underline hover:prose-a:underline
                          prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-[#44444E]/60 prose-td:p-2 prose-th:border prose-th:border-[#44444E]/60 prose-th:p-2 prose-th:bg-[#000000]/60 prose-th:text-[#E1DCC9]
                          prose-code:text-[#E1DCC9] prose-code:bg-[#000000]/60 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
                          prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
                          prose-blockquote:border-l-2 prose-blockquote:border-[#E1DCC9] prose-blockquote:bg-[#000000]/50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:rounded-r-lg prose-blockquote:text-[#E1DCC9] prose-blockquote:my-4 prose-blockquote:text-xs">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props) {
                                const {children, className, node, ref, ...rest} = props;
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                  <div className="rounded-xl overflow-hidden my-3 border border-[#44444E]/60 shadow-[0_4px_20px_rgba(0,0,0,0.5)] bg-[#000000]/80 backdrop-blur-md">
                                    <div className="bg-[#000000]/70 px-4 py-1.5 text-xs font-mono text-[#9E9EA8] border-b border-[#44444E]/60 flex justify-between items-center">
                                      <span>{match[1]}</span>
                                    </div>
                                    <SyntaxHighlighter
                                      {...(rest as any)}
                                      PreTag="div"
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                      style={oneDark as any}
                                      customStyle={{ margin: 0, background: 'transparent', padding: '1rem', fontSize: '0.8rem' }}
                                    />
                                  </div>
                                ) : (
                                  <code {...rest} className={className}>
                                    {children}
                                  </code>
                                )
                              }
                            }}
                          >
                            {processMessageContent(msg.content || "")}
                          </ReactMarkdown>
                        </div>
                        {msg.isStreaming && (
                          <span className="inline-flex gap-1 ml-1 mt-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="w-1.5 h-1.5 bg-[#E1DCC9] rounded-full animate-bounce"
                                style={{ animationDelay: `${i * 150}ms` }}
                              />
                            ))}
                          </span>
                        )}
                        <CitationBadge citations={msg.citations || []} />
                        {msg.telemetry && (
                          <div className="mt-2.5 pt-2 border-t border-[#44444E]/30 flex items-center gap-2 text-[10px] text-[#9E9EA8] font-mono select-none flex-wrap">
                            <span className="flex items-center gap-1 text-[#E1DCC9] bg-[#000000]/60 px-2 py-0.5 rounded border border-[#44444E]/50 font-semibold shadow-xs">
                              ⚡ {msg.telemetry.cache_hit ? "Semantic Cache: 0ms (Hit)" : `${msg.telemetry.ttft_ms}ms TTFT`}
                            </span>
                            {msg.telemetry.model && (
                              <span className="text-[#9E9EA8] bg-[#000000]/40 px-2 py-0.5 rounded border border-[#44444E]/40">
                                {msg.telemetry.model}
                              </span>
                            )}
                            {msg.telemetry.score !== undefined && (
                              <span className="text-emerald-400">
                                Similarity: {(msg.telemetry.score * 100).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-[#E1DCC9] text-[#1E1E24] flex items-center justify-center shrink-0 mt-1 shadow-[0_2px_12px_rgba(225,220,201,0.3)] font-bold">
                    <User className="w-4 h-4 text-[#1E1E24]" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating Agent Execution Toast */}
        <AgentPipelineToast 
          step={pipeline} 
          modelName={selectedModelObj.name} 
          agentDesc={
            isStreaming && messages.length > 0 
              ? messages[messages.length - 1].agentSteps?.slice(-1)[0] 
              : undefined
          } 
        />
      </div>

      {/* ── Prominent Floating Frosted Input Bar ────────────────────────── */}
      <div className="shrink-0 px-4 pb-6 sm:pb-4 pt-2 z-20 bg-transparent">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          {/* Active Document Status Banner if document is attached */}
          {hasDocument ? (
            <div className="mb-2 flex items-center justify-between px-3.5 py-2 bg-[#1E1E24]/80 backdrop-blur-xl border border-[#44444E]/60 rounded-xl text-xs shadow-[0_8px_24px_rgba(0,0,0,0.4)] animate-in fade-in duration-200">
              <div className="flex items-center gap-2 min-w-0">
                {uploadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#E1DCC9] animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-[#E1DCC9] shrink-0" />
                )}
                <span className="text-[#E1DCC9] font-semibold truncate">
                  {uploadProgress
                    ? `Uploading PDF ${uploadProgress.current} of ${uploadProgress.total}: ${uploadProgress.name}`
                    : attachedFile?.name || activeSourceFile || "PDF Document Attached"}
                </span>
                <span className="text-[10px] text-emerald-400 bg-[#000000]/60 px-2 py-0.5 rounded border border-emerald-500/30 font-medium shrink-0 hidden sm:inline">
                  RAG Active
                </span>
                {uploadMessage && (
                  <span className="text-[11px] text-[#9E9EA8] truncate hidden md:inline">
                    {uploadMessage}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {existingDocs.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setDocPickerOpen(true)}
                    className="text-[#E1DCC9] hover:text-white hover:bg-[#000000]/60 border border-[#44444E]/60 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer"
                    title="Switch to another PDF in Knowledge Base"
                  >
                    <FolderOpen className="w-3 h-3 text-[#E1DCC9]" />
                    <span className="hidden sm:inline">Switch</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCancelUpload}
                  className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-800/40 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0"
                  title="Cancel PDF upload / detach document"
                >
                  <X className="w-3.5 h-3.5 text-rose-400" />
                  <span>Detach</span>
                </button>
              </div>
            </div>
          ) : (
            /* No Document Attached -> Helpful, non-blocking selector banner */
            <div className="mb-2 px-3.5 py-2.5 bg-[#1E1E24]/75 backdrop-blur-xl border border-[#44444E]/60 rounded-xl text-xs text-[#E1DCC9] animate-in fade-in duration-200 shadow-[0_8px_24px_rgba(0,0,0,0.4)]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#E1DCC9] shrink-0" />
                  <span className="font-semibold text-[#F5F5F7]">
                    General AI Chat Mode
                    <span className="font-normal text-[#9E9EA8] ml-1.5 hidden md:inline">
                      — Ask anything directly, or attach a PDF to ground answers.
                    </span>
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {existingDocs.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setDocPickerOpen(true)}
                      className="px-2.5 py-1 bg-[#000000]/70 hover:bg-[#000000]/90 border border-[#44444E]/70 hover:border-[#E1DCC9]/60 text-[#E1DCC9] rounded-lg text-[11px] font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                      title="Pick an existing PDF from your Knowledge Base"
                    >
                      <FolderOpen className="w-3.5 h-3.5 text-[#E1DCC9]" />
                      <span>Choose Existing PDF ({existingDocs.length})</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1 bg-[#E1DCC9] hover:bg-[#EDE8D6] text-[#1E1E24] rounded-lg text-[11px] font-extrabold transition-colors flex items-center gap-1 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-3 h-3 text-[#1E1E24]" /> Upload PDF
                  </button>
                </div>
              </div>

              {/* Quick clickable chips for existing docs */}
              {existingDocs.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#44444E]/30 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-[#9E9EA8] shrink-0 mr-1">
                    Existing Docs:
                  </span>
                  {existingDocs.slice(0, 4).map((doc) => (
                    <button
                      key={doc.filename}
                      type="button"
                      onClick={() => handleAttachExistingDoc(doc.filename)}
                      className="px-2.5 py-0.5 rounded-md bg-[#000000]/50 hover:bg-[#E1DCC9]/20 border border-[#44444E]/50 hover:border-[#E1DCC9]/50 text-[#E1DCC9] hover:text-white text-[11px] font-medium transition-all flex items-center gap-1 cursor-pointer truncate max-w-[170px] shrink-0"
                      title={`Attach "${doc.filename}"`}
                    >
                      <FileText className="w-3 h-3 text-[#E1DCC9] shrink-0" />
                      <span className="truncate">{doc.filename}</span>
                    </button>
                  ))}
                  {existingDocs.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setDocPickerOpen(true)}
                      className="text-[11px] text-[#E1DCC9]/80 hover:text-[#E1DCC9] underline ml-1 shrink-0 font-medium cursor-pointer"
                    >
                      +{existingDocs.length - 4} more
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Input Capsule Box */}
          <div
            className={`flex flex-col bg-[#1E1E24]/80 backdrop-blur-2xl border rounded-2xl transition-all duration-300 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${
              isInputDisabled
                ? "border-[#44444E]/50 opacity-60 bg-[#1E1E24]/50"
                : "border-[#44444E]/70 hover:border-[#E1DCC9]/50 focus-within:border-[#E1DCC9]/80 focus-within:shadow-[0_12px_40px_rgba(225,220,201,0.15)] focus-within:ring-1 focus-within:ring-[#E1DCC9]/30"
            }`}
          >
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isStreaming
                  ? "Agent is processing query..."
                  : uploadingPdf
                  ? "⏳ Ingesting & embedding PDF document(s)... Please wait."
                  : hasDocument
                  ? `Ask anything about "${activeSourceFile || attachedFile?.name}"...`
                  : "Ask any general question, or attach a PDF to query documents..."
              }
              disabled={isInputDisabled}
              rows={1}
              className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-[#F5F5F7] placeholder-[#9E9EA8]/50 focus:outline-none resize-none leading-relaxed max-h-40 disabled:opacity-50 disabled:cursor-not-allowed no-scrollbar font-medium"
            />

            {/* Prompt Bar Controls */}
            <div className="flex items-center justify-between px-3 pb-2.5 pt-1 border-t border-[#44444E]/30">
              {/* Left Controls: Attach PDF Popover + Model Selector Dropdown */}
              <div className="flex items-center gap-2">
                {/* Upload Button (+) with Dropdown */}
                <div className="relative" ref={attachMenuRef}>
                  <button
                    type="button"
                    onClick={() => {
                      if (existingDocs.length > 0) {
                        setAttachMenuOpen((v) => !v);
                      } else {
                        fileInputRef.current?.click();
                      }
                    }}
                    disabled={isStreaming || uploadingPdf}
                    className="p-2 rounded-xl text-[#E1DCC9] hover:text-white hover:bg-[#000000]/60 border border-[#44444E]/60 transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                    title="Upload or Attach PDF Document"
                  >
                    <Plus className="w-4 h-4 text-[#E1DCC9]" />
                    <span className="hidden sm:inline text-[11px] font-semibold text-[#E1DCC9]">PDF</span>
                    {existingDocs.length > 0 && <ChevronDown className="w-3 h-3 text-[#9E9EA8]" />}
                  </button>

                  {/* Attach Options Dropdown Menu */}
                  {attachMenuOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-72 bg-[#1E1E24]/95 backdrop-blur-2xl border border-[#44444E]/80 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 p-2 animate-in fade-in duration-150">
                      <div className="px-2 py-1.5 flex items-center justify-between border-b border-[#44444E]/40 mb-1.5">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#9E9EA8]">Attach Document</span>
                        <span className="text-[10px] text-[#E1DCC9] font-medium">{existingDocs.length} in DB</span>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2.5 text-[#F5F5F7] hover:bg-[#000000]/60 transition-colors cursor-pointer mb-1 border border-transparent hover:border-[#44444E]/60"
                      >
                        <Plus className="w-4 h-4 text-[#E1DCC9] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#E1DCC9]">Upload New PDF</div>
                          <div className="text-[10px] text-[#9E9EA8]">Select file from your device</div>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          setDocPickerOpen(true);
                        }}
                        className="w-full text-left px-3 py-2 rounded-xl text-xs flex items-center gap-2.5 text-[#F5F5F7] hover:bg-[#000000]/60 transition-colors cursor-pointer border border-transparent hover:border-[#44444E]/60"
                      >
                        <FolderOpen className="w-4 h-4 text-[#E1DCC9] shrink-0" />
                        <div>
                          <div className="font-semibold text-[#E1DCC9]">Knowledge Base</div>
                          <div className="text-[10px] text-[#9E9EA8]">Choose from {existingDocs.length} ingested PDFs</div>
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Model Selector Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#000000]/60 backdrop-blur-md hover:bg-[#000000]/80 border border-[#44444E]/60 text-xs text-[#E1DCC9] transition-all cursor-pointer font-medium shadow-sm"
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#E1DCC9]" />
                    <span className="font-semibold">{selectedModelObj.name}</span>
                    <ChevronDown className="w-3 h-3 text-[#9E9EA8] ml-0.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-60 bg-[#1E1E24]/90 backdrop-blur-2xl border border-[#44444E]/80 rounded-2xl shadow-[0_12px_40px_rgba(0,0,0,0.8)] overflow-hidden z-50 p-1.5 animate-in fade-in duration-150">
                      <div className="px-2 py-1.5 flex items-center justify-between border-b border-[#44444E]/40 mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#9E9EA8]">Groq AI Engine</span>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block"></span>
                          Active
                        </span>
                      </div>
                      {availableModels.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                            selectedModel === m.id
                              ? "bg-[#000000]/70 text-[#E1DCC9] font-bold border border-[#44444E]/70 shadow-sm"
                              : "text-[#9E9EA8] hover:bg-[#000000]/40 hover:text-[#F5F5F7]"
                          }`}
                        >
                          <div>
                            <p className="leading-tight font-medium">{m.name}</p>
                            {m.tag && <p className="text-[10px] text-[#9E9EA8]/70 mt-0.5">{m.tag}</p>}
                          </div>
                          {selectedModel === m.id && <Check className="w-3.5 h-3.5 text-[#E1DCC9] shrink-0" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Control: Send Button */}
              <button
                type="submit"
                disabled={!input.trim() || isInputDisabled}
                className="w-8 h-8 flex items-center justify-center bg-[#E1DCC9] hover:bg-[#EDE8D6] disabled:bg-[#44444E]/40 disabled:text-[#9E9EA8]/40 text-[#1E1E24] rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-[0_2px_12px_rgba(225,220,201,0.25)] disabled:shadow-none font-bold"
                title="Send query"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#1E1E24]" />
                ) : (
                  <Send className="w-4 h-4 text-[#1E1E24]" />
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#9E9EA8] mt-2">
            Press <kbd className="bg-[#1E1E24]/80 border border-[#44444E]/60 rounded px-1 py-0.5 font-mono text-[#E1DCC9]">Enter</kbd> to send · <kbd className="bg-[#1E1E24]/80 border border-[#44444E]/60 rounded px-1 py-0.5 font-mono text-[#E1DCC9]">Shift+Enter</kbd> for line breaks
          </p>
        </form>
      </div>

      {/* ── Knowledge Base Document Selector Modal ──────────────────────── */}
      {docPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="bg-[#1E1E24]/90 backdrop-blur-2xl border border-[#44444E]/70 rounded-3xl w-full max-w-lg shadow-[0_24px_64px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[80vh]">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#44444E]/40 bg-[#000000]/60 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-[#1E1E24]/80 border border-[#44444E]/60 rounded-xl text-[#E1DCC9]">
                  <FolderOpen className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#E1DCC9]">Select Ingested Document</h3>
                  <p className="text-[11px] text-[#9E9EA8]">Attach an existing PDF from your Knowledge Base</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setDocPickerOpen(false);
                  setDocFilterQuery("");
                }}
                className="p-1.5 rounded-lg text-[#9E9EA8] hover:text-[#E1DCC9] hover:bg-[#1E1E24]/70 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="px-6 pt-4 pb-2">
              <div className="relative">
                <Search className="w-4 h-4 text-[#9E9EA8] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={docFilterQuery}
                  onChange={(e) => setDocFilterQuery(e.target.value)}
                  placeholder="Search documents by name..."
                  className="w-full pl-9 pr-4 py-2 bg-[#000000]/60 border border-[#44444E]/60 rounded-xl text-xs text-[#F5F5F7] placeholder-[#9E9EA8]/60 focus:outline-none focus:border-[#E1DCC9]/70"
                />
              </div>
            </div>

            {/* Document List */}
            <div className="flex-1 overflow-y-auto px-6 py-3 space-y-2.5 no-scrollbar">
              {existingDocs
                .filter((doc) =>
                  doc.filename.toLowerCase().includes(docFilterQuery.toLowerCase())
                )
                .map((doc) => {
                  const isCurrentlyActive = activeSourceFile === doc.filename;
                  return (
                    <div
                      key={doc.filename}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all ${
                        isCurrentlyActive
                          ? "bg-[#000000]/70 border-[#E1DCC9]/70 shadow-sm"
                          : "bg-[#000000]/40 border-[#44444E]/50 hover:border-[#E1DCC9]/40"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0 pr-3">
                        <div className="p-2 bg-[#1E1E24]/80 border border-[#44444E]/60 rounded-xl text-[#E1DCC9] shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#F5F5F7] truncate" title={doc.filename}>
                            {doc.filename}
                          </p>
                          <p className="text-[10px] text-[#9E9EA8] mt-0.5">
                            {doc.parent_chunks ? `${doc.parent_chunks} Chunks · ` : ""}
                            {doc.child_chunks ? `${doc.child_chunks} Embeddings` : "Ready for instant search"}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAttachExistingDoc(doc.filename)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 cursor-pointer ${
                          isCurrentlyActive
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 cursor-default"
                            : "bg-[#E1DCC9] hover:bg-[#EDE8D6] text-[#1E1E24] shadow-sm"
                        }`}
                      >
                        {isCurrentlyActive ? "Attached" : "Attach"}
                      </button>
                    </div>
                  );
                })}
              {existingDocs.filter((doc) =>
                doc.filename.toLowerCase().includes(docFilterQuery.toLowerCase())
              ).length === 0 && (
                <div className="text-center py-8 text-[#9E9EA8]">
                  <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#9E9EA8]" />
                  <p className="text-xs font-medium text-[#E1DCC9]">No matching documents found</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 border-t border-[#44444E]/40 bg-[#000000]/60 backdrop-blur-md flex items-center justify-between text-xs text-[#9E9EA8]">
              <button
                type="button"
                onClick={() => {
                  setDocPickerOpen(false);
                  fileInputRef.current?.click();
                }}
                className="text-[#E1DCC9] hover:underline flex items-center gap-1 font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Upload a different PDF
              </button>
              <button
                type="button"
                onClick={() => {
                  setDocPickerOpen(false);
                  setDocFilterQuery("");
                }}
                className="px-4 py-1.5 bg-[#1E1E24] hover:bg-[#44444E]/50 text-[#F5F5F7] border border-[#44444E]/60 font-semibold rounded-xl transition-all cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
