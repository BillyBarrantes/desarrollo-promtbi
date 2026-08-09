"use client";

import { LayoutV1, Point2D } from "@/lib/types";

type BlockType = LayoutV1["mobiliario"][number]["block_type"];

/** Real-world dimensions (meters) for each furniture block. */
export const BLOCK_DIMENSIONS: Record<BlockType, { w: number; h: number }> = {
  cama: { w: 1.4, h: 2.0 },
  inodoro: { w: 0.4, h: 0.65 },
  lavabo: { w: 0.55, h: 0.45 },
  mesa: { w: 1.2, h: 0.8 },
  auto: { w: 2.4, h: 5.0 },
  sofa: { w: 2.1, h: 0.9 },
  cocina: { w: 2.4, h: 0.6 },
  ducha: { w: 0.9, h: 0.9 },
  otro: { w: 0.6, h: 0.6 },
};

interface BlockProps {
  type: BlockType;
  insertion: Point2D; // Already in SVG px coordinates
  rotationDeg: number;
  scale: number; // User-defined scale multiplier (from layout JSON)
  pxPerMeter: number; // Conversion factor from meters to SVG px
}

export function CADBlock({ type, insertion, rotationDeg, scale, pxPerMeter }: BlockProps) {
  const dim = BLOCK_DIMENSIONS[type] ?? BLOCK_DIMENSIONS.otro;
  // Real-world size in pixels
  const wPx = dim.w * pxPerMeter * Math.max(0.2, scale);
  const hPx = dim.h * pxPerMeter * Math.max(0.2, scale);

  return (
    <g transform={`translate(${insertion.x} ${insertion.y}) rotate(${rotationDeg})`}>
      <g transform={`scale(${wPx} ${hPx})`}>{renderBlock(type)}</g>
    </g>
  );
}

/**
 * All block shapes are drawn in NORMALIZED coordinates: [-0.5, -0.5] to [0.5, 0.5].
 * They get scaled to real-world px dimensions by the parent <g>.
 */
function renderBlock(type: BlockType) {
  const s = 0.015; // normalized stroke width

  switch (type) {
    case "cama":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#e2e8f0" fillOpacity={0.4}>
          {/* Mattress outline */}
          <rect x={-0.5} y={-0.5} width={1} height={1} rx={0.03} />
          {/* Pillows */}
          <rect
            x={-0.42}
            y={-0.44}
            width={0.35}
            height={0.16}
            rx={0.04}
            fill="#cbd5e1"
            fillOpacity={0.6}
          />
          <rect
            x={0.07}
            y={-0.44}
            width={0.35}
            height={0.16}
            rx={0.04}
            fill="#cbd5e1"
            fillOpacity={0.6}
          />
          {/* Blanket line */}
          <line x1={-0.45} y1={-0.1} x2={0.45} y2={-0.1} strokeDasharray="0.04 0.02" />
        </g>
      );
    case "inodoro":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#f1f5f9" fillOpacity={0.5}>
          <ellipse cx={0} cy={0.08} rx={0.4} ry={0.42} />
          <rect x={-0.3} y={-0.5} width={0.6} height={0.3} rx={0.05} />
        </g>
      );
    case "lavabo":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#f1f5f9" fillOpacity={0.5}>
          <rect x={-0.48} y={-0.46} width={0.96} height={0.92} rx={0.08} />
          <ellipse cx={0} cy={0} rx={0.28} ry={0.22} fill="none" />
          <circle cx={0} cy={-0.12} r={0.04} fill="#334155" />
        </g>
      );
    case "mesa":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#fef3c7" fillOpacity={0.3}>
          <rect x={-0.5} y={-0.5} width={1} height={1} rx={0.02} />
          {/* Chairs as circles */}
          <circle cx={-0.55} cy={-0.3} r={0.07} fill="none" />
          <circle cx={0.55} cy={-0.3} r={0.07} fill="none" />
          <circle cx={-0.55} cy={0.3} r={0.07} fill="none" />
          <circle cx={0.55} cy={0.3} r={0.07} fill="none" />
        </g>
      );
    case "auto":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#e2e8f0" fillOpacity={0.3}>
          <rect x={-0.48} y={-0.5} width={0.96} height={1} rx={0.08} />
          {/* Windshield */}
          <line x1={-0.35} y1={-0.3} x2={0.35} y2={-0.3} />
          {/* Rear */}
          <line x1={-0.35} y1={0.3} x2={0.35} y2={0.3} />
          {/* Wheels */}
          <ellipse cx={-0.42} cy={-0.38} rx={0.06} ry={0.08} fill="#475569" fillOpacity={0.5} />
          <ellipse cx={0.42} cy={-0.38} rx={0.06} ry={0.08} fill="#475569" fillOpacity={0.5} />
          <ellipse cx={-0.42} cy={0.38} rx={0.06} ry={0.08} fill="#475569" fillOpacity={0.5} />
          <ellipse cx={0.42} cy={0.38} rx={0.06} ry={0.08} fill="#475569" fillOpacity={0.5} />
        </g>
      );
    case "sofa":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#ddd6fe" fillOpacity={0.3}>
          {/* Back */}
          <rect x={-0.5} y={-0.5} width={1} height={0.25} rx={0.04} />
          {/* Seat */}
          <rect
            x={-0.5}
            y={-0.25}
            width={1}
            height={0.75}
            rx={0.04}
            fill="#ede9fe"
            fillOpacity={0.3}
          />
          {/* Armrests */}
          <rect x={-0.5} y={-0.25} width={0.1} height={0.75} rx={0.03} />
          <rect x={0.4} y={-0.25} width={0.1} height={0.75} rx={0.03} />
        </g>
      );
    case "cocina":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#fef9c3" fillOpacity={0.3}>
          <rect x={-0.5} y={-0.5} width={1} height={1} />
          {/* Burners */}
          <circle cx={-0.22} cy={-0.15} r={0.1} fill="none" />
          <circle cx={0.22} cy={-0.15} r={0.1} fill="none" />
          <circle cx={-0.22} cy={0.2} r={0.08} fill="none" />
          <circle cx={0.22} cy={0.2} r={0.08} fill="none" />
          {/* Divider */}
          <line x1={0} y1={-0.5} x2={0} y2={0.5} strokeDasharray="0.04 0.02" />
        </g>
      );
    case "ducha":
      return (
        <g stroke="#334155" strokeWidth={s} fill="#e0f2fe" fillOpacity={0.3}>
          <rect x={-0.5} y={-0.5} width={1} height={1} />
          {/* Diagonal drain indicator */}
          <line x1={-0.5} y1={-0.5} x2={0.5} y2={0.5} />
          <line x1={0.5} y1={-0.5} x2={-0.5} y2={0.5} />
          {/* Drain */}
          <circle cx={0} cy={0} r={0.06} fill="#94a3b8" fillOpacity={0.5} />
        </g>
      );
    default:
      return (
        <g stroke="#334155" strokeWidth={s} fill="#f1f5f9" fillOpacity={0.3}>
          <rect x={-0.5} y={-0.5} width={1} height={1} />
          <line x1={-0.5} y1={-0.5} x2={0.5} y2={0.5} />
        </g>
      );
  }
}
