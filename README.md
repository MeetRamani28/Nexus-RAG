<div align="center">

<img src="Frontend/public/logo.jpg" width="90" style="border-radius: 16px;" />

# Nexus-RAG

### Enterprise Multi-Agent Retrieval-Augmented Generation (RAG) Platform

**Upload any PDF. Ask anything. Instant, high-precision document intelligence with cited real-time AI answers.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-nexus--rag--rose.vercel.app-6366f1?style=for-the-badge&logo=vercel&logoColor=white)](https://nexus-rag-rose.vercel.app/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-FF6B35?style=for-the-badge&logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-DC143C?style=for-the-badge&logo=qdrant&logoColor=white)](https://qdrant.tech/)

</div>

---

## Screenshots

### Dashboard
> Clean entry point - start a new chat or select an existing conversation from the sidebar.

![Dashboard](Frontend/public/screenshots/01_dashboard.png)

---

### Document Ready - Knowledge Base Loaded
> After uploading a PDF, the system confirms the document is indexed and ready. Suggested prompts appear automatically.

![Document Ready](Frontend/public/screenshots/02_document_ready.png)

---

### PDF Upload - Knowledge Base Selection
> Drag and drop a new PDF or pick from already-indexed documents in your personal knowledge base.

![PDF Upload](Frontend/public/screenshots/05_pdf_upload.png)

---

### Multi-Agent Pipeline - Live Processing
> Watch the specialized RAG pipeline execute in real-time: Vector Retrieval -> Cohere Reranking -> Web Search Approval -> LLM Synthesis.

![Agent Processing](Frontend/public/screenshots/03_agent_processing.png)

---

### AI Response - Rich Markdown with Citations
> Responses include structured markdown (tables, bold, bullet points) with interactive source citation badges.

![AI Response](Frontend/public/screenshots/04_ai_response.png)

---

### Mobile View - Fully Responsive

| Mobile Chat Response | Mobile Sidebar Navigation |
|:--------------------:|:-------------------------:|
| <img src="Frontend/public/screenshots/mobile_chat.jpeg" width="300" style="border-radius: 12px;" /> | <img src="Frontend/public/screenshots/mobile_sidebar.jpeg" width="300" style="border-radius: 12px;" /> |

---

## System Architecture

```
+------------------------------------------------------------------+
|                         USER QUERY                               |
+---------------------------+--------------------------------------+
                            |
               +------------v-------------+
               |  Semantic Cache (Redis)  |  <-- Cache HIT -> skip LLM
               |  Scoped nexus_cache:user |
               +------------+-------------+
                      Cache MISS
                            |
          +-----------------v----------------------------------------+
          |         LangGraph Orchestrator (Memory Checkpointer)     |
          |                                                           |
          |  [AGENT 1: Hybrid Retrieve] -> [AGENT 2: Cohere Rerank]   |
          |  (Dense + FastEmbed BM25)      (Cross-Encoder v3)        |
          |                                        |                  |
          |  [AGENT 3: HITL Web Search] -> [AGENT 4: LLM Synthesizer] |
          |  (Approval & RBAC Gating)       (Groq Active Models)     |
          +----------------------------------------------------------+
                                       |
                        +--------------v--------------+
                        |  SSE / WebSocket Streaming  |
                        |  React Frontend + Citations |
                        +-----------------------------+
```

---

## Key Features

### 1. Hybrid Search & Multi-Tenant Isolation
- **Hybrid Retrieval (Dense + FastEmbed BM25 + RRF)** - Combines Cohere `embed-english-v3.0` dense semantic vectors with `FastEmbed` BM25 sparse keyword vectors using Reciprocal Rank Fusion (RRF).
- **Parent-Child Dual Granularity Chunking** - 2000-character parent context chunks paired with 400-character child vectors for pinpoint accuracy without context loss.
- **Strict Multi-Tenant Isolation** - Qdrant payload keyword indexing (`user_id`, `doc_id`) enforces zero cross-tenant data leakage.

### 2. LangGraph State Persistence & Human-in-the-Loop (HITL)
- **Checkpointer State Persistence** - Conversation states are saved per thread using `MemorySaver` checkpointer.
- **HITL Web Search Approval** - Graph interrupts execution before external web search, soliciting explicit user approval when PDF context is low.
- **Clerk RBAC Gating** - Restricts web search capabilities based on user role (`free`, `pro`, `admin`).

### 3. Observability & Semantic Caching
- **LangSmith Tracing** - Node-by-node execution tracing across all graph stages (`retrieve`, `rerank`, `web_search`, `generate`).
- **Structured JSON Logging** - Production-grade JSON logs with ISO timestamps, log level, component tags, user ID, and request ID.
- **Scoped Semantic Cache (Redis + InMemory)** - Query cosine similarity matching (>95%) with tenant-scoped cache keys (`nexus_cache:{user_id}:{doc_id}:{hash}`).

---

## Benchmark Evaluation Results

Evaluated over 35 ground-truth benchmark Q&A pairs across test documents (`evals/golden_set.jsonl`).

### Retrieval Ablation Comparison
| Search Mode | Hit-Rate@3 | Hit-Rate@5 | Hit-Rate@10 | MRR | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dense Only** | 100.0% | 100.0% | 100.0% | 0.8286 | Cohere `embed-english-v3.0` |
| **Sparse BM25 Only** | 100.0% | 100.0% | 100.0% | 0.9429 | FastEmbed `Qdrant/bm25` |
| **Hybrid (RRF)** | **100.0%** | **100.0%** | **100.0%** | **0.8571** | Dense + Sparse + Reciprocal Rank Fusion |

### End-to-End Quality & Caching Performance
- **LLM-as-a-Judge Answer Relevance**: **0.97 / 1.0**
- **LLM-as-a-Judge Faithfulness**: **0.735 / 1.0**
- **Semantic Cache Hit Rate**: **100.0%**

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 + TypeScript | Core UI framework |
| Vite 8 | Ultra-fast bundler |
| Tailwind CSS v4 | Utility-first styling |
| Clerk Auth | Authentication and user management |
| ReactMarkdown + remark-gfm | Rich markdown rendering |
| react-syntax-highlighter | Code block syntax highlighting |
| **Vercel** | Hosting and CI/CD |

### Backend
| Technology | Purpose |
|---|---|
| FastAPI | REST API + SSE & WebSocket streaming |
| LangGraph | Multi-agent state machine with checkpointer |
| FastEmbed | BM25 sparse keyword embeddings |
| Groq API | Active model dynamic resolution (Qwen 27B / Llama 70B) |
| Cohere Rerank v3 | Cross-encoder re-ranking |
| Qdrant | Vector database with named dense + sparse vectors & payload indexing |
| PostgreSQL + SQLAlchemy | Persistent metadata & parent document storage |
| Redis + InMemory | Multi-tenant scoped semantic cache |
| LangSmith | Node-level observability & tracing |

---

## Getting Started

### Prerequisites
- **Python** 3.10+
- **Node.js** v18+
- API Keys: [Groq](https://console.groq.com/) | [Cohere](https://cohere.com/) | [Clerk](https://clerk.com/) | [Qdrant](https://qdrant.tech/)

### 1. Clone

```bash
git clone https://github.com/MeetRamani28/Nexus-RAG.git
cd Nexus-RAG
```

### 2. Backend Setup

```bash
cd Backend
python -m venv .venv

# Windows
.\.venv\Scripts\Activate.ps1
# Linux/macOS
source .venv/bin/activate

pip install -r requirements.txt pytest pytest-asyncio fastembed langsmith
```

Create `Backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key
COHERE_API_KEY=your_cohere_api_key
QDRANT_URL=your_qdrant_cloud_url
QDRANT_API_KEY=your_qdrant_api_key
POSTGRES_DB_URL=postgresql://user:password@host:port/dbname
REDIS_URL=rediss://default:password@host:port
LANGCHAIN_TRACING_V2=true
LANGCHAIN_API_KEY=your_langsmith_api_key
LANGCHAIN_PROJECT=Nexus-RAG-Enterprise
RETRIEVAL_SEARCH_MODE=hybrid
```

Run Backend:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Run Evaluation Suite

```bash
python evals/ingest_eval_docs.py
python -u evals/run_evals.py
```

### 4. Run Pytest Suite

```bash
python -m pytest Backend/tests
```

### 5. Frontend Setup

```bash
cd Frontend
npm install
npm run dev
# Open http://localhost:5173
```

---

## Project Structure

```
Nexus-RAG/
├── Backend/
│   ├── app/
│   │   ├── graph/          # LangGraph state machine, nodes & HITL interrupts
│   │   ├── ingestion/      # PDF loader, scanned PDF checks, parent-child chunking
│   │   ├── retrieval/      # Qdrant hybrid vector store (Dense + BM25 Sparse + RRF)
│   │   ├── cache/          # Multi-tenant scoped Redis semantic cache
│   │   ├── core/           # Embeddings, structured JSON logger, auth
│   │   ├── db/             # PostgreSQL models, CRUD, schemas
│   │   └── main.py         # FastAPI app, SSE & WebSocket streaming
│   └── tests/              # Pytest suite (isolation, cache, graph, pdf)
├── evals/
│   ├── golden_set.jsonl    # Ground truth evaluation dataset
│   ├── ingest_eval_docs.py # Sample PDF ingestion script
│   └── run_evals.py        # Automated evaluation harness
├── Frontend/
│   └── src/                # React 19 UI components & SSE hooks
├── EVALS.md                # Empirical evaluation benchmark results
└── README.md
```

---

## Author

**Meet Ramani**

[![GitHub](https://img.shields.io/badge/GitHub-MeetRamani28-181717?style=flat-square&logo=github)](https://github.com/MeetRamani28)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/meet-ramani-b48803292/)

---

## License

Distributed under the MIT License.
