class GeminiServiceError(Exception):
    """Base error for Gemini integration issues."""


class GeminiInvalidJSONError(GeminiServiceError):
    """Raised when Gemini output is not valid JSON."""


class GeminiSchemaValidationError(GeminiServiceError):
    """Raised when parsed JSON does not satisfy Pydantic schema."""


class DeterministicValidationError(Exception):
    """Raised when deterministic validation rejects a layout."""
