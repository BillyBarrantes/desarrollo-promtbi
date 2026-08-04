# AGENTS.md - Instrucciones Generales

Este repositorio combina un frontend Next.js y un backend FastAPI. Los agentes deben:
- Respetar las ADRs (`/adrs/ADR-001`, `ADR-002`, `ADR-003`).
- Mantener la separación estricta entre la lógica estocástica (Gemini) y la validación determinista (Python).
- Generar siempre respuestas limpias y estructuradas en Markdown/JSON.
