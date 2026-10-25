import { z } from "zod";

export const PROFILE_SLUGS = [
  "universal",
  "automotive",
  "home-repair-diy",
  "design-engineering",
  "electronics-technology",
  "tools-equipment",
  "education-learning",
  "science-research",
  "programming-software",
  "business-finance",
  "health-fitness",
  "cooking-nutrition",
  "travel-navigation",
  "art-creativity",
  "writing-communication",
  "photography-image-analysis",
  "science-mathematics",
  "agriculture-gardening",
  "fashion-beauty",
  "legal-administrative",
] as const;

export const profileSlugSchema = z.enum(PROFILE_SLUGS);
export type ProfileSlug = z.infer<typeof profileSlugSchema>;

export const PROFILES: { slug: ProfileSlug; label: string }[] = [
  { slug: "universal", label: "Universal (free run)" },
  { slug: "automotive", label: "Automotive" },
  { slug: "home-repair-diy", label: "Home repair & DIY" },
  { slug: "design-engineering", label: "Design & engineering" },
  { slug: "electronics-technology", label: "Electronics & technology" },
  { slug: "tools-equipment", label: "Tools & equipment" },
  { slug: "education-learning", label: "Education & learning" },
  { slug: "science-research", label: "Science & research" },
  { slug: "programming-software", label: "Programming & software" },
  { slug: "business-finance", label: "Business & finance" },
  { slug: "health-fitness", label: "Health & fitness" },
  { slug: "cooking-nutrition", label: "Cooking & nutrition" },
  { slug: "travel-navigation", label: "Travel & navigation" },
  { slug: "art-creativity", label: "Art & creativity" },
  { slug: "writing-communication", label: "Writing & communication" },
  { slug: "photography-image-analysis", label: "Photography & image analysis" },
  { slug: "science-mathematics", label: "Science & mathematics" },
  { slug: "agriculture-gardening", label: "Agriculture & gardening" },
  { slug: "fashion-beauty", label: "Fashion & beauty" },
  { slug: "legal-administrative", label: "Legal & administrative" },
];

export const thinkingEffortSchema = z.enum(["low", "medium", "high"]);
export type ThinkingEffort = z.infer<typeof thinkingEffortSchema>;

// Marks are stored as fractions of the photo so the phone and the server draw them identically.
export const ANNOTATION_PEN_WIDTH = 0.012;
export const ANNOTATION_FONT_SIZE = 0.055;

const fraction = z.number().min(0).max(1);
const colorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const annotationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("stroke"),
    color: colorSchema,
    points: z
      .array(z.tuple([fraction, fraction]))
      .min(1)
      .max(3000),
  }),
  z.object({
    kind: z.literal("text"),
    color: colorSchema,
    x: fraction,
    y: fraction,
    text: z.string().min(1).max(60),
  }),
]);
export type Annotation = z.infer<typeof annotationSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  profile: profileSlugSchema.default("universal"),
  model: z.string().min(1),
  text: z.string().max(8000).default(""),
  imageUrls: z
    .array(
      z
        .string()
        .refine((s) => s.startsWith("https://") || s.startsWith("data:image/")),
    )
    .max(4)
    .default([]),
  // Drawn onto the first image by the server before the model sees it.
  annotations: z.array(annotationSchema).max(200).default([]),
  thinkingEffort: thinkingEffortSchema.optional(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type SendMessageRequest = z.input<typeof sendMessageSchema>;

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const appleLoginSchema = z.object({
  identityToken: z.string().min(10),
  fullName: z.string().max(200).optional(),
});
export const emailRequestSchema = z.object({ email: emailSchema });
export const emailVerifySchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6}$/),
});
export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(200),
});
export const budgetSchema = z
  .object({
    monthlyBudgetEur: z.number().min(0).max(10000).optional(),
    blockWhenOverBudget: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

export const conversationPatchSchema = z
  .object({
    title: z.string().trim().min(1).max(120).optional(),
    archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);

export type ConversationSummary = {
  id: string;
  title: string;
  profile: ProfileSlug;
  updatedAt: string;
  archived: boolean;
  preview: string;
};

export type MessageDto = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images: string[];
  modelId: string | null;
  createdAt: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: MessageDto[];
};

export type SessionResponse = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

export type MeResponse = {
  id: string;
  email: string | null;
  name: string | null;
  monthlyBudgetEur: number;
  blockWhenOverBudget: boolean;
};

export type ModelInfo = {
  id: string;
  name: string;
  provider: string;
  contextLength: number | null;
  promptPerMillion: number;
  completionPerMillion: number;
  isFree: boolean;
  reasoningEfforts: string[];
  releasedAt: string;
  intelligenceIndex: number | null;
};

export type UsageSummary = {
  month: string;
  budgetEur: number;
  blockWhenOverBudget: boolean;
  spentEur: number;
  inputTokens: number;
  outputTokens: number;
  requests: number;
  freeRequestsToday: number;
  freeDailyLimit: number;
  byModel: {
    modelId: string;
    requests: number;
    inputTokens: number;
    outputTokens: number;
    costEur: number;
  }[];
  daily: { date: string; costEur: number }[];
  // Estimated from our own call count; Brave's dashboard is the source of truth.
  braveSearch: {
    enabled: boolean;
    searches: number;
    spentUsd: number;
    creditUsd: number;
    remainingUsd: number;
    costPerSearchUsd: number;
  };
};
