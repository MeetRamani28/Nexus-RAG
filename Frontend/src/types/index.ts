export interface Citation {
  source_file: string;
  page_number: number;
  content_snippet: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export interface IngestResponse {
  status: string;
  filename: string;
  parent_chunks_created: number;
  child_chunks_created: number;
  message: string;
}

export interface SystemInfoResponse {
  status: string;
  system: string;
  active_llm_model: string;
  vector_provider: string;
  reranker_model: string;
  hyde_enabled: boolean;
}