import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, User, Loader2, Copy, Check, FileText,
  Sparkles, FileSearch, BrainCircuit, Layers,
  X, Plus, ChevronDown, Cpu, Download
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ChatMessage, Citation, ConversationDetail, IngestResponse, LlmModel } from "../types";
import { CitationBadge } from "./CitationBadge";

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
      className="p-1.5 rounded-lg text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50 transition-all opacity-0 group-hover:opacity-100"
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
      color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/30",
    },
    reranking: {
      title: "Step 2/3: Cohere Rerank",
      desc: "Cross-encoder scoring top candidate passages...",
      icon: Layers,
      color: "text-violet-400 bg-violet-500/10 border-violet-500/30",
    },
    generating: {
      title: "Step 3/3: LLM Generation",
      desc: `Synthesizing answer with ${modelName}...`,
      icon: BrainCircuit,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    },
  };

  const curr = stepDetails[step as keyof typeof stepDetails] || stepDetails.retrieving;
  const Icon = curr.icon;

  return (
    <div className="mx-auto max-w-xl mb-4 p-3.5 rounded-xl bg-zinc-900/95 border border-zinc-800/80 shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl border ${curr.color} shrink-0`}>
          <Icon className="w-4 h-4 " />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-zinc-100">{curr.title}</p>
            <div className="flex items-center gap-1 text-[10px] text-zinc-400">
              <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />
              <span>Processing</span>
            </div>
          </div>
          <p className="text-[11px] text-zinc-400 truncate mt-0.5">{agentDesc || curr.desc}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-zinc-800 rounded-full mt-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400 transition-all duration-500"
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

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch Available Models
  useEffect(() => {
    fetchAuth(`${API_BASE_URL}/api/v1/models`)
      .then((r) => r.json())
      .then((data: LlmModel[]) => {
        if (data && data.length > 0) {
          setAvailableModels(data);
        }
      })
      .catch(() => {});
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

  // Handle PDF Upload via Attachment Button
  const handlePdfUpload = async (file: File) => {
    if (!file.name.endsWith(".pdf")) return;
    setAttachedFile(file);
    setUploadingPdf(true);
    setUploadMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    if (conversationId) {
      formData.append("conversation_id", conversationId);
    }

    try {
      const res = await fetchAuth(`${API_BASE_URL}/api/v1/ingest`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error(res.statusText);
      const data: IngestResponse = await res.json();
      setActiveSourceFile(data.filename);
      setUploadMessage(
        data.duplicate
          ? `Recognized existing "${data.filename}". Ready for instant Q&A!`
          : `Processed "${data.filename}" (${data.child_chunks_created} vectors)`
      );
      onDocUploaded();
      onConversationUpdated?.();
      fetchExistingDocs();
    } catch (e: unknown) {
      setUploadMessage(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingPdf(false);
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
  const isInputDisabled = isStreaming || !hasDocument;

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
      setMessages((p) =>
        p.map((m) =>
          m.id === aid
            ? { ...m, content: "Connection error. Please check backend server." }
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
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-6">
        <div className="w-20 h-20 rounded-3xl overflow-hidden border border-indigo-500/20 shadow-2xl shadow-indigo-500/10 mb-6">
          <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-2xl font-bold text-zinc-100 mb-2">Nexus Intelligence Engine</h2>
        <p className="text-zinc-400 text-xs max-w-md leading-relaxed mb-6">
          Select a conversation from the sidebar or start a new chat to analyze PDF documents with Qdrant Vector Search & Cohere Reranking.
        </p>
        <button
          onClick={onNewChat}
          className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-indigo-500/25 transition-all flex items-center gap-2 cursor-pointer group"
        >
          <Plus className="w-4 h-4 group-hover:scale-110 transition-transform" />
          Start New Chat
        </button>
      </div>
    );
  }

  if (isFetchingMessages) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full text-center px-6">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
        <p className="text-sm text-zinc-400">Loading conversation...</p>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-zinc-950 relative">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handlePdfUpload(f);
        }}
      />

      {/* ── Messages Container ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-xl overflow-hidden border border-indigo-500/20 shadow-xl shadow-indigo-500/10 mx-auto mb-4">
                <img src="/logo.jpg" alt="Nexus-RAG Logo" className="w-full h-full object-cover" />
              </div>
              <h3 className="text-2xl font-bold text-zinc-100 mb-1.5">Nexus Document Intelligence</h3>
              <p className="text-xs text-zinc-400 max-w-md mx-auto leading-relaxed">
                {activeSourceFile
                  ? `Active Document: "${activeSourceFile}". Ask any question below to begin retrieval!`
                  : "Upload a PDF to start a fresh analysis session, or select an existing document from your Knowledge Base."}
              </p>
            </div>

            {/* If PDF is already attached to this session */}
            {activeSourceFile ? (
              <div className="w-full max-w-xl mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center animate-in fade-in duration-300">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm mb-1">
                  <Check className="w-4 h-4" />
                  <span>Session PDF Ready: {activeSourceFile}</span>
                </div>
                <p className="text-xs text-zinc-400">You can now ask questions about this document using the prompt bar below.</p>
              </div>
            ) : (
              /* Central Drag & Drop PDF Upload Box */
              <div className="w-full max-w-xl mb-6 space-y-4">
                <label
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0];
                    if (f) handlePdfUpload(f);
                  }}
                  className="flex flex-col items-center justify-center border-2 border-dashed border-zinc-800/80 hover:border-indigo-500/60 rounded-3xl p-8 cursor-pointer transition-all duration-300 bg-zinc-900/40 hover:bg-indigo-500/5 group shadow-2xl"
                >
                  <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-indigo-400" />
                  </div>
                  <p className="text-sm font-semibold text-zinc-200 mb-1">
                    {attachedFile ? attachedFile.name : "Drop PDF here or click to browse"}
                  </p>
                  <p className="text-[11px] text-zinc-500">Upload a PDF for this new chat session</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 bg-indigo-600/90 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Select New PDF Document
                  </button>
                </label>

                {/* Existing Ingested Docs Selector */}
                {existingDocs.length > 0 && (
                  <div className="bg-zinc-900/60 border border-zinc-800/80 rounded-xl p-4 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                      Or select a document from Knowledge Base:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {existingDocs.map((doc) => (
                        <button
                          key={doc.filename}
                          type="button"
                          onClick={() => handleAttachExistingDoc(doc.filename)}
                          className="px-3 py-1.5 bg-zinc-800/80 hover:bg-indigo-500/10 border border-zinc-800/60 hover:border-indigo-500/40 rounded-xl text-xs text-zinc-300 hover:text-indigo-300 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-indigo-400" />
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
                  className="p-3.5 bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800/80 hover:border-indigo-500/40 rounded-xl text-left text-xs text-zinc-300 hover:text-zinc-100 transition-all duration-200 group flex items-start justify-between shadow-lg shadow-black/20"
                >
                  <span className="line-clamp-2 leading-relaxed">{s}</span>
                  <Sparkles className="w-3.5 h-3.5 text-zinc-600 group-hover:text-indigo-400 shrink-0 ml-2 mt-0.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-2 sm:px-4 pt-6 pb-6 space-y-6 max-w-3xl mx-auto w-full min-w-0">
            <div className="flex items-center justify-between mb-4 gap-4">
              {activeSourceFile ? (
                <div className="flex-1 flex items-center justify-between px-4 py-2 bg-zinc-900/80 border border-zinc-800/80 rounded-xl text-xs text-zinc-400">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">Session Document: <strong className="text-zinc-200">{activeSourceFile}</strong></span>
                  </div>
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0 ml-2 hidden sm:block">
                    Isolated Vector Retrieval
                  </span>
                </div>
              ) : <div />}
              {messages.length > 0 && (
                <button
                  onClick={exportChat}
                  className="shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-300 bg-zinc-800/50 hover:bg-zinc-800/50 rounded-xl transition-colors border border-zinc-800/50 hover:border-zinc-600"
                  title="Export Chat to Markdown"
                >
                  <Download className="w-3.5 h-3.5" />
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
                  <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 mt-1 text-zinc-300">
                    <Sparkles className="w-3.5 h-3.5" />
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
                    className={`rounded-xl px-5 py-4 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-zinc-800 text-zinc-100 rounded-br-sm border border-zinc-700 font-medium"
                        : "bg-transparent text-zinc-200"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>

                        <div className="prose prose-invert prose-sm max-w-none break-words overflow-x-auto
                          prose-p:leading-relaxed prose-p:my-1.5
                          prose-ul:my-2 prose-li:my-0.5 prose-ul:list-disc prose-ul:pl-5
                          prose-ol:my-2 prose-ol:list-decimal prose-ol:pl-5
                          prose-headings:text-zinc-100 prose-headings:font-semibold
                          prose-strong:text-zinc-100 prose-strong:font-semibold
                          prose-a:text-indigo-400 prose-a:no-underline hover:prose-a:underline
                          prose-table:border-collapse prose-table:w-full prose-td:border prose-td:border-zinc-800 prose-td:p-2 prose-th:border prose-th:border-zinc-800 prose-th:p-2 prose-th:bg-zinc-900
                          prose-code:text-zinc-300 prose-code:bg-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono
                          prose-pre:bg-transparent prose-pre:p-0 prose-pre:m-0
                          prose-blockquote:border-l-2 prose-blockquote:border-zinc-700 prose-blockquote:bg-zinc-900/50 prose-blockquote:px-4 prose-blockquote:py-2 prose-blockquote:rounded-r-lg prose-blockquote:text-zinc-400 prose-blockquote:my-4 prose-blockquote:text-xs">
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm]}
                            components={{
                              code(props) {
                                const {children, className, node, ref, ...rest} = props;
                                const match = /language-(\w+)/.exec(className || '');
                                return match ? (
                                  <div className="rounded-xl overflow-hidden my-3 border border-zinc-800 shadow-md">
                                    <div className="bg-zinc-900 px-4 py-1.5 text-xs font-mono text-zinc-400 border-b border-zinc-800 flex justify-between items-center">
                                      <span>{match[1]}</span>
                                    </div>
                                    <SyntaxHighlighter
                                      {...(rest as any)}
                                      PreTag="div"
                                      children={String(children).replace(/\n$/, '')}
                                      language={match[1]}
                                      style={oneDark as any}
                                      customStyle={{ margin: 0, background: '#020617', padding: '1rem', fontSize: '0.8rem' }}
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
                                className="w-1.5 h-1.5 bg-indigo-400 rounded-full "
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
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-800 border border-zinc-600/80 flex items-center justify-center shrink-0 mt-1 text-zinc-200 shadow-md">
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
      <div className="shrink-0 px-4 pb-6 sm:pb-4 pt-2 z-20 bg-zinc-950">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          {/* Lock Notice if no document is present */}
          {!hasDocument && (
            <div className="mb-2 flex items-center justify-between px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-300 animate-in fade-in duration-200">
              <div className="flex items-center gap-2">
                <span className="text-base">🔒</span>
                <span className="font-medium">Please upload a PDF document above to unlock the prompt input.</span>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 rounded-lg text-[11px] font-semibold transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Upload PDF
              </button>
            </div>
          )}

          {/* Attached PDF Status Notification if any */}
          {(attachedFile || uploadingPdf || uploadMessage) && (
            <div className="mb-2 flex items-center justify-between px-3.5 py-2 bg-zinc-900/90 border border-zinc-800 rounded-xl text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {uploadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 text-indigo-400 animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                )}
                <span className="text-zinc-300 font-medium truncate">
                  {attachedFile?.name || "Uploading..."}
                </span>
                {uploadMessage && (
                  <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    {uploadMessage}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setAttachedFile(null);
                  setUploadMessage(null);
                }}
                className="text-zinc-500 hover:text-zinc-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input Capsule Box */}
          <div
            className={`flex flex-col bg-zinc-900/90 border rounded-xl transition-all duration-300 shadow-2xl backdrop-blur-md ${
              isInputDisabled
                ? "border-zinc-800 opacity-60 bg-zinc-950/80"
                : "border-zinc-800/70 hover:border-zinc-600 focus-within:border-indigo-500/80 focus-within:ring-2 focus-within:ring-indigo-500/20"
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
                  : !hasDocument
                  ? "🔒 Upload a PDF document above to unlock prompt input..."
                  : "Ask anything about your documents..."
              }
              disabled={isInputDisabled}
              rows={1}
              className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none resize-none leading-relaxed max-h-40 disabled:opacity-50 disabled:cursor-not-allowed no-scrollbar"
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
                  className="p-2 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/80 border border-zinc-800 transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  title="Upload / Attach PDF Document"
                >
                  <Plus className="w-4 h-4 text-indigo-400" />
                  <span className="hidden sm:inline text-[11px] font-medium text-zinc-300">PDF</span>
                </button>

                {/* Model Selector Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 border border-zinc-800/60 text-xs text-zinc-200 transition-all cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    <span className="font-medium">{selectedModelObj.name}</span>
                    <ChevronDown className="w-3 h-3 text-zinc-400 ml-0.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-zinc-900 border border-zinc-800/80 rounded-xl shadow-2xl overflow-hidden z-50 p-1.5 animate-in fade-in duration-150">
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-zinc-500">
                        Select Groq LLM
                      </div>
                      {availableModels.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setSelectedModel(m.id);
                            setModelDropdownOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-xl text-xs flex items-center justify-between transition-colors ${
                            selectedModel === m.id
                              ? "bg-indigo-500/15 text-indigo-300 font-semibold border border-indigo-500/20"
                              : "text-zinc-300 hover:bg-zinc-800/80"
                          }`}
                        >
                          <div>
                            <p className="leading-tight">{m.name}</p>
                            {m.tag && <p className="text-[10px] text-zinc-500 mt-0.5">{m.tag}</p>}
                          </div>
                          {selectedModel === m.id && <Check className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
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
                className="w-8 h-8 flex items-center justify-center bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 disabled:shadow-none"
                title="Send query"
              >
                {isStreaming ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <p className="text-center text-[10px] text-zinc-600 mt-2">
            Press <kbd className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 font-mono text-zinc-400">Enter</kbd> to send · <kbd className="bg-zinc-900 border border-zinc-800 rounded px-1 py-0.5 font-mono text-zinc-400">Shift+Enter</kbd> for line breaks
          </p>
        </form>
      </div>
    </div>
  );
};
