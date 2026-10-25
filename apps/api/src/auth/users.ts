import { and, eq } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db/client.js";
import { oauthAccounts, users } from "../db/schema.js";
import { env } from "../env.js";

const appleKeys = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);

export async function verifyAppleIdentityToken(identityToken: string) {
  const { payload } = await jwtVerify(identityToken, appleKeys, {
    issuer: "https://appleid.apple.com",
    audience: env.APPLE_BUNDLE_ID,
  });
  if (!payload.sub) throw new Error("apple token has no subject");
  return {
    sub: payload.sub,
    email:
      typeof payload.email === "string" ? payload.email.toLowerCase() : null,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
  };
}

export async function findOrCreateUserByEmail(
  email: string,
  name?: string | null,
) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) {
    await db
      .update(users)
      .set({ emailVerifiedAt: new Date() })
      .where(eq(users.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(users)
    .values({ email, name: name ?? null, emailVerifiedAt: new Date() })
    .returning({ id: users.id });
  return created!.id;
}

export async function findOrCreateAppleUser(input: {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  name?: string | null;
}) {
  const [linked] = await db
    .select({ userId: oauthAccounts.userId })
    .from(oauthAccounts)
    .where(
      and(
        eq(oauthAccounts.provider, "apple"),
        eq(oauthAccounts.providerUserId, input.sub),
      ),
    )
    .limit(1);
  if (linked) return linked.userId;

  // Only a provider-verified email may be matched to an existing account.
  const verifiedEmail = input.emailVerified ? input.email : null;

  return db.transaction(async (tx) => {
    let userId: string | undefined;
    if (verifiedEmail) {
      const [match] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, verifiedEmail))
        .limit(1);
      userId = match?.id;
    }
    if (!userId) {
      const [created] = await tx
        .insert(users)
        .values({
          email: verifiedEmail,
          name: input.name ?? null,
          emailVerifiedAt: verifiedEmail ? new Date() : null,
        })
        .returning({ id: users.id });
      userId = created!.id;
    }
    await tx
      .insert(oauthAccounts)
      .values({ userId, provider: "apple", providerUserId: input.sub });
    return userId;
  });
}
