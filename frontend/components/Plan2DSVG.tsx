"use client";

import { useMemo, useRef, useState } from "react";

import { CADBlock } from "@/components/CADBlocks";
import { LayoutV1, Point2D } from "@/lib/types";

const VIEW_W = 1200;
const PAD = 40;

type ExportState = "idle" | "loading" | "success" | "error";

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

type WallLike = LayoutV1["muros_y_columnas"]["muros"][number];
type BoundingMask = { minX: number; maxX: number; minY: number; maxY: number };
type DimConstraints = { collisionMasks?: BoundingMask[]; minLen?: number; maxLaneShift?: number };

function computeViewHeight(
  vertices: Point2D[],
  marginsM: { left: number; right: number; top: number; bottom: number },
) {
  if (!vertices.length) return 760;
  const b = boundsOfPolygon(vertices);
  const tW = b.maxX - b.minX + marginsM.left + marginsM.right;
  const tH = b.maxY - b.minY + marginsM.top + marginsM.bottom;
  const hScale = (VIEW_W - PAD * 2) / Math.max(0.001, tW);
  return Math.max(600, Math.min(1600, Math.round(tH * hScale + PAD * 2)));
}

export function Plan2DSVG({ layout, layers }: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [exportState, setExportState] = useState<ExportState>("idle");
  const [exportMessage, setExportMessage] = useState<string | null>(null);
  const debugMode =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("debug") === "1";

  const marginsM = useMemo(
    () => estimateDimensionMargins(layout, layers.dimensions),
    [layout, layers.dimensions],
  );
  const viewH = useMemo(
    () => computeViewHeight(layout?.coordenadas_terreno.vertices ?? [], marginsM),
    [layout, marginsM],
  );
  const transform = useMemo(
    () => buildTransform(layout?.coordenadas_terreno.vertices ?? [], marginsM, viewH),
    [layout, marginsM, viewH],
  );
  const wallById = useMemo(() => {
    const map = new Map<string, WallLike>();
    for (const wall of layout?.muros_y_columnas.muros ?? []) {
      map.set(wall.id, wall);
    }
    return map;
  }, [layout]);
  const openingMasks = useMemo(() => {
    if (!layout) return [];
    return buildOpeningMasks(
      layout.puertas_ventanas.puertas,
      layout.puertas_ventanas.ventanas,
      wallById,
    );
  }, [layout, wallById]);

  return (
    <section>
      <h3>Plano 2D Tecnico CAD</h3>
      <div className="export-bar">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => exportSvg(svgRef.current)}
          disabled={!layout}
        >
          Exportar SVG
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!layout || exportState === "loading"}
          onClick={async () => {
            if (!layout) return;
            setExportState("loading");
            setExportMessage("Exportando DXF...");
            try {
              const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8003";
              const res = await fetch(`${apiBase}/api/v1/layouts/export/dxf`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(layout),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const blob = await res.blob();
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = `plano_vipromt_${Date.now()}.dxf`;
              document.body.appendChild(a);
              a.click();
              a.remove();
              URL.revokeObjectURL(url);
              setExportState("success");
              setExportMessage("Archivo DXF exportado correctamente.");
            } catch (err) {
              console.error("DXF export failed:", err);
              setExportState("error");
              setExportMessage("Error al exportar DXF. Revisa la consola.");
            }
          }}
        >
          {exportState === "loading" ? "Exportando..." : "Exportar AutoCAD (.DXF)"}
        </button>
      </div>
      {exportMessage && (
        <p
          role="status"
          aria-live="polite"
          className={`export-status export-status--${exportState}`}
        >
          {exportMessage}
        </p>
      )}
      <div className="svg-shell">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VIEW_W} ${viewH}`}
          className="plan-svg"
          aria-label="Plano CAD 2D"
        >
          <defs>
            <pattern id="cad-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#edf1f5" strokeWidth="1" />
            </pattern>
            <pattern
              id="hatch-portante"
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line x1="0" y1="0" x2="0" y2="6" stroke="#8b9cb3" strokeWidth="0.8" />
            </pattern>
          </defs>

          <rect x={0} y={0} width={VIEW_W} height={viewH} fill="#fff" />
          <rect x={0} y={0} width={VIEW_W} height={viewH} fill="url(#cad-grid)" />

          {layout ? (
            <>
              {layers.architecture && (
                <Terrain vertices={layout.coordenadas_terreno.vertices} toSvg={transform.toSvg} />
              )}
              {layers.architecture && (
                <RoomsFill rooms={layout.ambientes} toSvg={transform.toSvg} />
              )}
              {layers.architecture && (
                <Walls
                  walls={layout.muros_y_columnas.muros}
                  toSvg={transform.toSvg}
                  scale={transform.scale}
                />
              )}
              {layers.architecture && (
                <Openings
                  doors={layout.puertas_ventanas.puertas}
                  windows={layout.puertas_ventanas.ventanas}
                  wallById={wallById}
                  toSvg={transform.toSvg}
                  scale={transform.scale}
                />
              )}
              {layers.architecture && (
                <Furniture
                  items={layout.mobiliario}
                  toSvg={transform.toSvg}
                  scale={transform.scale}
                />
              )}
              {layers.sanitary && (
                <Sanitary
                  nodes={layout.instalaciones_MEP.sanitaria.nodos_agua}
                  toSvg={transform.toSvg}
                />
              )}
              {layers.sanitary && (
                <Drain
                  nodes={layout.instalaciones_MEP.sanitaria.nodos_desague}
                  toSvg={transform.toSvg}
                />
              )}
              {layers.electrical && (
                <Electrical
                  panel={layout.instalaciones_MEP.electrica.tablero_general.ubicacion}
                  points={layout.instalaciones_MEP.electrica.puntos}
                  toSvg={transform.toSvg}
                />
              )}
              {layers.architecture && (
                <RoomLabels
                  rooms={layout.ambientes}
                  walls={layout.muros_y_columnas.muros}
                  toSvg={transform.toSvg}
                />
              )}
              <Legend layers={layers} />
              {layers.dimensions && (
                <Dimensions
                  walls={layout.muros_y_columnas.muros}
                  terrain={layout.coordenadas_terreno.vertices}
                  rooms={layout.ambientes}
                  doors={layout.puertas_ventanas.puertas}
                  windows={layout.puertas_ventanas.ventanas}
                  wallById={wallById}
                  openingMasks={openingMasks}
                  toSvg={transform.toSvg}
                  scale={transform.scale}
                  debugMode={debugMode}
                />
              )}
              {debugMode && <DebugMasks masks={openingMasks} toSvg={transform.toSvg} />}
            </>
          ) : (
            <text x={PAD} y={PAD} fontSize={16} fill="#64748b">
              Genera una propuesta para dibujar el plano tecnico.
            </text>
          )}
        </svg>
      </div>
    </section>
  );
}

function Terrain({ vertices, toSvg }: { vertices: Point2D[]; toSvg: (p: Point2D) => Point2D }) {
  if (vertices.length < 3) return null;
  const d = polygonPath(vertices, toSvg);
  return <path d={d} fill="none" stroke="#2f3b4f" strokeWidth={1.2} />;
}

function RoomsFill({
  rooms,
  toSvg,
}: {
  rooms: LayoutV1["ambientes"];
  toSvg: (p: Point2D) => Point2D;
}) {
  return (
    <g>
      {rooms.map((room) => {
        const d = polygonPath(room.vertices, toSvg);
        return (
          <g key={room.id}>
            <path
              d={d}
              fill="rgba(100,116,139,0.02)"
              stroke="rgba(100,116,139,0.32)"
              strokeWidth={0.8}
            />
          </g>
        );
      })}
    </g>
  );
}

function RoomLabels({
  rooms,
  walls,
  toSvg,
}: {
  rooms: LayoutV1["ambientes"];
  walls: LayoutV1["muros_y_columnas"]["muros"];
  toSvg: (p: Point2D) => Point2D;
}) {
  // ─── Greedy Label Placer ───
  interface LabelRect {
    x: number;
    y: number;
    w: number;
    h: number;
    fontSize: number;
    areaFontSize: number;
  }

  const rectsOverlap = (a: LabelRect, b: LabelRect): boolean =>
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  const overlapsAny = (r: LabelRect, placed: LabelRect[]): boolean =>
    placed.some((p) => rectsOverlap(r, p));

  // Pre-compute label positions with anti-collision
  const placements: { room: (typeof rooms)[number]; rect: LabelRect; cx: number }[] = [];
  const placedRects: LabelRect[] = [];

  // Sort rooms by area descending — larger rooms get priority placement
  const sortedRooms = [...rooms].sort((a, b) => b.area_m2 - a.area_m2);

  for (const room of sortedRooms) {
    const box = boundsOfPolygon(room.vertices);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const c = toSvg({ x: cx, y: cy });

    let fontSize = 12;
    let areaFontSize = 10;
    const labelW = Math.max(100, Math.min(260, room.nombre.length * 7.5 + 16));
    const labelH = 48;

    // Try the centroid first
    let bestRect: LabelRect = {
      x: c.x - labelW / 2,
      y: c.y - 22,
      w: labelW,
      h: labelH,
      fontSize,
      areaFontSize,
    };
    let found = !overlapsAny(bestRect, placedRects);

    // If collides, try vertical offsets
    if (!found) {
      for (const dy of [-18, 18, -36, 36, -54, 54]) {
        const candidate: LabelRect = {
          x: c.x - labelW / 2,
          y: c.y - 22 + dy,
          w: labelW,
          h: labelH,
          fontSize,
          areaFontSize,
        };
        if (!overlapsAny(candidate, placedRects)) {
          bestRect = candidate;
          found = true;
          break;
        }
      }
    }

    // If still collides, try horizontal offsets
    if (!found) {
      for (const dx of [-30, 30, -60, 60]) {
        const candidate: LabelRect = {
          x: c.x - labelW / 2 + dx,
          y: c.y - 22,
          w: labelW,
          h: labelH,
          fontSize,
          areaFontSize,
        };
        if (!overlapsAny(candidate, placedRects)) {
          bestRect = candidate;
          found = true;
          break;
        }
      }
    }

    // Last resort: reduce font size
    if (!found) {
      fontSize = 10;
      areaFontSize = 8;
      const smallW = Math.max(80, Math.min(200, room.nombre.length * 6 + 12));
      const smallH = 38;
      bestRect = { x: c.x - smallW / 2, y: c.y - 18, w: smallW, h: smallH, fontSize, areaFontSize };
    }

    placedRects.push(bestRect);
    placements.push({ room, rect: bestRect, cx: bestRect.x + bestRect.w / 2 });
  }

  return (
    <g>
      {placements.map(({ room, rect, cx }) => {
        const areaText = `${room.area_m2.toFixed(2)} m\u00b2`;
        return (
          <g key={`label-${room.id}`}>
            <rect
              x={rect.x}
              y={rect.y}
              width={rect.w}
              height={rect.h}
              fill="#ffffff"
              opacity={0.96}
              rx={3}
              stroke="#cbd5e1"
              strokeWidth={0.5}
            />
            <text
              x={cx}
              y={rect.y + rect.h * 0.38}
              fontSize={rect.fontSize}
              fill="#111827"
              textAnchor="middle"
              fontWeight={700}
              letterSpacing="0.02em"
            >
              {room.nombre}
            </text>
            <text
              x={cx}
              y={rect.y + rect.h * 0.78}
              fontSize={rect.areaFontSize}
              fill="#475569"
              textAnchor="middle"
            >
              {areaText}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function Walls({
  walls,
  toSvg,
  scale,
}: {
  walls: LayoutV1["muros_y_columnas"]["muros"];
  toSvg: (p: Point2D) => Point2D;
  scale: number;
}) {
  return (
    <g>
      {walls.map((wall) => {
        const poly = wallPolygon(wall, scale, toSvg);
        const isPortante = wall.tipo === "portante";
        return (
          <path
            key={wall.id}
            d={poly}
            fill={isPortante ? "url(#hatch-portante)" : "#f0f2f5"}
            stroke="#1e293b"
            strokeWidth={isPortante ? 1.6 : 1.1}
            strokeLinejoin="miter"
          />
        );
      })}
    </g>
  );
}

function Openings({
  doors,
  windows,
  wallById,
  toSvg,
  scale,
}: {
  doors: LayoutV1["puertas_ventanas"]["puertas"];
  windows: LayoutV1["puertas_ventanas"]["ventanas"];
  wallById: Map<string, WallLike>;
  toSvg: (p: Point2D) => Point2D;
  scale: number;
}) {
  return (
    <g>
      {doors.map((door) => {
        const wall = wallById.get(door.host_wall_id);
        if (!wall) return null;
        const geom = doorOpeningGeometry(wall, door.offset_m, door.ancho_m, door.abatimiento);
        const startSvg = toSvg(geom.start);
        const endSvg = toSvg(geom.end);
        const hingeSvg = toSvg(geom.hinge);
        const leafClosedSvg = toSvg(geom.leafClosedEnd);
        const leafOpenSvg = toSvg(geom.leafOpenEnd);
        const radius = Math.max(door.ancho_m * scale, 1);
        const sweepFlag = swingSweepFlag(hingeSvg, leafClosedSvg, leafOpenSvg);
        return (
          <g key={door.id}>
            <line
              x1={startSvg.x}
              y1={startSvg.y}
              x2={endSvg.x}
              y2={endSvg.y}
              stroke="#fff"
              strokeWidth={Math.max(wall.espesor_m * scale + 2, 5)}
            />
            <line
              x1={hingeSvg.x}
              y1={hingeSvg.y}
              x2={leafOpenSvg.x}
              y2={leafOpenSvg.y}
              stroke="#1f2937"
              strokeWidth={1.2}
            />
            <path
              d={`M ${leafClosedSvg.x} ${leafClosedSvg.y} A ${radius} ${radius} 0 0 ${sweepFlag} ${leafOpenSvg.x} ${leafOpenSvg.y}`}
              fill="none"
              stroke="#1f2937"
              strokeWidth={1}
              strokeDasharray="3 2"
            />
          </g>
        );
      })}

      {windows.map((window) => {
        const wall = wallById.get(window.host_wall_id);
        if (!wall) return null;
        const geom = openingGeometry(wall, window.offset_m, window.ancho_m);
        const startSvg = toSvg(geom.start);
        const endSvg = toSvg(geom.end);
        const mid = midpoint(geom.start, geom.end);
        const perpOffset = scalePoint(geom.perp, 0.04);
        const l1s = toSvg(add(mid, scalePoint(geom.dir, -window.ancho_m / 2)));
        const l1e = toSvg(add(mid, scalePoint(geom.dir, window.ancho_m / 2)));
        const l2s = toSvg(add(add(mid, scalePoint(geom.dir, -window.ancho_m / 2)), perpOffset));
        const l2e = toSvg(add(add(mid, scalePoint(geom.dir, window.ancho_m / 2)), perpOffset));
        return (
          <g key={window.id}>
            <line
              x1={startSvg.x}
              y1={startSvg.y}
              x2={endSvg.x}
              y2={endSvg.y}
              stroke="#fff"
              strokeWidth={Math.max(wall.espesor_m * scale + 2, 5)}
            />
            <line x1={l1s.x} y1={l1s.y} x2={l1e.x} y2={l1e.y} stroke="#0f4c81" strokeWidth={1.3} />
            <line x1={l2s.x} y1={l2s.y} x2={l2e.x} y2={l2e.y} stroke="#0f4c81" strokeWidth={1.1} />
          </g>
        );
      })}
    </g>
  );
}

function Furniture({
  items,
  toSvg,
  scale,
}: {
  items: LayoutV1["mobiliario"];
  toSvg: (p: Point2D) => Point2D;
  scale: number;
}) {
  return (
    <g>
      {items.map((item) => {
        const p = toSvg(item.insertion);
        return (
          <CADBlock
            key={item.id}
            type={item.block_type}
            insertion={p}
            rotationDeg={-item.rotation_deg}
            scale={item.scale}
            pxPerMeter={scale}
          />
        );
      })}
    </g>
  );
}

function Sanitary({
  nodes,
  toSvg,
}: {
  nodes: LayoutV1["instalaciones_MEP"]["sanitaria"]["nodos_agua"];
  toSvg: (p: Point2D) => Point2D;
}) {
  return (
    <g>
      {nodes.map((n) => {
        const p = toSvg(n.ubicacion);
        return <circle key={n.id} cx={p.x} cy={p.y} r={4.5} fill="#0ea5a3" />;
      })}
    </g>
  );
}

function Drain({
  nodes,
  toSvg,
}: {
  nodes: LayoutV1["instalaciones_MEP"]["sanitaria"]["nodos_desague"];
  toSvg: (p: Point2D) => Point2D;
}) {
  return (
    <g>
      {nodes.map((n) => {
        const p = toSvg(n.ubicacion);
        return <rect key={n.id} x={p.x - 3.5} y={p.y - 3.5} width={7} height={7} fill="#14b8a6" />;
      })}
    </g>
  );
}

function Electrical({
  panel,
  points,
  toSvg,
}: {
  panel: LayoutV1["instalaciones_MEP"]["electrica"]["tablero_general"]["ubicacion"];
  points: LayoutV1["instalaciones_MEP"]["electrica"]["puntos"];
  toSvg: (p: Point2D) => Point2D;
}) {
  const panelSvg = toSvg(panel);
  return (
    <g>
      <rect x={panelSvg.x - 5} y={panelSvg.y - 5} width={10} height={10} fill="#b45309" />
      <text x={panelSvg.x + 8} y={panelSvg.y + 4} fontSize={10} fill="#92400e">
        TG
      </text>
      {points.map((point) => {
        const p = toSvg(point.ubicacion);
        return (
          <g key={point.id}>
            <line x1={p.x - 3} y1={p.y} x2={p.x + 3} y2={p.y} stroke="#b45309" strokeWidth={1.2} />
            <line x1={p.x} y1={p.y - 3} x2={p.x} y2={p.y + 3} stroke="#b45309" strokeWidth={1.2} />
          </g>
        );
      })}
    </g>
  );
}

function Dimensions({
  walls,
  terrain,
  rooms,
  doors,
  windows,
  wallById,
  openingMasks,
  toSvg,
  scale,
  debugMode,
}: {
  walls: LayoutV1["muros_y_columnas"]["muros"];
  terrain: Point2D[];
  rooms: LayoutV1["ambientes"];
  doors: LayoutV1["puertas_ventanas"]["puertas"];
  windows: LayoutV1["puertas_ventanas"]["ventanas"];
  wallById: Map<string, WallLike>;
  openingMasks: BoundingMask[];
  toSvg: (p: Point2D) => Point2D;
  scale: number;
  debugMode: boolean;
}) {
  if (!terrain.length) return null;

  const xs = terrain.map((p) => p.x);
  const ys = terrain.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bounds = { minX, maxX, minY, maxY };
  const roomLabelMasks = buildRoomLabelMasks(rooms, walls, scale);
  const hardMasks = [...openingMasks, ...roomLabelMasks];
  const grossRefsX = buildClosedGrossRefs(buildGrossRefsX(walls, bounds), bounds.minX, bounds.maxX);
  const grossRefsY = buildClosedGrossRefs(buildGrossRefsY(walls, bounds), bounds.minY, bounds.maxY);
  const netRefs = buildNetRefs(walls, bounds);
  const roomAnchors = buildRoomAnchorCandidates(rooms, hardMasks);
  const candidates = buildDimCandidates({
    bounds,
    grossRefsX,
    grossRefsY,
    netRefs,
    roomAnchors,
    doors,
    windows,
    wallById,
  });
  const solved = solveDimConstraints(candidates, hardMasks, scale);

  // RULE-1: Build architectural tick marks at every chain node
  const TICK_PX = 5;
  const chainTicks: Array<{ x: number; y: number; axis: "h" | "v" }> = [];
  for (const ref of grossRefsX) {
    chainTicks.push({ x: ref, y: bounds.maxY + 0.32, axis: "h" });
  }
  for (const ref of grossRefsY) {
    chainTicks.push({ x: bounds.maxX + 0.32, y: ref, axis: "v" });
  }
  // Overall axis endpoints
  chainTicks.push({ x: bounds.minX, y: bounds.maxY + 0.55, axis: "h" });
  chainTicks.push({ x: bounds.maxX, y: bounds.maxY + 0.55, axis: "h" });
  chainTicks.push({ x: bounds.maxX + 0.55, y: bounds.minY, axis: "v" });
  chainTicks.push({ x: bounds.maxX + 0.55, y: bounds.maxY, axis: "v" });

  return (
    <g>
      {solved.placements.map((p) => renderPlacement(p, toSvg, debugMode))}
      {/* RULE-1: Architectural 45° tick marks at every chain node */}
      {chainTicks.map((t, i) => {
        const s = toSvg({ x: t.x, y: t.y });
        return (
          <line
            key={`chain-tick-${i}`}
            x1={s.x - TICK_PX}
            y1={s.y - TICK_PX}
            x2={s.x + TICK_PX}
            y2={s.y + TICK_PX}
            stroke="#334155"
            strokeWidth={1.1}
          />
        );
      })}
      {debugMode &&
        solved.placedBoxes.map((b, i) => (
          <rect
            key={`dbg-placed-${i}`}
            x={toSvg({ x: b.minX, y: b.maxY }).x}
            y={toSvg({ x: b.maxX, y: b.minY }).y}
            width={Math.max(
              1,
              toSvg({ x: b.maxX, y: b.minY }).x - toSvg({ x: b.minX, y: b.maxY }).x,
            )}
            height={Math.max(
              1,
              toSvg({ x: b.minX, y: b.maxY }).y - toSvg({ x: b.maxX, y: b.minY }).y,
            )}
            fill="rgba(217,70,239,0.08)"
            stroke="#d946ef"
            strokeWidth={0.6}
          />
        ))}
    </g>
  );
}

function chainHorizontal(
  refs: number[],
  dimY: number,
  toSvg: (p: Point2D) => Point2D,
  keyPrefix: string,
  debugMode: boolean,
  constraints?: DimConstraints,
) {
  if (refs.length < 2) return null;
  return (
    <g>
      {refs
        .slice(0, -1)
        .map((x0, i) =>
          dimensionHorizontal(
            x0,
            refs[i + 1],
            dimY - 0.14,
            dimY,
            toSvg,
            `${keyPrefix}-${i}`,
            false,
            1,
            debugMode,
            constraints,
          ),
        )}
    </g>
  );
}

function chainVertical(
  refs: number[],
  dimX: number,
  toSvg: (p: Point2D) => Point2D,
  keyPrefix: string,
  debugMode: boolean,
  constraints?: DimConstraints,
) {
  if (refs.length < 2) return null;
  return (
    <g>
      {refs
        .slice(0, -1)
        .map((y0, i) =>
          dimensionVertical(
            y0,
            refs[i + 1],
            dimX - 0.14,
            dimX,
            toSvg,
            `${keyPrefix}-${i}`,
            false,
            1,
            debugMode,
            constraints,
          ),
        )}
    </g>
  );
}

function dimensionHorizontal(
  x0: number,
  x1: number,
  extY: number,
  dimY: number,
  toSvg: (p: Point2D) => Point2D,
  key: string,
  isOverall: boolean,
  lane = 0,
  debugMode = false,
  constraints?: DimConstraints,
) {
  const a = { x: x0, y: extY };
  const b = { x: x1, y: extY };
  const da = { x: x0, y: dimY };
  const db = { x: x1, y: dimY };
  const sa = toSvg(a);
  const sb = toSvg(b);
  const sda = toSvg(da);
  const sdb = toSvg(db);
  const mid = toSvg({ x: (x0 + x1) / 2, y: dimY });
  const len = Math.abs(x1 - x0);
  if (len < 0.12) return null;
  const isMinor = len < 0.2;

  const tick = 5;
  const stroke = isOverall ? "#334155" : "#64748b";
  const text = `${len.toFixed(2)} m`;
  const boxW = Math.max(42, text.length * 6.2);
  const gapHalf = boxW / 2 + 3;
  const lineY = sda.y;
  const midX = mid.x;
  const minLen = constraints?.minLen ?? 0.05;
  if (len < minLen) return null;
  const maxShift = constraints?.maxLaneShift ?? 0;
  const masks = constraints?.collisionMasks ?? [];

  let chosenLane = lane;
  let chosenBoxes: {
    textBox: BoundingMask;
    segBox: BoundingMask;
    leaderBox: BoundingMask | null;
  } | null = null;
  for (let shift = 0; shift <= maxShift; shift += 1) {
    const testLane = lane + shift;
    const labelDy = testLane * 14 + (isMinor ? 16 : 0);
    const textBox = {
      minX: mid.x - boxW / 2,
      maxX: mid.x + boxW / 2,
      minY: mid.y - 12 - labelDy,
      maxY: mid.y - labelDy,
    };
    const segBox = {
      minX: Math.min(sda.x, sdb.x),
      maxX: Math.max(sda.x, sdb.x),
      minY: lineY - 3,
      maxY: lineY + 3,
    };
    const leaderBox = isMinor
      ? {
          minX: mid.x - 1,
          maxX: mid.x + 1,
          minY: Math.min(mid.y - labelDy + 2, mid.y - 2),
          maxY: Math.max(mid.y - labelDy + 2, mid.y - 2),
        }
      : null;
    const union = mergeMasks([textBox, segBox, ...(leaderBox ? [leaderBox] : [])]);
    if (!union || !intersectsAny(union, masks)) {
      chosenLane = testLane;
      chosenBoxes = { textBox, segBox, leaderBox };
      break;
    }
  }
  if (!chosenBoxes) return null;
  const labelDy = chosenLane * 14 + (isMinor ? 16 : 0);

  return (
    <g key={key}>
      <line x1={sa.x} y1={sa.y} x2={sda.x} y2={sda.y} stroke={stroke} strokeWidth={0.8} />
      <line x1={sb.x} y1={sb.y} x2={sdb.x} y2={sdb.y} stroke={stroke} strokeWidth={0.8} />
      <line
        x1={sda.x}
        y1={lineY}
        x2={midX - gapHalf}
        y2={lineY}
        stroke={stroke}
        strokeWidth={0.9}
      />
      <line
        x1={midX + gapHalf}
        y1={lineY}
        x2={sdb.x}
        y2={lineY}
        stroke={stroke}
        strokeWidth={0.9}
      />
      <line
        x1={sda.x - tick}
        y1={sda.y - tick}
        x2={sda.x + tick}
        y2={sda.y + tick}
        stroke={stroke}
        strokeWidth={1}
      />
      <line
        x1={sdb.x - tick}
        y1={sdb.y - tick}
        x2={sdb.x + tick}
        y2={sdb.y + tick}
        stroke={stroke}
        strokeWidth={1}
      />
      <rect
        x={mid.x - boxW / 2}
        y={mid.y - 12 - labelDy}
        width={boxW}
        height={12}
        fill="#ffffff"
        opacity={0.95}
      />
      <text x={mid.x} y={mid.y - 3 - labelDy} fontSize={10} fill="#1f2937" textAnchor="middle">
        {text}
      </text>
      {isMinor && (
        <line
          x1={mid.x}
          y1={mid.y - labelDy + 2}
          x2={mid.x}
          y2={mid.y - 2}
          stroke="#64748b"
          strokeWidth={0.8}
        />
      )}
      {debugMode && (
        <>
          <rect
            x={chosenBoxes.segBox.minX - 6}
            y={chosenBoxes.segBox.minY - 6}
            width={chosenBoxes.segBox.maxX - chosenBoxes.segBox.minX + 12}
            height={chosenBoxes.segBox.maxY - chosenBoxes.segBox.minY + 12}
            fill="rgba(217,70,239,0.12)"
            stroke="#d946ef"
            strokeWidth={0.7}
          />
          <rect
            x={chosenBoxes.segBox.minX}
            y={chosenBoxes.segBox.minY}
            width={chosenBoxes.segBox.maxX - chosenBoxes.segBox.minX}
            height={chosenBoxes.segBox.maxY - chosenBoxes.segBox.minY}
            fill="rgba(59,130,246,0.18)"
            stroke="#2563eb"
            strokeWidth={0.7}
          />
          <rect
            x={chosenBoxes.textBox.minX}
            y={chosenBoxes.textBox.minY}
            width={chosenBoxes.textBox.maxX - chosenBoxes.textBox.minX}
            height={chosenBoxes.textBox.maxY - chosenBoxes.textBox.minY}
            fill="rgba(249,115,22,0.2)"
            stroke="#f97316"
            strokeWidth={0.7}
          />
        </>
      )}
    </g>
  );
}

function dimensionVertical(
  y0: number,
  y1: number,
  extX: number,
  dimX: number,
  toSvg: (p: Point2D) => Point2D,
  key: string,
  isOverall: boolean,
  lane = 0,
  debugMode = false,
  constraints?: DimConstraints,
) {
  const a = { x: extX, y: y0 };
  const b = { x: extX, y: y1 };
  const da = { x: dimX, y: y0 };
  const db = { x: dimX, y: y1 };
  const sa = toSvg(a);
  const sb = toSvg(b);
  const sda = toSvg(da);
  const sdb = toSvg(db);
  const mid = toSvg({ x: dimX, y: (y0 + y1) / 2 });
  const len = Math.abs(y1 - y0);
  if (len < 0.12) return null;
  const isMinor = len < 0.2;

  const tick = 5;
  const stroke = isOverall ? "#334155" : "#64748b";
  const text = `${len.toFixed(2)} m`;
  const boxW = Math.max(42, text.length * 6.2);
  const lineX = sda.x;
  const midY = mid.y;
  const gapHalf = 8;
  const minLen = constraints?.minLen ?? 0.05;
  if (len < minLen) return null;
  const maxShift = constraints?.maxLaneShift ?? 0;
  const masks = constraints?.collisionMasks ?? [];

  let chosenLane = lane;
  let chosenBoxes: {
    textBox: BoundingMask;
    segBox: BoundingMask;
    leaderBox: BoundingMask | null;
  } | null = null;
  for (let shift = 0; shift <= maxShift; shift += 1) {
    const testLane = lane + shift;
    const labelDx = testLane * 28 + (isMinor ? 20 : 0);
    const textBox = {
      minX: mid.x + 2 + labelDx,
      maxX: mid.x + 2 + labelDx + boxW,
      minY: mid.y - 10,
      maxY: mid.y + 2,
    };
    const segBox = {
      minX: lineX - 3,
      maxX: lineX + 3,
      minY: Math.min(sda.y, sdb.y),
      maxY: Math.max(sda.y, sdb.y),
    };
    const leaderBox = isMinor
      ? {
          minX: Math.min(mid.x + 2 + labelDx, lineX),
          maxX: Math.max(mid.x + 2 + labelDx, lineX),
          minY: Math.min(mid.y - 4, mid.y),
          maxY: Math.max(mid.y - 4, mid.y),
        }
      : null;
    const union = mergeMasks([textBox, segBox, ...(leaderBox ? [leaderBox] : [])]);
    if (!union || !intersectsAny(union, masks)) {
      chosenLane = testLane;
      chosenBoxes = { textBox, segBox, leaderBox };
      break;
    }
  }
  if (!chosenBoxes) return null;
  const labelDx = chosenLane * 28 + (isMinor ? 20 : 0);

  return (
    <g key={key}>
      <line x1={sa.x} y1={sa.y} x2={sda.x} y2={sda.y} stroke={stroke} strokeWidth={0.8} />
      <line x1={sb.x} y1={sb.y} x2={sdb.x} y2={sdb.y} stroke={stroke} strokeWidth={0.8} />
      <line
        x1={lineX}
        y1={sda.y}
        x2={lineX}
        y2={midY - gapHalf}
        stroke={stroke}
        strokeWidth={0.9}
      />
      <line
        x1={lineX}
        y1={midY + gapHalf}
        x2={lineX}
        y2={sdb.y}
        stroke={stroke}
        strokeWidth={0.9}
      />
      <line
        x1={sda.x - tick}
        y1={sda.y - tick}
        x2={sda.x + tick}
        y2={sda.y + tick}
        stroke={stroke}
        strokeWidth={1}
      />
      <line
        x1={sdb.x - tick}
        y1={sdb.y - tick}
        x2={sdb.x + tick}
        y2={sdb.y + tick}
        stroke={stroke}
        strokeWidth={1}
      />
      <rect
        x={mid.x + 2 + labelDx}
        y={mid.y - 10}
        width={boxW}
        height={12}
        fill="#ffffff"
        opacity={0.95}
      />
      <text
        x={mid.x + 2 + labelDx + boxW / 2}
        y={mid.y - 1}
        fontSize={10}
        fill="#1f2937"
        textAnchor="middle"
      >
        {text}
      </text>
      {isMinor && (
        <line
          x1={mid.x + 2 + labelDx}
          y1={mid.y - 4}
          x2={lineX}
          y2={mid.y}
          stroke="#64748b"
          strokeWidth={0.8}
        />
      )}
      {debugMode && (
        <>
          <rect
            x={chosenBoxes.segBox.minX - 6}
            y={chosenBoxes.segBox.minY - 6}
            width={chosenBoxes.segBox.maxX - chosenBoxes.segBox.minX + 12}
            height={chosenBoxes.segBox.maxY - chosenBoxes.segBox.minY + 12}
            fill="rgba(217,70,239,0.12)"
            stroke="#d946ef"
            strokeWidth={0.7}
          />
          <rect
            x={chosenBoxes.segBox.minX}
            y={chosenBoxes.segBox.minY}
            width={chosenBoxes.segBox.maxX - chosenBoxes.segBox.minX}
            height={chosenBoxes.segBox.maxY - chosenBoxes.segBox.minY}
            fill="rgba(59,130,246,0.18)"
            stroke="#2563eb"
            strokeWidth={0.7}
          />
          <rect
            x={chosenBoxes.textBox.minX}
            y={chosenBoxes.textBox.minY}
            width={chosenBoxes.textBox.maxX - chosenBoxes.textBox.minX}
            height={chosenBoxes.textBox.maxY - chosenBoxes.textBox.minY}
            fill="rgba(249,115,22,0.2)"
            stroke="#f97316"
            strokeWidth={0.7}
          />
        </>
      )}
    </g>
  );
}

function Legend({ layers }: { layers: LayerState }) {
  return (
    <g>
      <rect
        x={VIEW_W - 255}
        y={20}
        width={220}
        height={112}
        fill="rgba(255,255,255,0.93)"
        stroke="#cbd5e1"
      />
      <text x={VIEW_W - 245} y={40} fontSize={14} fill="#111827">
        Capas activas
      </text>
      <text x={VIEW_W - 245} y={60} fontSize={13} fill="#111827">
        Arquitectura: {layers.architecture ? "ON" : "OFF"}
      </text>
      <text x={VIEW_W - 245} y={78} fontSize={13} fill="#111827">
        Sanitaria: {layers.sanitary ? "ON" : "OFF"}
      </text>
      <text x={VIEW_W - 245} y={96} fontSize={13} fill="#111827">
        Electrica: {layers.electrical ? "ON" : "OFF"}
      </text>
      <text x={VIEW_W - 245} y={114} fontSize={13} fill="#111827">
        Cotas: {layers.dimensions ? "ON" : "OFF"}
      </text>
    </g>
  );
}

function DebugMasks({ masks, toSvg }: { masks: BoundingMask[]; toSvg: (p: Point2D) => Point2D }) {
  return (
    <g>
      {masks.map((m, i) => {
        const p1 = toSvg({ x: m.minX, y: m.maxY });
        const p2 = toSvg({ x: m.maxX, y: m.minY });
        const x = Math.min(p1.x, p2.x);
        const y = Math.min(p1.y, p2.y);
        const w = Math.abs(p2.x - p1.x);
        const h = Math.abs(p2.y - p1.y);
        return (
          <g key={`dbg-open-${i}`}>
            <rect
              x={x}
              y={y}
              width={w}
              height={h}
              fill="rgba(239,68,68,0.18)"
              stroke="#dc2626"
              strokeWidth={0.8}
            />
            <text x={x + 4} y={y + 11} fontSize={9} fill="#991b1b">
              opening-mask
            </text>
          </g>
        );
      })}
    </g>
  );
}

function estimateDimensionMargins(layout: LayoutV1 | null, dimensionsOn: boolean) {
  if (!layout || !dimensionsOn) {
    return { left: 0.4, right: 0.4, top: 0.4, bottom: 0.4 };
  }
  const bounds = boundsOfPolygon(layout.coordenadas_terreno.vertices);
  const gx = buildGrossRefsX(layout.muros_y_columnas.muros, bounds);
  const gy = buildGrossRefsY(layout.muros_y_columnas.muros, bounds);
  const minorX = gx.slice(0, -1).filter((x0, i) => Math.abs(gx[i + 1] - x0) < 0.2).length;
  const minorY = gy.slice(0, -1).filter((y0, i) => Math.abs(gy[i + 1] - y0) < 0.2).length;
  return {
    left: 0.7,
    right: 0.9 + Math.min(0.6, minorY * 0.1),
    top: 0.9 + Math.min(0.6, minorX * 0.1),
    bottom: 0.7,
  };
}

function buildTransform(
  vertices: Point2D[],
  marginsM: { left: number; right: number; top: number; bottom: number },
  viewH: number,
) {
  if (vertices.length === 0) {
    return {
      toSvg: (p: Point2D) => p,
      scale: 1,
    };
  }

  const xs = vertices.map((p) => p.x);
  const ys = vertices.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const width = Math.max(0.001, maxX - minX + marginsM.left + marginsM.right);
  const height = Math.max(0.001, maxY - minY + marginsM.bottom + marginsM.top);
  const scale = Math.min((VIEW_W - PAD * 2) / width, (viewH - PAD * 2) / height);
  const originX = minX - marginsM.left;
  const originY = minY - marginsM.bottom;

  return {
    toSvg: (p: Point2D) => ({
      x: PAD + (p.x - originX) * scale,
      y: viewH - PAD - (p.y - originY) * scale,
    }),
    scale,
  };
}

function wallPolygon(wall: WallLike, scale: number, toSvg: (p: Point2D) => Point2D) {
  const dir = normalize(sub(wall.fin, wall.inicio));
  const perp = { x: -dir.y, y: dir.x };
  const half = Math.max(0.15, wall.espesor_m || 0.15) / 2;

  const p1 = add(wall.inicio, scalePoint(perp, half));
  const p2 = add(wall.fin, scalePoint(perp, half));
  const p3 = add(wall.fin, scalePoint(perp, -half));
  const p4 = add(wall.inicio, scalePoint(perp, -half));

  const s1 = toSvg(p1);
  const s2 = toSvg(p2);
  const s3 = toSvg(p3);
  const s4 = toSvg(p4);
  return `M ${s1.x} ${s1.y} L ${s2.x} ${s2.y} L ${s3.x} ${s3.y} L ${s4.x} ${s4.y} Z`;
}

function openingGeometry(wall: WallLike, offsetM: number, widthM: number) {
  const dir = normalize(sub(wall.fin, wall.inicio));
  const perp = { x: -dir.y, y: dir.x };
  const wallLen = distance(wall.inicio, wall.fin);
  const centerOffset = clamp(offsetM, 0, wallLen);
  const center = add(wall.inicio, scalePoint(dir, centerOffset));
  const half = widthM / 2;
  const start = add(center, scalePoint(dir, -half));
  const end = add(center, scalePoint(dir, half));
  return { start, end, center, dir, perp };
}

function exportSvg(svg: SVGSVGElement | null) {
  if (!svg) return;
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const blob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vipromt-plano-cad-${Date.now()}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

function polygonPath(vertices: Point2D[], toSvg: (p: Point2D) => Point2D) {
  if (vertices.length < 3) return "";
  const first = toSvg(vertices[0]);
  let d = `M ${first.x} ${first.y}`;
  for (let i = 1; i < vertices.length; i += 1) {
    const p = toSvg(vertices[i]);
    d += ` L ${p.x} ${p.y}`;
  }
  d += " Z";
  return d;
}

function polygonCenter(vertices: Point2D[]) {
  if (!vertices.length) return { x: 0, y: 0 };
  const sum = vertices.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / vertices.length, y: sum.y / vertices.length };
}

function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

function scalePoint(p: Point2D, scalar: number): Point2D {
  return { x: p.x * scalar, y: p.y * scalar };
}

function distance(a: Point2D, b: Point2D) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function normalize(v: Point2D): Point2D {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function uniqueSorted(values: number[], tolerance: number) {
  const ordered = [...values].sort((a, b) => a - b);
  const result: number[] = [];
  for (const value of ordered) {
    if (!result.length || Math.abs(value - result[result.length - 1]) > tolerance) {
      result.push(value);
    }
  }
  return result;
}

function selectLabelAnchor(vertices: Point2D[], walls: LayoutV1["muros_y_columnas"]["muros"]) {
  const center = polygonCenter(vertices);
  const box = boundsOfPolygon(vertices);
  const spanX = box.maxX - box.minX;
  const spanY = box.maxY - box.minY;

  // Dense grid search: 7×7 = 49 candidates across the room bbox
  const steps = 7;
  const margin = 0.15; // inset from bbox edges to avoid wall overlap
  const gridCandidates: Point2D[] = [];
  for (let ix = 0; ix <= steps; ix++) {
    for (let iy = 0; iy <= steps; iy++) {
      const t = ix / steps;
      const u = iy / steps;
      gridCandidates.push({
        x: box.minX + margin + (spanX - margin * 2) * t,
        y: box.minY + margin + (spanY - margin * 2) * u,
      });
    }
  }

  // Also include center-based shifts for backward compat
  const centerShifts = [
    { x: 0, y: 0 },
    { x: spanX * 0.15, y: 0 },
    { x: -spanX * 0.15, y: 0 },
    { x: 0, y: spanY * 0.15 },
    { x: 0, y: -spanY * 0.15 },
  ];
  for (const s of centerShifts) {
    gridCandidates.push({ x: center.x + s.x, y: center.y + s.y });
  }

  const inside = gridCandidates.filter((p) => pointInPolygon(p, vertices));

  const inWalls = walls.filter((w) =>
    segmentBoxIntersectsPolygon(
      {
        minX: Math.min(w.inicio.x, w.fin.x),
        maxX: Math.max(w.inicio.x, w.fin.x),
        minY: Math.min(w.inicio.y, w.fin.y),
        maxY: Math.max(w.inicio.y, w.fin.y),
      },
      vertices,
    ),
  );

  // If no candidates pass pointInPolygon, use the geometric center as fallback
  if (!inside.length) return center;

  // Pick the candidate farthest from any wall
  return inside.reduce((best, current) => {
    const bestDist = minDistanceToWalls(best, inWalls);
    const currentDist = minDistanceToWalls(current, inWalls);
    return currentDist > bestDist ? current : best;
  }, inside[0]);
}

function minDistanceToWalls(point: Point2D, walls: LayoutV1["muros_y_columnas"]["muros"]) {
  if (!walls.length) return Number.POSITIVE_INFINITY;
  let min = Number.POSITIVE_INFINITY;
  for (const wall of walls) {
    const d = distancePointToSegment(point, wall.inicio, wall.fin);
    if (d < min) min = d;
  }
  return min;
}

function interiorWallDimensions({
  walls,
  bounds,
  openingMasks,
  toSvg,
}: {
  walls: LayoutV1["muros_y_columnas"]["muros"];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  openingMasks: BoundingMask[];
  toSvg: (p: Point2D) => Point2D;
}) {
  const eps = 0.03;
  const interior = walls.filter((w) => {
    return !isPerimeterWall(w, bounds, eps);
  });

  return (
    <g>
      {interior.map((wall) => {
        const dir = normalize(sub(wall.fin, wall.inicio));
        const perp = { x: -dir.y, y: dir.x };
        const candidates = [scalePoint(perp, 0.2), scalePoint(perp, -0.2)];
        const offsets = candidates.map((o) => ({
          offset: o,
          score: clearanceScore(add(midpoint(wall.inicio, wall.fin), o), walls),
        }));
        const selected = offsets.sort((a, b) => b.score - a.score)[0]?.offset ?? candidates[0];

        const extA = add(wall.inicio, selected);
        const extB = add(wall.fin, selected);
        const dimA = add(extA, scalePoint(normalize(selected), 0.35));
        const dimB = add(extB, scalePoint(normalize(selected), 0.35));

        const candidate = dimensionParallel(
          wall.inicio,
          wall.fin,
          extA,
          extB,
          dimA,
          dimB,
          toSvg,
          `inner-${wall.id}`,
        );
        const collides = segmentIntersectsMasks(dimA, dimB, openingMasks, 0.1);
        return collides ? null : candidate;
      })}
    </g>
  );
}

function dimensionParallel(
  wStart: Point2D,
  wEnd: Point2D,
  extStart: Point2D,
  extEnd: Point2D,
  dimStart: Point2D,
  dimEnd: Point2D,
  toSvg: (p: Point2D) => Point2D,
  key: string,
) {
  const len = distance(wStart, wEnd);
  if (len < 0.05) return null;
  const sW = toSvg(wStart);
  const eW = toSvg(wEnd);
  const sExt = toSvg(extStart);
  const eExt = toSvg(extEnd);
  const sDim = toSvg(dimStart);
  const eDim = toSvg(dimEnd);
  const mid = midpoint(dimStart, dimEnd);
  const sMid = toSvg(mid);
  const n = normalize(sub(dimEnd, dimStart));
  const t = { x: -n.y, y: n.x };
  const tick = 4;

  return (
    <g key={key}>
      <line x1={sW.x} y1={sW.y} x2={sExt.x} y2={sExt.y} stroke="#64748b" strokeWidth={0.8} />
      <line x1={eW.x} y1={eW.y} x2={eExt.x} y2={eExt.y} stroke="#64748b" strokeWidth={0.8} />
      <line x1={sDim.x} y1={sDim.y} x2={eDim.x} y2={eDim.y} stroke="#64748b" strokeWidth={0.9} />
      <line
        x1={sDim.x - t.x * tick}
        y1={sDim.y - t.y * tick}
        x2={sDim.x + t.x * tick}
        y2={sDim.y + t.y * tick}
        stroke="#64748b"
        strokeWidth={0.9}
      />
      <line
        x1={eDim.x - t.x * tick}
        y1={eDim.y - t.y * tick}
        x2={eDim.x + t.x * tick}
        y2={eDim.y + t.y * tick}
        stroke="#64748b"
        strokeWidth={0.9}
      />
      <rect
        x={sMid.x - 20}
        y={sMid.y - 11}
        width={40}
        height={12}
        fill="#ffffff"
        opacity={0.95}
        rx={1}
      />
      <text x={sMid.x} y={sMid.y - 2} fontSize={10} fill="#1f2937" textAnchor="middle">
        {len.toFixed(2)} m
      </text>
    </g>
  );
}

function boundsOfPolygon(vertices: Point2D[]) {
  const xs = vertices.map((p) => p.x);
  const ys = vertices.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function pointInPolygon(point: Point2D, polygon: Point2D[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentBoxIntersectsPolygon(
  box: { minX: number; maxX: number; minY: number; maxY: number },
  polygon: Point2D[],
) {
  const pb = boundsOfPolygon(polygon);
  return !(box.maxX < pb.minX || box.minX > pb.maxX || box.maxY < pb.minY || box.minY > pb.maxY);
}

function distancePointToSegment(point: Point2D, a: Point2D, b: Point2D) {
  const ab = sub(b, a);
  const ap = sub(point, a);
  const denom = ab.x * ab.x + ab.y * ab.y;
  const t = denom > 0 ? clamp((ap.x * ab.x + ap.y * ab.y) / denom, 0, 1) : 0;
  const proj = { x: a.x + ab.x * t, y: a.y + ab.y * t };
  return distance(point, proj);
}

function clearanceScore(point: Point2D, walls: LayoutV1["muros_y_columnas"]["muros"]) {
  return minDistanceToWalls(point, walls);
}

function openingDimension({
  start,
  end,
  offset,
  text,
  toSvg,
  keyId,
  labelLane = 0,
  debugMode = false,
}: {
  start: Point2D;
  end: Point2D;
  offset: Point2D;
  text: string;
  toSvg: (p: Point2D) => Point2D;
  keyId: string;
  labelLane?: number;
  debugMode?: boolean;
}) {
  const ds = add(start, offset);
  const de = add(end, offset);
  const s0 = toSvg(start);
  const e0 = toSvg(end);
  const s = toSvg(ds);
  const e = toSvg(de);
  const m = toSvg(midpoint(ds, de));
  const dir = normalize(sub(e, s));
  const n = { x: -dir.y, y: dir.x };
  const tick = 3.5;
  const textBoxW = Math.max(42, text.length * 6.2);
  const labelOffsetPx = 12 + labelLane * 10;
  const lx = m.x + n.x * labelOffsetPx;
  const ly = m.y + n.y * labelOffsetPx;
  const textBox = { x: lx - textBoxW / 2, y: ly - 10, width: textBoxW, height: 12 };
  const segBox = {
    x: Math.min(s.x, e.x),
    y: Math.min(s.y, e.y),
    width: Math.max(1, Math.abs(e.x - s.x)),
    height: Math.max(1, Math.abs(e.y - s.y)),
  };
  const exclusion = {
    x: segBox.x - 6,
    y: segBox.y - 6,
    width: segBox.width + 12,
    height: segBox.height + 12,
  };
  return (
    <g key={keyId}>
      <line x1={s0.x} y1={s0.y} x2={s.x} y2={s.y} stroke="#64748b" strokeWidth={0.7} />
      <line x1={e0.x} y1={e0.y} x2={e.x} y2={e.y} stroke="#64748b" strokeWidth={0.7} />
      <line x1={s.x} y1={s.y} x2={e.x} y2={e.y} stroke="#64748b" strokeWidth={0.8} />
      <line
        x1={s.x - n.x * tick}
        y1={s.y - n.y * tick}
        x2={s.x + n.x * tick}
        y2={s.y + n.y * tick}
        stroke="#64748b"
        strokeWidth={0.8}
      />
      <line
        x1={e.x - n.x * tick}
        y1={e.y - n.y * tick}
        x2={e.x + n.x * tick}
        y2={e.y + n.y * tick}
        stroke="#64748b"
        strokeWidth={0.8}
      />
      <rect
        x={textBox.x}
        y={textBox.y}
        width={textBox.width}
        height={textBox.height}
        fill="#ffffff"
        stroke="#cbd5e1"
        strokeWidth={0.6}
        opacity={0.98}
      />
      <text x={lx} y={ly - 1.5} fontSize={9} fill="#1f2937" textAnchor="middle">
        {text}
      </text>
      {debugMode && (
        <>
          <rect
            x={segBox.x}
            y={segBox.y}
            width={segBox.width}
            height={segBox.height}
            fill="rgba(59,130,246,0.18)"
            stroke="#2563eb"
            strokeWidth={0.7}
          />
          <rect
            x={exclusion.x}
            y={exclusion.y}
            width={exclusion.width}
            height={exclusion.height}
            fill="rgba(217,70,239,0.12)"
            stroke="#d946ef"
            strokeWidth={0.7}
          />
          <rect
            x={textBox.x}
            y={textBox.y}
            width={textBox.width}
            height={textBox.height}
            fill="rgba(249,115,22,0.2)"
            stroke="#f97316"
            strokeWidth={0.7}
          />
        </>
      )}
    </g>
  );
}

function doorOpeningGeometry(
  wall: WallLike,
  offsetM: number,
  widthM: number,
  abatimiento: "izquierda" | "derecha" | "corrediza" | "plegable",
) {
  const dir = normalize(sub(wall.fin, wall.inicio));
  const perp = { x: -dir.y, y: dir.x };
  const wallLen = distance(wall.inicio, wall.fin);
  const safeWidth = Math.max(widthM, 0.2);
  const startOffset = clamp(offsetM - safeWidth / 2, 0, Math.max(0, wallLen - safeWidth));
  const start = add(wall.inicio, scalePoint(dir, startOffset));
  const end = add(start, scalePoint(dir, safeWidth));
  const leftHinge = abatimiento === "izquierda";
  const hinge = leftHinge ? end : start;
  const leafClosedEnd = leftHinge ? start : end;
  const openSign = leftHinge ? -1 : 1;
  const leafOpenEnd = add(hinge, scalePoint(perp, safeWidth * openSign));
  return { start, end, hinge, leafClosedEnd, leafOpenEnd, dir, perp };
}

function swingSweepFlag(hinge: Point2D, from: Point2D, to: Point2D) {
  const v1 = { x: from.x - hinge.x, y: from.y - hinge.y };
  const v2 = { x: to.x - hinge.x, y: to.y - hinge.y };
  const cross = v1.x * v2.y - v1.y * v2.x;
  return cross <= 0 ? 1 : 0;
}

function interiorNetChains({
  refsX,
  refsY,
  yDim,
  xDim,
  toSvg,
  debugMode,
  collisionMasks,
}: {
  refsX: number[];
  refsY: number[];
  yDim: number;
  xDim: number;
  toSvg: (p: Point2D) => Point2D;
  debugMode: boolean;
  collisionMasks: BoundingMask[];
}) {
  return (
    <g>
      {refsX.slice(0, -1).map((x0, i) => {
        const x1 = refsX[i + 1];
        const segA = { x: x0, y: yDim };
        const segB = { x: x1, y: yDim };
        if (segmentIntersectsMasks(segA, segB, collisionMasks, 0.2)) return null;
        return dimensionHorizontal(
          x0,
          x1,
          yDim + 0.12,
          yDim,
          toSvg,
          `net-x-${i}`,
          false,
          0,
          debugMode,
          { collisionMasks, minLen: 0.2, maxLaneShift: 3 },
        );
      })}
      {refsY.slice(0, -1).map((y0, i) => {
        const y1 = refsY[i + 1];
        const segA = { x: xDim, y: y0 };
        const segB = { x: xDim, y: y1 };
        if (segmentIntersectsMasks(segA, segB, collisionMasks, 0.2)) return null;
        return dimensionVertical(
          y0,
          y1,
          xDim + 0.12,
          xDim,
          toSvg,
          `net-y-${i}`,
          false,
          0,
          debugMode,
          { collisionMasks, minLen: 0.2, maxLaneShift: 3 },
        );
      })}
    </g>
  );
}

function roomNetDimensions({
  rooms,
  toSvg,
  debugMode,
  collisionMasks,
}: {
  rooms: LayoutV1["ambientes"];
  toSvg: (p: Point2D) => Point2D;
  debugMode: boolean;
  collisionMasks: BoundingMask[];
}) {
  return (
    <g>
      {rooms.map((room) => {
        const b = boundsOfPolygon(room.vertices);
        const width = b.maxX - b.minX;
        const height = b.maxY - b.minY;
        if (width < 0.25 || height < 0.25) return null;
        const candidates = [
          { xDim: b.minX + width * 0.5, yDim: b.minY + height * 0.5 },
          { xDim: b.minX + width * 0.5, yDim: b.minY + height * 0.72 },
          { xDim: b.minX + width * 0.5, yDim: b.minY + height * 0.28 },
          { xDim: b.minX + width * 0.72, yDim: b.minY + height * 0.5 },
          { xDim: b.minX + width * 0.28, yDim: b.minY + height * 0.5 },
        ];

        let selected: { xDim: number; yDim: number } | null = null;
        for (const c of candidates) {
          const center = { x: c.xDim, y: c.yDim };
          if (
            intersectsAny(
              {
                minX: center.x - 0.01,
                maxX: center.x + 0.01,
                minY: center.y - 0.01,
                maxY: center.y + 0.01,
              },
              collisionMasks,
            )
          )
            continue;
          const hA = { x: b.minX, y: c.yDim };
          const hB = { x: b.maxX, y: c.yDim };
          const vA = { x: c.xDim, y: b.minY };
          const vB = { x: c.xDim, y: b.maxY };
          if (segmentIntersectsMasks(hA, hB, collisionMasks, 0.05)) continue;
          if (segmentIntersectsMasks(vA, vB, collisionMasks, 0.05)) continue;
          selected = c;
          break;
        }
        if (!selected) return null;
        return (
          <g key={`room-dims-${room.id}`}>
            {dimensionHorizontal(
              b.minX,
              b.maxX,
              selected.yDim + 0.06,
              selected.yDim,
              toSvg,
              `room-x-${room.id}`,
              false,
              0,
              debugMode,
              { collisionMasks, minLen: 0.05, maxLaneShift: 4 },
            )}
            {dimensionVertical(
              b.minY,
              b.maxY,
              selected.xDim + 0.06,
              selected.xDim,
              toSvg,
              `room-y-${room.id}`,
              false,
              0,
              debugMode,
              { collisionMasks, minLen: 0.05, maxLaneShift: 4 },
            )}
          </g>
        );
      })}
    </g>
  );
}

function boundaryWallThickness(
  walls: LayoutV1["muros_y_columnas"]["muros"],
  side: "left" | "right" | "bottom" | "top",
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  eps: number,
) {
  const candidates = walls.filter((wall) => {
    const p1 = wall.inicio;
    const p2 = wall.fin;
    if (side === "left")
      return Math.abs(p1.x - bounds.minX) <= eps && Math.abs(p2.x - bounds.minX) <= eps;
    if (side === "right")
      return Math.abs(p1.x - bounds.maxX) <= eps && Math.abs(p2.x - bounds.maxX) <= eps;
    if (side === "bottom")
      return Math.abs(p1.y - bounds.minY) <= eps && Math.abs(p2.y - bounds.minY) <= eps;
    return Math.abs(p1.y - bounds.maxY) <= eps && Math.abs(p2.y - bounds.maxY) <= eps;
  });
  return candidates.length
    ? Math.max(...candidates.map((w) => Math.max(0.05, w.espesor_m || 0.15)))
    : 0.15;
}

function isPerimeterWall(
  wall: LayoutV1["muros_y_columnas"]["muros"][number],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  eps: number,
) {
  const p1 = wall.inicio;
  const p2 = wall.fin;
  const onMinX = Math.abs(p1.x - bounds.minX) <= eps && Math.abs(p2.x - bounds.minX) <= eps;
  const onMaxX = Math.abs(p1.x - bounds.maxX) <= eps && Math.abs(p2.x - bounds.maxX) <= eps;
  const onMinY = Math.abs(p1.y - bounds.minY) <= eps && Math.abs(p2.y - bounds.minY) <= eps;
  const onMaxY = Math.abs(p1.y - bounds.maxY) <= eps && Math.abs(p2.y - bounds.maxY) <= eps;
  return onMinX || onMaxX || onMinY || onMaxY;
}

function buildGrossRefsX(
  walls: LayoutV1["muros_y_columnas"]["muros"],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const refs = [bounds.minX, bounds.maxX];
  const eps = 0.04;
  for (const wall of walls) {
    const isVertical = Math.abs(wall.fin.y - wall.inicio.y) >= Math.abs(wall.fin.x - wall.inicio.x);
    if (!isVertical) continue;
    const c = (wall.inicio.x + wall.fin.x) / 2;
    const halfE = wall.espesor_m / 2;
    // RULE-3: Skip perimeter walls whose face is flush with terrain boundary
    // These walls don't create interior divisions — their faces ARE the boundary
    const faceL = c - halfE;
    const faceR = c + halfE;
    const isPerimLeft = Math.abs(faceL - bounds.minX) <= eps || Math.abs(c - bounds.minX) <= eps;
    const isPerimRight = Math.abs(faceR - bounds.maxX) <= eps || Math.abs(c - bounds.maxX) <= eps;
    if (isPerimLeft || isPerimRight) continue;
    // Interior wall: add BOTH faces as gross refs
    refs.push(faceL, faceR);
  }
  const rawRefs = uniqueSorted(refs, 0.005).filter(
    (v) => v >= bounds.minX - 1e-6 && v <= bounds.maxX + 1e-6,
  );
  // FIX-V1: Merge any consecutive refs closer than 0.12m (sub-wall-thickness)
  return mergeCloseRefs(rawRefs, 0.12);
}

function buildClosedGrossRefs(refsInput: number[], minBound: number, maxBound: number) {
  let refs = uniqueSorted([minBound, ...refsInput, maxBound], 0.002);
  if (Math.abs(refs[0] - minBound) > 0.002) refs = [minBound, ...refs];
  if (Math.abs(refs[refs.length - 1] - maxBound) > 0.002) refs = [...refs, maxBound];

  const total = maxBound - minBound;
  const partial = refs.slice(0, -1).reduce((acc, v, i) => acc + Math.abs(refs[i + 1] - v), 0);
  if (Math.abs(partial - total) > 0.01) {
    refs = uniqueSorted([minBound, maxBound, ...refs], 0.001);
  }
  // Ensure boundary endpoints are exact
  if (refs.length > 0) {
    refs[0] = minBound;
    refs[refs.length - 1] = maxBound;
  }
  return refs;
}

function buildGrossRefsY(
  walls: LayoutV1["muros_y_columnas"]["muros"],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const refs = [bounds.minY, bounds.maxY];
  const eps = 0.04;
  for (const wall of walls) {
    const isHorizontal =
      Math.abs(wall.fin.x - wall.inicio.x) > Math.abs(wall.fin.y - wall.inicio.y);
    if (!isHorizontal) continue;
    const c = (wall.inicio.y + wall.fin.y) / 2;
    const halfE = wall.espesor_m / 2;
    // RULE-3: Skip perimeter walls flush with terrain boundary
    const faceBot = c - halfE;
    const faceTop = c + halfE;
    const isPerimBot = Math.abs(faceBot - bounds.minY) <= eps || Math.abs(c - bounds.minY) <= eps;
    const isPerimTop = Math.abs(faceTop - bounds.maxY) <= eps || Math.abs(c - bounds.maxY) <= eps;
    if (isPerimBot || isPerimTop) continue;
    refs.push(faceBot, faceTop);
  }
  const rawRefs = uniqueSorted(refs, 0.005).filter(
    (v) => v >= bounds.minY - 1e-6 && v <= bounds.maxY + 1e-6,
  );
  // FIX-V1: Merge any consecutive refs closer than 0.12m
  return mergeCloseRefs(rawRefs, 0.12);
}

// Merge consecutive refs closer than `threshold` — consolidates sub-wall-thickness fragments
function mergeCloseRefs(refs: number[], threshold: number): number[] {
  if (refs.length <= 1) return refs;
  const result: number[] = [refs[0]];
  for (let i = 1; i < refs.length; i++) {
    const last = result[result.length - 1];
    if (Math.abs(refs[i] - last) < threshold) {
      // Keep the one that is a boundary or round number
      // Replace last with midpoint
      result[result.length - 1] = (last + refs[i]) / 2;
    } else {
      result.push(refs[i]);
    }
  }
  return result;
}

function buildNetRefs(
  walls: LayoutV1["muros_y_columnas"]["muros"],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
) {
  const eps = 0.04;
  const leftEsp = boundaryWallThickness(walls, "left", bounds, eps);
  const rightEsp = boundaryWallThickness(walls, "right", bounds, eps);
  const bottomEsp = boundaryWallThickness(walls, "bottom", bounds, eps);
  const topEsp = boundaryWallThickness(walls, "top", bounds, eps);

  const innerLeft = bounds.minX + leftEsp / 2;
  const innerRight = bounds.maxX - rightEsp / 2;
  const innerBottom = bounds.minY + bottomEsp / 2;
  const innerTop = bounds.maxY - topEsp / 2;

  const refsX = [innerLeft, innerRight];
  const refsY = [innerBottom, innerTop];
  for (const wall of walls) {
    const isVertical = Math.abs(wall.fin.y - wall.inicio.y) >= Math.abs(wall.fin.x - wall.inicio.x);
    const c = isVertical ? (wall.inicio.x + wall.fin.x) / 2 : (wall.inicio.y + wall.fin.y) / 2;
    if (isVertical) {
      if (c <= innerLeft + eps || c >= innerRight - eps) continue;
      refsX.push(c - wall.espesor_m / 2, c + wall.espesor_m / 2);
    } else {
      if (c <= innerBottom + eps || c >= innerTop - eps) continue;
      refsY.push(c - wall.espesor_m / 2, c + wall.espesor_m / 2);
    }
  }
  return {
    refsX: uniqueSorted(refsX, 0.01),
    refsY: uniqueSorted(refsY, 0.01),
    yDim: innerTop - 0.18,
    xDim: innerLeft + 0.18,
  };
}

function buildRoomLabelMasks(
  rooms: LayoutV1["ambientes"],
  walls: LayoutV1["muros_y_columnas"]["muros"],
  scale: number,
) {
  const pxToM = (px: number) => px / Math.max(scale, 1e-6);
  return rooms.map((room) => {
    const anchor = selectLabelAnchor(room.vertices, walls);
    const w = pxToM(Math.max(98, Math.min(250, room.nombre.length * 6.5)));
    const hTop = pxToM(16);
    const hBottom = pxToM(14);
    return {
      minX: anchor.x - w / 2,
      maxX: anchor.x + w / 2,
      minY: anchor.y - hBottom,
      maxY: anchor.y + hTop,
    };
  });
}

function intersectsAny(mask: BoundingMask, masks: BoundingMask[]) {
  return masks.some(
    (m) => !(mask.maxX < m.minX || mask.minX > m.maxX || mask.maxY < m.minY || mask.minY > m.maxY),
  );
}

function mergeMasks(masks: BoundingMask[]) {
  if (!masks.length) return null;
  return {
    minX: Math.min(...masks.map((m) => m.minX)),
    maxX: Math.max(...masks.map((m) => m.maxX)),
    minY: Math.min(...masks.map((m) => m.minY)),
    maxY: Math.max(...masks.map((m) => m.maxY)),
  };
}

function buildOpeningMasks(
  doors: LayoutV1["puertas_ventanas"]["puertas"],
  windows: LayoutV1["puertas_ventanas"]["ventanas"],
  wallById: Map<string, WallLike>,
) {
  const masks: BoundingMask[] = [];

  for (const door of doors) {
    const wall = wallById.get(door.host_wall_id);
    if (!wall) continue;
    const g = doorOpeningGeometry(wall, door.offset_m, door.ancho_m, door.abatimiento);
    const points = [g.start, g.end, g.hinge, g.leafOpenEnd, g.leafClosedEnd];
    const b = boundsOfPoints(points);
    masks.push(expandMask(b, 0.15));
  }

  for (const win of windows) {
    const wall = wallById.get(win.host_wall_id);
    if (!wall) continue;
    const g = openingGeometry(wall, win.offset_m, win.ancho_m);
    const b = boundsOfPoints([g.start, g.end]);
    masks.push(expandMask(b, 0.12));
  }

  return masks;
}

function boundsOfPoints(points: Point2D[]): BoundingMask {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function expandMask(mask: BoundingMask, amount: number): BoundingMask {
  return {
    minX: mask.minX - amount,
    maxX: mask.maxX + amount,
    minY: mask.minY - amount,
    maxY: mask.maxY + amount,
  };
}

function segmentIntersectsMasks(a: Point2D, b: Point2D, masks: BoundingMask[], padding = 0) {
  const seg = boundsOfPoints([a, b]);
  const probe = expandMask(seg, padding);
  return masks.some(
    (m) =>
      !(probe.maxX < m.minX || probe.minX > m.maxX || probe.maxY < m.minY || probe.minY > m.maxY),
  );
}

type DimAxis = "h" | "v";
type DimCandidate = {
  id: string;
  groupId?: string;
  axis: DimAxis;
  wStart: Point2D;
  wEnd: Point2D;
  wExtStart: Point2D;
  wExtEnd: Point2D;
  text: string;
  priority: number;
  baseLane: number;
  minor: boolean;
};

type DimPlacement = {
  id: string;
  axis: DimAxis;
  stroke: string;
  segA: Point2D;
  segB: Point2D;
  extA: Point2D;
  extB: Point2D;
  tickA1: Point2D;
  tickA2: Point2D;
  tickB1: Point2D;
  tickB2: Point2D;
  text: string;
  textPos: Point2D;
  textBox: BoundingMask;
  segmentBox: BoundingMask;
  leader: { from: Point2D; via?: Point2D; to: Point2D } | null;
  unionBox: BoundingMask;
};

function buildDimCandidates({
  bounds,
  grossRefsX,
  grossRefsY,
  netRefs,
  roomAnchors,
  doors,
  windows,
  wallById,
}: {
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  grossRefsX: number[];
  grossRefsY: number[];
  netRefs: { refsX: number[]; refsY: number[]; yDim: number; xDim: number };
  roomAnchors: Array<{
    roomId: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    xDim: number;
    yDim: number;
  }>;
  doors: LayoutV1["puertas_ventanas"]["puertas"];
  windows: LayoutV1["puertas_ventanas"]["ventanas"];
  wallById: Map<string, WallLike>;
}) {
  const cands: DimCandidate[] = [];
  const addChain = (
    refs: number[],
    axis: DimAxis,
    dimCoord: number,
    extCoord: number,
    prefix: string,
    priority: number,
    baseLane: number,
  ) => {
    refs.slice(0, -1).forEach((a, i) => {
      const b = refs[i + 1];
      const len = Math.abs(b - a);
      const isWallThickness = len < 0.25;
      const isGrossChain = prefix.startsWith("gross");
      const isOverallChain = prefix.startsWith("overall");
      // FIX-1: Never drop gross/overall segments — they must cover 100% of the axis
      if (isOverallChain && len < 0.005) return;
      if (isGrossChain && len < 0.005) return;
      if (!isGrossChain && !isOverallChain && len < 0.05) return;
      if (!isGrossChain && !isOverallChain && len < 0.2) return;
      if (axis === "h") {
        cands.push({
          id: `${prefix}-${i}`,
          axis,
          wStart: { x: a, y: dimCoord },
          wEnd: { x: b, y: dimCoord },
          wExtStart: { x: a, y: extCoord },
          wExtEnd: { x: b, y: extCoord },
          text: `${len.toFixed(2)} m`,
          priority,
          baseLane,
          minor: isWallThickness || len < 0.32,
        });
      } else {
        cands.push({
          id: `${prefix}-${i}`,
          axis,
          wStart: { x: dimCoord, y: a },
          wEnd: { x: dimCoord, y: b },
          wExtStart: { x: extCoord, y: a },
          wExtEnd: { x: extCoord, y: b },
          text: `${len.toFixed(2)} m`,
          priority,
          baseLane,
          minor: isWallThickness || len < 0.32,
        });
      }
    });
  };

  addChain([bounds.minX, bounds.maxX], "h", bounds.maxY + 0.55, bounds.maxY, "overall-x", 100, 0);
  addChain([bounds.minY, bounds.maxY], "v", bounds.maxX + 0.55, bounds.maxX, "overall-y", 100, 0);
  addChain(grossRefsX, "h", bounds.maxY + 0.32, bounds.maxY, "gross-x", 85, 0);
  addChain(grossRefsY, "v", bounds.maxX + 0.32, bounds.maxX, "gross-y", 85, 0);
  // NET chains removed: they generated false interior dimensions ("2.50m" bug).
  // Room-level bounding box dims (below) provide accurate per-room measurements.

  const openingOffset = 0.25;
  for (const door of doors) {
    const wall = wallById.get(door.host_wall_id);
    if (!wall) continue;
    const g = doorOpeningGeometry(wall, door.offset_m, door.ancho_m, door.abatimiento);
    const horizontal = Math.abs(g.end.x - g.start.x) >= Math.abs(g.end.y - g.start.y);
    const dirs = [g.perp, scalePoint(g.perp, -1)];
    dirs.forEach((d, i) => {
      const off = scalePoint(normalize(d), openingOffset);
      const p1 = add(g.start, off);
      const p2 = add(g.end, off);
      if (horizontal) {
        cands.push({
          id: `open-door-${door.id}-${i}`,
          groupId: `open-door-${door.id}`,
          axis: "h",
          wStart: p1,
          wEnd: p2,
          wExtStart: g.start,
          wExtEnd: g.end,
          text: `${door.ancho_m.toFixed(2)} m`,
          priority: 65,
          baseLane: i,
          minor: false,
        });
      } else {
        cands.push({
          id: `open-door-${door.id}-${i}`,
          groupId: `open-door-${door.id}`,
          axis: "v",
          wStart: p1,
          wEnd: p2,
          wExtStart: g.start,
          wExtEnd: g.end,
          text: `${door.ancho_m.toFixed(2)} m`,
          priority: 65,
          baseLane: i,
          minor: false,
        });
      }
    });
  }
  for (const win of windows) {
    const wall = wallById.get(win.host_wall_id);
    if (!wall) continue;
    const g = openingGeometry(wall, win.offset_m, win.ancho_m);
    const horizontal = Math.abs(g.end.x - g.start.x) >= Math.abs(g.end.y - g.start.y);
    const dirs = [g.perp, scalePoint(g.perp, -1)];
    dirs.forEach((d, i) => {
      const off = scalePoint(normalize(d), openingOffset);
      const p1 = add(g.start, off);
      const p2 = add(g.end, off);
      if (horizontal) {
        cands.push({
          id: `open-win-${win.id}-${i}`,
          groupId: `open-win-${win.id}`,
          axis: "h",
          wStart: p1,
          wEnd: p2,
          wExtStart: g.start,
          wExtEnd: g.end,
          text: `${win.ancho_m.toFixed(2)} m`,
          priority: 64,
          baseLane: i,
          minor: false,
        });
      } else {
        cands.push({
          id: `open-win-${win.id}-${i}`,
          groupId: `open-win-${win.id}`,
          axis: "v",
          wStart: p1,
          wEnd: p2,
          wExtStart: g.start,
          wExtEnd: g.end,
          text: `${win.ancho_m.toFixed(2)} m`,
          priority: 64,
          baseLane: i,
          minor: false,
        });
      }
    });
  }

  for (const room of roomAnchors) {
    const w = room.maxX - room.minX;
    const h = room.maxY - room.minY;
    // Room dims: priority 80 for X, 78 for Y — X is placed first to avoid collisions
    if (w >= 0.25) {
      const yAnchors = [room.yDim, room.minY + h * 0.66, room.minY + h * 0.33];
      yAnchors.forEach((ay, idx) =>
        cands.push({
          id: `room-x-${room.roomId}-${idx}`,
          groupId: `room-x-${room.roomId}`,
          axis: "h",
          wStart: { x: room.minX, y: ay },
          wEnd: { x: room.maxX, y: ay },
          wExtStart: { x: room.minX, y: ay + 0.06 },
          wExtEnd: { x: room.maxX, y: ay + 0.06 },
          text: `${w.toFixed(2)} m`,
          priority: 80,
          baseLane: idx,
          minor: false,
        }),
      );
    }
    if (h >= 0.25) {
      const xAnchors = [room.xDim, room.minX + w * 0.66, room.minX + w * 0.33];
      xAnchors.forEach((ax, idx) =>
        cands.push({
          id: `room-y-${room.roomId}-${idx}`,
          groupId: `room-y-${room.roomId}`,
          axis: "v",
          wStart: { x: ax, y: room.minY },
          wEnd: { x: ax, y: room.maxY },
          wExtStart: { x: ax + 0.06, y: room.minY },
          wExtEnd: { x: ax + 0.06, y: room.maxY },
          text: `${h.toFixed(2)} m`,
          priority: 78,
          baseLane: idx,
          minor: false,
        }),
      );
    }
  }
  return cands;
}

function buildRoomAnchorCandidates(rooms: LayoutV1["ambientes"], hardMasks: BoundingMask[]) {
  const anchors: Array<{
    roomId: string;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    xDim: number;
    yDim: number;
  }> = [];
  for (const room of rooms) {
    const b = boundsOfPolygon(room.vertices);
    const width = b.maxX - b.minX;
    const height = b.maxY - b.minY;
    if (width < 0.25 || height < 0.25) continue;

    const candidates: Array<{ x: number; y: number }> = [];
    const steps = 8;
    for (let ix = 1; ix < steps; ix += 1) {
      for (let iy = 1; iy < steps; iy += 1) {
        candidates.push({ x: ix / steps, y: iy / steps });
      }
    }
    let best: { xDim: number; yDim: number } | null = null;
    let bestCost = Number.POSITIVE_INFINITY;
    const roomLabelW = Math.max(1.0, Math.min(3.2, room.nombre.length * 0.08));
    const roomLabel = {
      minX: b.minX + width / 2 - roomLabelW / 2,
      maxX: b.minX + width / 2 + roomLabelW / 2,
      minY: b.minY + height / 2 - 0.36,
      maxY: b.minY + height / 2 + 0.36,
    };
    for (const c of candidates) {
      const xDim = b.minX + width * c.x;
      const yDim = b.minY + height * c.y;
      const center = { x: xDim, y: yDim };
      if (!pointInPolygon(center, room.vertices)) continue;
      const probe: BoundingMask = {
        minX: xDim - 0.06,
        maxX: xDim + 0.06,
        minY: yDim - 0.06,
        maxY: yDim + 0.06,
      };
      const overlapHard = hardMasks.some((m) => intersectsAny(probe, [m])) ? 1 : 0;
      const overlapLabel = intersectsAny(probe, [roomLabel]) ? 1 : 0;
      const hLine: BoundingMask = {
        minX: b.minX,
        maxX: b.maxX,
        minY: yDim - 0.04,
        maxY: yDim + 0.04,
      };
      const vLine: BoundingMask = {
        minX: xDim - 0.04,
        maxX: xDim + 0.04,
        minY: b.minY,
        maxY: b.maxY,
      };
      const linePenalty =
        (intersectsAny(hLine, hardMasks) ? 1 : 0) + (intersectsAny(vLine, hardMasks) ? 1 : 0);
      const dx = c.x - 0.5;
      const dy = c.y - 0.5;
      const dist = Math.hypot(dx, dy) * 0.4;
      const cost = overlapHard * 50 + overlapLabel * 30 + linePenalty * 20 + dist;
      if (cost < bestCost) {
        bestCost = cost;
        best = { xDim, yDim };
      }
    }
    if (best) {
      anchors.push({
        roomId: room.id,
        minX: b.minX,
        maxX: b.maxX,
        minY: b.minY,
        maxY: b.maxY,
        xDim: best.xDim,
        yDim: best.yDim,
      });
    }
  }
  return anchors;
}

function solveDimConstraints(cands: DimCandidate[], hardMasks: BoundingMask[], scale: number) {
  const sorted = [...cands].sort((a, b) => b.priority - a.priority);
  const placedBoxes: BoundingMask[] = [];
  const placements: DimPlacement[] = [];
  const consumedGroups = new Set<string>();
  for (const cand of sorted) {
    if (cand.groupId && consumedGroups.has(cand.groupId)) continue;
    const isOverall = cand.id.startsWith("overall-");
    const isPerimeter = isOverall || cand.id.startsWith("gross-");
    const isRoom = cand.id.startsWith("room-");
    const maxShift = cand.minor ? 12 : 8;
    let accepted: DimPlacement | null = null;

    // OVERALL chains are ALWAYS placed — they are the total terrain dimension
    if (isOverall) {
      accepted = projectCandidate(cand, 0, scale);
      if (accepted) {
        placements.push(accepted);
        placedBoxes.push(accepted.unionBox);
        if (cand.groupId) consumedGroups.add(cand.groupId);
      }
      continue;
    }

    // Normal placement: try collision-free slots
    for (let shift = 0; shift <= maxShift; shift += 1) {
      const maybe = projectCandidate(cand, shift, scale);
      if (!maybe) continue;
      if (intersectsAny(maybe.unionBox, hardMasks)) continue;
      if (intersectsAny(maybe.unionBox, placedBoxes)) continue;
      accepted = maybe;
      break;
    }
    // Force-accept perimeter + room chains with higher lanes (ignore placedBoxes)
    if (!accepted && (isPerimeter || isRoom)) {
      for (let shift = maxShift + 1; shift <= maxShift + 8; shift += 1) {
        const maybe = projectCandidate(cand, shift, scale);
        if (!maybe) continue;
        if (intersectsAny(maybe.unionBox, hardMasks)) continue;
        accepted = maybe;
        break;
      }
    }
    // Last resort for room/gross dims — render at baseLane ignoring ALL collisions
    if (!accepted && (isRoom || isPerimeter)) {
      accepted = projectCandidate(cand, 0, scale);
    }
    if (accepted) {
      placements.push(accepted);
      placedBoxes.push(accepted.unionBox);
      if (cand.groupId) consumedGroups.add(cand.groupId);
    }
  }
  return { placements, placedBoxes };
}

function projectCandidate(c: DimCandidate, laneShift: number, scale: number): DimPlacement | null {
  const s = c.wStart;
  const e = c.wEnd;
  const se = c.wExtStart;
  const ee = c.wExtEnd;
  const len = distance(s, e);
  if (len < 0.005) return null;
  const pxToM = (px: number) => px / Math.max(scale, 1e-6);
  const tick = pxToM(5);
  const textW = pxToM(Math.max(42, c.text.length * 6.2));
  const textH = pxToM(12);
  // FIX-2: Strict max leader length — 40px in world coords
  const MAX_LEADER = pxToM(40);

  if (c.axis === "h") {
    const laneDy = pxToM((c.baseLane + laneShift) * 14 + (c.minor ? 18 : 0));
    const mid = midpoint(s, e);
    const textBox: BoundingMask = {
      minX: mid.x - textW / 2,
      maxX: mid.x + textW / 2,
      minY: mid.y - textH - laneDy,
      maxY: mid.y - laneDy,
    };
    const segmentBox: BoundingMask = {
      minX: Math.min(s.x, e.x),
      maxX: Math.max(s.x, e.x),
      minY: s.y - pxToM(3),
      maxY: s.y + pxToM(3),
    };
    // FIX-2: Leader line clamped to MAX_LEADER, 45° elbow
    let leader: { from: Point2D; via?: Point2D; to: Point2D } | null = null;
    if (c.minor && laneDy > pxToM(4)) {
      const leaderLen = Math.min(laneDy, MAX_LEADER);
      const elbowD = pxToM(6);
      leader = {
        from: { x: mid.x, y: mid.y - laneDy + pxToM(2) },
        via: { x: mid.x + elbowD, y: mid.y - laneDy + pxToM(2) + elbowD },
        to: { x: mid.x, y: mid.y - laneDy + pxToM(2) + leaderLen },
      };
    }
    const leaderMask = leader
      ? expandMask(boundsOfPoints([leader.from, leader.via ?? leader.from, leader.to]), pxToM(1))
      : null;
    const union = mergeMasks([
      expandMask(textBox, pxToM(2)),
      expandMask(segmentBox, pxToM(1)),
      ...(leaderMask ? [leaderMask] : []),
    ]);
    if (!union) return null;
    return {
      id: c.id,
      axis: c.axis,
      stroke: c.priority >= 100 ? "#334155" : "#64748b",
      segA: s,
      segB: e,
      extA: se,
      extB: ee,
      tickA1: { x: s.x - tick, y: s.y - tick },
      tickA2: { x: s.x + tick, y: s.y + tick },
      tickB1: { x: e.x - tick, y: e.y - tick },
      tickB2: { x: e.x + tick, y: e.y + tick },
      text: c.text,
      textPos: { x: mid.x, y: mid.y - pxToM(3) - laneDy },
      textBox,
      segmentBox,
      leader,
      unionBox: union,
    };
  }

  const laneDx = pxToM((c.baseLane + laneShift) * 28 + (c.minor ? 20 : 0));
  const mid = midpoint(s, e);
  const textBox: BoundingMask = {
    minX: mid.x + pxToM(2) + laneDx,
    maxX: mid.x + pxToM(2) + laneDx + textW,
    minY: mid.y - pxToM(10),
    maxY: mid.y + pxToM(2),
  };
  const segmentBox: BoundingMask = {
    minX: s.x - pxToM(3),
    maxX: s.x + pxToM(3),
    minY: Math.min(s.y, e.y),
    maxY: Math.max(s.y, e.y),
  };
  // FIX-2: Leader line clamped to MAX_LEADER, 45° elbow, never crosses the canvas
  let leader: { from: Point2D; via?: Point2D; to: Point2D } | null = null;
  if (c.minor && laneDx > pxToM(4)) {
    const leaderLen = Math.min(laneDx, MAX_LEADER);
    const elbowD = pxToM(6);
    leader = {
      from: { x: mid.x + pxToM(2) + laneDx, y: mid.y - pxToM(4) },
      via: { x: mid.x + pxToM(2) + laneDx - elbowD, y: mid.y - pxToM(4) + elbowD },
      to: { x: mid.x + pxToM(2) + laneDx - leaderLen, y: mid.y },
    };
  }
  const leaderMask = leader
    ? expandMask(boundsOfPoints([leader.from, leader.via ?? leader.from, leader.to]), pxToM(1))
    : null;
  const union = mergeMasks([
    expandMask(textBox, pxToM(2)),
    expandMask(segmentBox, pxToM(1)),
    ...(leaderMask ? [leaderMask] : []),
  ]);
  if (!union) return null;
  return {
    id: c.id,
    axis: c.axis,
    stroke: c.priority >= 100 ? "#334155" : "#64748b",
    segA: s,
    segB: e,
    extA: se,
    extB: ee,
    tickA1: { x: s.x - tick, y: s.y - tick },
    tickA2: { x: s.x + tick, y: s.y + tick },
    tickB1: { x: e.x - tick, y: e.y - tick },
    tickB2: { x: e.x + tick, y: e.y + tick },
    text: c.text,
    textPos: { x: mid.x + pxToM(2) + laneDx + textW / 2, y: mid.y - pxToM(1) },
    textBox,
    segmentBox,
    leader,
    unionBox: union,
  };
}

function renderPlacement(p: DimPlacement, toSvg: (p: Point2D) => Point2D, debugMode: boolean) {
  const aExt = toSvg(p.extA);
  const bExt = toSvg(p.extB);
  const aSeg = toSvg(p.segA);
  const bSeg = toSvg(p.segB);
  const tA1 = toSvg(p.tickA1);
  const tA2 = toSvg(p.tickA2);
  const tB1 = toSvg(p.tickB1);
  const tB2 = toSvg(p.tickB2);
  const textPos = toSvg(p.textPos);
  const tl = toSvg({ x: p.textBox.minX, y: p.textBox.maxY });
  const br = toSvg({ x: p.textBox.maxX, y: p.textBox.minY });
  const segTL = toSvg({ x: p.segmentBox.minX, y: p.segmentBox.maxY });
  const segBR = toSvg({ x: p.segmentBox.maxX, y: p.segmentBox.minY });
  const unionTL = toSvg({ x: p.unionBox.minX, y: p.unionBox.maxY });
  const unionBR = toSvg({ x: p.unionBox.maxX, y: p.unionBox.minY });
  const sw = 0.8;
  const fontSize = 10;
  const isRoom = p.id.startsWith("room-");

  // FIX-1: Clamp extension lines for room dims — max 20px from segment endpoint
  let clampedAExt = aExt;
  let clampedBExt = bExt;
  if (isRoom) {
    const maxExtPx = 20;
    if (p.axis === "h") {
      // Extension lines are vertical (same X, different Y)
      const dyA = aExt.y - aSeg.y;
      if (Math.abs(dyA) > maxExtPx) {
        clampedAExt = { x: aExt.x, y: aSeg.y + Math.sign(dyA) * maxExtPx };
      }
      const dyB = bExt.y - bSeg.y;
      if (Math.abs(dyB) > maxExtPx) {
        clampedBExt = { x: bExt.x, y: bSeg.y + Math.sign(dyB) * maxExtPx };
      }
    } else {
      // Extension lines are horizontal (same Y, different X)
      const dxA = aExt.x - aSeg.x;
      if (Math.abs(dxA) > maxExtPx) {
        clampedAExt = { x: aSeg.x + Math.sign(dxA) * maxExtPx, y: aExt.y };
      }
      const dxB = bExt.x - bSeg.x;
      if (Math.abs(dxB) > maxExtPx) {
        clampedBExt = { x: bSeg.x + Math.sign(dxB) * maxExtPx, y: bExt.y };
      }
    }
  }

  // FIX-2: Check if segment is too short for central line
  // Only suppress for room dims — gross/overall and door openings always show
  const isGrossOrOverall = p.id.startsWith("gross-") || p.id.startsWith("overall-");
  const isOpening = p.id.startsWith("open-");
  const segLenPx = p.axis === "h" ? Math.abs(bSeg.x - aSeg.x) : Math.abs(bSeg.y - aSeg.y);
  const textWidthPx = Math.max(1, br.x - tl.x);
  const suppressCentralLine = !isGrossOrOverall && !isOpening && segLenPx < textWidthPx + 8;

  return (
    <g key={p.id}>
      <line
        x1={clampedAExt.x}
        y1={clampedAExt.y}
        x2={aSeg.x}
        y2={aSeg.y}
        stroke={p.stroke}
        strokeWidth={sw}
      />
      <line
        x1={clampedBExt.x}
        y1={clampedBExt.y}
        x2={bSeg.x}
        y2={bSeg.y}
        stroke={p.stroke}
        strokeWidth={sw}
      />
      {/* Central dimension line — suppressed if segment is narrower than text */}
      {!suppressCentralLine &&
        (() => {
          const textGapPx = Math.max(1, br.x - tl.x) / 2 + 4;
          if (p.axis === "h") {
            return (
              <>
                <line
                  x1={aSeg.x}
                  y1={aSeg.y}
                  x2={textPos.x - textGapPx}
                  y2={aSeg.y}
                  stroke={p.stroke}
                  strokeWidth={sw + 0.1}
                />
                <line
                  x1={textPos.x + textGapPx}
                  y1={bSeg.y}
                  x2={bSeg.x}
                  y2={bSeg.y}
                  stroke={p.stroke}
                  strokeWidth={sw + 0.1}
                />
              </>
            );
          }
          const textGapPxV = Math.max(1, tl.y - br.y) / 2 + 4;
          return (
            <>
              <line
                x1={aSeg.x}
                y1={aSeg.y}
                x2={aSeg.x}
                y2={textPos.y - textGapPxV}
                stroke={p.stroke}
                strokeWidth={sw + 0.1}
              />
              <line
                x1={bSeg.x}
                y1={textPos.y + textGapPxV}
                x2={bSeg.x}
                y2={bSeg.y}
                stroke={p.stroke}
                strokeWidth={sw + 0.1}
              />
            </>
          );
        })()}
      <line x1={tA1.x} y1={tA1.y} x2={tA2.x} y2={tA2.y} stroke={p.stroke} strokeWidth={1} />
      <line x1={tB1.x} y1={tB1.y} x2={tB2.x} y2={tB2.y} stroke={p.stroke} strokeWidth={1} />
      {/* FIX-V2: White background rect behind dimension text */}
      <rect
        x={tl.x - 2}
        y={br.y - 1}
        width={Math.max(1, br.x - tl.x) + 4}
        height={Math.max(1, tl.y - br.y) + 2}
        fill="#ffffff"
        opacity={0.95}
        rx={1}
      />
      <text x={textPos.x} y={textPos.y} fontSize={fontSize} fill="#1f2937" textAnchor="middle">
        {p.text}
      </text>
      {p.leader && (
        <polyline
          points={[
            `${toSvg(p.leader.from).x},${toSvg(p.leader.from).y}`,
            ...(p.leader.via ? [`${toSvg(p.leader.via).x},${toSvg(p.leader.via).y}`] : []),
            `${toSvg(p.leader.to).x},${toSvg(p.leader.to).y}`,
          ].join(" ")}
          fill="none"
          stroke={p.stroke}
          strokeWidth={sw}
        />
      )}
      {debugMode && (
        <>
          <rect
            x={segTL.x}
            y={segBR.y}
            width={Math.max(1, segBR.x - segTL.x)}
            height={Math.max(1, segTL.y - segBR.y)}
            fill="rgba(59,130,246,0.18)"
            stroke="#2563eb"
            strokeWidth={0.7}
          />
          <rect
            x={tl.x}
            y={br.y}
            width={Math.max(1, br.x - tl.x)}
            height={Math.max(1, tl.y - br.y)}
            fill="rgba(249,115,22,0.2)"
            stroke="#f97316"
            strokeWidth={0.7}
          />
          <rect
            x={unionTL.x}
            y={unionBR.y}
            width={Math.max(1, unionBR.x - unionTL.x)}
            height={Math.max(1, unionTL.y - unionBR.y)}
            fill="rgba(217,70,239,0.12)"
            stroke="#d946ef"
            strokeWidth={0.7}
          />
        </>
      )}
    </g>
  );
}
