# Documento Maestro de Proyecto: ViPromt

## 1. Vision General (Que es ViPromt?)
ViPromt es una plataforma de software avanzado (PropTech) disenada para actuar como un equipo multidisciplinario de expertos: Arquitecto, Ingeniero Civil, Disenador de Interiores, Gasfitero y Electricista.

El sistema toma los requerimientos de un usuario (texto) y las restricciones espaciales de un terreno (imagen/boceto con medidas), procesa esta informacion a traves de un "cerebro" de Inteligencia Artificial (Gemini API), y devuelve planos tecnicos en 2D funcionales y visualizaciones conceptuales en 3D fotorrealistas. La premisa fundamental es separar la logica de diseno (IA) de la ejecucion grafica (Frontend/Backend) para evitar alucinaciones y garantizar la precision tecnica.

## 2. Objetivos Principales (Que queremos lograr?)

### Cero Alucinaciones Arquitectonicas
El sistema debe respetar leyes fisicas, medidas universales de ergonomia y el Reglamento Nacional de Edificaciones (RNE) de Peru. Si un usuario pide algo inviable, el sistema debe detectarlo, explicar el motivo y proponer una solucion real.

### Ingenieria Integrada
El diseno no solo debe ser estetico, sino constructivamente viable. Debe incluir la distribucion logica de redes de agua, desague (optimizando montantes) y electricidad (tableros, puntos de luz).

### Fidelidad Bidireccional
El render 3D (visualizacion conceptual de alta fidelidad) debe respetar de manera estricta la distribucion espacial, elementos y medidas definidos previamente en el plano 2D.

### Optimizacion de Recursos Computacionales
Evitar motores de renderizado 3D pesados. Usar dibujo vectorial para el 2D y generacion de imagenes por IA para el 3D.

## 3. Arquitectura y Stack Tecnologico Recomendado

### El Cerebro (Motor Logico): Google Gemini API (Multimodal)
Se encarga del razonamiento espacial, lectura de bocetos, validacion de normas y generacion de la estructura de datos (JSON) de la distribucion.

### El Orquestador (Backend): Python con FastAPI
Gestiona la logica del negocio, recibe los inputs, se comunica con la API de Gemini, valida la estructura del JSON resultante (usando Pydantic) y gestiona los prompts para la generacion de imagenes. Es rapido, asincrono y el estandar de la industria para IA.

### El Dibujante y la Interfaz (Frontend): Next.js (React)
Interfaz de usuario fluida y conversacional. Toma el JSON validado del backend y utiliza librerias de renderizado 2D (como React Flow o HTML5 Canvas) para "dibujar" el plano tecnico exacto y a escala.

### Generador Visual (Render 3D): API de Generacion de Imagenes de Google
Se alimenta con prompts hiper-detallados construidos por el backend basados unicamente en el JSON del plano 2D aprobado para crear imagenes fotorrealistas fieles al diseno.

### Base de Datos: Supabase (PostgreSQL)
Almacenamiento relacional robusto para guardar historiales de chat, archivos JSON de los proyectos, imagenes generadas y perfiles de usuarios.

## 4. Fases del Flujo de Trabajo (El Plan Operativo)
El desarrollo debe contemplar el siguiente flujo secuencial de interaccion con el usuario:

### Fase 1: Recepcion y Analisis (Input)
- El usuario sube un plano/boceto base con medidas y describe sus necesidades mediante un prompt humanizado.
- ViPromt analiza la viabilidad tecnica y normativa.
- Si hay incongruencias, inicia un chat para resolver dudas y ajustar expectativas.

### Fase 2: Diseno Tecnico (Output 2D y JSON)
- El cerebro genera la distribucion espacial y las redes de ingenieria (MEP) optimas.
- El sistema exporta un JSON estructurado.
- El frontend lee este JSON y dibuja un plano 2D tecnico, con medidas exactas y simbologia correcta.
- El usuario puede descargar este plano.

### Fase 3: Iteracion (Chat de Optimizacion)
- ViPromt invita al usuario a revisar el plano 2D.
- El usuario puede sugerir cambios o pedir optimizaciones.
- El cerebro procesa el cambio, recalcula la ingenieria, actualiza el JSON y el frontend redibuja el plano 2D.

### Fase 4: Visualizacion Fiel (Render 3D)
- Una vez aprobado el 2D, ViPromt redacta un prompt descriptivo estricto basado en la distribucion final.
- Se genera la imagen fotorrealista (Render 3D conceptual).
- El usuario puede iterar sobre colores o materiales, pero el sistema mantendra bloqueada la estructura espacial del 2D original.
