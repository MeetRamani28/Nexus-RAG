<div align="center">

<img src="Frontend/public/logo.jpg" width="90" style="border-radius: 16px; box-shadow: 0 8px 32px rgba(225, 220, 201, 0.2);" />

# Nexus-RAG

### Enterprise-Grade Agentic Document Intelligence & RAG Platform

**Upload any PDF. Ask anything. Instant, high-precision document intelligence with verified source citations, hybrid vector search, and sub-5ms intent micro-caching.**

[![Live Demo](https://img.shields.io/badge/Live_Demo-nexus--rag--rose.vercel.app-6366f1?style=for-the-badge&logo=vercel&logoColor=white)](https://nexus-rag-rose.vercel.app/)
[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![LangGraph](https://img.shields.io/badge/LangGraph-FF6B35?style=for-the-badge&logo=langchain&logoColor=white)](https://langchain-ai.github.io/langgraph/)
[![Groq](https://img.shields.io/badge/Groq-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)
[![Qdrant](https://img.shields.io/badge/Qdrant-DC143C?style=for-the-badge&logo=qdrant&logoColor=white)](https://qdrant.tech/)

</div>

---

## 📸 Screenshots & UI Showcase

### 1. Document Intelligence with Verifiable Source Citations
> High-precision AI response grounded in document context with interactive expandable source drawer showing exact chunk snippets and page numbers.

![AI Response with Citations](Frontend/public/screenshots/04_ai_response.png)

---

### 2. Multi-Document Knowledge Base Management
> Centralized document repository displaying indexed PDFs, parent chunk counts, and Qdrant vector embeddings with 1-click detachment and deletion.

![Knowledge Base Management](Frontend/public/screenshots/05_knowledge_base.png)

---

### 3. Mobile-First Responsive Experience
> Touch-optimized mobile layout with resilient search input, visible conversation actions (rename & delete), and fluid drawer navigation.

| Mobile Chat Interface | Mobile Conversation History |
|:---------------------:|:---------------------------:|
| <img src="Frontend/public/screenshots/mobile_chat.jpeg" width="300" style="border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" /> | <img src="Frontend/public/screenshots/mobile_sidebar.jpeg" width="300" style="border-radius: 14px; box-shadow: 0 8px 30px rgba(0,0,0,0.5);" /> |

---

## ⚡ What Makes Nexus-RAG Unique?

### 🚀 1. Instant Intent Engine (<5ms TTFT)
Normal conversational queries (e.g. *"hello"*, *"what can you do"*, *"how are you"*) bypass heavy vector retrieval and external LLM APIs completely. An intelligent intent classifier streams instant, beautifully formatted markdown answers in sub-5ms, saving 99% in token costs and latency.

### 🎯 2. Sub-3s End-to-End Hybrid RAG Pipeline
For complex document queries, Nexus-RAG couples **HyDE query expansion** (accelerated to ~180ms via Llama-3.1-8B), **Qdrant dense + sparse BM25 retrieval**, and **Cohere Cross-Encoder Reranking** with real-time SSE token streaming from Groq (Llama 3.3 70B @ 280 tokens/sec). Full responses complete in **under 3 to 4 seconds**.

### 🔍 3. Verifiable Page-Level Citations
Every synthesized insight includes transparent source attribution badges. Clicking **`4 sources retrieved ⌵`** reveals the exact document passage, page number, and chunk similarity score.

### 🛡️ 4. Multi-Tenant Isolation & Clerk Authentication
User sessions and vector collections are strictly partitioned via Clerk User IDs and Qdrant payload filters (`user_id`, `doc_id`), guaranteeing zero cross-tenant data leakage.

### ✨ 5. Obsidian & Cream Slate Glassmorphism UI
Designed with a cohesive palette (`#000000`, `#1E1E24`, `#44444E`, `#E1DCC9`), interactive WebGL 3D logo, zero viewport scroll leakage, and edge-cached static distribution via Vercel.

---

## 🏗️ System Architecture

```
+-------------------------------------------------------------------------+
|                                USER QUERY                               |
+-----------------------------------+-------------------------------------+
                                    |
            +-----------------------v-----------------------+
            |  Instant Conversational Intent Engine (<5ms)  |  <-- Chit-Chat / Greetings / Capabilities
            +-----------------------+-----------------------+
                                    | General / Document Query
            +-----------------------v-----------------------+
            |      Redis Semantic Cache (nexus_cache:user)  |  <-- Cache HIT (>95% similarity)
            +-----------------------+-----------------------+
                                    | Cache MISS
         +--------------------------v---------------------------+
         |      LangGraph State Machine (Memory Checkpointer)   |
         |                                                      |
         |  [STEP 1: Fast HyDE Expansion (Llama-3.1-8B ~180ms)]  |
         |                            |                         |
         |  [STEP 2: Qdrant Hybrid Retrieval (Dense + BM25)]    |
         |                            |                         |
         |  [STEP 3: Cohere Reranking (Cross-Encoder v3)]       |
         |                            |                         |
         |  [STEP 4: HITL Web Search (DuckDuckGo RBAC Gate)]    |
         |                            |                         |
         |  [STEP 5: Groq LLM Synthesis (Llama-3.3-70B Stream)] |
         +--------------------------+---------------------------+
                                    |
                    +---------------v---------------+
                    |   FastAPI SSE Stream Engine   |
                    |   Live Telemetry (TTFT & Citations)
                    +---------------+---------------+
                                    |
                    +---------------v---------------+
                    |     React 19 Glassmorphic UI  |
                    +-------------------------------+
```

---

## 📊 Benchmark Evaluation Results

Evaluated over 35 ground-truth benchmark Q&A pairs across complex test documents (`evals/golden_set.jsonl`).

### Retrieval Ablation Comparison
| Search Mode | Hit-Rate@3 | Hit-Rate@5 | Hit-Rate@10 | MRR | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dense Only** | 100.0% | 100.0% | 100.0% | 0.8286 | Cohere `embed-english-v3.0` |
| **Sparse BM25 Only** | 100.0% | 100.0% | 100.0% | 0.9429 | FastEmbed `Qdrant/bm25` |
| **Hybrid (RRF)** | **100.0%** | **100.0%** | **100.0%** | **0.8571** | Dense + Sparse + Reciprocal Rank Fusion |

### End-to-End Quality & Caching Metrics
- **LLM-as-a-Judge Answer Relevance**: **0.97 / 1.0**
- **LLM-as-a-Judge Faithfulness**: **0.735 / 1.0**
- **Semantic Cache Hit Rate**: **100.0%**
- **Instant Intent TTFT**: **< 5ms**
- **Average Document RAG TTFT**: **~1,100ms**

---

## 🛠️ Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| **React 19 + TypeScript** | Component state management & UI orchestration |
| **Vite 8** | High-performance bundling & lightning HMR |
| **Tailwind CSS v4** | Utility-first obsidian slate styling |
| **Three.js** | Custom WebGL interactive 3D logo |
| **Clerk Auth** | Enterprise authentication and multi-tenant user identity |
| **ReactMarkdown + KaTeX** | Rich Markdown text, math, tables & code rendering |
| **Vercel** | Edge CDN deployment with 1-year immutable caching |

### Backend
| Technology | Purpose |
|---|---|
| **FastAPI** | High-throughput async REST API + Server-Sent Events (SSE) |
| **LangGraph** | Multi-agent state machine with state checkpointer |
| **Qdrant Cloud** | Vector database with named dense + sparse vectors & payload isolation |
| **Cohere Rerank v3** | Cross-encoder contextual reranker |
| **Groq Cloud** | High-speed LLM inference (Llama 3.3 70B & Llama 3.1 8B) |
| **FastEmbed** | Client-side sparse BM25 vector generation |
| **Redis** | Multi-tenant scoped semantic cache |
| **PostgreSQL + SQLAlchemy** | Persistent metadata, chat histories & parent chunk store |

---

## 🚀 Getting Started

### Prerequisites
- **Python** 3.10+
- **Node.js** v18+
- API Keys: [Groq](https://console.groq.com/) | [Cohere](https://cohere.com/) | [Clerk](https://clerk.com/) | [Qdrant](https://qdrant.tech/)

### 1. Clone Repository

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
RETRIEVAL_SEARCH_MODE=hybrid
HYDE_ENABLED=true
```

Run Backend Server:
```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd ../Frontend
npm install
npm run dev
# Access http://localhost:5173
```

---

## 📁 Repository Structure

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
│   │   ├── intent_engine.py# Sub-5ms Instant Intent & Conversational Engine
│   │   └── main.py         # FastAPI app, SSE token streaming & API routes
│   └── tests/              # Pytest suite (isolation, cache, graph, pdf)
├── evals/
│   ├── golden_set.jsonl    # Ground truth evaluation dataset
│   ├── ingest_eval_docs.py # Sample PDF ingestion script
│   └── run_evals.py        # Automated evaluation harness
├── Frontend/
│   ├── public/screenshots/ # High-resolution UI showcase images
│   └── src/                # React 19 UI components & SSE hooks
├── EVALS.md                # Empirical evaluation benchmark results
└── README.md
```

---

## 👨‍💻 Author

**Meet Ramani**

[![GitHub](https://img.shields.io/badge/GitHub-MeetRamani28-181717?style=flat-square&logo=github)](https://github.com/MeetRamani28)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0A66C2?style=flat-square&logo=linkedin)](https://www.linkedin.com/in/meet-ramani-b48803292/)

---

## 📜 License

Distributed under the MIT License.
