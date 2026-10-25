import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pino } from "pino";
import { pinoHttp } from "pino-http";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.js";
import { chatRouter } from "./routes/chat.js";
import { conversationsRouter } from "./routes/conversations.js";
import { healthRouter } from "./routes/health.js";
import { meRouter } from "./routes/me.js";
import { modelsRouter } from "./routes/models.js";

const logger = pino({
  level: env.NODE_ENV === "production" ? "info" : "debug",
});
const app = express();

app.set("trust proxy", 1);
app.use(helmet());
app.use(cors());
app.use(
  pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }),
);
// Large enough for a few compressed inline photos until uploads go to object storage.
app.use(express.json({ limit: "10mb" }));
app.use(
  rateLimit({
    windowMs: 60_000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);

app.use(healthRouter);
app.use("/auth", authRouter);
app.use("/v1", meRouter, modelsRouter, chatRouter, conversationsRouter);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error(err);
  res.status(500).json({ error: "internal_error" });
});

app.listen(env.PORT, () => logger.info(`API listening on :${env.PORT}`));
