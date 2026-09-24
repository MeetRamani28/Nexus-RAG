import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, User, Loader2, Copy, Check, FileText,
  Sparkles, FileSearch, BrainCircuit, Layers,
  X, Plus, ChevronDown, Cpu, Download
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vs } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage, Citation, ConversationDetail, IngestResponse, LlmModel } from "../types";
import { CitationBadge } from "./CitationBadge";
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
  onDocUploaded: () => void;
  onConversationUpdated?: () => void;
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
      className="p-1.5 rounded-lg text-[#71717A] hover:text-[#18181B] hover:bg-black/5 transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
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
      color: "text-[#FF5722] bg-[#FF5722]/10 border-[#FF5722]/20",
    },
    reranking: {
      title: "Step 2/3: Cohere Rerank",
      desc: "Cross-encoder scoring top candidate passages...",
      icon: Layers,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
    },
    generating: {
      title: "Step 3/3: LLM Generation",
      desc: `Synthesizing answer with ${modelName}...`,
      icon: BrainCircuit,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
    },
  };

  const curr = stepDetails[step as keyof typeof stepDetails] || stepDetails.retrieving;
  const Icon = curr.icon;

  return (
    <div className="mx-auto max-w-xl mb-4 p-3.5 rounded-2xl bg-white border border-[#E5E2D9] shadow-xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl border ${curr.color} shrink-0`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-[#18181B]">{curr.title}</p>
            <div className="flex items-center gap-1 text-[10px] text-[#71717A]">
              <Loader2 className="w-3 h-3 animate-spin text-[#FF5722]" />
              <span className="font-medium">Processing</span>
            </div>
          </div>
          <p className="text-[11px] text-[#71717A] truncate mt-0.5">{agentDesc || curr.desc}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-[#E5E2D9] rounded-full mt-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#FF5722] via-indigo-500 to-emerald-500 transition-all duration-500"
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
  onDocUploaded,
  onConversationUpdated,
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Fetch Available Models from Groq via backend — shows only live models
  useEffect(() => {
    fetchAuth(`${API_BASE_URL}/api/v1/models`)
      .then((r) => r.json())
      .then((data: LlmModel[]) => {
        if (data && data.length > 0) {
          setAvailableModels(data);
          // If currently selected model is not in the live list, auto-switch to first available
          const ids = data.map((m) => m.id);
          setSelectedModel((prev) => (ids.includes(prev) ? prev : data[0].id));
        }
      })
      .catch(() => {}); // Silently fallback to DEFAULT_MODELS
  }, [fetchAuth]);

  // Close model dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const [activeSourceFile, setActiveSourceFile] = useState<string | null>(null);
  const [existingDocs, setExistingDocs] = useState<{ filename: string }[]>([]);

  // Fetch ingested docs list for selection
  const fetchExistingDocs = useCallback(async () => {
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/documents`);
      if (res.ok) {
        setExistingDocs(await res.json());
      }
    } catch {
      // ignore
    }
  }, [fetchAuth]);

  useEffect(() => {
    fetchExistingDocs();
  }, [fetchExistingDocs]);

  const [isFetchingMessages, setIsFetchingMessages] = useState(false);

  // Load Messages for active conversation
  const loadMessages = useCallback(async (id: string) => {
    if (id.startsWith("conv-")) {
      setMessages([]);
      setActiveSourceFile(null);
      setIsFetchingMessages(false);
      return;
    }
    setIsFetchingMessages(true);
    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}`);
      if (!res.ok) {
        setMessages([]);
        setActiveSourceFile(null);
        setIsFetchingMessages(false);
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
    } finally {
      setIsFetchingMessages(false);
    }
  }, [fetchAuth]);

  useEffect(() => {
    setAttachedFile(null);
    setUploadMessage(null);
    if (conversationId) loadMessages(conversationId);
    else {
      setMessages([]);
      setActiveSourceFile(null);
    }
  }, [conversationId, loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
  const handleCancelUpload = () => {
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
    toast.info("PDF upload canceled", { id: "pdf-cancel" });
  };

  // Handle PDF Upload (Supports Single & Multiple PDF Selection)
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
        toast.success(
          pdfFiles.length === 1
            ? `Processed "${lastFilename}"`
            : `Ingested ${processedCount} PDF documents into Knowledge Base!`
        );
        onDocUploaded();
        onConversationUpdated?.();
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
        setUploadMessage(`Attached document "${filename}" to this chat!`);
        onConversationUpdated?.();
      }
    } catch {
      // ignore
    }
  };

  // Check if a document is bound to this conversation session
  const hasDocument = activeSourceFile !== null || attachedFile !== null || (uploadMessage !== null && !uploadMessage.includes("failed"));
  const isInputDisabled = isStreaming || uploadingPdf || !hasDocument;

  // Send Message
  const sendMessage = async (questionText: string) => {
    if (!conversationId || isStreaming || !hasDocument) return;
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
    setPipeline("retrieving");

    // Show a cold-start warning after 5s if still waiting
    let coldStartToastId: string | number | undefined;
    const coldStartTimer = setTimeout(() => {
      coldStartToastId = toast.loading(
        "⏳ Backend is waking up from sleep mode... Please wait 1-2 minutes for Render cold start.",
        { duration: 120000 }
      );
    }, 5000);

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

      // Backend responded — dismiss cold start toast
      clearTimeout(coldStartTimer);
      if (coldStartToastId !== undefined) {
        toast.dismiss(coldStartToastId);
        toast.success("Backend is ready!", { duration: 2000 });
      }

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
            if (parsed.token) {
              // Detect model_not_found error inside stream token
              const tokenText: string = parsed.token;
              const isModelError =
                tokenText.includes("model_not_found") ||
                tokenText.includes("does not exist") ||
                (tokenText.includes("Error code: 404") && tokenText.includes("model"));

              if (isModelError) {
                // Auto-refresh model list and switch to first available
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
      clearTimeout(coldStartTimer);
      if (coldStartToastId !== undefined) toast.dismiss(coldStartToastId);
      toast.error(
        "Cannot reach backend. If this is your first visit, please wait 1-2 minutes for the server to wake up and try again.",
        { duration: 8000 }
      );
      setMessages((p) =>
        p.map((m) =>
          m.id === aid
            ? { ...m, content: "⚠️ Connection error. The backend server may be waking up from sleep mode. Please wait 1-2 minutes and try again." }
            : m
        )
      );
    } finally {
      clearTimeout(coldStartTimer);
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
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-6 bg-[#F8F6F0]">
        <div className="w-20 h-20 rounded-3xl overflow-hidden border border-[#E5E2D9] shadow-xl mb-6">
          <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-2xl font-bold text-[#18181B] mb-2">Nexus Intelligence Engine</h2>
        <p className="text-[#71717A] text-xs max-w-md leading-relaxed mb-6">
          Select a conversation from the sidebar or start a new chat to analyze PDF documents with Qdrant Vector Search & Cohere Reranking.
        </p>
        <button
          onClick={onNewChat}
          className="px-6 py-2.5 bg-[#18181B] hover:bg-[#27272A] text-white rounded-xl text-sm font-semibold shadow-md transition-all flex items-center gap-2 cursor-pointer group"
        >
          <Plus className="w-4 h-4 group-hover:scale-110 transition-transform text-[#FF5722]" />
          Start New Chat
        </button>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#F8F6F0] relative">
      {/* Top progress bar when switching existing conversations */}
      {isFetchingMessages && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#FF5722] via-indigo-500 to-[#FF5722] animate-pulse z-50" />
      )}
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
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl overflow-hidden border border-[#E5E2D9] shadow-md mx-auto mb-4">
                <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
              </div>
              <h3 className="text-2xl font-bold text-[#18181B] mb-1.5">Nexus Document Intelligence</h3>
              <p className="text-xs text-[#71717A] max-w-md mx-auto leading-relaxed">
                {activeSourceFile
                  ? `Active Document: "${activeSourceFile}". Ask any question below to begin retrieval!`
                  : "Upload a PDF to start a fresh analysis session, or select an existing document from your Knowledge Base."}
              </p>
            </div>

            {/* If PDF is already attached to this session */}
            {activeSourceFile ? (
              <div className="w-full max-w-xl mb-6 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center animate-in fade-in duration-300">
                <div className="flex items-center justify-center gap-2 text-emerald-800 font-bold text-sm mb-1">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Session PDF Ready: {activeSourceFile}</span>
                </div>
                <p className="text-xs text-[#71717A]">You can now ask questions about this document using the prompt bar below.</p>
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
                  className="flex flex-col items-center justify-center border-2 border-dashed border-[#E5E2D9] hover:border-[#FF5722]/60 rounded-3xl p-8 cursor-pointer transition-all duration-300 bg-white hover:bg-[#F5F2EB] group shadow-sm"
                >
                  <div className="w-12 h-12 rounded-2xl bg-[#FF5722]/10 border border-[#FF5722]/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-[#FF5722]" />
                  </div>
                  <p className="text-sm font-semibold text-[#18181B] mb-1">
                    {uploadProgress
                      ? `Uploading PDF ${uploadProgress.current} of ${uploadProgress.total}: ${uploadProgress.name}`
                      : attachedFile
                      ? attachedFile.name
                      : "Drop single or multiple PDFs here or click to browse"}
                  </p>
                  <p className="text-[11px] text-[#71717A]">Upload PDF documents to start analyzing</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingPdf}
                    className="mt-4 px-4 py-2 bg-[#18181B] hover:bg-[#27272A] disabled:opacity-50 text-white rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    {uploadingPdf ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF5722]" /><span>Processing PDF(s)...</span></>
                    ) : (
                      <><Plus className="w-3.5 h-3.5 text-[#FF5722]" /><span>Select PDF Document(s)</span></>
                    )}
                  </button>
                </label>

                {/* Existing Ingested Docs Selector */}
                {existingDocs.length > 0 && (
                  <div className="bg-white border border-[#E5E2D9] rounded-2xl p-4 text-left shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#71717A] mb-2">
                      Or select a document from Knowledge Base:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {existingDocs.map((doc) => (
                        <button
                          key={doc.filename}
                          type="button"
                          onClick={() => handleAttachExistingDoc(doc.filename)}
                          className="px-3 py-1.5 bg-[#F8F6F0] hover:bg-[#F5F2EB] border border-[#E5E2D9] rounded-xl text-xs text-[#18181B] font-medium transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-[#FF5722]" />
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
                  className="p-3.5 bg-white hover:bg-[#F5F2EB] border border-[#E5E2D9] hover:border-[#18181B]/30 rounded-2xl text-left text-xs text-[#18181B] transition-all duration-200 group flex items-start justify-between shadow-sm cursor-pointer"
                >
                  <span className="line-clamp-2 leading-relaxed font-medium">{s}</span>
                  <Sparkles className="w-3.5 h-3.5 text-[#71717A] group-hover:text-[#FF5722] shrink-0 ml-2 mt-0.5 transition-colors" />
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
                  className="flex-1 flex items-center justify-between px-3.5 py-2.5 bg-white border border-[#E5E2D9] hover:border-[#18181B]/20 rounded-2xl text-xs text-[#71717A] hover:text-[#18181B] transition-all group cursor-pointer shadow-sm"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-[#FF5722] shrink-0" />
                    <span className="truncate">
                      Session Document: <strong className="text-[#18181B] font-semibold">{activeSourceFile}</strong>
                    </span>
                    <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0 hidden sm:block font-medium">
                      Isolated Vector Retrieval
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2 text-[#71717A] group-hover:text-[#18181B] transition-colors">
                    <Download className="w-3.5 h-3.5" />
                    <span className="text-[11px] font-semibold hidden sm:inline">Export MD</span>
                  </div>
                </button>
              ) : <div />}
              {messages.length > 0 && !activeSourceFile && (
                <button
                  onClick={exportChat}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#18181B] bg-white hover:bg-[#F5F2EB] rounded-2xl transition-colors border border-[#E5E2D9] shadow-sm cursor-pointer"
                  title="Export Chat to Markdown"
                >
                  <Download className="w-3.5 h-3.5 text-[#FF5722]" />
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
                  <div className="w-8 h-8 rounded-xl bg-white border border-[#E5E2D9] flex items-center justify-center shrink-0 mt-1 text-[#FF5722] shadow-sm">
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
                        ? "bg-[#18181B] text-white rounded-br-sm shadow-sm font-medium"
                        : "bg-white text-[#18181B] border border-[#E5E2D9] shadow-sm"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-slate prose-sm max-w-none break-words overflow-x-auto
                          prose-p:leading-relaxed prose-p:my-1.5 prose-p:text-[#18181B]
                          prose-ul:my-2 prose-li:my-0.5 prose-ul:list-disc prose-ul:pl-5
                          prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5
                          prose-headings:text-[#18181B] prose-headings:font-bold
                          prose-strong:text-[#18181B] prose-strong:font-bold
                          prose-a:text-[#FF5722] prose-a:no-underline hover:prose-a:underline
                          prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-[#E5E2D9] prose-td:p-2 prose-th:border prose-th:border-[#E5E2D9] prose-th:p-2 prose-th:bg-[#F8F6F0] prose-th:text-[#18181B]
                          prose-code:text-[#18181B] prose-code:bg-[#F5F2EB] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
                          prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
                          prose-blockquote:border-l-2 prose-blockquote:border-[#FF5722] prose-blockquote:bg-[#F8F6F0] prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:rounded-r-lg prose-blockquote:text-[#71717A] prose-blockquote:my-4 prose-blockquote:text-xs">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props) {
                                const {children, className, node, ref, ...rest} = props;
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                  <div className="rounded-xl overflow-hidden my-3 border border-[#E5E2D9] shadow-sm bg-white">
                                    <div className="bg-[#F5F2EB] px-4 py-1.5 text-xs font-mono text-[#71717A] border-b border-[#E5E2D9] flex justify-between items-center">
                                      <span>{match[1]}</span>
                                    </div>
                                    <SyntaxHighlighter
                                      {...(rest as any)}
                                      PreTag="div"
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                      style={vs as any}
                                      customStyle={{ margin: 0, background: '#ffffff', padding: '1rem', fontSize: '0.8rem' }}
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
                                className="w-1.5 h-1.5 bg-[#FF5722] rounded-full animate-bounce"
                                style={{ animationDelay: `${i * 150}ms` }}
                              />
                            ))}
                          </span>
                        )}
                        <CitationBadge citations={msg.citations || []} />
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>

                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-xl bg-[#18181B] flex items-center justify-center shrink-0 mt-1 text-white shadow-sm">
                    <User className="w-4 h-4" />
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

      {/* ── Prominent Input Bar (Antigravity / Gemini Style) ──────────────── */}
      <div className="shrink-0 px-4 pb-6 sm:pb-4 pt-2 z-20 bg-[#F8F6F0]">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          {/* Lock Notice if no document is present */}
          {!hasDocument && (
            <div className="mb-2 flex items-center justify-between px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="text-base">🔒</span>
                <span className="font-semibold">Please upload a PDF document above to unlock the prompt input.</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1 bg-[#18181B] hover:bg-[#27272A] text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3 text-[#FF5722]" /> Upload PDF
              </button>
            </div>
          )}

          {/* Attached PDF Status Notification if any */}
          {(attachedFile || uploadingPdf || uploadMessage || uploadProgress || activeSourceFile) && (
            <div className="mb-2 flex items-center justify-between px-3.5 py-2 bg-white border border-[#E5E2D9] rounded-xl text-xs shadow-sm">
              <div className="flex items-center gap-2 min-w-0">
                {uploadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 text-[#FF5722] animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-[#FF5722] shrink-0" />
                )}
                <span className="text-[#18181B] font-semibold truncate">
                  {uploadProgress
                    ? `Uploading PDF ${uploadProgress.current} of ${uploadProgress.total}: ${uploadProgress.name}`
                    : attachedFile?.name || activeSourceFile || "PDF Document Attached"}
                </span>
                {uploadMessage && (
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                    {uploadMessage}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleCancelUpload}
                className="text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-lg transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer shrink-0"
                title="Cancel PDF upload / detach document"
              >
                <X className="w-3.5 h-3.5 text-rose-600" />
                <span>Cancel</span>
              </button>
            </div>
          )}

          {/* Input Capsule Box */}
          <div
            className={`flex flex-col bg-white border rounded-2xl transition-all duration-300 shadow-md ${
              isInputDisabled
                ? "border-[#E5E2D9] opacity-60 bg-[#F5F2EB]"
                : "border-[#E5E2D9] hover:border-[#18181B]/40 focus-within:border-[#18181B] focus-within:ring-2 focus-within:ring-[#18181B]/10"
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
                  : !hasDocument
                  ? "🔒 Upload a PDF document above to unlock prompt input..."
                  : "Ask anything about your documents..."
              }
              disabled={isInputDisabled}
              rows={1}
              className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-[#18181B] placeholder-[#71717A] focus:outline-none resize-none leading-relaxed max-h-40 disabled:opacity-50 disabled:cursor-not-allowed no-scrollbar font-medium"
            />

            {/* Prompt Bar Controls (Model Selector + Attachment + Send Button) */}
            <div className="flex items-center justify-between px-3 pb-2.5 pt-1">
              {/* Left Controls: Attach PDF + Model Selector Dropdown */}
              <div className="flex items-center gap-2">
                {/* Upload Button (+) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming || uploadingPdf}
                  className="p-2 rounded-xl text-[#71717A] hover:text-[#18181B] hover:bg-[#F5F2EB] border border-[#E5E2D9] transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  title="Upload / Attach PDF Document"
                >
                  <Plus className="w-4 h-4 text-[#FF5722]" />
                  <span className="hidden sm:inline text-[11px] font-semibold text-[#18181B]">PDF</span>
                </button>

                {/* Model Selector Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F8F6F0] hover:bg-[#F5F2EB] border border-[#E5E2D9] text-xs text-[#18181B] transition-all cursor-pointer font-medium"
                  >
                    <Cpu className="w-3.5 h-3.5 text-[#FF5722]" />
                    <span className="font-semibold">{selectedModelObj.name}</span>
                    <ChevronDown className="w-3 h-3 text-[#71717A] ml-0.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-60 bg-white border border-[#E5E2D9] rounded-2xl shadow-2xl overflow-hidden z-50 p-1.5 animate-in fade-in duration-150">
                      <div className="px-2 py-1.5 flex items-center justify-between border-b border-[#E5E2D9] mb-1">
                        <span className="text-[10px] uppercase tracking-wider font-bold text-[#71717A]">Groq AI Engine</span>
                        <span className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
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
                              ? "bg-[#F5F2EB] text-[#18181B] font-bold border border-[#E5E2D9]"
                              : "text-[#71717A] hover:bg-[#F8F6F0] hover:text-[#18181B]"
                          }`}
                        >
                          <div>
                            <p className="leading-tight font-medium">{m.name}</p>
                            {m.tag && <p className="text-[10px] text-[#71717A] mt-0.5">{m.tag}</p>}
                          </div>
                          {selectedModel === m.id && <Check className="w-3.5 h-3.5 text-[#FF5722] shrink-0" />}
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
                className="w-8 h-8 flex items-center justify-center bg-[#18181B] hover:bg-[#27272A] disabled:bg-zinc-200 disabled:text-zinc-400 text-white rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-md disabled:shadow-none"
                title="Send query"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-[#71717A] mt-2">
            Press <kbd className="bg-white border border-[#E5E2D9] rounded px-1 py-0.5 font-mono text-[#18181B]">Enter</kbd> to send · <kbd className="bg-white border border-[#E5E2D9] rounded px-1 py-0.5 font-mono text-[#18181B]">Shift+Enter</kbd> for line breaks
          </p>
        </form>
      </div>
    </div>
  );
};
