import os
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from app.llm_manager import get_active_llm_model_name

class HyDEEngine:
    """
    Hypothetical Document Embeddings (HyDE) Engine.
    Generates a hypothetical document snippet for a user query before vector search,
    bridging the semantic gap between questions and dense text chunks.
    """

    def __init__(self):
        self.enabled = os.getenv("HYDE_ENABLED", "false").strip().lower() in ["true", "1", "yes"]

    def generate_hypothetical_document(self, query: str) -> str:
        """
        Generates a 2-3 sentence hypothetical answer passage for the given query.
        Falls back gracefully to the original query if HyDE is disabled or fails.
        """
        if not self.enabled:
            return query

        # Fast path: concise queries match dense vectors directly; save LLM round-trip
        if len(query.strip().split()) <= 8:
            return query

        groq_api_key = os.getenv("GROQ_API_KEY", "")
        if not groq_api_key:
            return query

        # Use fast working model for query expansion
        hyde_model = "openai/gpt-oss-20b"

        prompt = ChatPromptTemplate.from_messages([
            ("system", "Write a concise 2-sentence hypothetical document snippet that answers this question. Output ONLY the factual text."),
            ("human", "{question}")
        ])

        try:
            llm = ChatGroq(
                temperature=0.2,
                model_name=hyde_model,
                groq_api_key=groq_api_key,
                max_tokens=60,
                timeout=2.0,
            )
            chain = prompt | llm
            response = chain.invoke({"question": query})
            hypothetical_passage = str(response.content).strip()
            
            if hypothetical_passage and len(hypothetical_passage) > 20:
                print(f"[HyDE Expansion]: Generated hypothetical passage for query: '{query[:40]}...'")
                return hypothetical_passage
            
            return query

        except Exception as e:
            print(f"[HyDE Warning]: Failed to generate hypothetical document ({e}). Falling back to raw query.")
            return query
