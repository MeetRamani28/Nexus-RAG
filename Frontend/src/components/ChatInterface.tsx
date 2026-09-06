import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Send, User, Loader2, Copy, Check, FileText,
  Sparkles, FileSearch, BrainCircuit, Layers,
  X, Plus, ChevronDown, Cpu
} from "lucide-react";
import ReactMarkdown from "react-markdown";
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
      className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-700/50 transition-all opacity-0 group-hover:opacity-100"
      title="Copy message"
    >
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
};

// ─── Agent Pipeline Execution Toast ──────────────────────────────────────────
const AgentPipelineToast: React.FC<{ step: PipelineStep; modelName: string }> = ({ step, modelName }) => {
  if (step === "idle" || step === "done") return null;

  const stepDetails = {
    retrieving: {
      title: "Step 1/3: Vector Search",
      desc: "Embedding query & retrieving dense context from Qdrant...",
      icon: FileSearch,
      color: "text-blue-400 bg-blue-500/10 border-blue-500/30",
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
    <div className="mx-auto max-w-xl mb-4 p-3.5 rounded-2xl bg-[#0f172a]/95 border border-slate-700/80 shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-xl border ${curr.color} shrink-0`}>
          <Icon className="w-4 h-4 animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-100">{curr.title}</p>
            <div className="flex items-center gap-1 text-[10px] text-slate-400">
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
              <span>Processing</span>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 truncate mt-0.5">{curr.desc}</p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-1 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-400 transition-all duration-500"
          style={{
            width: step === "retrieving" ? "33%" : step === "reranking" ? "66%" : "95%",
          }}
        />
      </div>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────
export const ChatInterface: React.FC<Props> = ({
  conversationId,
  onDocUploaded,
  onConversationUpdated,
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
    fetch(`${API_BASE_URL}/api/v1/models`)
      .then((r) => r.json())
      .then((data: LlmModel[]) => {
        if (data && data.length > 0) {
          setAvailableModels(data);
        }
      })
      .catch(() => {});
  }, []);

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
      const res = await fetch(`${API_BASE_URL}/api/v1/documents`);
      if (res.ok) {
        setExistingDocs(await res.json());
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchExistingDocs();
  }, [fetchExistingDocs]);

  // Load Messages for active conversation
  const loadMessages = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/conversations/${id}`);
      if (!res.ok) return;
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
  }, []);

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
      const res = await fetch(`${API_BASE_URL}/api/v1/ingest`, {
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
      const res = await fetch(
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

    setTimeout(() => setPipeline("reranking"), 900);
    setTimeout(() => setPipeline("generating"), 1800);

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/query/stream`, {
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
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mb-4 shadow-xl shadow-blue-500/10">
          <BrainCircuit className="w-8 h-8 text-blue-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-100 mb-2">Nexus Intelligence Engine</h2>
        <p className="text-slate-400 text-xs max-w-md leading-relaxed">
          Select or create a conversation from the sidebar to analyze PDF documents with Qdrant Vector Search & Cohere Reranking.
        </p>
      </div>
    );
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full bg-[#050811] relative">
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
      <div className="flex-1 overflow-y-auto no-scrollbar">
        {isEmpty ? (
          <div className="flex flex-col items-center justify-center min-h-full px-6 py-8">
            {/* Header */}
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 border border-blue-500/20 flex items-center justify-center mx-auto mb-3 shadow-xl shadow-blue-500/10">
                <Sparkles className="w-7 h-7 text-blue-400" />
              </div>
              <h3 className="text-2xl font-bold text-slate-100 mb-1.5">Nexus Document Intelligence</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                {activeSourceFile
                  ? `Active Document: "${activeSourceFile}". Ask any question below to begin retrieval!`
                  : "Upload a PDF to start a fresh analysis session, or select an existing document from your Knowledge Base."}
              </p>
            </div>

            {/* If PDF is already attached to this session */}
            {activeSourceFile ? (
              <div className="w-full max-w-xl mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center animate-in fade-in duration-300">
                <div className="flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm mb-1">
                  <Check className="w-4 h-4" />
                  <span>Session PDF Ready: {activeSourceFile}</span>
                </div>
                <p className="text-xs text-slate-400">You can now ask questions about this document using the prompt bar below.</p>
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
                  className="flex flex-col items-center justify-center border-2 border-dashed border-slate-700/80 hover:border-blue-500/60 rounded-3xl p-8 cursor-pointer transition-all duration-300 bg-slate-900/40 hover:bg-blue-500/5 group shadow-2xl"
                >
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <FileText className="w-6 h-6 text-blue-400" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200 mb-1">
                    {attachedFile ? attachedFile.name : "Drop PDF here or click to browse"}
                  </p>
                  <p className="text-[11px] text-slate-500">Upload a PDF for this new chat session</p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="mt-4 px-4 py-2 bg-blue-600/90 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Select New PDF Document
                  </button>
                </label>

                {/* Existing Ingested Docs Selector */}
                {existingDocs.length > 0 && (
                  <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 text-left">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                      Or select a document from Knowledge Base:
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {existingDocs.map((doc) => (
                        <button
                          key={doc.filename}
                          type="button"
                          onClick={() => handleAttachExistingDoc(doc.filename)}
                          className="px-3 py-1.5 bg-slate-800/80 hover:bg-blue-500/10 border border-slate-700/60 hover:border-blue-500/40 rounded-xl text-xs text-slate-300 hover:text-blue-300 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
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
                  className="p-3.5 bg-slate-900/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-blue-500/40 rounded-2xl text-left text-xs text-slate-300 hover:text-slate-100 transition-all duration-200 group flex items-start justify-between shadow-lg shadow-black/20"
                >
                  <span className="line-clamp-2 leading-relaxed">{s}</span>
                  <Sparkles className="w-3.5 h-3.5 text-slate-600 group-hover:text-blue-400 shrink-0 ml-2 mt-0.5 transition-colors" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="px-4 pt-6 pb-6 space-y-6 max-w-3xl mx-auto w-full">
            {activeSourceFile && (
              <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border border-slate-800/80 rounded-xl text-xs text-slate-400 mb-4">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                  <span className="truncate">Session Document: <strong className="text-slate-200">{activeSourceFile}</strong></span>
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 shrink-0">
                  Isolated Vector Retrieval
                </span>
              </div>
            )}
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                  msg.role === "user" ? "justify-end" : "justify-start"
                }`}
              >
                {msg.role === "assistant" && (
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-600 via-blue-500 to-violet-600 flex items-center justify-center shrink-0 mt-1 shadow-lg shadow-blue-500/25 text-white">
                    <Sparkles className="w-4 h-4" />
                  </div>
                )}

                <div className={`group relative max-w-[85%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                  {/* Copy Button */}
                  {msg.role === "assistant" && msg.content && (
                    <div className="absolute -top-2.5 right-0 z-10">
                      <CopyButton text={msg.content} />
                    </div>
                  )}

                  <div
                    className={`rounded-2xl px-4 py-3.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white rounded-br-none shadow-lg shadow-blue-600/20 font-medium"
                        : "bg-slate-900/90 border border-slate-800/90 text-slate-200 rounded-bl-none shadow-xl shadow-black/30"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <>
                        <div className="prose prose-invert prose-sm max-w-none
                          prose-p:leading-relaxed prose-p:my-1.5
                          prose-ul:my-2 prose-li:my-0.5
                          prose-ol:my-2
                          prose-headings:text-slate-100 prose-headings:font-semibold
                          prose-strong:text-slate-100 prose-strong:font-semibold
                          prose-code:text-blue-300 prose-code:bg-slate-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs
                          prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:rounded-xl
                          prose-blockquote:border-blue-500/40 prose-blockquote:text-slate-400">
                          <ReactMarkdown>{msg.content || ""}</ReactMarkdown>
                        </div>
                        {msg.isStreaming && (
                          <span className="inline-flex gap-1 ml-1 mt-1">
                            {[0, 1, 2].map((i) => (
                              <span
                                key={i}
                                className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"
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
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 border border-slate-600/80 flex items-center justify-center shrink-0 mt-1 text-slate-200 shadow-md">
                    <User className="w-4 h-4" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Floating Agent Execution Toast */}
        <AgentPipelineToast step={pipeline} modelName={selectedModelObj.name} />
      </div>

      {/* ── Prominent Input Bar (Antigravity / Gemini Style) ──────────────── */}
      <div className="shrink-0 px-4 pb-4 pt-2 z-20">
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
            <div className="mb-2 flex items-center justify-between px-3.5 py-2 bg-slate-900/90 border border-slate-800 rounded-xl text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {uploadingPdf ? (
                  <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin shrink-0" />
                ) : (
                  <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                )}
                <span className="text-slate-300 font-medium truncate">
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
                className="text-slate-500 hover:text-slate-300 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Input Capsule Box */}
          <div
            className={`flex flex-col bg-slate-900/90 border rounded-2xl transition-all duration-300 shadow-2xl backdrop-blur-xl ${
              isInputDisabled
                ? "border-slate-800 opacity-60 bg-slate-950/80"
                : "border-slate-700/70 hover:border-slate-600 focus-within:border-blue-500/80 focus-within:ring-2 focus-within:ring-blue-500/20"
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
              className="w-full bg-transparent px-4 pt-3.5 pb-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none resize-none leading-relaxed max-h-40 disabled:opacity-50 disabled:cursor-not-allowed"
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
                  className="p-2 rounded-xl text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 border border-slate-800 transition-all flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
                  title="Upload / Attach PDF Document"
                >
                  <Plus className="w-4 h-4 text-blue-400" />
                  <span className="hidden sm:inline text-[11px] font-medium text-slate-300">PDF</span>
                </button>

                {/* Model Selector Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  <button
                    type="button"
                    onClick={() => setModelDropdownOpen((v) => !v)}
                    disabled={isStreaming}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-xs text-slate-200 transition-all cursor-pointer"
                  >
                    <Cpu className="w-3.5 h-3.5 text-blue-400" />
                    <span className="font-medium">{selectedModelObj.name}</span>
                    <ChevronDown className="w-3 h-3 text-slate-400 ml-0.5" />
                  </button>

                  {/* Dropdown Menu */}
                  {modelDropdownOpen && (
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden z-50 p-1.5 animate-in fade-in duration-150">
                      <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-semibold text-slate-500">
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
                              ? "bg-blue-500/15 text-blue-300 font-semibold border border-blue-500/20"
                              : "text-slate-300 hover:bg-slate-800/80"
                          }`}
                        >
                          <div>
                            <p className="leading-tight">{m.name}</p>
                            {m.tag && <p className="text-[10px] text-slate-500 mt-0.5">{m.tag}</p>}
                          </div>
                          {selectedModel === m.id && <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />}
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
                className="w-8 h-8 flex items-center justify-center bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-blue-500/20 disabled:shadow-none"
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

          <p className="text-center text-[10px] text-slate-600 mt-2">
            Press <kbd className="bg-slate-900 border border-slate-800 rounded px-1 py-0.5 font-mono text-slate-400">Enter</kbd> to send · <kbd className="bg-slate-900 border border-slate-800 rounded px-1 py-0.5 font-mono text-slate-400">Shift+Enter</kbd> for line breaks
          </p>
        </form>
      </div>
    </div>
  );
};
