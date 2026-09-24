import React, { useState } from "react";
import { MessageSquare, Trash2, Edit2, Check, X } from "lucide-react";
import type { ConversationListItem } from "../types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

interface Props {
  conversations: ConversationListItem[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return date.toLocaleDateString("en-US", { weekday: "long" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function groupByDate(conversations: ConversationListItem[]) {
  const groups: Record<string, ConversationListItem[]> = {};
  for (const conv of conversations) {
    const label = formatDate(conv.updated_at);
    if (!groups[label]) groups[label] = [];
    groups[label].push(conv);
  }
  return groups;
}

export const ConversationList: React.FC<Props> = ({
  conversations,
  activeId,
  onSelect,
  onDelete,
  onRename,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const startEdit = (conv: ConversationListItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(conv.id);
    setEditValue(conv.title);
  };

  const confirmEdit = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editValue.trim()) {
      await fetch(`${API_BASE_URL}/api/v1/conversations/${id}/title`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editValue.trim() }),
      });
      onRename(id, editValue.trim());
    }
    setEditingId(null);
  };

  const cancelEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(id);
  };

  const groups = groupByDate(conversations);

  if (conversations.length === 0) {
    return (
      <div className="text-center text-[#94A3B8] text-xs py-6 px-2">
        No conversations yet.
        <br />
        Click <span className="text-[#00F0FF] font-semibold">+ New Chat</span> to begin.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([label, convs]) => (
        <div key={label}>
          <p className="text-[10px] uppercase tracking-widest text-[#94A3B8] font-bold px-2 mb-1">
            {label}
          </p>
          <div className="space-y-1">
            {convs.map((conv) => (
              <div
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={`group relative flex items-center px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                  activeId === conv.id
                    ? "bg-[#0B0F19] border border-[#232F48] text-[#00F0FF] font-semibold shadow-sm"
                    : "hover:bg-[#0B0F19]/60 text-[#F1F5F9]/80 hover:text-[#F1F5F9] border border-transparent"
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5 shrink-0 mr-2.5 text-[#00F0FF]" />

                {editingId === conv.id ? (
                  <div className="flex-1 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") confirmEdit(conv.id, e as unknown as React.MouseEvent);
                        if (e.key === "Escape") cancelEdit(e as unknown as React.MouseEvent);
                      }}
                      className="flex-1 bg-[#0B0F19] text-[#F1F5F9] text-xs rounded-lg px-2 py-1 border border-[#00F0FF] focus:outline-none min-w-0"
                    />
                    <button onClick={(e) => confirmEdit(conv.id, e)} className="text-emerald-400 hover:text-emerald-300 p-0.5">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={cancelEdit} className="text-[#94A3B8] hover:text-[#F1F5F9] p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <span className="flex-1 text-xs truncate">{conv.title}</span>
                    <div className="hidden group-hover:flex items-center gap-1 ml-1 shrink-0">
                      <button
                        onClick={(e) => startEdit(conv, e)}
                        className="p-0.5 text-[#94A3B8] hover:text-[#00F0FF] transition-colors"
                        title="Rename"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(conv.id, e)}
                        className="p-0.5 text-[#94A3B8] hover:text-rose-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};
