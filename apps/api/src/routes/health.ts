import { Router } from "express";
import { pool } from "../db/client.js";

export const healthRouter = Router();

healthRouter.get("/health", async (_req, res) => {
  const db = await pool.query("select 1").then(
    () => "up",
    () => "down",
  );
  res.status(db === "up" ? 200 : 503).json({ status: db === "up" ? "ok" : "degraded", db });
});
