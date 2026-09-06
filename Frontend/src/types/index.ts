export interface Citation {
  source_file: string;
  page_number: number;
  content_snippet: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export interface IngestResponse {
  status: string;
  filename: string;
  parent_chunks_created: number;
  child_chunks_created: number;
  message: string;
  duplicate: boolean;
}

export interface SystemInfoResponse {
  status: string;
  system: string;
  active_llm_model: string;
  vector_provider: string;
  reranker_model: string;
  hyde_enabled: boolean;
}

export interface ConversationListItem {
  id: string;
  title: string;
  source_file?: string;
  created_at: string;
  updated_at: string;
  message_count: number;
}

export interface MessageResponse {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  created_at: string;
}

export interface ConversationDetail {
  id: string;
  title: string;
  source_file?: string;
  created_at: string;
  updated_at: string;
  messages: MessageResponse[];
}

export interface IngestedDocument {
  id: string;
  filename: string;
  parent_chunks: number;
  child_chunks: number;
  ingested_at: string;
}

export interface LlmModel {
  id: string;
  name: string;
  tag?: string;
}

