import React, { useState } from "react";
import {
  Plus, Search, MessageSquare, Trash2, Edit2, Check, X,
  FolderOpen, Clock,
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
    <div className="flex flex-col h-full bg-[#151C2C] border-r border-[#232F48]">
      {/* Top Action: New Chat Button (Luminous Cyber Cyan Button) */}
      <div className="p-3 border-b border-[#232F48]">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#00F0FF] hover:bg-[#66F6FF] text-[#0B0F19] rounded-xl text-sm font-extrabold transition-all duration-300 shadow-md hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        >
          <Plus className="w-4 h-4 text-[#0B0F19]" />
          New Chat
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2 bg-[#0B0F19] border border-[#232F48] rounded-lg px-3 py-2 shadow-inner">
          <Search className="w-3.5 h-3.5 text-[#94A3B8] shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            className="flex-1 bg-transparent text-xs text-[#F1F5F9] placeholder-[#94A3B8]/60 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch("")} className="text-[#94A3B8] hover:text-[#00F0FF] cursor-pointer">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-2 pb-2">
        {conversations.length === 0 ? (
          <div className="text-center py-8 px-4 animate-in fade-in">
            <MessageSquare className="w-8 h-8 text-[#94A3B8]/40 mx-auto mb-2" />
            <p className="text-xs text-[#00F0FF] font-medium">No conversations yet</p>
            <p className="text-[11px] text-[#94A3B8] mt-1">Click New Chat to begin</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-xs text-[#94A3B8] py-6">No results for &ldquo;{search}&rdquo;</p>
        ) : (
          Array.from(groups.entries()).map(([label, convs]) => (
            <div key={label} className="mb-3">
              <div className="flex items-center gap-2 px-2 mb-1.5">
                <Clock className="w-2.5 h-2.5 text-[#94A3B8]" />
                <span className="text-[10px] uppercase tracking-widest font-semibold text-[#94A3B8]">{label}</span>
              </div>
              {convs.map(conv => (
                <div
                  key={conv.id}
                  onClick={() => onSelect(conv.id)}
                  className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-150 mb-0.5 ${
                    activeId === conv.id
                      ? "bg-[#0B0F19] border border-[#232F48] text-[#00F0FF] shadow-sm font-semibold"
                      : "hover:bg-[#0B0F19]/60 text-[#F1F5F9]/80 hover:text-[#F1F5F9] border border-transparent"
                  }`}
                >
                  <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${activeId === conv.id ? "text-[#00F0FF]" : "text-[#94A3B8]"}`} />

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
                        className="flex-1 bg-[#0B0F19] text-[#F1F5F9] text-xs rounded-lg px-2 py-1 border border-[#00F0FF] focus:outline-none min-w-0"
                      />
                      <button onClick={e => commitEdit(conv.id, e)} className="text-emerald-400 hover:text-emerald-300 p-0.5 cursor-pointer">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setEditId(null); }} className="text-[#94A3B8] hover:text-[#F1F5F9] p-0.5 cursor-pointer">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] truncate leading-tight ${activeId === conv.id ? 'text-[#00F0FF] font-semibold' : 'text-[#F1F5F9]/90 group-hover:text-[#F1F5F9] transition-colors'}`}>{conv.title}</p>
                        {conv.message_count > 0 && (
                          <p className={`text-[10px] mt-0.5 ${activeId === conv.id ? 'text-[#94A3B8]' : 'text-[#94A3B8]/70'}`}>{conv.message_count} {conv.message_count === 1 ? "query" : "queries"}</p>
                        )}
                      </div>
                      <div className="hidden group-hover:flex items-center gap-1 shrink-0 ml-2">
                        <button
                          onClick={e => startEdit(conv, e)}
                          className="p-1 text-[#94A3B8] hover:text-[#00F0FF] rounded-md hover:bg-[#0B0F19] transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); onDelete(conv.id); }}
                          className="p-1 text-[#94A3B8] hover:text-rose-400 rounded-md hover:bg-rose-950/40 transition-all cursor-pointer"
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
      <div className="border-t border-[#232F48] p-3">
        <button
          onClick={onOpenDocs}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#0B0F19] hover:bg-[#0B0F19]/80 border border-[#232F48] shadow-sm transition-all group cursor-pointer"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg bg-[#151C2C] border border-[#232F48] flex items-center justify-center">
              <FolderOpen className="w-3.5 h-3.5 text-[#00F0FF]" />
            </div>
            <div className="text-left">
              <p className="text-xs font-semibold text-[#00F0FF]">Documents</p>
              <p className="text-[10px] text-[#94A3B8]">{docCount} file{docCount !== 1 ? "s" : ""} indexed</p>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
