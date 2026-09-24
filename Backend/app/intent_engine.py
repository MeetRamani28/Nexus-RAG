"""
Instant Intent & Conversational Engine for Nexus-RAG.
Handles small talk, greetings, well-being inquiries, and system capability questions
in sub-10ms without invoking heavy vector retrieval or external LLM API calls.
"""

import re
from typing import Optional


CAPABILITIES_RESPONSE = """I am **Nexus-RAG**, an Enterprise Document Intelligence & Research Assistant powered by hybrid vector search, Cohere reranking, and high-speed LLMs.

### 🌟 What I can do for you:
- 📄 **Deep Document Intelligence**: Upload single or multiple PDF documents (contracts, financial reports, research papers, study notes) and ask complex questions.
- 🎯 **Source-Grounded Answers**: Every insight is retrieved from your uploaded files and backed by verifiable source citations with page numbers.
- ⚡ **Instant Semantic Caching**: Frequently asked questions are served in milliseconds via Redis-powered semantic caching.
- 💡 **General AI Analysis**: Ask general knowledge questions, request summaries, analyze data, or draft content directly.

To get started, simply **upload or attach a PDF** using the button below, or ask any question directly!"""

GREETING_RESPONSE = """Hello! 👋 Welcome to **Nexus-RAG**.

I am your Enterprise Document Intelligence Assistant. You can ask me any general question, or attach a PDF to analyze documents with high-precision vector search and verified source citations.

How can I assist you today?"""

WELLBEING_RESPONSE = """I'm running at peak performance and ready to assist! 🚀

Whether you need to analyze a document, extract key data, or brainstorm solutions, I'm here to help. What would you like to work on today?"""

GRATITUDE_RESPONSE = """You're very welcome! 😊 Feel free to ask if you have more questions or need further analysis on your documents."""

FAREWELL_RESPONSE = """Goodbye! Have a productive day ahead. Whenever you have documents to analyze, Nexus-RAG is right here for you. 👋"""


def get_instant_conversational_response(question: str) -> Optional[str]:
    """
    Evaluates whether a user query is a greeting, small-talk, or capability inquiry.
    If so, returns a pre-formatted, production-grade response instantly (sub-5ms).
    Returns None if the query contains actual analytical or document-related questions.
    """
    q = question.strip().lower()
    if not q:
        return None

    # Normalize punctuation and extra spaces
    q_clean = re.sub(r"[^\w\s]", " ", q)
    q_clean = re.sub(r"\s+", " ", q_clean).strip()

    # 1. Capabilities / "what you do" / "who are you" / "what can you do"
    capabilities_patterns = [
        r"^(what\s+you\s+do|what\s+do\s+you\s+do|what\s+can\s+you\s+do|what\s+are\s+you\s+able\s+to\s+do|what\s+are\s+your\s+capabilities|what\s+is\s+your\s+purpose|who\s+are\s+you|what\s+is\s+nexus\s*rag|tell\s+me\s+about\s+yourself|help|how\s+do\s+you\s+work)$",
        r"^(hello|hi|hey|hy)\s+(what\s+you\s+do|what\s+do\s+you\s+do|what\s+can\s+you\s+do|who\s+are\s+you|tell\s+me\s+about\s+yourself)$",
        r"^(what\s+you\s+do|what\s+do\s+you\s+do|what\s+can\s+you\s+do)\s+(hello|hi|hey)$"
    ]
    for pat in capabilities_patterns:
        if re.search(pat, q_clean):
            return CAPABILITIES_RESPONSE

    # 2. Well-being / "how are you" / "how r u"
    wellbeing_patterns = [
        r"^(how\s+are\s+you|how\s+r\s+u|how\s+are\s+you\s+doing|how\s+is\s+it\s+going|hows\s+it\s+going|are\s+you\s+ok|how\s+do\s+you\s+feel)$",
        r"^(hello|hi|hey|hy)\s+(how\s+are\s+you|how\s+r\s+u|how\s+are\s+you\s+doing|how\s+is\s+it\s+going)$",
        r"^(how\s+are\s+you|how\s+r\s+u)\s+(hello|hi|hey)$"
    ]
    for pat in wellbeing_patterns:
        if re.search(pat, q_clean):
            return WELLBEING_RESPONSE

    # 3. Standard greetings (hello, hi, hey, greetings, good morning/evening, etc.)
    greeting_patterns = [
        r"^(h+i+|h+e+y+|h+y+|h+e+l+l+o+|hola|namaste|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|sup|yo+)$"
    ]
    for pat in greeting_patterns:
        if re.search(pat, q_clean):
            return GREETING_RESPONSE

    # 4. Gratitude
    gratitude_patterns = [
        r"^(thanks|thank\s+you|thank\s+you\s+so\s+much|thx|ty|great\s+thanks|awesome\s+thanks)$"
    ]
    for pat in gratitude_patterns:
        if re.search(pat, q_clean):
            return GRATITUDE_RESPONSE

    # 5. Farewell
    farewell_patterns = [
        r"^(bye|goodbye|see\s+you|cya|take\s+care)$"
    ]
    for pat in farewell_patterns:
        if re.search(pat, q_clean):
            return FAREWELL_RESPONSE

    return None
