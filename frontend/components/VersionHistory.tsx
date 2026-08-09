import { LayoutVersion } from "@/lib/types";

interface Props {
  versions: LayoutVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function StatusBadge({ status }: { status: LayoutVersion["status"] }) {
  let badgeClass = "status-badge--neutral";
  if (status === "aprobado") badgeClass = "status-badge--ok";
  if (status === "observado") badgeClass = "status-badge--warn";
  if (status === "rechazado" || status === "error") badgeClass = "status-badge--err";

  return <span className={`status-badge ${badgeClass}`}>{status}</span>;
}

export function VersionHistory({ versions, selectedId, onSelect }: Props) {
  if (versions.length === 0) {
    return (
      <section>
        <h3>Historial de Versiones</h3>
        <p className="empty-state">Aun no hay versiones generadas. Genera una propuesta para comenzar.</p>
      </section>
    );
  }

  return (
    <section>
      <h3>Historial de Versiones</h3>
      <ul className="history-list">
        {versions.map((version) => {
          const active = selectedId === version.id;
          return (
            <li key={version.id} className={active ? "history-item history-item--active" : "history-item"}>
              <button
                type="button"
                className="history-item__btn"
                onClick={() => onSelect(version.id)}
                aria-current={active ? "true" : undefined}
              >
                <span className="history-item__info">
                  <span className="history-item__id">{version.id}</span>
                  <span className="history-item__meta">
                    {new Date(version.createdAt).toLocaleString()}
                  </span>
                </span>
                <StatusBadge status={version.status} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
