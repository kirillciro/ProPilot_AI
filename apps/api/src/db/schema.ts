import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").unique(),
  name: text("name"),
  emailVerifiedAt: timestamp("email_verified_at"),
  monthlyBudgetEur: numeric("monthly_budget_eur", { precision: 10, scale: 2 })
    .notNull()
    .default("10.00"),
  blockWhenOverBudget: boolean("block_when_over_budget")
    .notNull()
    .default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"apple" | "facebook">().notNull(),
    providerUserId: text("provider_user_id").notNull(),
  },
  (t) => [
    uniqueIndex("oauth_provider_sub_idx").on(t.provider, t.providerUserId),
  ],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    deviceLabel: text("device_label"),
    expiresAt: timestamp("expires_at").notNull(),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("refresh_user_idx").on(t.userId)],
);

export const emailCodes = pgTable("email_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  codeHash: text("code_hash").notNull(),
  attempts: integer("attempts").notNull().default(0),
  expiresAt: timestamp("expires_at").notNull(),
  consumedAt: timestamp("consumed_at"),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  systemPrompt: text("system_prompt").notNull(),
  config: jsonb("config")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New conversation"),
    profileSlug: text("profile_slug").notNull().default("universal"),
    vehicleContext: jsonb("vehicle_context").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
    deletedAt: timestamp("deleted_at"),
  },
  (t) => [index("conversations_user_idx").on(t.userId, t.updatedAt)],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    // Sibling messages share a parent, which is how edit/regenerate branches are modelled.
    parentId: uuid("parent_id"),
    role: text("role").$type<"user" | "assistant" | "system">().notNull(),
    content: text("content").notNull().default(""),
    modelId: text("model_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("messages_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  mime: text("mime").notNull(),
  width: integer("width"),
  height: integer("height"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const models = pgTable("models", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  contextLength: integer("context_length"),
  inputModalities: jsonb("input_modalities").$type<string[]>().notNull(),
  reasoningEfforts: jsonb("reasoning_efforts")
    .$type<string[]>()
    .notNull()
    .default([]),
  reasoningMandatory: boolean("reasoning_mandatory").notNull().default(false),
  isFree: boolean("is_free").notNull().default(false),
  featured: boolean("featured").notNull().default(false),
  intelligenceIndex: numeric("intelligence_index", { precision: 6, scale: 2 }),
  releasedAt: timestamp("released_at"),
  expiresAt: timestamp("expires_at"),
  active: boolean("active").notNull().default(true),
  syncedAt: timestamp("synced_at").defaultNow().notNull(),
});

export const modelPrices = pgTable(
  "model_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    // USD per single token, stored as OpenRouter reports it.
    promptPerToken: numeric("prompt_per_token", {
      precision: 24,
      scale: 14,
    }).notNull(),
    completionPerToken: numeric("completion_per_token", {
      precision: 24,
      scale: 14,
    }).notNull(),
    imagePerToken: numeric("image_per_token", { precision: 24, scale: 14 }),
    reasoningPerToken: numeric("reasoning_per_token", {
      precision: 24,
      scale: 14,
    }),
    // Tiered or time-of-day price rules from the provider, kept raw for the cost calculator.
    overrides: jsonb("overrides").$type<unknown[]>(),
    effectiveFrom: timestamp("effective_from").defaultNow().notNull(),
  },
  (t) => [index("model_prices_model_idx").on(t.modelId, t.effectiveFrom)],
);

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    messageId: uuid("message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    cachedTokens: integer("cached_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 14, scale: 8 })
      .notNull()
      .default("0"),
    costEur: numeric("cost_eur", { precision: 14, scale: 8 })
      .notNull()
      .default("0"),
    isEstimated: boolean("is_estimated").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("usage_user_created_idx").on(t.userId, t.createdAt)],
);

// One row per billable web-search API call, used to track the monthly free credit.
export const searchEvents = pgTable(
  "search_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: text("provider").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("search_provider_created_idx").on(t.provider, t.createdAt)],
);
