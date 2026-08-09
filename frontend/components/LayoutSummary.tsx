import { LayoutV1 } from "@/lib/types";

interface Props {
  layout: LayoutV1 | null;
}

export function LayoutSummary({ layout }: Props) {
  if (!layout) {
    return <p className="empty-state">Sin layout tecnico para mostrar.</p>;
  }

  const stats = [
    { label: "Terreno", value: `${layout.coordenadas_terreno.area_total_m2} m2` },
    { label: "Ambientes", value: layout.ambientes.length },
    { label: "Muros", value: layout.muros_y_columnas.muros.length },
    { label: "Columnas", value: layout.muros_y_columnas.columnas.length },
    { label: "Puertas", value: layout.puertas_ventanas.puertas.length },
    { label: "Ventanas", value: layout.puertas_ventanas.ventanas.length },
    {
      label: "Nodos de agua",
      value: layout.instalaciones_MEP.sanitaria.nodos_agua.length,
    },
    {
      label: "Nodos de desague",
      value: layout.instalaciones_MEP.sanitaria.nodos_desague.length,
    },
    { label: "Circuitos", value: layout.instalaciones_MEP.electrica.circuitos.length },
    {
      label: "Puntos electricos",
      value: layout.instalaciones_MEP.electrica.puntos.length,
    },
  ];

  return (
    <section>
      <h3>Resumen Tecnico v1</h3>
      <p className="prompt-meta">Proyecto: {layout.project_id}</p>
      <div className="stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-card">
            <div className="stat-card__label">{stat.label}</div>
            <div className="stat-card__value stat-card__value--accent">{stat.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
