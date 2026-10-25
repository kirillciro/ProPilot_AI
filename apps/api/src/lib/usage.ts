import { and, eq, gte, like, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { usageEvents, users, searchEvents } from "../db/schema.js";
import { env } from "../env.js";
import type { Usage } from "../ai/openrouter.js";
import type { UsageSummary } from "@propilot/shared";

// OpenRouter caps free-model requests per day per account; the exact cap depends on purchased credits.
export const FREE_DAILY_LIMIT = 50;

const startOfMonth = () => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
};
const startOfDay = () => {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
};

export async function spentThisMonthEur(userId: string) {
  const [row] = await db
    .select({ spent: sql<string>`coalesce(sum(${usageEvents.costEur}), 0)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        gte(usageEvents.createdAt, startOfMonth()),
      ),
    );
  return Number(row?.spent ?? 0);
}

export async function recordUsage(
  userId: string,
  modelId: string,
  usage: Usage,
  ids: { conversationId?: string; messageId?: string } = {},
) {
  const costUsd = usage.cost ?? 0;
  await db.insert(usageEvents).values({
    userId,
    modelId,
    conversationId: ids.conversationId,
    messageId: ids.messageId,
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    costUsd: costUsd.toFixed(8),
    costEur: (costUsd * env.USD_TO_EUR).toFixed(8),
    isEstimated: usage.cost == null,
  });
}

export async function recordBraveSearch() {
  await db.insert(searchEvents).values({ provider: "brave" });
}

// The Brave key is shared by every user, so this is app-wide.
export async function braveMonthSummary(): Promise<
  UsageSummary["braveSearch"]
> {
  const [row] = await db
    .select({ n: sql<string>`count(*)` })
    .from(searchEvents)
    .where(
      and(
        eq(searchEvents.provider, "brave"),
        gte(searchEvents.createdAt, startOfMonth()),
      ),
    );
  const searches = Number(row?.n ?? 0);
  const costPerSearchUsd = env.BRAVE_COST_PER_SEARCH_USD;
  const creditUsd = env.BRAVE_MONTHLY_CREDIT_USD;
  const spentUsd = searches * costPerSearchUsd;
  return {
    enabled: Boolean(env.BRAVE_SEARCH_API_KEY),
    searches,
    spentUsd,
    creditUsd,
    remainingUsd: Math.max(0, creditUsd - spentUsd),
    costPerSearchUsd,
  };
}

export async function usageSummary(userId: string): Promise<UsageSummary> {
  const since = startOfMonth();
  const mine = and(
    eq(usageEvents.userId, userId),
    gte(usageEvents.createdAt, since),
  );

  const [user] = await db
    .select({
      budget: users.monthlyBudgetEur,
      block: users.blockWhenOverBudget,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [totals] = await db
    .select({
      spent: sql<string>`coalesce(sum(${usageEvents.costEur}), 0)`,
      input: sql<string>`coalesce(sum(${usageEvents.inputTokens}), 0)`,
      output: sql<string>`coalesce(sum(${usageEvents.outputTokens}), 0)`,
      requests: sql<string>`count(*)`,
    })
    .from(usageEvents)
    .where(mine);

  const byModel = await db
    .select({
      modelId: usageEvents.modelId,
      requests: sql<string>`count(*)`,
      input: sql<string>`sum(${usageEvents.inputTokens})`,
      output: sql<string>`sum(${usageEvents.outputTokens})`,
      cost: sql<string>`sum(${usageEvents.costEur})`,
    })
    .from(usageEvents)
    .where(mine)
    .groupBy(usageEvents.modelId)
    .orderBy(sql`sum(${usageEvents.costEur}) desc`);

  const day = sql<string>`to_char(date_trunc('day', ${usageEvents.createdAt}), 'YYYY-MM-DD')`;
  const daily = await db
    .select({ date: day, cost: sql<string>`sum(${usageEvents.costEur})` })
    .from(usageEvents)
    .where(mine)
    .groupBy(day)
    .orderBy(day);

  const [free] = await db
    .select({ n: sql<string>`count(*)` })
    .from(usageEvents)
    .where(
      and(
        eq(usageEvents.userId, userId),
        like(usageEvents.modelId, "%:free"),
        gte(usageEvents.createdAt, startOfDay()),
      ),
    );

  return {
    month: since.toISOString().slice(0, 7),
    budgetEur: Number(user?.budget ?? 0),
    blockWhenOverBudget: user?.block ?? true,
    spentEur: Number(totals?.spent ?? 0),
    inputTokens: Number(totals?.input ?? 0),
    outputTokens: Number(totals?.output ?? 0),
    requests: Number(totals?.requests ?? 0),
    freeRequestsToday: Number(free?.n ?? 0),
    freeDailyLimit: FREE_DAILY_LIMIT,
    byModel: byModel.map((m) => ({
      modelId: m.modelId,
      requests: Number(m.requests),
      inputTokens: Number(m.input),
      outputTokens: Number(m.output),
      costEur: Number(m.cost),
    })),
    daily: daily.map((d) => ({ date: d.date, costEur: Number(d.cost) })),
    braveSearch: await braveMonthSummary(),
  };
}
