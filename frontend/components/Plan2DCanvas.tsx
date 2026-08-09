"use client";

import { useEffect, useMemo, useRef } from "react";

import { LayoutV1, Point2D } from "@/lib/types";

const BASE_WIDTH = 980;
const BASE_HEIGHT = 620;
const PADDING = 36;

type LayerState = {
  architecture: boolean;
  sanitary: boolean;
  electrical: boolean;
  dimensions: boolean;
};

interface Props {
  layout: LayoutV1 | null;
  layers: LayerState;
}

export function Plan2DCanvas({ layout, layers }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const hasData = useMemo(() => Boolean(layout), [layout]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = BASE_WIDTH * dpr;
    canvas.height = BASE_HEIGHT * dpr;
    canvas.style.width = `${BASE_WIDTH}px`;
    canvas.style.height = `${BASE_HEIGHT}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    context.clearRect(0, 0, BASE_WIDTH, BASE_HEIGHT);
    drawBackground(context);

    if (!layout) {
      drawEmptyState(context);
      return;
    }

    const transform = buildTransform(layout.coordenadas_terreno.vertices);

    drawTerrain(context, layout.coordenadas_terreno.vertices, transform);

    if (layers.architecture) {
      drawRooms(context, layout, transform);
      drawWalls(context, layout, transform);
      drawColumns(context, layout, transform);
      drawDoors(context, layout, transform);
      drawWindows(context, layout, transform);
    }

    if (layers.sanitary) {
      drawSanitary(context, layout, transform);
    }

    if (layers.electrical) {
      drawElectrical(context, layout, transform);
    }

    if (layers.dimensions) {
      drawWallDimensions(context, layout, transform);
    }

    drawLegend(context, layers);
  }, [layout, layers]);

  return (
    <section>
      <h3>Plano 2D Tecnico</h3>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => exportCanvas(canvasRef.current)}
        disabled={!layout}
      >
        Exportar PNG
      </button>
      <div className="canvas-shell">
        <canvas ref={canvasRef} className="plan-canvas" aria-label="Plano tecnico 2D" />
      </div>
      {!hasData && (
        <p className="empty-state">Genera una propuesta para dibujar el plano tecnico.</p>
      )}
    </section>
  );
}

function exportCanvas(canvas: HTMLCanvasElement | null) {
  if (!canvas) {
    return;
  }

  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = `vipromt-plano-${Date.now()}.png`;
  link.click();
}

function drawBackground(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, BASE_WIDTH, BASE_HEIGHT);

  ctx.strokeStyle = "#eef2f6";
  ctx.lineWidth = 1;
  for (let x = 0; x < BASE_WIDTH; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, BASE_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < BASE_HEIGHT; y += 24) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(BASE_WIDTH, y);
    ctx.stroke();
  }
}

function drawEmptyState(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#6d7787";
  ctx.font = "16px IBM Plex Sans, Segoe UI, sans-serif";
  ctx.fillText("Sin datos de layout para dibujar.", PADDING, PADDING + 8);
}

function buildTransform(points: Point2D[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(maxX - minX, 0.001);
  const height = Math.max(maxY - minY, 0.001);

  const scaleX = (BASE_WIDTH - PADDING * 2) / width;
  const scaleY = (BASE_HEIGHT - PADDING * 2) / height;
  const scale = Math.min(scaleX, scaleY);

  return {
    toCanvas(point: Point2D) {
      return {
        x: PADDING + (point.x - minX) * scale,
        y: BASE_HEIGHT - PADDING - (point.y - minY) * scale,
      };
    },
    scale,
  };
}

function drawTerrain(
  ctx: CanvasRenderingContext2D,
  vertices: Point2D[],
  transform: { toCanvas: (point: Point2D) => Point2D },
) {
  if (vertices.length < 3) {
    return;
  }

  ctx.beginPath();
  const first = transform.toCanvas(vertices[0]);
  ctx.moveTo(first.x, first.y);

  for (let i = 1; i < vertices.length; i += 1) {
    const p = transform.toCanvas(vertices[i]);
    ctx.lineTo(p.x, p.y);
  }

  ctx.closePath();
  ctx.fillStyle = "rgba(0, 90, 122, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "#005a7a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawWalls(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D; scale: number },
) {
  for (const wall of layout.muros_y_columnas.muros) {
    const start = transform.toCanvas(wall.inicio);
    const end = transform.toCanvas(wall.fin);

    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.strokeStyle = wall.tipo === "portante" ? "#212a37" : "#505a69";
    ctx.lineWidth = Math.max(2, wall.espesor_m * transform.scale);
    ctx.lineCap = "butt";
    ctx.stroke();
  }
}

function drawRooms(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D },
) {
  for (const room of layout.ambientes ?? []) {
    if (!room.vertices || room.vertices.length < 3) {
      continue;
    }
    const color = roomColor(room.uso);
    ctx.beginPath();
    const first = transform.toCanvas(room.vertices[0]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < room.vertices.length; i += 1) {
      const p = transform.toCanvas(room.vertices[i]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.fillStyle = color.fill;
    ctx.fill();
    ctx.strokeStyle = color.stroke;
    ctx.lineWidth = 1;
    ctx.stroke();

    const center = polygonCenter(room.vertices);
    const centerCanvas = transform.toCanvas(center);
    ctx.fillStyle = "#1f2937";
    ctx.font = "12px IBM Plex Sans, Segoe UI, sans-serif";
    ctx.fillText(room.nombre, centerCanvas.x + 3, centerCanvas.y - 3);
  }
}

function drawColumns(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D; scale: number },
) {
  for (const column of layout.muros_y_columnas.columnas) {
    const center = transform.toCanvas(column.centro);
    const width = Math.max(6, column.ancho_m * transform.scale);
    const height = Math.max(6, column.largo_m * transform.scale);

    ctx.fillStyle = column.estructural ? "#7a869a" : "#9ca8ba";
    ctx.fillRect(center.x - width / 2, center.y - height / 2, width, height);
  }
}

function drawDoors(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D; scale: number },
) {
  for (const door of layout.puertas_ventanas.puertas) {
    const p = transform.toCanvas(door.posicion);
    const radius = Math.max(6, (door.ancho_m * transform.scale) / 2);

    ctx.beginPath();
    ctx.arc(p.x, p.y, radius, 0, Math.PI / 2);
    ctx.strokeStyle = "#0f7f31";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#0f7f31";
    ctx.font = "11px IBM Plex Sans, Segoe UI, sans-serif";
    ctx.fillText(door.id, p.x + 4, p.y - 4);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D; scale: number },
) {
  for (const win of layout.puertas_ventanas.ventanas) {
    const p = transform.toCanvas(win.posicion);
    const half = Math.max(6, (win.ancho_m * transform.scale) / 2);

    ctx.beginPath();
    ctx.moveTo(p.x - half, p.y);
    ctx.lineTo(p.x + half, p.y);
    ctx.strokeStyle = "#0077cc";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "#0077cc";
    ctx.font = "11px IBM Plex Sans, Segoe UI, sans-serif";
    ctx.fillText(win.id, p.x + 4, p.y - 4);
  }
}

function drawSanitary(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D },
) {
  for (const node of layout.instalaciones_MEP.sanitaria.nodos_agua) {
    const p = transform.toCanvas(node.ubicacion);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#00a3a3";
    ctx.fill();
  }

  for (const node of layout.instalaciones_MEP.sanitaria.nodos_desague) {
    const p = transform.toCanvas(node.ubicacion);
    ctx.beginPath();
    ctx.rect(p.x - 4, p.y - 4, 8, 8);
    ctx.fillStyle = "#2a9d8f";
    ctx.fill();
  }
}

function drawElectrical(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D },
) {
  const panel = transform.toCanvas(layout.instalaciones_MEP.electrica.tablero_general.ubicacion);
  ctx.fillStyle = "#b3541e";
  ctx.fillRect(panel.x - 7, panel.y - 7, 14, 14);
  ctx.fillStyle = "#b3541e";
  ctx.font = "11px IBM Plex Sans, Segoe UI, sans-serif";
  ctx.fillText("TG", panel.x + 10, panel.y + 4);

  for (const point of layout.instalaciones_MEP.electrica.puntos) {
    const p = transform.toCanvas(point.ubicacion);
    ctx.beginPath();
    ctx.moveTo(p.x - 4, p.y);
    ctx.lineTo(p.x + 4, p.y);
    ctx.moveTo(p.x, p.y - 4);
    ctx.lineTo(p.x, p.y + 4);
    ctx.strokeStyle = "#e2711d";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawWallDimensions(
  ctx: CanvasRenderingContext2D,
  layout: LayoutV1,
  transform: { toCanvas: (point: Point2D) => Point2D },
) {
  ctx.fillStyle = "#374151";
  ctx.font = "10px IBM Plex Sans, Segoe UI, sans-serif";

  for (const wall of layout.muros_y_columnas.muros) {
    const start = transform.toCanvas(wall.inicio);
    const end = transform.toCanvas(wall.fin);
    const midX = (start.x + end.x) / 2;
    const midY = (start.y + end.y) / 2;
    const length = Math.hypot(wall.fin.x - wall.inicio.x, wall.fin.y - wall.inicio.y);

    ctx.fillText(`${length.toFixed(2)} m`, midX + 4, midY - 4);
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, layers: LayerState) {
  const x = BASE_WIDTH - 240;
  const y = 18;
  const rowHeight = 16;

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.fillRect(x - 8, y - 12, 230, 96);
  ctx.strokeStyle = "#cfd8e3";
  ctx.strokeRect(x - 8, y - 12, 230, 96);

  ctx.fillStyle = "#222";
  ctx.font = "12px IBM Plex Sans, Segoe UI, sans-serif";
  ctx.fillText("Capas activas", x, y);

  const items = [
    `Arquitectura: ${layers.architecture ? "ON" : "OFF"}`,
    `Sanitaria: ${layers.sanitary ? "ON" : "OFF"}`,
    `Electrica: ${layers.electrical ? "ON" : "OFF"}`,
    `Cotas: ${layers.dimensions ? "ON" : "OFF"}`,
  ];

  for (let i = 0; i < items.length; i += 1) {
    ctx.fillText(items[i], x, y + rowHeight * (i + 1));
  }
}

function polygonCenter(vertices: Point2D[]): Point2D {
  if (vertices.length === 0) {
    return { x: 0, y: 0 };
  }
  const sum = vertices.reduce((acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}

function roomColor(uso: LayoutV1["ambientes"][number]["uso"]) {
  switch (uso) {
    case "social":
      return { fill: "rgba(66, 135, 245, 0.15)", stroke: "rgba(66, 135, 245, 0.8)" };
    case "privado":
      return { fill: "rgba(120, 81, 169, 0.15)", stroke: "rgba(120, 81, 169, 0.8)" };
    case "servicio":
      return { fill: "rgba(11, 163, 122, 0.15)", stroke: "rgba(11, 163, 122, 0.8)" };
    case "circulacion":
      return { fill: "rgba(245, 158, 11, 0.15)", stroke: "rgba(245, 158, 11, 0.8)" };
    default:
      return { fill: "rgba(107, 114, 128, 0.15)", stroke: "rgba(107, 114, 128, 0.8)" };
  }
}
