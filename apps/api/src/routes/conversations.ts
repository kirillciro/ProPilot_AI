import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Router } from "express";
import {
  conversationPatchSchema,
  profileSlugSchema,
  type ConversationDetail,
  type ConversationSummary,
  type MessageDto,
} from "@propilot/shared";
import { db } from "../db/client.js";
import { attachments, conversations, messages } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

export const conversationsRouter = Router();
conversationsRouter.use(requireAuth);

type Row = typeof conversations.$inferSelect;

const toSummary = (row: Row, preview: string): ConversationSummary => ({
  id: row.id,
  title: row.title,
  profile: profileSlugSchema.catch("universal").parse(row.profileSlug),
  updatedAt: row.updatedAt.toISOString(),
  archived: row.archivedAt != null,
  preview,
});

const isUuid = (v: string) => /^[0-9a-f-]{36}$/i.test(v);

const owned = (id: string, userId: string) =>
  and(
    eq(conversations.id, id),
    eq(conversations.userId, userId),
    isNull(conversations.deletedAt),
  );

conversationsRouter.get("/conversations", async (req, res) => {
  const archived = req.query.archived === "true";
  const rows = await db
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.userId, req.userId!),
        isNull(conversations.deletedAt),
        archived
          ? isNotNull(conversations.archivedAt)
          : isNull(conversations.archivedAt),
      ),
    )
    .orderBy(desc(conversations.updatedAt))
    .limit(200);

  const ids = rows.map((r) => r.id);
  const last = ids.length
    ? await db
        .selectDistinctOn([messages.conversationId], {
          conversationId: messages.conversationId,
          content: messages.content,
        })
        .from(messages)
        .where(inArray(messages.conversationId, ids))
        .orderBy(messages.conversationId, desc(messages.createdAt))
    : [];
  const preview = new Map(last.map((m) => [m.conversationId, m.content]));

  res.json(
    rows.map((r) =>
      toSummary(
        r,
        (preview.get(r.id) ?? "").replace(/\s+/g, " ").slice(0, 140),
      ),
    ),
  );
});

conversationsRouter.get("/conversations/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!isUuid(id)) return res.status(404).json({ error: "not_found" });
  const [row] = await db
    .select()
    .from(conversations)
    .where(owned(id, req.userId!))
    .limit(1);
  if (!row) return res.status(404).json({ error: "not_found" });

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(messages.createdAt);
  const files = msgs.length
    ? await db
        .select({ messageId: attachments.messageId, url: attachments.url })
        .from(attachments)
        .where(
          inArray(
            attachments.messageId,
            msgs.map((m) => m.id),
          ),
        )
        .orderBy(attachments.createdAt)
    : [];

  const dto: MessageDto[] = msgs
    .filter((m) => m.role !== "system")
    .map((m) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      images: files.filter((f) => f.messageId === m.id).map((f) => f.url),
      modelId: m.modelId,
      createdAt: m.createdAt.toISOString(),
    }));

  const detail: ConversationDetail = {
    ...toSummary(row, dto.at(-1)?.content ?? ""),
    messages: dto,
  };
  res.json(detail);
});

conversationsRouter.patch("/conversations/:id", async (req, res) => {
  const id = String(req.params.id);
  const body = conversationPatchSchema.safeParse(req.body);
  if (!isUuid(id) || !body.success)
    return res.status(400).json({ error: "invalid_body" });

  const [row] = await db
    .update(conversations)
    .set({
      ...(body.data.title !== undefined ? { title: body.data.title } : {}),
      ...(body.data.archived !== undefined
        ? { archivedAt: body.data.archived ? new Date() : null }
        : {}),
    })
    .where(owned(id, req.userId!))
    .returning();
  if (!row) return res.status(404).json({ error: "not_found" });
  res.json(toSummary(row, ""));
});

conversationsRouter.delete("/conversations/:id", async (req, res) => {
  const id = String(req.params.id);
  if (!isUuid(id)) return res.status(404).json({ error: "not_found" });
  await db.delete(conversations).where(owned(id, req.userId!));
  res.status(204).end();
});
