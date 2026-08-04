import { LayoutV1 } from "@/lib/types";

interface Props {
  layout: LayoutV1 | null;
}

export function LayoutSummary({ layout }: Props) {
  if (!layout) {
    return <p>Sin layout tecnico para mostrar.</p>;
  }

  return (
    <section>
      <h3>Resumen Tecnico v1</h3>
      <p>Proyecto: {layout.project_id}</p>
      <p>Terreno: {layout.coordenadas_terreno.area_total_m2} m2</p>
      <p>Ambientes: {layout.ambientes.length}</p>
      <p>
        Muros: {layout.muros_y_columnas.muros.length} | Columnas: {layout.muros_y_columnas.columnas.length}
      </p>
      <p>
        Puertas: {layout.puertas_ventanas.puertas.length} | Ventanas: {layout.puertas_ventanas.ventanas.length}
      </p>
      <p>
        Nodos agua: {layout.instalaciones_MEP.sanitaria.nodos_agua.length} | Nodos desague: {layout.instalaciones_MEP.sanitaria.nodos_desague.length}
      </p>
      <p>
        Circuitos: {layout.instalaciones_MEP.electrica.circuitos.length} | Puntos electricos: {layout.instalaciones_MEP.electrica.puntos.length}
      </p>
    </section>
  );
}
