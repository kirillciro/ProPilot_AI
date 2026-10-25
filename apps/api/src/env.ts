import { z } from "zod";

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  OPENROUTER_API_KEY: z.string().min(1),
  OPENROUTER_REFERER: z.string().default("http://localhost:4000"),
  OPENROUTER_APP_TITLE: z.string().default("ProPilot AI"),
  // Signs access tokens and peppers email-code hashes.
  JWT_SECRET: z.string().min(32),
  APPLE_BUNDLE_ID: z.string().default("com.propilot.ai"),
  USD_TO_EUR: z.coerce.number().positive().default(0.92),
  // Without these the email login code is printed to the API console instead of sent.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  // Optional: web-wide image results; without it the keyless Openverse/Wikimedia sources are used.
  BRAVE_SEARCH_API_KEY: z.string().optional(),
  BRAVE_COST_PER_SEARCH_USD: z.coerce.number().positive().default(0.005),
  // Brave is skipped once this month's estimated spend reaches the free credit.
  BRAVE_MONTHLY_CREDIT_USD: z.coerce.number().min(0).default(5),
});

export const env = schema.parse(process.env);
