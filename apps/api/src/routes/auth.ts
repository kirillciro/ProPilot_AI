import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, gte, isNull } from "drizzle-orm";
import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import {
  appleLoginSchema,
  emailRequestSchema,
  emailVerifySchema,
  refreshSchema,
} from "@propilot/shared";
import {
  CODE_TTL_MS,
  MAX_CODE_ATTEMPTS,
  hashLoginCode,
  newLoginCode,
  sendLoginCode,
} from "../auth/email.js";
import { issueSession, revokeSession, rotateSession } from "../auth/tokens.js";
import {
  findOrCreateAppleUser,
  findOrCreateUserByEmail,
  verifyAppleIdentityToken,
} from "../auth/users.js";
import { db } from "../db/client.js";
import { emailCodes } from "../db/schema.js";

export const authRouter = Router();

authRouter.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 60,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
const codeLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
});

const invalid = (res: import("express").Response, issues?: unknown) =>
  res.status(400).json({ error: "invalid_body", issues });

authRouter.post("/apple", async (req, res) => {
  const body = appleLoginSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error.issues);

  let claims;
  try {
    claims = await verifyAppleIdentityToken(body.data.identityToken);
  } catch {
    return res.status(401).json({ error: "invalid_apple_token" });
  }
  const userId = await findOrCreateAppleUser({
    ...claims,
    name: body.data.fullName,
  });
  res.json(await issueSession(userId, req.header("user-agent")?.slice(0, 120)));
});

authRouter.post("/email/request", codeLimiter, async (req, res) => {
  const body = emailRequestSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error.issues);
  const { email } = body.data;

  const recent = await db
    .select({ id: emailCodes.id })
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        gte(emailCodes.expiresAt, new Date(Date.now() + CODE_TTL_MS - 60_000)),
      ),
    );

  // Same response either way so the endpoint cannot be used to probe accounts or spam an inbox.
  if (recent.length === 0) {
    const code = newLoginCode();
    await db.insert(emailCodes).values({
      email,
      codeHash: hashLoginCode(email, code),
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    await sendLoginCode(email, code);
  }
  res.status(204).end();
});

authRouter.post("/email/verify", async (req, res) => {
  const body = emailVerifySchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error.issues);
  const { email, code } = body.data;

  const [row] = await db
    .select()
    .from(emailCodes)
    .where(
      and(
        eq(emailCodes.email, email),
        isNull(emailCodes.consumedAt),
        gt(emailCodes.expiresAt, new Date()),
      ),
    )
    .orderBy(desc(emailCodes.expiresAt))
    .limit(1);

  if (!row || row.attempts >= MAX_CODE_ATTEMPTS)
    return res.status(401).json({ error: "invalid_code" });

  const given = Buffer.from(hashLoginCode(email, code));
  const expected = Buffer.from(row.codeHash);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    await db
      .update(emailCodes)
      .set({ attempts: row.attempts + 1 })
      .where(eq(emailCodes.id, row.id));
    return res.status(401).json({ error: "invalid_code" });
  }

  const consumed = await db
    .update(emailCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(emailCodes.id, row.id), isNull(emailCodes.consumedAt)))
    .returning({ id: emailCodes.id });
  if (consumed.length === 0)
    return res.status(401).json({ error: "invalid_code" });

  const userId = await findOrCreateUserByEmail(email);
  res.json(await issueSession(userId, req.header("user-agent")?.slice(0, 120)));
});

authRouter.post("/refresh", async (req, res) => {
  const body = refreshSchema.safeParse(req.body);
  if (!body.success) return invalid(res, body.error.issues);
  const session = await rotateSession(body.data.refreshToken);
  if (!session) return res.status(401).json({ error: "invalid_refresh_token" });
  res.json(session);
});

authRouter.post("/logout", async (req, res) => {
  const body = refreshSchema.safeParse(req.body);
  if (body.success) await revokeSession(body.data.refreshToken);
  res.status(204).end();
});
