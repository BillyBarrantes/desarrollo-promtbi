"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/lib/types";

interface Props {
  messages: ChatMessage[];
  loading: boolean;
  onSend: (message: string) => void;
  onUndo: () => void;
  canUndo: boolean;
}

export function ChatThread({ messages, loading, onSend, onUndo, canUndo }: Props) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;
    onSend(input.trim());
    setInput("");
  };

  return (
    <div className="chat-thread">
      <div
        className="chat-messages"
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Historial de la conversacion"
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            <p>Escribe una instrucción para editar el plano actual.</p>
            <p className="chat-hint">
              Ej: &quot;Mueve el baño al frente&quot;, &quot;Agranda el dormitorio&quot;
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble chat-${msg.role}`}>
            <div className="chat-bubble-header">
              {msg.role === "user"
                ? "🧑 Tú"
                : msg.role === "assistant"
                  ? "🤖 ViPromt"
                  : "⚙️ Sistema"}
              <span className="chat-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="chat-bubble-content">{msg.content}</div>
            {msg.versionId && <span className="chat-version-tag">{msg.versionId}</span>}
          </div>
        ))}
        {loading && (
          <div className="chat-bubble chat-assistant" aria-busy="true">
            <div className="chat-bubble-header">🤖 ViPromt</div>
            <div className="chat-bubble-content chat-typing">
              <span></span>
              <span></span>
              <span></span> Editando plano...
            </div>
          </div>
        )}
      </div>
      <form className="chat-input-bar" onSubmit={handleSubmit}>
        {canUndo && (
          <button
            type="button"
            className="chat-undo-btn"
            onClick={onUndo}
            aria-label="Deshacer ultimo cambio"
            title="Deshacer ultimo cambio"
          >
            ↩
          </button>
        )}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Instrucción de edición..."
          disabled={loading}
          className="chat-input"
          aria-label="Instruccion de edicion"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="chat-send-btn"
          aria-label="Enviar instruccion"
        >
          {loading ? "..." : "→"}
        </button>
      </form>
    </div>
  );
}
