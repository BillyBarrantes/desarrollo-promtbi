# KPIS Base - ViPromt (Fase 0)

## 1) Latencia fin-a-fin por propuesta tecnica
- Definicion: tiempo total desde recepcion de input (texto + imagen) hasta respuesta JSON validada por el gate determinista.
- Formula: `latencia_ms = t_respuesta_validada - t_recepcion_request`
- Objetivo inicial (SLO):
  - p50 <= 7000 ms
  - p95 <= 15000 ms
- Fuente de medicion: logs estructurados de backend por `request_id`.
- Frecuencia de revision: semanal.

## 2) Costo estimado por propuesta
- Definicion: costo promedio de una propuesta tecnica completa (tokens/modelo + servicios asociados de IA).
- Formula: `costo_promedio_usd = sum(costo_request_usd) / total_propuestas`
- Objetivo inicial: <= 0.12 USD por propuesta tecnica en entorno dev/staging.
- Umbral de alerta: > 0.20 USD por propuesta (promedio movil de 50 requests).
- Fuente de medicion: metadatos de consumo por request + dashboard financiero.
- Frecuencia de revision: diaria.

## 3) Porcentaje de rechazo normativo
- Definicion: porcentaje de propuestas que el gate determinista marca como `rechazado` por incumplimiento RNE/fisico.
- Formula: `%rechazo_normativo = (propuestas_rechazadas / propuestas_totales) * 100`
- Objetivo operativo inicial: 15% - 40% (esperado en fase temprana por filtrado estricto).
- Umbral de alerta:
  - < 10%: posible validacion laxa.
  - > 50%: posible degradacion de prompts/modelo o reglas excesivas.
- Fuente de medicion: tabla de resultados de validacion por version.
- Frecuencia de revision: semanal.

## 4) Porcentaje de retrabajo
- Definicion: porcentaje de proyectos que requieren 2 o mas iteraciones adicionales por inconsistencias tecnicas detectadas tras la primera propuesta aprobada.
- Formula: `%retrabajo = (proyectos_con_retrabajo / proyectos_totales) * 100`
- Objetivo inicial: <= 25%.
- Umbral de alerta: > 35% en ventana movil de 30 dias.
- Fuente de medicion: historial de versiones por proyecto (`plan_version`).
- Frecuencia de revision: semanal.

## Convenciones de medicion
- Todas las metricas se calculan por entorno (`dev`, `staging`, `prod`) y por version de esquema (`v1`).
- Toda medicion debe incluir: `request_id`, `project_id`, `schema_version`, `model_version`, `prompt_version`.
- Cambios de objetivo solo mediante ADR o acta tecnica de producto.
