import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yta/database";
import { researchNiches } from "@yta/youtube-core";
import { asyncHandler, ok, parse } from "../http";

const researchSchema = z.object({
  seedTopic: z.string().max(120).optional(),
  count: z.number().int().min(1).max(10).optional(),
});

export const nichesRouter = Router();

/** GET /api/niches - ranked niches. */
nichesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const niches = await prisma.niche.findMany({
      orderBy: { overallScore: "desc" },
    });
    ok(res, { items: niches });
  })
);

/** POST /api/niches/research - AI-powered high-CPM niche research. */
nichesRouter.post(
  "/research",
  asyncHandler(async (req, res) => {
    const body = parse(researchSchema, req.body ?? {});
    const niches = await researchNiches(body);
    ok(res, { items: niches }, 201);
  })
);
