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


@dataclass
class DXFInvalidLayerError(DXFExportError):
    """Raised when a DXF layer reference is invalid or not found.

    Attributes:
        message: Human-readable description inherited from DXFExportError.
        layer_name: Name of the invalid/missing DXF layer.
        reason: Why the layer is invalid ('missing', 'reserved', 'duplicated', etc.).
    """
    message: str = ""
    layer_name: str = ""
    reason: str = ""

    def __str__(self) -> str:
        base = super().__str__()
        if self.layer_name:
            return f"{base} [layer={self.layer_name!r}, reason={self.reason!r}]"
        return base


@dataclass
class DXFEmptyDocumentError(DXFExportError):
    """Raised when a DXF export produces an empty document (no valid entities).

    Attributes:
        message: Inherited from DXFExportError.
        failed_entities: Inherited; typically [] for this error.
        expected_count: Total entities the exporter attempted before declaring empty.
    """
    message: str = ""
    failed_entities: list[str] = field(default_factory=list)
    expected_count: int = 0

    def __str__(self) -> str:
        base = super().__str__()
        return f"{base} [expected={self.expected_count}]"
