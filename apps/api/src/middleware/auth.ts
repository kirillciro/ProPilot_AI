import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../auth/tokens.js";

declare module "express-serve-static-core" {
  interface Request {
    userId?: string;
  }
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  try {
    req.userId = await verifyAccessToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "invalid_token" });
  }
}
