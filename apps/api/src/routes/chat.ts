import { rateLimit } from "express-rate-limit";
import { Router } from "express";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { sendMessageSchema } from "@propilot/shared";
import {
  chatStream,
  type ChatMessage,
  type ContentPart,
  type ToolCall,
  type Usage,
} from "../ai/openrouter.js";
import { applyAnnotations } from "../ai/annotate.js";
import { IMAGE_SEARCH_TOOL, searchImages } from "../ai/imageSearch.js";
import { systemPromptFor } from "../ai/profiles.js";
import { db } from "../db/client.js";
import { attachments, conversations, messages, users } from "../db/schema.js";
import { recordUsage, spentThisMonthEur } from "../lib/usage.js";
import { requireAuth } from "../middleware/auth.js";

export const chatRouter = Router();

// OpenRouter reserves credit for max_tokens up front; without a cap it reserves the model's maximum.
const MAX_OUTPUT_TOKENS = 4096;
const HISTORY_LIMIT = 20;
// Bounds paid search calls and model round-trips per user message.
const MAX_TOOL_ROUNDS = 2;
const MAX_CALLS_PER_ROUND = 2;

const chatLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: (req) => req.userId ?? "anon",
  validate: { keyGeneratorIpFallback: false },
});

const titleFrom = (text: string) => {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return "Photo";
  return t.length > 60 ? `${t.slice(0, 57)}…` : t;
};

const mimeOf = (url: string) =>
  /^data:(image\/[a-z0-9.+-]+);/i.exec(url)?.[1] ?? "image/jpeg";

const sumUsage = (a: Usage | undefined, b: Usage): Usage => ({
  prompt_tokens: (a?.prompt_tokens ?? 0) + (b.prompt_tokens ?? 0),
  completion_tokens: (a?.completion_tokens ?? 0) + (b.completion_tokens ?? 0),
  total_tokens: (a?.total_tokens ?? 0) + (b.total_tokens ?? 0),
  cost:
    a?.cost == null && b.cost == null
      ? undefined
      : (a?.cost ?? 0) + (b.cost ?? 0),
  prompt_tokens_details: {
    cached_tokens:
      (a?.prompt_tokens_details?.cached_tokens ?? 0) +
      (b.prompt_tokens_details?.cached_tokens ?? 0),
  },
  completion_tokens_details: {
    reasoning_tokens:
      (a?.completion_tokens_details?.reasoning_tokens ?? 0) +
      (b.completion_tokens_details?.reasoning_tokens ?? 0),
  },
});

function friendlyError(raw: string) {
  if (/afford|credits/i.test(raw))
    return "The AI provider balance is too low. Pick a free model or top up credits.";
  if (/429|rate-limit/i.test(raw))
    return "This model is busy right now (free models are rate-limited). Try again shortly or pick another model.";
  if (/403|agentic/i.test(raw))
    return "This model can't be used from an app. Pick another one.";
  return raw;
}

// Earlier turns are sent as text; only the most recent photo is re-sent so follow-up questions still work.
async function loadHistory(conversationId: string): Promise<ChatMessage[]> {
  const rows = (
    await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.createdAt))
      .limit(HISTORY_LIMIT)
  ).reverse();
  if (rows.length === 0) return [];

  const files = await db
    .select({ messageId: attachments.messageId, url: attachments.url })
    .from(attachments)
    .where(
      inArray(
        attachments.messageId,
        rows.map((r) => r.id),
      ),
    );
  const withImages = rows.filter(
    (r) => r.role === "user" && files.some((f) => f.messageId === r.id),
  );
  const latestImageMessageId = withImages.at(-1)?.id;

  const history: ChatMessage[] = [];
  for (const r of rows) {
    if (r.role === "system") continue;
    const images = files.filter((f) => f.messageId === r.id).map((f) => f.url);
    if (r.id === latestImageMessageId) {
      const parts: ContentPart[] = [
        { type: "text", text: r.content || "Describe this image." },
        ...images.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ];
      history.push({ role: "user", content: parts });
    } else if (r.content || images.length) {
      history.push({
        role: r.role,
        content:
          r.content ||
          (r.role === "user" ? "[photo sent earlier]" : "[images shown]"),
      });
    }
  }
  return history;
}

