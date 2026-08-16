import express from "express";
import cors from "cors";
import { getEnv, hasCapability } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { availableTtsProviders, isPublishingConfigured } from "@yta/youtube-core";
import { errorMiddleware, jsonReplacer, ok } from "./http";
import { apisRouter } from "./routes/apis";
import { hunterRouter } from "./routes/hunter";
import { nichesRouter } from "./routes/niches";
import { channelsRouter } from "./routes/channels";
import { videosRouter } from "./routes/videos";

export function createApp(): express.Express {
  const app = express();

  app.set("json replacer", jsonReplacer);
  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/health", (_req, res) => {
    ok(res, { status: "healthy", uptime: process.uptime() });
  });

  /** Capability report - shows which integrations are configured. */
  app.get("/api/capabilities", (_req, res) => {
    ok(res, {
      database: hasCapability("database"),
      githubToken: hasCapability("github"),
      aiProviders: getProviderRegistry()
        .available()
        .map((provider) => provider.name),
      ttsProviders: availableTtsProviders(),
      youtubePublishing: isPublishingConfigured(),
      environment: getEnv().NODE_ENV,
    });
  });

  app.use("/api/apis", apisRouter);
  app.use("/api/hunter", hunterRouter);
  app.use("/api/niches", nichesRouter);
  app.use("/api/channels", channelsRouter);
  app.use("/api/videos", videosRouter);

  app.use((_req, res) => {
    res.status(404).json({
      ok: false,
      error: { code: "NOT_FOUND", message: "Route not found" },
    });
  });

  app.use(errorMiddleware);
  return app;
}
