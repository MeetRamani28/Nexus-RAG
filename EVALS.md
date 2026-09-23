# Nexus-RAG Benchmark Evaluation Results

## System Evaluation & Retrieval Ablation Benchmark
Date: 2026-09-23 23:28:13
Dataset: `Backend/evals/golden_set.jsonl` (35 ground-truth benchmark Q&A pairs)

### 1. Retrieval Ablation Comparison (Dense vs Sparse BM25 vs Hybrid RRF)
| Search Mode | Hit-Rate@3 | Hit-Rate@5 | Hit-Rate@10 | MRR | Description |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Dense Only** | 71.43% | 82.86% | 100.0% | 0.7562 | Cohere `embed-english-v3.0` |
| **Sparse BM25 Only** | 88.57% | 100.0% | 100.0% | 0.9086 | FastEmbed `Qdrant/bm25` |
| **Hybrid (RRF)** | **82.86%** | **100.0%** | **100.0%** | **0.8181** | Dense + Sparse + Reciprocal Rank Fusion |

### 2. End-to-End LLM-as-a-Judge Metrics (Groq Model)
| Metric | Score (0.0 - 1.0) | Description |
| :--- | :--- | :--- |
| **Faithfulness** | 0.49 | Groundedness in retrieved PDF context |
| **Answer Relevance** | 0.67 | Directness & accuracy vs expected ground truth |

### 3. Latency & Caching Performance
| Metric | Score | Unit |
| :--- | :--- | :--- |
| **Latency p50** | 14315.47 | ms |
| **Latency p95** | 15948.77 | ms |
| **Semantic Cache Hit Rate** | 100.0% | Exact / High Cosine Similarity Hits |

---
*Generated automatically by `Backend/evals/run_evals.py`*