chatRouter.post("/chat", requireAuth, chatLimiter, async (req, res) => {
  const parsed = sendMessageSchema.safeParse(req.body);
  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "invalid_body", issues: parsed.error.issues });
    return;
  }
  const {
    model,
    text,
    imageUrls: rawImageUrls,
    annotations,
    thinkingEffort,
    profile,
    conversationId,
  } = parsed.data;
  const userId = req.userId!;

  const [user] = await db
    .select({
      budget: users.monthlyBudgetEur,
      block: users.blockWhenOverBudget,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) {
    res.status(401).json({ error: "unknown_user" });
    return;
  }
  if (user.block && !model.endsWith(":free")) {
    const spent = await spentThisMonthEur(userId);
    if (spent >= Number(user.budget)) {
      res.status(402).json({
        error: "budget_exceeded",
        spentEur: spent,
        budgetEur: Number(user.budget),
      });
      return;
    }
  }

  let convoId = conversationId;
  let title: string;
  let history: ChatMessage[] = [];
  // Marks are baked in so both the model and the saved history see them.
  let imageUrls = rawImageUrls;
  if (annotations.length && rawImageUrls[0]?.startsWith("data:image/")) {
    try {
      imageUrls = [
        await applyAnnotations(rawImageUrls[0], annotations),
        ...rawImageUrls.slice(1),
      ];
    } catch (err) {
      req.log.warn(err);
    }
  }
  if (convoId) {
    const [existing] = await db
      .select({ id: conversations.id, title: conversations.title })
      .from(conversations)
      .where(
        and(
          eq(conversations.id, convoId),
          eq(conversations.userId, userId),
          isNull(conversations.deletedAt),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "conversation_not_found" });
      return;
    }
    title = existing.title;
    history = await loadHistory(existing.id);
    await db
      .update(conversations)
      .set({ updatedAt: new Date(), archivedAt: null, profileSlug: profile })
      .where(eq(conversations.id, existing.id));
  } else {
    title = titleFrom(text);
    const [created] = await db
      .insert(conversations)
      .values({ userId, title, profileSlug: profile })
      .returning({ id: conversations.id });
    convoId = created!.id;
  }

  const [userMsg] = await db
    .insert(messages)
    .values({ conversationId: convoId, role: "user", content: text })
    .returning({ id: messages.id });
  if (imageUrls.length) {
    await db.insert(attachments).values(
      imageUrls.map((url) => ({
        messageId: userMsg!.id,
        url,
        mime: mimeOf(url),
      })),
    );
  }

  const chatMessages: ChatMessage[] = [
    { role: "system", content: systemPromptFor(profile) },
    ...history,
    {
      role: "user",
      content: [
        { type: "text", text: text || "Describe this image." },
        ...imageUrls.map((url) => ({
          type: "image_url" as const,
          image_url: { url },
        })),
      ],
    },
  ];

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(
    `event: conversation\ndata: ${JSON.stringify({ id: convoId, title })}\n\n`,
  );

  const abort = new AbortController();
  res.on("close", () => abort.abort());

  let reply = "";
  let usage: Usage | undefined;
  let failure: string | undefined;
  const foundImages: string[] = [];

  const runTool = async (call: ToolCall) => {
    if (call.function.name !== "search_images")
      return JSON.stringify({ error: "unknown tool" });
    try {
      const args = JSON.parse(call.function.arguments || "{}") as {
        query?: unknown;
      };
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) return JSON.stringify({ error: "query is required" });
      const hits = (await searchImages(query)).filter(
        (h) => !foundImages.includes(h.url),
      );
      foundImages.push(...hits.map((h) => h.url));
      if (hits.length) {
        res.write(
          `event: images\ndata: ${JSON.stringify({ images: hits.map((h) => h.url) })}\n\n`,
        );
      }
      return JSON.stringify({
        shown_to_user: hits.length,
        results: hits.map((h) => ({ title: h.title, source: h.pageUrl })),
      });
    } catch (err) {
      req.log.warn(err);
      return JSON.stringify({ error: "image search is unavailable right now" });
    }
  };

  let rounds = 0;
  let useTools = true;
  while (true) {
    const offerTools = useTools && rounds < MAX_TOOL_ROUNDS;
    let calls: ToolCall[] = [];
    let produced = "";
    try {
      for await (const event of chatStream(
        {
          model,
          messages: chatMessages,
          effort: thinkingEffort,
          maxTokens: MAX_OUTPUT_TOKENS,
          tools: offerTools ? [IMAGE_SEARCH_TOOL] : undefined,
        },
        abort.signal,
      )) {
        if (event.type === "delta") {
          reply += event.text;
          produced += event.text;
          res.write(`event: delta\ndata: ${JSON.stringify(event)}\n\n`);
        } else if (event.type === "usage") {
          usage = sumUsage(usage, event.usage);
          res.write(
            `event: usage\ndata: ${JSON.stringify({ type: "usage", usage })}\n\n`,
          );
        } else {
          calls = event.calls.slice(0, MAX_CALLS_PER_ROUND);
        }
      }
    } catch (err) {
      if (abort.signal.aborted) break;
      const raw = (err as Error).message;
      // Some models reject the tools parameter; retry the same turn without it.
      if (offerTools && !produced && /tool/i.test(raw)) {
        useTools = false;
        continue;
      }
      failure = friendlyError(raw);
      break;
    }
    if (calls.length === 0) break;

    rounds++;
    chatMessages.push({
      role: "assistant",
      content: produced || null,
      tool_calls: calls,
    });
    for (const call of calls) {
      chatMessages.push({
        role: "tool",
        tool_call_id: call.id,
        content: await runTool(call),
      });
    }
  }

  // Keep whatever was generated, even if the stream failed or the client left.
  try {
    let messageId: string | undefined;
    if (reply || foundImages.length) {
      const [saved] = await db
        .insert(messages)
        .values({
          conversationId: convoId,
          parentId: userMsg!.id,
          role: "assistant",
          content: reply,
          modelId: model,
        })
        .returning({ id: messages.id });
      messageId = saved!.id;
      if (foundImages.length) {
        await db.insert(attachments).values(
          foundImages.map((url) => ({
            messageId: messageId!,
            url,
            mime: mimeOf(url),
          })),
        );
      }
      await db
        .update(conversations)
        .set({ updatedAt: new Date() })
        .where(eq(conversations.id, convoId));
    }
    if (usage) {
      await recordUsage(userId, model, usage, {
        conversationId: convoId,
        messageId,
      });
    }
  } catch (err) {
    req.log.error(err);
  }

  if (failure) {
    res.write(
      `event: error\ndata: ${JSON.stringify({ message: failure })}\n\n`,
    );
  } else {
    res.write("event: done\ndata: {}\n\n");
  }
  res.end();
});
