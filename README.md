<div align="center">

<img src="Frontend/public/logo.jpg" width="90" style="border-radius: 16px;" />

# Nexus-RAG

### Agentic Document Intelligence Engine

**Upload any PDF. Ask anything. Get cited, real-time AI answers.**

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
> Watch the 4-agent RAG pipeline execute in real-time: Vector Search -> Reranking -> Web Fallback -> Synthesis.

![Agent Processing](Frontend/public/screenshots/03_agent_processing.png)

---

### AI Response - Rich Markdown with Citations
> Responses include structured markdown (tables, bold, bullet points) with source citation badges.

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
               |  Cosine Similarity >= 95%|
               +------------+-------------+
                     Cache MISS
                            |
          +-----------------v----------------------------------------+
          |              LangGraph Orchestrator                       |
          |                                                           |
          |  [AGENT 1: Retrieve]  -->  [AGENT 2: Cohere Rerank v3]   |
          |       (Qdrant)                  (Cross-Encoder)           |
          |                                        |                  |
          |  [AGENT 3: Web Search]  -->  [AGENT 4: Generate (Groq)]  |
          |    (DuckDuckGo)                  (Llama 3.3 70B)         |
          +----------------------------------------------------------+
                                       |
                        +--------------v--------------+
                        |  SSE Token Streaming        |
                        |  React Frontend + Citations  |
                        +-----------------------------+
```

---

## Key Features

### Intelligent RAG Pipeline
- **Parent-Child Chunking** - Large parent chunks (2000 chars) for rich LLM context + small child chunks (400 chars) for high-precision vector search
- **HyDE (Hypothetical Document Embedding)** - LLM generates a hypothetical answer first, then retrieves by its embedding for improved recall
- **Cohere Rerank v3** - Cross-encoder re-scoring after vector retrieval to eliminate noisy context before synthesis
- **Web Search Fallback** - DuckDuckGo agent activates automatically when document context is insufficient
- **Semantic Cache** - Repeated queries bypass the LLM entirely (Redis with in-memory fallback) - saves tokens, responds instantly

### Real-time Streaming
- **Server-Sent Events (SSE)** - Token-by-token response streaming from Groq
- **Live agent step indicators** - Users see "Vector Search -> Reranking -> Synthesizing..." in real-time
- **Reasoning block rendering** - DeepSeek model chain-of-thought displayed as styled blockquotes

### Full Chat Experience
- **Persistent conversations** backed by PostgreSQL - chat history survives reloads
- **Multi-conversation support** - multiple threads like ChatGPT, with rename and delete
- **Source citation badges** - click to expand the exact retrieved chunk from the document
- **Export to Markdown** - download full conversation as .md file
- **Model selector** - switch between Groq models mid-chat
- **Duplicate detection** - MD5 hash check prevents re-processing the same PDF

### Auth and Security
- **Clerk JWT authentication** - Google / Email signup
- **Per-user data isolation** - no cross-user data access
- **Rate limiting** - 30 queries/min per user via SlowAPI

### UI and UX
- **Fully responsive** - mobile and desktop
- **Dark premium design** - Zinc palette
- **Cold-start loading screen** - graceful handling of Render free-tier spin-up
- **Skeleton loaders** for conversation list

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
| FastAPI | REST API + SSE streaming |
| LangGraph | Multi-agent state machine orchestration |
| LangChain | LLM chains and prompt engineering |
| Groq API (Llama 3.3 70B) | Ultra-fast LLM inference |
| Cohere Rerank v3 | Cross-encoder re-ranking |
| Qdrant | Vector database for semantic search |
| FastEmbed (all-MiniLM-L6-v2) | Local embedding model |
| PostgreSQL + SQLAlchemy | Conversations and document metadata |
| Redis + InMemory fallback | Semantic response caching |
| SlowAPI | Rate limiting |
| DuckDuckGo Search | Live web context fallback |
| **Render** | Backend hosting |

---

## Getting Started

### Prerequisites
- **Python** 3.10+
- **Node.js** v18+
- API Keys: [Groq](https://console.groq.com/) | [Cohere](https://cohere.com/) | [Clerk](https://clerk.com/)

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

pip install -r requirements.txt
```

Create `Backend/.env`:
```env
GROQ_API_KEY=your_groq_api_key
COHERE_API_KEY=your_cohere_api_key
DATABASE_URL=postgresql://user:password@host:port/dbname
CLERK_SECRET_KEY=your_clerk_secret_key
REDIS_URL=redis://localhost:6379/0
```

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

### 3. Frontend Setup

```bash
cd Frontend
npm install
```

Create `Frontend/.env`:
```env
VITE_API_BASE_URL=http://localhost:8000
VITE_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
```

```bash
npm run dev
# Open http://localhost:5173
```

---

## Project Structure

```
Nexus-RAG/
├── Backend/
│   └── app/
│       ├── graph/          # LangGraph state machine and agent nodes
│       ├── ingestion/      # PDF loader and parent-child chunking
│       ├── retrieval/      # Qdrant vector store and Cohere reranker
│       ├── cache/          # Semantic cache (Redis + in-memory fallback)
│       ├── core/           # Embeddings, config, auth
│       ├── db/             # PostgreSQL models, CRUD, schemas
│       └── main.py         # FastAPI app, SSE endpoints
├── Frontend/
│   └── src/
│       ├── components/     # ChatInterface, Sidebar, CitationBadge, ...
│       ├── App.tsx         # Root layout, auth, routing
│       └── index.css       # Tailwind + typography plugin
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
