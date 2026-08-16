import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yta/database";
import { API_CATEGORIES, NotFoundError, createLogger, errorMessage } from "@yta/shared";
import { CATEGORY_STRATEGIES, FreeApiHunter } from "@yta/api-hunter";
import { asyncHandler, ok, parse } from "../http";

const logger = createLogger("api:hunter");

const startRunSchema = z.object({
  categories: z.array(z.enum(API_CATEGORIES)).min(1).optional(),
  maxReposPerCategory: z.number().int().min(1).max(50).optional(),
  minStars: z.number().int().min(0).optional(),
});

/** In-process guard: only one hunter run at a time. */
let runInProgress = false;

export const hunterRouter = Router();

/** GET /api/hunter/categories - available categories and their strategies. */
hunterRouter.get("/categories", (_req, res) => {
  ok(res, {
    categories: CATEGORY_STRATEGIES.map((s) => ({
      category: s.category,
      label: s.label,
      queries: s.queries.length,
      weight: s.weight,
    })),
  });
});

/** POST /api/hunter/runs - start a hunt (runs async in the background). */
hunterRouter.post(
  "/runs",
  asyncHandler(async (req, res) => {
    const body = parse(startRunSchema, req.body ?? {});
    if (runInProgress) {
      ok(res, { started: false, reason: "A hunter run is already in progress" }, 409);
      return;
    }

    runInProgress = true;
    const hunter = new FreeApiHunter();
    // Fire and forget - progress is persisted to HunterRun incrementally.
    void hunter
      .run(body)
      .catch((error) => logger.error("hunter run crashed", { error: errorMessage(error) }))
      .finally(() => {
        runInProgress = false;
      });

    ok(res, { started: true }, 202);
  })
);

/** GET /api/hunter/runs - run history, newest first. */
hunterRouter.get(
  "/runs",
  asyncHandler(async (_req, res) => {
    const runs = await prisma.hunterRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    ok(res, { items: runs, inProgress: runInProgress });
  })
);

/** GET /api/hunter/runs/:id */
hunterRouter.get(
  "/runs/:id",
  asyncHandler(async (req, res) => {
    const run = await prisma.hunterRun.findUnique({ where: { id: req.params.id } });
    if (!run) throw new NotFoundError("Hunter run not found");
    ok(res, run);
  })
);
