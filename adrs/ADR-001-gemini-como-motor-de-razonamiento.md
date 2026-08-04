# ADR-001: Gemini como motor de razonamiento separado del motor matematico

## Estado
Aceptado

## Contexto
ViPromt requiere interpretar prompts de usuario y bocetos/imagenes para proponer distribuciones arquitectonicas y MEP.
Las tareas multimodales de comprension y propuesta son probabilisticas y no deben mezclarse con validaciones deterministas de cumplimiento tecnico.

## Decision
Se adopta Gemini como motor de razonamiento multimodal para generar propuestas estructuradas en JSON.
La salida de Gemini se considera propuesta inicial y siempre pasa por validacion de contrato y reglas deterministicas antes de aprobarse.

## Justificacion
- Gemini aporta alta capacidad para interpretar lenguaje natural e imagenes de entrada.
- La separacion de responsabilidades reduce riesgo de errores silenciosos.
- Permite evolucionar prompts/modelos sin romper el subsistema de validacion tecnica.

## Consecuencias
- Se mantiene trazabilidad por version de modelo y prompt.
- Se requiere manejo robusto de errores de formato/contrato en backend.
- El sistema puede cambiar de proveedor LLM sin redisenar el motor de validacion.

## Trade-offs
- Mayor complejidad inicial por pipeline de doble etapa (propuesta + validacion).
- Incremento de latencia frente a una unica llamada de IA sin controles.
