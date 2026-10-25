import { env } from "../env.js";

const BASE_URL = "https://openrouter.ai/api/v1";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

export type Tool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
};

export type OpenRouterModel = {
  id: string;
  name: string;
  created: number;
  expiration_date: string | null;
  context_length: number | null;
  architecture: { input_modalities: string[]; output_modalities: string[] };
  pricing: {
    prompt: string;
    completion: string;
    image?: string;
    internal_reasoning?: string;
    overrides?: unknown[];
  };
  reasoning?: { mandatory?: boolean; supported_efforts?: string[] };
  benchmarks?: { artificial_analysis?: { intelligence_index?: number | null } };
};

export type Usage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  cost?: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
};

function headers() {
  return {
    Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    "HTTP-Referer": env.OPENROUTER_REFERER,
    "X-Title": env.OPENROUTER_APP_TITLE,
    "Content-Type": "application/json",
  };
}

/** Chat models that accept images and answer with text only. */
export function isVisionChatModel(m: OpenRouterModel): boolean {
  const { input_modalities, output_modalities } = m.architecture;
  return (
    input_modalities.includes("image") &&
    output_modalities.length === 1 &&
    output_modalities[0] === "text" &&
    Number(m.pricing.prompt) >= 0 && // routers report -1
    !m.id.endsWith(":batch") &&
    !m.id.includes("content-safety") &&
    // Routers may pick a text-only safety model; inkling is restricted to agent harnesses (403).
    !m.id.startsWith("openrouter/") &&
    !m.id.startsWith("thinkingmachines/") &&
    (!m.expiration_date || new Date(m.expiration_date) > new Date())
  );
}

export async function fetchVisionModels(): Promise<OpenRouterModel[]> {
  const res = await fetch(`${BASE_URL}/models`);
  if (!res.ok) throw new Error(`OpenRouter /models failed: ${res.status}`);
  const body = (await res.json()) as { data: OpenRouterModel[] };
  return body.data.filter(isVisionChatModel);
}

type ChatParams = {
  model: string;
  messages: ChatMessage[];
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
  tools?: Tool[];
};

function buildBody(p: ChatParams, stream: boolean) {
  return {
    model: p.model,
    messages: p.messages,
    stream,
    max_tokens: p.maxTokens,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    usage: { include: true },
    ...(p.effort ? { reasoning: { effort: p.effort } } : {}),
    ...(p.tools?.length ? { tools: p.tools } : {}),
  };
}

export async function chatOnce(p: ChatParams) {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildBody(p, false)),
  });
  const json = (await res.json()) as {
    choices?: { message: { content: string } }[];
    usage?: Usage;
    error?: { message: string; metadata?: { raw?: string } };
  };
  if (!res.ok) {
    const detail = json.error?.metadata?.raw;
    throw new Error(
      `${json.error?.message ?? `OpenRouter error ${res.status}`}${detail ? `: ${detail}` : ""}`,
    );
  }
  return { text: json.choices?.[0]?.message.content ?? "", usage: json.usage };
}

export type StreamEvent =
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "tool_calls"; calls: ToolCall[] };

export async function* chatStream(
  p: ChatParams,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(buildBody(p, true)),
    signal,
  });
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenRouter error ${res.status}: ${text.slice(0, 300)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  // Tool calls arrive as fragments keyed by index; arguments are concatenated JSON pieces.
  const calls = new Map<number, ToolCall>();

  read: while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      // Lines starting with ":" are SSE keep-alive comments.
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") break read;

      const chunk = JSON.parse(data) as {
        choices?: {
          delta?: {
            content?: string | null;
            tool_calls?: {
              index?: number;
              id?: string;
              function?: { name?: string; arguments?: string };
            }[];
          };
        }[];
        usage?: Usage;
        error?: { message: string };
      };
      if (chunk.error) throw new Error(chunk.error.message);
      const delta = chunk.choices?.[0]?.delta;
      if (delta?.content) yield { type: "delta", text: delta.content };
      for (const part of delta?.tool_calls ?? []) {
        const index = part.index ?? 0;
        const call = calls.get(index) ?? {
          id: "",
          type: "function" as const,
          function: { name: "", arguments: "" },
        };
        if (part.id) call.id = part.id;
        if (part.function?.name) call.function.name += part.function.name;
        if (part.function?.arguments)
          call.function.arguments += part.function.arguments;
        calls.set(index, call);
      }
      if (chunk.usage) yield { type: "usage", usage: chunk.usage };
    }
  }

  if (calls.size) {
    yield {
      type: "tool_calls",
      calls: [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([, c]) => c),
    };
  }
}
