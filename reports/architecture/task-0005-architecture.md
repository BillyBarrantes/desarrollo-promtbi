# Reporte de Arquitectura SaaS — task-0005

- **Fecha:** 2026-08-09T01:33:33Z
- **Revisor:** saas-architect
- **Proyecto:** desarrollo-promtbi-main
- **Tarea:** task-0005 — "Polish frontend UX and visual consistency"
- **Rama:** `agent/dev/task-0005`
- **Veredicto:** APROBADO CON OBSERVACIONES

## Contexto revisado

- `.ops/state/task-0005.json`
- `reports/plans/task-0005-plan.md`
- `reports/qa/task-0005-qa.md`
- `reports/contract/task-0005-contract.md`
- `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md`, `AGENTS.md`
- `frontend/lib/types.ts` y estado de `frontend/lib/` en el diff
- Diff completo del working tree (10 archivos: 1 preexistente de setup + 9 de task-0005)

## 1. Coherencia arquitectónica

La tarea es un *polish* de UX/visual estrictamente de presentación. Se cumple el
aislamiento acordado:

- **Frontend/back end separados:** ningún archivo bajo `backend/` aparece en el
  diff. No se introduce lógica de negocio ni validación en el frontend; la
  validación determinista permanece en Python.
- **Contratos de API intactos:** `frontend/lib/api.ts` y
  `frontend/lib/types.ts` sin cambios (`git diff --name-only -- frontend/lib/`
  vacío). El endpoint de exportación DXF (`POST /api/v1/layouts/export/dxf`) y el
  payload `JSON.stringify(layout)` se preservan literalmente.
- **Tipos consumidos correctamente:** los nuevos campos usados en
  `ValidationPanel` (`categoria`, `valor_normativo`, `valor_observado`) y en
  `VersionHistory` (`createdAt`, `status`, `rejection`) existen y coinciden con
  `types.ts` (verificado, no modificado). Todas las ramas de los `switch` sobre
  `RuleResult`, `RNEValidation.estado_global` y `LayoutVersion.status` cubren el
  rango completo de la unión tipada. Sin cambios en el modelo de dominio.
- **Sin artefactos generados:** el diff no incluye `tsconfig.tsbuildinfo` ni
  `.DS_Store`.
- **Cambio pre-existente documentado:** `.opencode/opencode.jsonc` (única línea
  `$schema`) es del setup de entorno, anterior a task-0005; fuera de este
  alcance y documentado en los reportes previos. No se trata de código de
  producción.

## 2. Compatibilidad de API y modelo

- Ninguna petición nueva, ni endpoints, ni tipos request/response tocados.
- `LayoutV1` / `RNEValidation` intactos → compatibilidad con el backend actual y
  con futuras iteraciones del motor de validación.
- El flujo input → generación → iteración → exportación permanece funcional
  (verificado por QA: lint + build OK).

## 3. Accesibilidad (avance significativo)

- `skip-link` a `#main-content` presente en `layout.tsx`; ancla correctamente
  aplicada en `<main>`.
- `:focus-visible` global con `outline` visible y `outline-offset`; inputs con
  anillo de foco (border + box-shadow) sin perder indicación visual.
- `role="log"` + `aria-live="polite"` en el hilo de chat; `aria-busy` en la
  burbuja de carga; `aria-label` en botones de ícono (undo/send) y en el input
  de edición.
- Alertas de error/rechazo con `role="alert"`; feedback de exportación DXF con
  `role="status"` + `aria-live="polite"`.
- `aria-current="true"` en el historial de versiones activo.
- `prefers-reduced-motion` respetado (desactiva animaciones/transiciones).
- `::selection`, `-webkit-font-smoothing`, `text-rendering` mejoran la
  legibilidad. Contraste mejorado en `--warn` (de `#ad7a00` a `#8a5a00`) y
  consistencia de soft-bg en badges/poppered alerts.

## 4. Comportamiento responsive

- Se conservan los breakpoints de la línea base (1400px y 1120px) tanto para
  `app-grid` de 2 columnas como para `app-grid--iterate` de 3 columnas, y ahora
  la regla de colapso usa `:not(.app-grid--iterate)` para no pisar el modo
  iterate (mejora sobre el estado previo).
- `stat-grid` con `repeat(auto-fit, minmax(...))`, `export-bar`, alertas y
  badges con `flex-wrap`/`wrap` → comportamiento sano en anchos estrechos.

