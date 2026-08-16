import { Router } from "express";
import { z } from "zod";
import { prisma } from "@yta/database";
import { NotFoundError, ValidationError } from "@yta/shared";
import {
  generateThumbnail,
  isPublishingConfigured,
  optimizeVideoSeo,
  setThumbnail,
  synthesizeVoiceover,
  uploadVideo,
  writeScript,
} from "@yta/youtube-core";
import { asyncHandler, ok, parse } from "../http";

const createVideoSchema = z.object({
  channelId: z.string(),
  ideaId: z.string().optional(),
  title: z.string().min(1).max(150),
});

const scriptSchema = z.object({
  targetMinutes: z.number().min(1).max(60).optional(),
  tone: z.string().max(200).optional(),
});

const voiceoverSchema = z.object({
  voice: z.string().max(80).optional(),
});

const thumbnailSchema = z.object({
  punchText: z.string().max(30).optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

const scheduleSchema = z.object({
  scheduledAt: z.string().datetime(),
});

const publishSchema = z.object({
  videoFilePath: z.string().min(1),
  privacyStatus: z.enum(["private", "unlisted", "public"]).optional(),
  thumbnailFilePath: z.string().optional(),
});

export const videosRouter = Router();

videosRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const channelId = typeof req.query.channelId === "string" ? req.query.channelId : undefined;
    const videos = await prisma.video.findMany({
      where: channelId ? { channelId } : undefined,
      include: { channel: { select: { name: true } }, script: { select: { wordCount: true } } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    ok(res, { items: videos });
  })
);

videosRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parse(createVideoSchema, req.body);
    const video = await prisma.video.create({ data: body });
    if (body.ideaId) {
      await prisma.videoIdea.update({
        where: { id: body.ideaId },
        data: { status: "USED" },
      });
    }
    ok(res, video, 201);
  })
);

videosRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const video = await prisma.video.findUnique({
      where: { id: req.params.id },
      include: { script: true, assets: true, idea: true },
    });
    if (!video) throw new NotFoundError("Video not found");
    ok(res, video);
  })
);

/** POST /api/videos/:id/script - AI script writing. */
videosRouter.post(
  "/:id/script",
  asyncHandler(async (req, res) => {
    const body = parse(scriptSchema, req.body ?? {});
    const script = await writeScript(req.params.id as string, body);
    ok(res, script, 201);
  })
);

/** POST /api/videos/:id/voiceover - TTS from the video's script. */
videosRouter.post(
  "/:id/voiceover",
  asyncHandler(async (req, res) => {
    const body = parse(voiceoverSchema, req.body ?? {});
    const videoId = req.params.id as string;
    const video = await prisma.video.findUnique({
      where: { id: videoId },
      include: { script: true },
    });
    if (!video) throw new NotFoundError("Video not found");
    if (!video.script) {
      throw new ValidationError("Video has no script yet - generate one first");
    }

    const result = await synthesizeVoiceover(video.script.content, {
      voice: body.voice,
      fileName: `voiceover-${videoId}.mp3`,
    });

    const asset = await prisma.asset.create({
      data: {
        videoId,
        kind: "VOICEOVER",
        path: result.filePath,
        provider: result.provider,
        metadata: { voice: result.voice, bytes: result.bytes },
      },
    });
    await prisma.video.update({ where: { id: videoId }, data: { status: "VOICED" } });
    ok(res, asset, 201);
  })
);

/** POST /api/videos/:id/thumbnail - free local SVG thumbnail. */
videosRouter.post(
  "/:id/thumbnail",
  asyncHandler(async (req, res) => {
    const body = parse(thumbnailSchema, req.body ?? {});
    const videoId = req.params.id as string;
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundError("Video not found");

    const result = await generateThumbnail({
      title: video.title,
      punchText: body.punchText,
      accentColor: body.accentColor,
      fileName: `thumbnail-${videoId}.svg`,
    });

    const asset = await prisma.asset.create({
      data: {
        videoId,
        kind: "THUMBNAIL",
        path: result.filePath,
        provider: "local-svg",
        metadata: { width: result.width, height: result.height },
      },
    });
    await prisma.video.update({
      where: { id: videoId },
      data: { status: "THUMBNAILED" },
    });
    ok(res, asset, 201);
  })
);

/** POST /api/videos/:id/optimize - AI SEO for title/description/tags. */
videosRouter.post(
  "/:id/optimize",
  asyncHandler(async (req, res) => {
    const { video, suggestion } = await optimizeVideoSeo(req.params.id as string);
    ok(res, { video, suggestion });
  })
);

/** POST /api/videos/:id/schedule - set the planned publish time. */
videosRouter.post(
  "/:id/schedule",
  asyncHandler(async (req, res) => {
    const body = parse(scheduleSchema, req.body);
    const video = await prisma.video.update({
      where: { id: req.params.id },
      data: { scheduledAt: new Date(body.scheduledAt), status: "SCHEDULED" },
    });
    ok(res, video);
  })
);

/** POST /api/videos/:id/publish - upload to YouTube (uses scheduledAt when set). */
videosRouter.post(
  "/:id/publish",
  asyncHandler(async (req, res) => {
    if (!isPublishingConfigured()) {
      throw new ValidationError(
        "YouTube publishing is not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN."
      );
    }
    const body = parse(publishSchema, req.body);
    const videoId = req.params.id as string;
    const video = await prisma.video.findUnique({ where: { id: videoId } });
    if (!video) throw new NotFoundError("Video not found");

    const result = await uploadVideo({
      videoFilePath: body.videoFilePath,
      title: video.title,
      description: video.description ?? "",
      tags: video.tags,
      privacyStatus: body.privacyStatus,
      publishAt: video.scheduledAt?.toISOString(),
    });

    if (body.thumbnailFilePath) {
      await setThumbnail(result.youtubeVideoId, body.thumbnailFilePath);
    }

    const updated = await prisma.video.update({
      where: { id: videoId },
      data: {
        youtubeVideoId: result.youtubeVideoId,
        status: video.scheduledAt ? "SCHEDULED" : "PUBLISHED",
        publishedAt: video.scheduledAt ? null : new Date(),
      },
    });
    ok(res, { video: updated, ...result });
  })
);
