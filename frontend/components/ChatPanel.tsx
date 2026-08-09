"use client";

import { FormEvent, useMemo, useState } from "react";

import { ApiError, generateLayout, iterateLayout, parseRejection } from "@/lib/api";
import { ChatMessage, LayoutVersion } from "@/lib/types";
import { LayoutSummary } from "@/components/LayoutSummary";
import { Plan2DSVG } from "@/components/Plan2DSVG";
import { ValidationPanel } from "@/components/ValidationPanel";
import { VersionHistory } from "@/components/VersionHistory";
import { ChatThread } from "@/components/ChatThread";

type AppMode = "generate" | "iterate";

export function statusBadgeClass(status: LayoutVersion["status"]): string {
  switch (status) {
    case "aprobado":
      return "status-badge--ok";
    case "observado":
      return "status-badge--warn";
    case "error":
      return "status-badge--err";
    default:
      return "status-badge--err";
  }
}

function generateVersionId(index: number): string {
  return `v${index + 1}`;
}

export function ChatPanel() {
  const [projectId, setProjectId] = useState("vipromt-proj-001");
  const [prompt, setPrompt] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<AppMode>("generate");
  const [layers, setLayers] = useState({
    architecture: true,
    sanitary: true,
    electrical: true,
    dimensions: true,
  });

  // Version stack for undo/redo
  const [versionStack, setVersionStack] = useState<LayoutVersion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);

  // Chat conversation
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const currentVersion = useMemo(
    () =>
      currentIndex >= 0 && currentIndex < versionStack.length ? versionStack[currentIndex] : null,
    [versionStack, currentIndex],
  );

  const canUndo = currentIndex > 0;
  const canRedo = currentIndex < versionStack.length - 1;

  // ─── GENERATE MODE ───────────────────────────────────────
  const submitGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!prompt.trim()) return;

    setLoading(true);
    try {
      const layout = await generateLayout({ projectId, prompt, imageFile });
      const nextVersion: LayoutVersion = {
        id: generateVersionId(versionStack.length),
        prompt,
        createdAt: new Date().toISOString(),
        status: layout.validacion_RNE.estado_global,
        layout,
      };
      const newStack = [...versionStack, nextVersion];
      setVersionStack(newStack);
      setCurrentIndex(newStack.length - 1);
      setPrompt("");

      // If approved, switch to iterate mode
      if (layout.validacion_RNE.estado_global === "aprobado") {
        setMode("iterate");
        setChatMessages([
          {
            id: `sys-${Date.now()}`,
            role: "system",
            content: `Plano generado y aprobado (${nextVersion.id}). Ahora puedes editar el plano con instrucciones en lenguaje natural.`,
            timestamp: new Date().toISOString(),
            versionId: nextVersion.id,
          },
        ]);
      }
    } catch (error) {
      const nextVersionId = generateVersionId(versionStack.length);
      if (error instanceof ApiError) {
        const rejection = parseRejection(error.payload);
        const nextVersion: LayoutVersion = {
          id: nextVersionId,
          prompt,
          createdAt: new Date().toISOString(),
          status: rejection ? "rechazado" : "error",
          rejection: rejection ?? undefined,
          error: rejection ? undefined : `Error ${error.status}`,
        };
        const newStack = [...versionStack, nextVersion];
        setVersionStack(newStack);
        setCurrentIndex(newStack.length - 1);
      } else {
        const nextVersion: LayoutVersion = {
          id: nextVersionId,
          prompt,
          createdAt: new Date().toISOString(),
          status: "error",
          error: "Error inesperado al procesar solicitud",
        };
        const newStack = [...versionStack, nextVersion];
        setVersionStack(newStack);
        setCurrentIndex(newStack.length - 1);
      }
    } finally {
      setLoading(false);
    }
  };

  // ─── ITERATE MODE ────────────────────────────────────────
  const submitIterate = async (message: string) => {
    if (!currentVersion?.layout) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: message,
      timestamp: new Date().toISOString(),
    };
    setChatMessages((prev) => [...prev, userMessage]);
    setLoading(true);

    try {
      const result = await iterateLayout({
        projectId,
        message,
        currentLayout: currentVersion.layout,
        conversationHistory: chatMessages,
      });

      const nextVersion: LayoutVersion = {
        id: generateVersionId(versionStack.length),
        prompt: message,
        createdAt: new Date().toISOString(),
        status: result.layout.validacion_RNE?.estado_global ?? "aprobado",
        layout: result.layout,
      };

      // Truncate any redo history, then push
      const truncated = versionStack.slice(0, currentIndex + 1);
      const newStack = [...truncated, nextVersion];
      setVersionStack(newStack);
      setCurrentIndex(newStack.length - 1);

      const assistantMessage: ChatMessage = {
        id: `asst-${Date.now()}`,
        role: "assistant",
        content: result.change_summary,
        timestamp: new Date().toISOString(),
        versionId: nextVersion.id,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      const errorMsg =
        error instanceof ApiError
          ? `Error: ${error.status} — ${JSON.stringify((error.payload as { detail?: unknown })?.detail ?? "")}`
          : "Error inesperado al editar el plano";
      const errMessage: ChatMessage = {
        id: `err-${Date.now()}`,
        role: "system",
        content: `❌ ${errorMsg}`,
        timestamp: new Date().toISOString(),
      };
      setChatMessages((prev) => [...prev, errMessage]);
    } finally {
      setLoading(false);
    }
  };

  // ─── UNDO ────────────────────────────────────────────────
  const handleUndo = () => {
    if (!canUndo) return;
    const prevIndex = currentIndex - 1;
    setCurrentIndex(prevIndex);
    const undoMessage: ChatMessage = {
      id: `undo-${Date.now()}`,
      role: "system",
      content: `Deshecho. Volviendo a ${versionStack[prevIndex].id}.`,
      timestamp: new Date().toISOString(),
      versionId: versionStack[prevIndex].id,
    };
    setChatMessages((prev) => [...prev, undoMessage]);
  };

  const handleSelectVersion = (id: string) => {
    const idx = versionStack.findIndex((v) => v.id === id);
    if (idx >= 0) setCurrentIndex(idx);
  };

  const handleBackToGenerate = () => {
    setMode("generate");
  };

  // ─── RENDER ──────────────────────────────────────────────
  return (
    <main id="main-content" className={`app-grid ${mode === "iterate" ? "app-grid--iterate" : ""}`}>
      <aside className="panel">
        <h2>Diseño del layout</h2>

        {mode === "generate" ? (
          <form onSubmit={submitGenerate} className="form-grid">
            <div>
              <label className="field-label" htmlFor="projectId">
                Project ID
              </label>
              <input
                id="projectId"
                className="field-input"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="prompt">
                Prompt tecnico
              </label>
              <textarea
                id="prompt"
                className="field-textarea"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={6}
                placeholder="Describe requerimientos del ambiente con medidas y restricciones."
                required
              />
            </div>

            <div>
              <label className="field-label" htmlFor="image">
                Boceto/plano (opcional)
              </label>
              <input
                id="image"
                className="field-input"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? "Procesando..." : "Generar propuesta"}
            </button>
          </form>
        ) : (
          <div className="iterate-info">
            <p className="iterate-badge">Modo Edicion</p>
            <p>
              Editando: <strong>{projectId}</strong>
            </p>
            <p>
              Version actual: <strong>{currentVersion?.id ?? "—"}</strong>
            </p>
            <button type="button" className="back-to-generate" onClick={handleBackToGenerate}>
              ← Nuevo plano
            </button>
          </div>
        )}

        <div className="layer-panel">
          <h3>Capas de dibujo</h3>
          <label className="check-row">
            <input
              type="checkbox"
              checked={layers.architecture}
              onChange={(e) => setLayers((c) => ({ ...c, architecture: e.target.checked }))}
            />
            Arquitectura
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={layers.sanitary}
              onChange={(e) => setLayers((c) => ({ ...c, sanitary: e.target.checked }))}
            />
            Sanitaria
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={layers.electrical}
              onChange={(e) => setLayers((c) => ({ ...c, electrical: e.target.checked }))}
            />
            Electrica
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={layers.dimensions}
              onChange={(e) => setLayers((c) => ({ ...c, dimensions: e.target.checked }))}
            />
            Cotas
          </label>
        </div>

        <div className="layer-panel">
          <VersionHistory
            versions={versionStack}
            selectedId={currentVersion?.id ?? null}
            onSelect={handleSelectVersion}
          />
        </div>
      </aside>

      <section className="main-stack">
        <header className="panel">
          <h1 className="app-header__title">
            ViPromt
            {currentVersion && (
              <span className={`status-badge ${statusBadgeClass(currentVersion.status)}`}>
                {currentVersion.status}
              </span>
            )}
          </h1>
          <p className="app-header__sub">
            {mode === "generate"
              ? "Dibujo tecnico 2D por capas, conectado a backend local."
              : "Edicion conversacional — modifica el plano con instrucciones."}
          </p>
          {currentVersion && (
            <p className="app-header__sub app-header__meta">
              Version seleccionada: {currentVersion.id}
            </p>
          )}
        </header>

        <div className="panel">
          <h3>Prompt de la iteracion</h3>
          {currentVersion?.prompt ? (
            <p className="prompt-text">{currentVersion.prompt}</p>
          ) : (
            <p className="empty-state">Aun no hay una propuesta generada.</p>
          )}
          {currentVersion?.error && (
            <div role="alert" className="alert alert--error alert-block">
              <span className="alert__title">No se pudo procesar la solicitud</span>
              <span>{currentVersion.error}</span>
            </div>
          )}
          {currentVersion?.rejection && (
            <div role="alert" className="alert alert--warn alert-block">
              <span className="alert__title">{currentVersion.rejection.message}</span>
              <span>Alternativas para continuar:</span>
              <ul>
                {currentVersion.rejection.alternativas.map((alt) => (
                  <li key={alt}>{alt}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="panel">
          <Plan2DSVG layout={currentVersion?.layout ?? null} layers={layers} />
        </div>

        <div className="panel">
          <LayoutSummary layout={currentVersion?.layout ?? null} />
        </div>

        <div className="panel">
          <ValidationPanel
            validation={
              currentVersion?.layout?.validacion_RNE ??
              currentVersion?.rejection?.validacion_RNE ??
              null
            }
          />
        </div>
      </section>

      {mode === "iterate" && (
        <aside className="chat-panel">
          <h3>Chat de Edicion</h3>
          <ChatThread
            messages={chatMessages}
            loading={loading}
            onSend={submitIterate}
            onUndo={handleUndo}
            canUndo={canUndo}
          />
        </aside>
      )}

      <div aria-live="polite" className="visually-hidden">
        {loading ? "Procesando solicitud..." : "Listo."}
      </div>
    </main>
  );
}
