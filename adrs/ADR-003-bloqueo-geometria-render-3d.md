# ADR-003: Bloqueo de geometria en render 3D para fidelidad 2D->3D

## Estado
Aceptado

## Contexto
ViPromt define el plano tecnico 2D como fuente de verdad del proyecto aprobado.
La etapa 3D debe visualizar materiales y atmosfera sin alterar la estructura espacial validada.

## Decision
Se bloquea toda modificacion geometrica en la fase de render 3D.
El generador de prompts 3D solo puede tomar la geometria final aprobada en 2D y permite cambios de estilo, materiales, iluminacion y acabados.

## Justificacion
- Evita inconsistencias entre plano tecnico y visualizacion conceptual.
- Preserva cumplimiento normativo validado previamente.
- Reduce retrabajo por divergencias entre diseno tecnico y render.

## Consecuencias
- El usuario no podra pedir cambios de distribucion en la fase 3D.
- Cambios estructurales requeriran volver a fase de iteracion tecnica 2D.
- Se requiere trazabilidad estricta entre version de plano y version de render.

## Trade-offs
- Menor flexibilidad creativa en render a cambio de mayor fidelidad tecnica.
