import os
import requests
from typing import List, Optional

_active_model_cache: Optional[str] = None

# Priority ranking for text generation models on Groq
PREFERRED_MODEL_PRIORITY: List[str] = [
    "llama-3.3-70b-versatile",
    "qwen/qwen3.8-27b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-120b",
    "groq/compound",
    "llama-3.1-70b-versatile",
    "mixtral-8x7b-32768",
    "llama3-70b-8192"
]

# Keywords to exclude non-chat/audio/guardrail models
EXCLUDE_KEYWORDS: List[str] = [
    "whisper",
    "guard",
    "safeguard",
    "orpheus",
    "allam"
]

def fetch_active_groq_models(groq_api_key: str) -> List[str]:
    """Fetches list of active model IDs from Groq API."""
    if not groq_api_key:
        return []

    try:
        url = "https://api.groq.com/openai/v1/models"
        headers = {"Authorization": f"Bearer {groq_api_key}"}
        response = requests.get(url, headers=headers, timeout=5.0)
        
        if response.status_code == 200:
            data = response.json().get("data", [])
            active_ids = [
                m["id"] for m in data 
                if m.get("active", True) and not any(ex in m["id"].lower() for ex in EXCLUDE_KEYWORDS)
            ]
            return active_ids
    except Exception as e:
        print(f"[LLM Manager Warning]: Failed to fetch models from Groq API ({e})")
    
    return []


def get_active_llm_model_name() -> str:
    """
    Dynamically finds and returns the best active text generation model on Groq.
    Uses environment override LLM_MODEL_NAME if specified, otherwise queries Groq API.
    """
    global _active_model_cache
    if _active_model_cache:
        return _active_model_cache

    env_override = os.getenv("LLM_MODEL_NAME", "").strip()
    groq_api_key = os.getenv("GROQ_API_KEY", "").strip()

    available_models = fetch_active_groq_models(groq_api_key)

    # 1. If env override is specified and available, use it
    if env_override and (not available_models or env_override in available_models):
        _active_model_cache = env_override
        print(f"[LLM Manager]: Using configured LLM_MODEL_NAME: '{_active_model_cache}'")
        return _active_model_cache

    # 2. Match against priority list
    for model_id in PREFERRED_MODEL_PRIORITY:
        if model_id in available_models:
            _active_model_cache = model_id
            print(f"[LLM Manager]: Dynamically resolved best active Groq model: '{_active_model_cache}'")
            return _active_model_cache

    # 3. If any text model is available, use the first one
    if available_models:
        _active_model_cache = available_models[0]
        print(f"[LLM Manager]: Fallback to available Groq model: '{_active_model_cache}'")
        return _active_model_cache

    # 4. Ultimate fallback default
    fallback = env_override or "qwen/qwen3.8-27b"
    _active_model_cache = fallback
    print(f"[LLM Manager]: Default fallback model: '{_active_model_cache}'")
    return _active_model_cache
