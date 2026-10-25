import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { db } from "../db/client.js";
import { refreshTokens } from "../db/schema.js";
import { env } from "../env.js";

const key = new TextEncoder().encode(env.JWT_SECRET);
const ISSUER = "propilot-api";
export const ACCESS_TTL_S = 15 * 60;
const REFRESH_TTL_MS = 60 * 24 * 60 * 60 * 1000;

export const sha256 = (value: string) =>
  createHash("sha256").update(value).digest("hex");

export function signAccessToken(userId: string) {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL_S}s`)
    .sign(key);
}

export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, key, {
    issuer: ISSUER,
    algorithms: ["HS256"],
  });
  if (!payload.sub) throw new Error("token has no subject");
  return payload.sub;
}

export async function issueSession(
  userId: string,
  deviceLabel?: string | null,
) {
  const refreshToken = randomBytes(32).toString("base64url");
  await db.insert(refreshTokens).values({
    userId,
    tokenHash: sha256(refreshToken),
    deviceLabel: deviceLabel ?? null,
    expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
  });
  return {
    accessToken: await signAccessToken(userId),
    refreshToken,
    expiresIn: ACCESS_TTL_S,
  };
}

async function revokeAllForUser(userId: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)),
    );
}

/** Rotates a refresh token; presenting an already-used one revokes every session of that user. */
export async function rotateSession(refreshToken: string) {
  const [row] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, sha256(refreshToken)))
    .limit(1);
  if (!row || row.expiresAt < new Date()) return null;

  const claimed = await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.id, row.id), isNull(refreshTokens.revokedAt)))
    .returning({ id: refreshTokens.id });

  if (claimed.length === 0) {
    await revokeAllForUser(row.userId);
    return null;
  }
  return issueSession(row.userId, row.deviceLabel);
}

export async function revokeSession(refreshToken: string) {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(refreshTokens.tokenHash, sha256(refreshToken)),
        isNull(refreshTokens.revokedAt),
      ),
    );
}
