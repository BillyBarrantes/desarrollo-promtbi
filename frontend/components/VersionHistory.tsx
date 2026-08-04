import { LayoutVersion } from "@/lib/types";

interface Props {
  versions: LayoutVersion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function VersionHistory({ versions, selectedId, onSelect }: Props) {
  if (versions.length === 0) {
    return <p>Aun no hay versiones generadas.</p>;
  }

  return (
    <section>
      <h3>Historial de Versiones</h3>
      <ul>
        {versions.map((version) => (
          <li key={version.id}>
            <button type="button" onClick={() => onSelect(version.id)}>
              {selectedId === version.id ? "* " : ""}
              {version.id} - {version.status} - {new Date(version.createdAt).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
