import { NotFoundError, createLogger, extractJson } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { prisma } from "@yta/database";
import type { AnalyticsSnapshot, Recommendation } from "@yta/database";

const logger = createLogger("youtube-core:analytics");

export interface ChannelPerformanceSummary {
  channelId: string;
  snapshots: number;
  totalViews: number;
  totalWatchTimeMinutes: number;
  totalSubscribersGained: number;
  avgClickThroughRate: number;
  estimatedRevenueUsd: number;
}

/** Record a manual/synced analytics snapshot for a channel or video. */
export async function recordSnapshot(input: {
  channelId: string;
  videoId?: string;
  views?: number;
  impressions?: number;
  clickThroughRate?: number;
  avgViewDurationSec?: number;
  watchTimeMinutes?: number;
  subscribersGained?: number;
  estimatedRevenueUsd?: number;
  raw?: unknown;
}): Promise<AnalyticsSnapshot> {
  return prisma.analyticsSnapshot.create({
    data: {
      channelId: input.channelId,
      videoId: input.videoId,
      views: input.views ?? 0,
      impressions: input.impressions ?? 0,
      clickThroughRate: input.clickThroughRate ?? 0,
      avgViewDurationSec: input.avgViewDurationSec ?? 0,
      watchTimeMinutes: input.watchTimeMinutes ?? 0,
      subscribersGained: input.subscribersGained ?? 0,
      estimatedRevenueUsd: input.estimatedRevenueUsd ?? 0,
      raw: input.raw as object | undefined,
    },
  });
}

/** Aggregate a channel's snapshots into a performance summary. */
export async function summarizeChannel(
  channelId: string
): Promise<ChannelPerformanceSummary> {
  const snapshots = await prisma.analyticsSnapshot.findMany({
    where: { channelId },
    orderBy: { capturedAt: "desc" },
    take: 500,
  });

  const summary: ChannelPerformanceSummary = {
    channelId,
    snapshots: snapshots.length,
    totalViews: snapshots.reduce((sum, s) => sum + s.views, 0),
    totalWatchTimeMinutes: snapshots.reduce((sum, s) => sum + s.watchTimeMinutes, 0),
    totalSubscribersGained: snapshots.reduce((sum, s) => sum + s.subscribersGained, 0),
    avgClickThroughRate:
      snapshots.length > 0
        ? snapshots.reduce((sum, s) => sum + s.clickThroughRate, 0) / snapshots.length
        : 0,
    estimatedRevenueUsd: snapshots.reduce((sum, s) => sum + s.estimatedRevenueUsd, 0),
  };
  return summary;
}

interface RawRecommendation {
  type: string;
  title: string;
  body: string;
  priority: number;
}

/**
 * Ask the AI to review recent performance and produce concrete, actionable
 * recommendations. Stored as OPEN recommendations for the dashboard.
 */
export async function generateRecommendations(
  channelId: string
): Promise<Recommendation[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { niche: true },
  });
  if (!channel) throw new NotFoundError(`Channel ${channelId} not found`);

  const summary = await summarizeChannel(channelId);
  const recentVideos = await prisma.video.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: 15,
    include: { analytics: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });

  const videoLines = recentVideos.map((video) => {
    const latest = video.analytics[0];
    return `- "${video.title}" [${video.status}] views=${latest?.views ?? 0} ctr=${latest?.clickThroughRate ?? 0}% avgViewSec=${latest?.avgViewDurationSec ?? 0}`;
  });

  const prompt = `You are auditing a faceless YouTube channel. Produce 3-6 concrete recommendations.

Channel: "${channel.name}" ${channel.niche ? `(niche: ${channel.niche.name})` : ""}
Aggregate: views=${summary.totalViews}, watchTimeMin=${Math.round(summary.totalWatchTimeMinutes)}, subsGained=${summary.totalSubscribersGained}, avgCTR=${summary.avgClickThroughRate.toFixed(2)}%

Recent videos:
${videoLines.join("\n") || "(no videos yet)"}

Each recommendation:
- type: one of "title" | "thumbnail" | "topic" | "upload-time" | "format" | "retention"
- title: one-line action
- body: 2-4 sentences of specific advice grounded in the data above
- priority: 1 (do now) to 5 (nice to have)

Return JSON: {"recommendations": [ ... ]}`;

  const registry = getProviderRegistry();
  const result = await registry.complete(
    [
      {
        role: "system",
        content:
          "You are a data-driven YouTube channel strategist. Respond ONLY with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, temperature: 0.6, maxTokens: 2000 }
  );

  const parsed = extractJson<{ recommendations: RawRecommendation[] }>(result.text);
  const created = await Promise.all(
    (parsed.recommendations ?? []).map((rec) =>
      prisma.recommendation.create({
        data: {
          channelId,
          type: rec.type,
          title: rec.title,
          body: rec.body,
          priority: Math.min(Math.max(Math.round(rec.priority ?? 3), 1), 5),
        },
      })
    )
  );

  logger.info("recommendations generated", { channelId, count: created.length });
  return created;
}
