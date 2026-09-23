import logging
import json
import sys
import time
from typing import Optional, Dict, Any

class JSONFormatter(logging.Formatter):
    """
    Structured JSON log formatter for enterprise log aggregators (Datadog, CloudWatch, ELK).
    """

    def format(self, record: logging.LogRecord) -> str:
        log_obj: Dict[str, Any] = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(record.created)),
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
            "component": getattr(record, "component", "Nexus-RAG"),
            "request_id": getattr(record, "request_id", None),
            "user_id": getattr(record, "user_id", None),
        }

        if record.exc_info:
            log_obj["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_obj)


def setup_logger(name: str = "nexus_rag") -> logging.Logger:
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter())
        logger.addHandler(handler)

    logger.propagate = False
    return logger

logger = setup_logger()

def get_logger(component: str = "Nexus-RAG") -> logging.Logger:
    return logging.getLogger("nexus_rag")
