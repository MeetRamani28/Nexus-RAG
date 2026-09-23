import React, { useState } from "react";
import {
  Plus, Search, MessageSquare, Trash2, Edit2, Check, X,
  ChevronRight, FolderOpen, Clock,
} from "lucide-react";
import type { ConversationListItem } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface Props {
  conversations: ConversationListItem[];
  activeId: string | null;
  docCount: number;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenDocs: () => void;
  fetchAuth?: (url: string, options?: RequestInit) => Promise<Response>;
  isLoading?: boolean;
}

function relativeLabel(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  if (diff < 30) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function groupConversations(list: ConversationListItem[]) {
  const map = new Map<string, ConversationListItem[]>();
  for (const c of list) {
    const label = relativeLabel(c.updated_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(c);
  }
  return map;
}

export const Sidebar: React.FC<Props> = ({
  conversations, activeId, docCount,
  onNewChat, onSelect, onDelete, onRename, onOpenDocs, fetchAuth = fetch
}) => {
  const [search, setSearch] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editVal, setEditVal] = useState("");

  const filtered = search.trim()
    ? conversations.filter(c => c.title.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const groups = groupConversations(filtered);

  const startEdit = (c: ConversationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditId(c.id);
    setEditVal(c.title);
  };

  const commitEdit = async (id: string, e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
    if (editVal.trim()) {
      await fetchAuth(`${API_BASE_URL}/api/v1/conversations/${id}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editVal.trim() }),
      });
      onRename(id, editVal.trim());
    }
    setEditId(null);
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F2EB] border-r border-[#E5E2D9]">
      {/* Top Action: New Chat Button (Sleek Dark Graphite Pill Button matching Screenshot 3) */}
      <div className="p-3 border-b border-[#E5E2D9]">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#18181B] hover:bg-[#27272A] text-white rounded-xl text-sm font-semibold transition-all duration-300 shadow-sm hover:shadow-md hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-white" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 bg-white border border-[#E5E2D9] rounded-lg px-3 py-2 shadow-xs">
          <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 bg-transparent text-xs text-[#18181B] placeholder-zinc-400 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8 px-4 animate-in fade-in">
            <MessageSquare className="w-8 h-8 text-zinc-300 mx-auto mb-2" />
            <p className="text-xs text-zinc-500 font-medium">No conversations yet</p>
            <p className="text-[11px] text-zinc-400 mt-1">Click New Chat to begin</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-zinc-500 py-6">No results for &ldquo;{search}&rdquo;</p>
        ) : (
          Array.from(groups.entries()).map(([label, convs]) => (
            <div key={label} className="mb-3">
              <div className="flex items-center gap-2 px-2 mb-1.5">
                <Clock className="w-2.5 h-2.5 text-zinc-400" />
                <span className="text-[10px] uppercase tracking-widest font-semibold text-zinc-500">{label}</span>
              </div>
              {convs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 mb-0.5 ${
                    activeId === conv.id
                      ? "bg-white border border-[#E5E2D9] text-[#18181B] shadow-sm font-semibold"
                      : "hover:bg-white/60 text-zinc-600 hover:text-[#18181B] border border-transparent"
                  }`}
                >
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${activeId === conv.id ? "text-[#FF5722]" : "text-zinc-400"}`} />

                  {editId === conv.id ? (
                    <div className="flex-1 flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={editVal}
                        onChange={e => setEditVal(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") commitEdit(conv.id, e);
                          if (e.key === "Escape") setEditId(null);
                        }}
                        className="flex-1 bg-white text-[#18181B] text-xs rounded-lg px-2 py-1 border border-[#18181B] focus:outline-none min-w-0"
                      />
                      <button onClick={e => commitEdit(conv.id, e)} className="text-emerald-600 hover:text-emerald-700 p-0.5 cursor-pointer">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setEditId(null); }} className="text-zinc-400 hover:text-zinc-600 p-0.5 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] truncate leading-tight ${activeId === conv.id ? 'text-[#18181B] font-semibold' : 'text-zinc-700 group-hover:text-[#18181B] transition-colors'}`}>{conv.title}</p>
                        {conv.message_count > 0 && (
                          <p className={`text-[10px] mt-0.5 ${activeId === conv.id ? 'text-zinc-500' : 'text-zinc-400'}`}>{conv.message_count} {conv.message_count === 1 ? "query" : "queries"}</p>
                        )}
                      </div>
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={e => startEdit(conv, e)}
                          className="p-1 text-zinc-400 hover:text-zinc-700 rounded-md hover:bg-zinc-100 transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                          className="p-1 text-zinc-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {/* Documents Footer */}
      <div className="border-t border-[#E5E2D9] p-3">
        <button
          onClick={onOpenDocs}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-white hover:bg-zinc-50 border border-[#E5E2D9] shadow-xs transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-orange-50 border border-orange-200 flex items-center justify-center">
              <FolderOpen className="w-3.5 h-3.5 text-[#FF5722]" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-[#18181B]">Documents</p>
              <p className="text-[10px] text-zinc-500">{docCount} file{docCount !== 1 ? "s" : ""} indexed</p>
            </div>
          </div>
          <ChevronRight className="w-3.5 h-3.5 text-zinc-400 group-hover:text-zinc-600 transition-colors" />
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