## 5. Mantenibilidad

- BEM-lite bien aplicado (`.field-input`, `.status-badge--ok`,
  `.rule-item__evidence`, etc.); una sola definición de tokens de color alert y
  status en `globals.css` con variables semánticas que coinciden con los
  badges (ok/warn/err soft + border).
- El extender estados se centraliza en CSS puro sin lógica embebida.
- **Duplicación leve:** existen 3 copias del mapeo estado→clase de badge:
  `statusBadgeClass` (ChatPanel) vs `StatusBadge` (VersionHistory) vs
  `verdictBadgeClass`/`ruleBadgeClass` (ValidationPanel). No bloquea, pero
  conviene extraer en un helper compartido (`components/ui/status.tsx`) para
  que la gramática de estados (aprobado/observado/rechazado/error y
  cumple/no_cumple/no_aplica) tenga un único punto de verdad.

## 6. Dirección de diseño SaaS

- El cambio pulsa la dirección existente (tema claro "CAD técnico" basado en
  IBM Plex Sans, acentos `#005a7a`): tokens semánticos, soft backgrounds,
  tapas/estados vacíos consistentes, jerarquía `h1/h2/h3` tipificada. Esto es
  coherente con `DESIGN.md` en cuanto a componentes (ChatPanel, ValidationPanel,
  VersionHistory, visor SVG/Canvas) y con el producto.
- **Nota de diseño (documentación):** `DESIGN.md` describe "esquema oscuro
  técnico", pero el producto renderiza un tema claro. Este desajuste es
  pre-existente; la tarea continuó el tema claro real. Recomendación: actualizar
  `DESIGN.md`/ADR para fijar el sistema de color (claro, tokens semánticos)
  como verdad documentada, evitando ambigüedad en futuras tareas. Es un cambio
  de docs, no de código; queda fuera de task-0005.

## 7. Observaciones (no bloqueantes)

1. **Calidad de texto en español (regresión menor):** varios strings quedaron
   sin acentos correctos en esta iteración ("Modo Edicion", "Version actual",
   "Edicion conversacional", "Chat de Edicion") mientras que el metadata
   ("Diseño Arquitectónico CAD") y otros ("Diseño del layout") sí los
   conservan. Antes había "Versión actual" / "Edición". Alineación de UI: se
   recomienda normalizar TODOS los strings visibles al español ortográfico
   correcto (usar acentos) en el mismo sitio.
2. **Emoji inconsistente:** se eliminaron la mayoría de los emojis, pero quedan
   `🤖` en `ChatThread` y `❌` en el mensaje de error de iteración. Si la
   dirección es premium/modesto sin emojis, tratarlos por igual.
3. **Live regions redundantes:** la región global `aria-live="polite"`
   ("Procesando solicitud..."/"Listo.") se suma a `role="log"` del chat y
   `role="status"` del export. Funciona, pero puede provocar anuncios dobles
   en lector de pantalla; validarlo con una prueba manual de screen reader.
4. **Duplicación del mapeo de estados** (ver sección 5).

## 8. Checklist de criterios de aceptación

| Criterio | Estado |
| --- | --- |
| Workflow funcional de input a resultado | ✅ (build/QA) |
| Consistencia de spacing/typography/colores/bordes/estados | ✅ |
| Estados loading, vacío, success, validation-error, error | ✅ (empty-state, alertas, badges, feedback DXF) |
| Accesibilidad: navegación teclado, foco visible, contraste, labels | ✅ (con obs. menores) |
| Sin cambios en backend/contrato/env/secretos/infra | ✅ |
| Diff limitado a `frontend/` sin artefactos generados | ✅ (9 archivos; `.opencode` pre-existente) |

## Veredicto

**APROBADO CON OBSERVACIONES.** La implementación respeta la arquitectura de
VIPROMT: separación frontend/backend intacta, contratos de API sin tocar,
tipos coherentes, una sola fuente de verdad de validación determinista en
backend y mejoras de accesibilidad/responsive consistentes con la dirección
de diseño SaaS existente (tema claro técnico). Las observaciones 1 y 2
(calidad de texto/emojis) son mejoras de pulido recomendadas para futuro
inmediato, no bloqueantes para la aprobación humana.

La tarea queda **awaiting_approval** a la espera del release-supervisor /
aprobación humana. No se realizó ningún cambio de código, contrato, backend,
secretos, infraestructura ni `.opencode/`.