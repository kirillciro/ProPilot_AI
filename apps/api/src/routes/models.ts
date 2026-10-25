import { Router } from "express";
import type { ModelInfo } from "@propilot/shared";
import { fetchVisionModels } from "../ai/openrouter.js";
import { requireAuth } from "../middleware/auth.js";

export const modelsRouter = Router();

let cache: { at: number; body: ModelInfo[] } | undefined;
const TTL_MS = 10 * 60 * 1000;
const perMillion = (perToken: string) =>
  Math.round(Number(perToken) * 1_000_000 * 10_000) / 10_000;

// Live catalog for now; becomes a read from the synced `models` table.
modelsRouter.get("/models", requireAuth, async (_req, res, next) => {
  try {
    if (!cache || Date.now() - cache.at > TTL_MS) {
      const models = await fetchVisionModels();
      cache = {
        at: Date.now(),
        body: models.map((m) => ({
          id: m.id,
          name: m.name,
          provider: m.id.split("/")[0]!,
          contextLength: m.context_length,
          promptPerMillion: perMillion(m.pricing.prompt),
          completionPerMillion: perMillion(m.pricing.completion),
          isFree:
            Number(m.pricing.prompt) === 0 &&
            Number(m.pricing.completion) === 0,
          reasoningEfforts: m.reasoning?.supported_efforts ?? [],
          releasedAt: new Date(m.created * 1000).toISOString(),
          intelligenceIndex:
            m.benchmarks?.artificial_analysis?.intelligence_index ?? null,
        })),
      };
    }
    res.json(cache.body);
  } catch (err) {
    next(err);
  }
});
