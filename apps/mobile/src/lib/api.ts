import { fetch } from "expo/fetch";
import type {
  ConversationDetail,
  ConversationSummary,
  MeResponse,
  ModelInfo,
  SendMessageRequest,
  SessionResponse,
  UsageSummary,
} from "@propilot/shared";
import { API_URL } from "./config";
import { getAccessToken, invalidateAccessToken } from "./session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

async function errorFrom(res: Awaited<ReturnType<typeof fetch>>) {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  const code = body.error ?? `http_${res.status}`;
  const message =
    code === "budget_exceeded"
      ? "Monthly budget reached. Raise it in Usage & Billing or pick a free model."
      : code === "rate_limited"
        ? "Too many requests. Wait a moment and try again."
        : `Request failed (${res.status})`;
  return new ApiError(res.status, code, message);
}

// Adds the bearer token and retries once with a fresh one if the server says 401.
async function authed(
  path: string,
  init: { method?: string; body?: string; signal?: AbortSignal } = {},
) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken();
    if (!token)
      throw new ApiError(401, "unauthorized", "Please sign in again.");
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${token}`,
      },
    });
    if (res.status === 401 && attempt === 0) {
      invalidateAccessToken();
      continue;
    }
    return res;
  }
  throw new ApiError(401, "unauthorized", "Please sign in again.");
}

async function json<T>(
  path: string,
  init?: { method?: string; body?: string },
) {
  const res = await authed(path, init);
  if (!res.ok) throw await errorFrom(res);
  return (await res.json()) as T;
}

async function publicPost<T>(path: string, body: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await errorFrom(res);
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const loginWithApple = (identityToken: string, fullName?: string) =>
  publicPost<SessionResponse>("/auth/apple", { identityToken, fullName });
export const requestEmailCode = (email: string) =>
  publicPost<void>("/auth/email/request", { email });
export const verifyEmailCode = (email: string, code: string) =>
  publicPost<SessionResponse>("/auth/email/verify", { email, code });

export const getMe = () => json<MeResponse>("/v1/me");
export const updateMe = (patch: {
  monthlyBudgetEur?: number;
  blockWhenOverBudget?: boolean;
}) =>
  json<MeResponse>("/v1/me", { method: "PATCH", body: JSON.stringify(patch) });
export const deleteMe = async () => {
  const res = await authed("/v1/me", { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res);
};
export const getModels = () => json<ModelInfo[]>("/v1/models");
export const getUsage = () => json<UsageSummary>("/v1/usage/summary");

export const listConversations = (archived: boolean) =>
  json<ConversationSummary[]>(`/v1/conversations?archived=${archived}`);
export const getConversation = (id: string) =>
  json<ConversationDetail>(`/v1/conversations/${id}`);
export const patchConversation = (
  id: string,
  patch: { title?: string; archived?: boolean },
) =>
  json<ConversationSummary>(`/v1/conversations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
export const deleteConversation = async (id: string) => {
  const res = await authed(`/v1/conversations/${id}`, { method: "DELETE" });
  if (!res.ok) throw await errorFrom(res);
};

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  cost?: number;
};

type Handlers = {
  onDelta: (text: string) => void;
  onUsage?: (usage: Usage) => void;
  onImages?: (urls: string[]) => void;
  onConversation?: (conversation: { id: string; title: string }) => void;
};

export async function streamChat(
  body: SendMessageRequest,
  handlers: Handlers,
  signal?: AbortSignal,
) {
  const res = await authed("/v1/chat", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw await errorFrom(res);
  if (!res.body) throw new Error("Empty response");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary: number;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);

      const event = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.+)$/m.exec(block)?.[1];
      if (!event || !data) continue;

      const payload = JSON.parse(data) as {
        id?: string;
        title?: string;
        text?: string;
        usage?: Usage;
        message?: string;
        images?: string[];
      };
      if (event === "conversation" && payload.id)
        handlers.onConversation?.({
          id: payload.id,
          title: payload.title ?? "",
        });
      else if (event === "delta" && payload.text)
        handlers.onDelta(payload.text);
      else if (event === "usage" && payload.usage)
        handlers.onUsage?.(payload.usage);
      else if (event === "images" && payload.images)
        handlers.onImages?.(payload.images);
      else if (event === "error")
        throw new Error(payload.message ?? "Stream error");
    }
  }
}
