import { ChatMessage, IterateResponse, LayoutV1, RejectionDetail } from "@/lib/types";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8003";

export class ApiError extends Error {
  readonly status: number;
  readonly payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

export async function generateLayout(params: {
  projectId: string;
  prompt: string;
  imageFile: File | null;
}): Promise<LayoutV1> {
  const body = new FormData();
  body.set("project_id", params.projectId);
  body.set("prompt", params.prompt);
  if (params.imageFile) {
    body.set("image", params.imageFile);
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/layouts/generate`, {
    method: "POST",
    body,
  });

  const data = await safeJson(response);
  if (!response.ok) {
    throw new ApiError(
      `Backend request failed with status ${response.status}`,
      response.status,
      data,
    );
  }

  return data as LayoutV1;
}

export async function iterateLayout(params: {
  projectId: string;
  message: string;
  currentLayout: LayoutV1;
  conversationHistory: ChatMessage[];
}): Promise<IterateResponse> {
  const body = new FormData();
  body.set("project_id", params.projectId);
  body.set("message", params.message);
  body.set("current_layout", JSON.stringify(params.currentLayout));
  body.set("conversation_history", JSON.stringify(params.conversationHistory));

  const response = await fetch(`${API_BASE_URL}/api/v1/layouts/iterate`, {
    method: "POST",
    body,
  });

  const data = await safeJson(response);
  if (!response.ok) {
    throw new ApiError(
      `Iterate request failed with status ${response.status}`,
      response.status,
      data,
    );
  }

  return data as IterateResponse;
}

export function parseRejection(payload: unknown): RejectionDetail | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const detail = (payload as { detail?: unknown }).detail;
  if (!detail || typeof detail !== "object") {
    return null;
  }

  const typed = detail as Partial<RejectionDetail>;
  if (!typed.message || !typed.validacion_RNE || !typed.alternativas) {
    return null;
  }

  return typed as RejectionDetail;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return { detail: "Invalid JSON response" };
  }
}
