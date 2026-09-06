import os
import sys
import json
import time
from typing import List, Dict, Any

# Add Backend root directory to sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.retrieval.factory import get_vector_store
from app.retrieval.reranker import RerankEngine


def compute_precision_at_k(retrieved_docs: List[Any], ground_truth_keywords: List[str], k: int) -> float:
    """
    Precision@K = (Relevant retrieved documents in top K) / K
    A document is deemed relevant if its content contains at least one ground-truth keyword.
    """
    top_k_docs = retrieved_docs[:k]
    if not top_k_docs:
        return 0.0

    relevant_count = 0
    for doc in top_k_docs:
        content = doc.page_content.lower()
        if any(kw.lower() in content for kw in ground_truth_keywords):
            relevant_count += 1

    return relevant_count / float(k)


def compute_recall_at_k(retrieved_docs: List[Any], ground_truth_keywords: List[str], k: int) -> float:
    """
    Recall@K = (Ground truth keywords found in top K documents) / (Total ground truth keywords)
    """
    top_k_docs = retrieved_docs[:k]
    if not top_k_docs or not ground_truth_keywords:
        return 0.0

    combined_text = " ".join([doc.page_content.lower() for doc in top_k_docs])
    found_keywords = sum(1 for kw in ground_truth_keywords if kw.lower() in combined_text)

    return found_keywords / float(len(ground_truth_keywords))


def run_evaluation():
    dataset_path = os.path.join(os.path.dirname(__file__), "dataset.json")
    if not os.path.exists(dataset_path):
        print(f"[Error]: Dataset file not found at {dataset_path}")
        return

    with open(dataset_path, "r", encoding="utf-8") as f:
        dataset = json.load(f)

    print("=" * 75)
    print(" [BENCHMARK] Nexus-RAG Retrieval Evaluation Benchmark")
    print("=" * 75)
    provider = os.getenv("VECTOR_STORE_PROVIDER", "qdrant")
    print(f"Vector Store Provider : {provider.upper()}")
    print(f"Total Test Queries    : {len(dataset)}")
    print("=" * 75)

    vector_store = get_vector_store()
    reranker = RerankEngine(top_n=5)

    k_values = [1, 3, 5]
    metrics = {f"P@{k}": [] for k in k_values}
    metrics.update({f"R@{k}": [] for k in k_values})
    latency_list = []

    for idx, item in enumerate(dataset, 1):
        query = item["query"]
        ground_truth_keywords = item["ground_truth_keywords"]

        start_time = time.time()
        # 1. Vector Store Search
        retrieved_parents = vector_store.search_child_and_fetch_parents(query, top_k=10)
        # 2. Rerank
        reranked_docs = reranker.rerank_documents(query, retrieved_parents) if retrieved_parents else []
        latency = time.time() - start_time
        latency_list.append(latency)

        eval_docs = reranked_docs if reranked_docs else retrieved_parents

        # Compute metrics for each K
        query_metrics = {}
        for k in k_values:
            p_k = compute_precision_at_k(eval_docs, ground_truth_keywords, k)
            r_k = compute_recall_at_k(eval_docs, ground_truth_keywords, k)
            metrics[f"P@{k}"].append(p_k)
            metrics[f"R@{k}"].append(r_k)
            query_metrics[f"P@{k}"] = p_k
            query_metrics[f"R@{k}"] = r_k

        print(f"[{idx:02d}/{len(dataset)}] Query: '{query[:45]}...' | P@3: {query_metrics['P@3']:.2f} | R@3: {query_metrics['R@3']:.2f} | Latency: {latency*1000:.1f}ms")

    avg_latency = sum(latency_list) / len(latency_list) if latency_list else 0.0

    print("\n" + "=" * 75)
    print(" [SUMMARY] EVALUATION SUMMARY BENCHMARK RESULTS")
    print("=" * 75)
    print(f"{'Metric':<15} | {'Score':<10}")
    print("-" * 30)

    for k in k_values:
        mean_p = sum(metrics[f"P@{k}"]) / len(metrics[f"P@{k}"])
        mean_r = sum(metrics[f"R@{k}"]) / len(metrics[f"R@{k}"])
        print(f"Precision@{k:<6} | {mean_p:.4f}")
        print(f"Recall@{k:<9} | {mean_r:.4f}")

    print("-" * 30)
    print(f"Mean Latency    | {avg_latency*1000:.2f} ms")
    print("=" * 75)


if __name__ == "__main__":
    run_evaluation()
