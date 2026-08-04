from functools import lru_cache

from app.services.gemini_service import GeminiLayoutService
from app.validators.deterministic_validator import DeterministicLayoutValidator


@lru_cache
def get_layout_service() -> GeminiLayoutService:
    return GeminiLayoutService()


@lru_cache
def get_layout_validator() -> DeterministicLayoutValidator:
    return DeterministicLayoutValidator()
