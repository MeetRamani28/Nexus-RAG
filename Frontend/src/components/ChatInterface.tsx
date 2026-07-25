import React, { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Sparkles, Loader2 } from "lucide-react";
import type { ChatMessage, Citation } from "../types";
import { CitationBadge } from "./CitationBadge";

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userQuery = input.trim();
    setInput("");

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      sender: "user",
      text: userQuery,
    };

    const assistantMsgId = (Date.now() + 1).toString();
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      sender: "assistant",
      text: "",
      citations: [],
      isStreaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setIsStreaming(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/query/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userQuery, top_k: 5 }),
      });

      if (!response.body) throw new Error("ReadableStream not supported");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let currentCitations: Citation[] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("event: citations")) {
            continue;
          }
          if (line.startsWith("data: ")) {
            const dataStr = line.replace("data: ", "").trim();
            if (dataStr === "[DONE]") break;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.citations) {
                currentCitations = parsed.citations;
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, citations: currentCitations }
                      : msg,
                  ),
                );
              }

              if (parsed.token) {
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, text: msg.text + parsed.token }
                      : msg,
                  ),
                );
              }
            } catch {
              // Ignore non-json frames
            }
          }
        }
      }
    } catch (err) {
      console.error("SSE Error:", err);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId
            ? { ...msg, text: "Error connecting to Nexus-RAG Engine." }
            : msg,
        ),
      );
    } finally {
      setIsStreaming(false);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMsgId ? { ...msg, isStreaming: false } : msg,
        ),
      );
    }
  };

  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col h-[600px] backdrop-blur-md shadow-2xl">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 bg-sky-500/10 rounded-lg border border-sky-500/20 text-sky-400">
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">
              Intelligence Assistant
            </h3>
            <p className="text-xs text-slate-400">
              Hybrid Search + Cohere Rerank + Llama 3
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2 text-xs text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>SSE Streaming Active</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-3">
            <Sparkles className="w-10 h-10 text-slate-600" />
            <p className="text-sm">
              Upload a PDF and ask questions to start retrieving context.
            </p>
          </div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start space-x-3 ${
                msg.sender === "user" ? "justify-end" : "justify-start"
              }`}
            >
              {msg.sender === "assistant" && (
                <div className="p-2 bg-sky-500/10 rounded-xl border border-sky-500/20 text-sky-400 mt-1 shrink-0">
                  <Bot className="w-4 h-4" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
                  msg.sender === "user"
                    ? "bg-sky-600 text-slate-50 rounded-tr-none"
                    : "bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.isStreaming && (
                  <span className="inline-block w-2 h-4 bg-sky-400 animate-pulse ml-1 align-middle" />
                )}
                {msg.sender === "assistant" && msg.citations && (
                  <CitationBadge citations={msg.citations} />
                )}
              </div>

              {msg.sender === "user" && (
                <div className="p-2 bg-slate-800 rounded-xl text-slate-300 mt-1 shrink-0">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-slate-800 bg-slate-950/50"
      >
        <div className="flex space-x-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your ingested documents..."
            disabled={isStreaming}
            className="flex-1 bg-slate-900 border border-slate-800 focus:border-sky-500 rounded-xl px-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none transition-colors"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="bg-sky-600 hover:bg-sky-500 disabled:bg-slate-800 disabled:text-slate-600 text-slate-100 px-5 py-3 rounded-xl transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shrink-0"
          >
            {isStreaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
