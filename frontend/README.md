# ViPromt Frontend (Fase 4)

## Puertos locales

- Frontend: `http://localhost:3003`
- Backend esperado: `http://localhost:8003`

## Setup

1. `npm install`
2. Copiar `.env.local.example` a `.env.local`
3. `npm run dev`

## Flujo

- Carga prompt + imagen opcional
- Envio al endpoint `POST /api/v1/layouts/generate`
- Registro de versiones de respuesta (aprobado/observado/rechazado/error)
- Panel de validacion RNE y resumen tecnico por version
- Dibujo tecnico 2D en canvas con capas: arquitectura, sanitaria, electrica y cotas
- Exportacion de plano 2D a PNG
