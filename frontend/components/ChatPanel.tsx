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
    () => (currentIndex >= 0 && currentIndex < versionStack.length ? versionStack[currentIndex] : null),
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
        setChatMessages([{
          id: `sys-${Date.now()}`,
          role: "system",
          content: `✅ Plano generado y aprobado (${nextVersion.id}). Ahora puedes editar el plano con instrucciones en lenguaje natural.`,
          timestamp: new Date().toISOString(),
          versionId: nextVersion.id,
        }]);
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
      const errorMsg = error instanceof ApiError
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
      content: `↩ Deshecho. Volviendo a ${versionStack[prevIndex].id}.`,
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
    <main className={`app-grid ${mode === "iterate" ? "app-grid--iterate" : ""}`}>
      <aside className="panel">
        <h2>Iteracion de Diseno</h2>

        {mode === "generate" ? (
          <form onSubmit={submitGenerate} className="form-grid">
            <label htmlFor="projectId">Project ID</label>
            <input id="projectId" value={projectId} onChange={(e) => setProjectId(e.target.value)} required />

            <label htmlFor="prompt">Prompt tecnico</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={6}
              placeholder="Describe requerimientos del ambiente con medidas y restricciones."
              required
            />

            <label htmlFor="image">Boceto/plano (opcional)</label>
            <input
              id="image"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />

            <button type="submit" disabled={loading}>
              {loading ? "Procesando..." : "Generar propuesta"}
            </button>
          </form>
        ) : (
          <div className="iterate-info">
            <p className="iterate-badge">✏️ Modo Edición</p>
            <p>Editando: <strong>{projectId}</strong></p>
            <p>Versión actual: <strong>{currentVersion?.id ?? "—"}</strong></p>
            <button type="button" className="back-to-generate" onClick={handleBackToGenerate}>
              ← Nuevo plano
            </button>
          </div>
        )}

        <div className="layer-panel">
          <h3>Capas de dibujo</h3>
          <label>
            <input type="checkbox" checked={layers.architecture} onChange={(e) => setLayers((c) => ({ ...c, architecture: e.target.checked }))} />
            Arquitectura
          </label>
          <label>
            <input type="checkbox" checked={layers.sanitary} onChange={(e) => setLayers((c) => ({ ...c, sanitary: e.target.checked }))} />
            Sanitaria
          </label>
          <label>
            <input type="checkbox" checked={layers.electrical} onChange={(e) => setLayers((c) => ({ ...c, electrical: e.target.checked }))} />
            Electrica
          </label>
          <label>
            <input type="checkbox" checked={layers.dimensions} onChange={(e) => setLayers((c) => ({ ...c, dimensions: e.target.checked }))} />
            Cotas
          </label>
        </div>

        <div style={{ marginTop: 14 }}>
          <VersionHistory
            versions={versionStack}
            selectedId={currentVersion?.id ?? null}
            onSelect={handleSelectVersion}
          />
        </div>
      </aside>

      <section className="main-stack">
        <header className="panel">
          <h1>ViPromt - Fase 5</h1>
          <p>
            {mode === "generate"
              ? "Dibujo tecnico 2D por capas, conectado a backend local 8003."
              : "Edición conversacional — modifica el plano con instrucciones."}
          </p>
          {currentVersion && <p>Version seleccionada: {currentVersion.id}</p>}
        </header>

        <div className="panel">
          <h3>Prompt de la iteracion</h3>
          <p>{currentVersion?.prompt ?? "Sin prompt seleccionado."}</p>
          {currentVersion?.error && <p style={{ color: "var(--err)" }}>{currentVersion.error}</p>}
          {currentVersion?.rejection && (
            <>
              <p style={{ color: "var(--warn)" }}>{currentVersion.rejection.message}</p>
              <ul>
                {currentVersion.rejection.alternativas.map((alt) => (
                  <li key={alt}>{alt}</li>
                ))}
              </ul>
            </>
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
            validation={currentVersion?.layout?.validacion_RNE ?? currentVersion?.rejection?.validacion_RNE ?? null}
          />
        </div>
      </section>

      {mode === "iterate" && (
        <aside className="chat-panel">
          <h3>Chat de Edición</h3>
          <ChatThread
            messages={chatMessages}
            loading={loading}
            onSend={submitIterate}
            onUndo={handleUndo}
            canUndo={canUndo}
          />
        </aside>
      )}
    </main>
  );
}
