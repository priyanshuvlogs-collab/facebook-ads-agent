import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yta/database";
import { NotFoundError } from "@yta/shared";
import {
  generateRecommendations,
  generateVideoIdeas,
  recordSnapshot,
  summarizeChannel,
} from "@yta/youtube-core";
import { asyncHandler, ok, parse } from "../http";

const createChannelSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  nicheId: z.string().optional(),
  youtubeChannelId: z.string().optional(),
  timezone: z.string().max(60).optional(),
});

const generateIdeasSchema = z.object({
  count: z.number().int().min(1).max(25).optional(),
});

const snapshotSchema = z.object({
  videoId: z.string().optional(),
  views: z.number().int().min(0).optional(),
  impressions: z.number().int().min(0).optional(),
  clickThroughRate: z.number().min(0).max(100).optional(),
  avgViewDurationSec: z.number().min(0).optional(),
  watchTimeMinutes: z.number().min(0).optional(),
  subscribersGained: z.number().int().optional(),
  estimatedRevenueUsd: z.number().min(0).optional(),
});

export const channelsRouter = Router();

channelsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const channels = await prisma.channel.findMany({
      include: { niche: true, _count: { select: { videos: true, ideas: true } } },
      orderBy: { createdAt: "desc" },
    });
    ok(res, { items: channels });
  })
);

channelsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(createChannelSchema, req.body);
    const channel = await prisma.channel.create({ data: body, include: { niche: true } });
    ok(res, channel, 201);
  })
);

channelsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.id },
      include: {
        niche: true,
        ideas: { orderBy: { score: "desc" }, take: 25 },
        videos: { orderBy: { createdAt: "desc" }, take: 25 },
        recommendations: {
          where: { status: "OPEN" },
          orderBy: { priority: "asc" },
        },
      },
    });
    if (!channel) throw new NotFoundError("Channel not found");
    ok(res, channel);
  })
);

/** POST /api/channels/:id/ideas - AI idea generation. */
channelsRouter.post(
  "/:id/ideas",
  asyncHandler(async (req, res) => {
    const body = parse(generateIdeasSchema, req.body ?? {});
    const ideas = await generateVideoIdeas(req.params.id as string, body.count ?? 10);
    ok(res, { items: ideas }, 201);
  })
);

/** GET /api/channels/:id/analytics - aggregated performance. */
channelsRouter.get(
  "/:id/analytics",
  asyncHandler(async (req, res) => {
    const summary = await summarizeChannel(req.params.id as string);
    const recent = await prisma.analyticsSnapshot.findMany({
      where: { channelId: req.params.id },
      orderBy: { capturedAt: "desc" },
      take: 50,
    });
    ok(res, { summary, snapshots: recent });
  })
);

/** POST /api/channels/:id/analytics - record a snapshot. */
channelsRouter.post(
  "/:id/analytics",
  asyncHandler(async (req, res) => {
    const body = parse(snapshotSchema, req.body ?? {});
    const snapshot = await recordSnapshot({ channelId: req.params.id as string, ...body });
    ok(res, snapshot, 201);
  })
);

/** POST /api/channels/:id/recommendations - AI channel audit. */
channelsRouter.post(
  "/:id/recommendations",
  asyncHandler(async (req, res) => {
    const recommendations = await generateRecommendations(req.params.id as string);
    ok(res, { items: recommendations }, 201);
  })
);
