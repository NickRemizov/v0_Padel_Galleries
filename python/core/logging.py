"""
Centralized logging configuration.
Provides consistent logging format across the application.
"""

import logging
import sys
from typing import Optional
from datetime import datetime


class ColoredFormatter(logging.Formatter):
    """
    Colored log formatter for console output.
    """
    
    COLORS = {
        'DEBUG': '\033[36m',     # Cyan
        'INFO': '\033[32m',      # Green
        'WARNING': '\033[33m',   # Yellow
        'ERROR': '\033[31m',     # Red
        'CRITICAL': '\033[35m',  # Magenta
    }
    RESET = '\033[0m'
    
    def format(self, record: logging.LogRecord) -> str:
        # Add color to level name
        color = self.COLORS.get(record.levelname, '')
        record.levelname = f"{color}{record.levelname}{self.RESET}"
        return super().format(record)


def setup_logging(
    level: str = "INFO",
    format_string: Optional[str] = None,
    use_colors: bool = True
) -> None:
    """
    Configure application logging.
    
    Args:
        level: Logging level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
        format_string: Custom format string (optional)
        use_colors: Whether to use colored output
    """
    if format_string is None:
        format_string = "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    
    # Create handler
    handler = logging.StreamHandler(sys.stdout)
    
    # Use colored formatter if requested
    if use_colors:
        formatter = ColoredFormatter(format_string, datefmt="%H:%M:%S")
    else:
        formatter = logging.Formatter(format_string, datefmt="%H:%M:%S")
    
    handler.setFormatter(formatter)
    
    # Configure root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, level.upper()))
    root_logger.handlers = [handler]
    
    # Suppress noisy loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("hpack").setLevel(logging.WARNING)


def get_logger(name: str) -> logging.Logger:
    """
    Get a logger instance with the given name.
    
    Usage:
        from core.logging import get_logger
        logger = get_logger(__name__)
        logger.info("Something happened")
    """
    return logging.getLogger(name)


# === Structured logging helpers ===

class LogContext:
    """
    Context manager for adding context to log messages.
    
    Usage:
        with LogContext(logger, request_id="123", user_id="456"):
            logger.info("Processing request")  # Will include context
    """
    
    def __init__(self, logger: logging.Logger, **context):
        self.logger = logger
        self.context = context
        self.old_factory = None
    
    def __enter__(self):
        self.old_factory = logging.getLogRecordFactory()
        context = self.context
        
        def factory(*args, **kwargs):
            record = self.old_factory(*args, **kwargs)
            for key, value in context.items():
                setattr(record, key, value)
            return record
        
        logging.setLogRecordFactory(factory)
        return self
    
    def __exit__(self, *args):
        logging.setLogRecordFactory(self.old_factory)


# === Log event helpers ===

def log_request(logger: logging.Logger, method: str, path: str, **kwargs):
    """Log an incoming request."""
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items())
    logger.info(f"→ {method} {path} {extra}".strip())


def log_response(logger: logging.Logger, status: int, duration_ms: float, **kwargs):
    """Log an outgoing response."""
    extra = " ".join(f"{k}={v}" for k, v in kwargs.items())
    logger.info(f"← {status} ({duration_ms:.1f}ms) {extra}".strip())


def log_db_query(logger: logging.Logger, operation: str, table: str, duration_ms: float):
    """Log a database query."""
    logger.debug(f"DB {operation} on {table} ({duration_ms:.1f}ms)")


def log_error(logger: logging.Logger, error: Exception, context: str = None):
    """Log an error with optional context."""
    msg = f"{type(error).__name__}: {error}"
    if context:
        msg = f"[{context}] {msg}"
    logger.error(msg, exc_info=True)
