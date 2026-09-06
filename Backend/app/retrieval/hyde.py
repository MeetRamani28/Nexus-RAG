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
        self.enabled = os.getenv("HYDE_ENABLED", "true").strip().lower() in ["true", "1", "yes"]

    def generate_hypothetical_document(self, query: str) -> str:
        """
        Generates a 2-3 sentence hypothetical answer passage for the given query.
        Falls back gracefully to the original query if HyDE is disabled or fails.
        """
        if not self.enabled:
            return query

        groq_api_key = os.getenv("GROQ_API_KEY", "")
        if not groq_api_key:
            return query

        active_model = get_active_llm_model_name()

        prompt = ChatPromptTemplate.from_messages([
            ("system", "You are a specialized RAG Query Expansion Assistant.\n"
                       "Write a concise, plausible 2-3 sentence hypothetical passage that answers the user's question.\n"
                       "Do not write any introductory text, markdown headers, or explanations. Output ONLY the hypothetical document text."),
            ("human", "{question}")
        ])

        try:
            llm = ChatGroq(
                temperature=0.3,
                model_name=active_model,
                groq_api_key=groq_api_key
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
