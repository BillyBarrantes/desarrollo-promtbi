import { RNEValidation } from "@/lib/types";

interface Props {
  validation: RNEValidation | null;
}

export function ValidationPanel({ validation }: Props) {
  if (!validation) {
    return <p>Sin validacion disponible.</p>;
  }

  return (
    <section>
      <h3>Validacion RNE</h3>
      <p>Estado: {validation.estado_global}</p>
      <p>
        Reglas: {validation.resumen.total_reglas} | Cumple: {validation.resumen.cumple} | No cumple: {validation.resumen.no_cumple} | No aplica: {validation.resumen.no_aplica}
      </p>
      <ul>
        {validation.reglas_evaluadas.map((rule) => (
          <li key={rule.rule_id}>
            <strong>{rule.rule_id}</strong> [{rule.resultado}] - {rule.evidencia}
          </li>
        ))}
      </ul>
    </section>
  );
}
