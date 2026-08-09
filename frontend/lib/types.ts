export type RuleResult = "cumple" | "no_cumple" | "no_aplica";

export interface Point2D {
  x: number;
  y: number;
}

export interface RuleEvaluation {
  rule_id: string;
  categoria: string;
  resultado: RuleResult;
  evidencia: string;
  valor_normativo?: string;
  valor_observado?: string;
  severidad?: "baja" | "media" | "alta" | "critica";
}

export interface RNEValidation {
  estado_global: "aprobado" | "observado" | "rechazado";
  reglas_evaluadas: RuleEvaluation[];
  resumen: {
    total_reglas: number;
    cumple: number;
    no_cumple: number;
    no_aplica: number;
  };
}

export interface LayoutV1 {
  version: "v1.1";
  project_id: string;
  timestamp_utc: string;
  coordenadas_terreno: {
    unidad: "m";
    area_total_m2: number;
    vertices: Point2D[];
  };
  ambientes: Array<{
    id: string;
    nombre: string;
    uso: "social" | "privado" | "servicio" | "circulacion" | "otro";
    vertices: Point2D[];
    area_m2: number;
  }>;
  muros_y_columnas: {
    muros: Array<{
      id: string;
      tipo: "portante" | "no_portante" | "cerramiento";
      inicio: Point2D;
      fin: Point2D;
      espesor_m: number;
      altura_m?: number;
    }>;
    columnas: Array<{
      id: string;
      centro: Point2D;
      ancho_m: number;
      largo_m: number;
      estructural: boolean;
    }>;
  };
  puertas_ventanas: {
    puertas: Array<{
      id: string;
      tipo: "principal" | "interior" | "bano" | "servicio";
      host_wall_id: string;
      offset_m: number;
      posicion: Point2D;
      ancho_m: number;
      alto_m: number;
      abatimiento: "izquierda" | "derecha" | "corrediza" | "plegable";
    }>;
    ventanas: Array<{
      id: string;
      host_wall_id: string;
      offset_m: number;
      posicion: Point2D;
      ancho_m: number;
      alto_m: number;
      antepecho_m: number;
      tipo?: "corrediza" | "batiente" | "fija" | "proyectante";
    }>;
  };
  mobiliario: Array<{
    id: string;
    block_type:
      "cama" | "inodoro" | "lavabo" | "mesa" | "auto" | "sofa" | "cocina" | "ducha" | "otro";
    insertion: Point2D;
    rotation_deg: number;
    scale: number;
    room_id?: string | null;
    metadata?: Record<string, string>;
  }>;
  instalaciones_MEP: {
    sanitaria: {
      montante_id: string;
      nodos_agua: Array<{ id: string; ambiente: string; ubicacion: Point2D }>;
      nodos_desague: Array<{ id: string; ambiente: string; ubicacion: Point2D }>;
      tramos: Array<{
        id: string;
        desde_nodo_id: string;
        hasta_nodo_id: string;
        diametro_mm: number;
        pendiente_porcentaje: number;
      }>;
    };
    electrica: {
      tablero_general: { id: string; ubicacion: Point2D; amperaje_principal: number };
      circuitos: Array<{
        id: string;
        tipo: "iluminacion" | "tomacorriente" | "fuerza";
        breaker_a: number;
      }>;
      puntos: Array<{
        id: string;
        tipo: "luminaria" | "interruptor" | "tomacorriente" | "salida_especial";
        ambiente: string;
        ubicacion: Point2D;
        circuito_id: string;
      }>;
    };
  };
  validacion_RNE: RNEValidation;
}

export interface RejectionDetail {
  message: string;
  validacion_RNE: RNEValidation;
  alternativas: string[];
}

export interface LayoutVersion {
  id: string;
  prompt: string;
  createdAt: string;
  status: "aprobado" | "observado" | "rechazado" | "error";
  layout?: LayoutV1;
  rejection?: RejectionDetail;
  error?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  versionId?: string;
}

export interface IterateResponse {
  layout: LayoutV1;
  change_summary: string;
}
