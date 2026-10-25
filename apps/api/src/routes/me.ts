import { eq } from "drizzle-orm";
import { Router } from "express";
import { budgetSchema, type MeResponse } from "@propilot/shared";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { usageSummary } from "../lib/usage.js";
import { requireAuth } from "../middleware/auth.js";

export const meRouter = Router();
meRouter.use(requireAuth);

async function loadMe(userId: string): Promise<MeResponse | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    monthlyBudgetEur: Number(u.monthlyBudgetEur),
    blockWhenOverBudget: u.blockWhenOverBudget,
  };
}

meRouter.get("/me", async (req, res) => {
  const me = await loadMe(req.userId!);
  if (!me) return res.status(401).json({ error: "unknown_user" });
  res.json(me);
});

meRouter.patch("/me", async (req, res) => {
  const body = budgetSchema.safeParse(req.body);
  if (!body.success)
    return res
      .status(400)
      .json({ error: "invalid_body", issues: body.error.issues });

  await db
    .update(users)
    .set({
      ...(body.data.monthlyBudgetEur !== undefined && {
        monthlyBudgetEur: body.data.monthlyBudgetEur.toFixed(2),
      }),
      ...(body.data.blockWhenOverBudget !== undefined && {
        blockWhenOverBudget: body.data.blockWhenOverBudget,
      }),
    })
    .where(eq(users.id, req.userId!));
  res.json(await loadMe(req.userId!));
});

// Required by App Store review for apps that offer account creation.
meRouter.delete("/me", async (req, res) => {
  await db.delete(users).where(eq(users.id, req.userId!));
  res.status(204).end();
});

meRouter.get("/usage/summary", async (req, res) => {
  res.json(await usageSummary(req.userId!));
});
