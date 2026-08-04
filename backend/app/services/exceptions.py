"""Domain exceptions for VIPROMT services.

Centraliza las excepciones de dominio reutilizables por los servicios
(DXFExporter, layout_optimizer, etc.). Estas excepciones representan
fallos de negocio detectados por la capa determinista y deben propagarse
hacia los endpoints con una estructura consistente.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class DXFExportError(Exception):
    """Raised when a DXF export cannot be completed.

    Attributes:
        message: Human-readable description of the failure.
        failed_entities: IDs/kinds of entities that could not be exported
            (e.g. ``["furniture:f1", "wall:m2"]``). Useful for diagnostics
            and structured logging by the API layer.
    """

    message: str
    failed_entities: list[str] = field(default_factory=list)

    def __post_init__(self) -> None:
        # ``Exception`` expects a single string arg; expose the message so
        # ``str(exc)`` and traceback rendering remain informative.
        super().__init__(self.message)

    def __str__(self) -> str:
        if self.failed_entities:
            return f"{self.message} (failed: {', '.join(self.failed_entities)})"
        return self.message
