import { RNEValidation, RuleEvaluation } from "@/lib/types";

interface Props {
  validation: RNEValidation | null;
}

function ruleBadgeClass(result: RuleEvaluation["resultado"]): string {
  switch (result) {
    case "cumple":
      return "rule-item__badge--cumple";
    case "no_cumple":
      return "rule-item__badge--no_cumple";
    default:
      return "rule-item__badge--no_aplica";
  }
}

function verdictBadgeClass(estado: RNEValidation["estado_global"]): string {
  switch (estado) {
    case "aprobado":
      return "status-badge--ok";
    case "observado":
      return "status-badge--warn";
    default:
      return "status-badge--err";
  }
}

export function ValidationPanel({ validation }: Props) {
  if (!validation) {
    return <p className="empty-state">Aun no hay resultados de validacion RNE.</p>;
  }

  return (
    <section>
      <h3>Validacion RNE</h3>
      <div className="validation-verdict">
        <span className={`status-badge ${verdictBadgeClass(validation.estado_global)}`}>
          Estado: {validation.estado_global}
        </span>
        <span className="prompt-text">
          {validation.estado_global === "aprobado"
            ? "El plano cumple con las reglas evaluadas."
            : "Revisa las reglas marcadas como no cumplidas."}
        </span>
      </div>

      <div className="validation-summary">
        <div className="stat-card">
          <div className="stat-card__label">Reglas</div>
          <div className="stat-card__value">{validation.resumen.total_reglas}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Cumple</div>
          <div className="stat-card__value stat-card__value--accent">{validation.resumen.cumple}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">No cumple</div>
          <div className="stat-card__value stat-card__value--err">{validation.resumen.no_cumple}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">No aplica</div>
          <div className="stat-card__value">{validation.resumen.no_aplica}</div>
        </div>
      </div>

      <h3>Reglas evaluadas</h3>
      <ul className="rule-list">
        {validation.reglas_evaluadas.map((rule) => (
          <li key={rule.rule_id} className="rule-item">
            <div className="rule-item__head">
              <span className={`rule-item__badge ${ruleBadgeClass(rule.resultado)}`}>{rule.resultado}</span>
              <span className="rule-item__id">{rule.rule_id}</span>
              <span className="rule-item__categoria">{rule.categoria}</span>
            </div>
            <p className="rule-item__evidence">{rule.evidencia}</p>
            {rule.valor_normativo != null && (
              <p className="rule-item__evidence">
                Normativo: <strong>{rule.valor_normativo}</strong>
                {rule.valor_observado != null && <> | Observado: <strong>{rule.valor_observado}</strong></>}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
