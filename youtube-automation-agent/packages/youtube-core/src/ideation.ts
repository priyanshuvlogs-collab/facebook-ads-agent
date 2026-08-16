import { NotFoundError, createLogger, extractJson } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { prisma } from "@yta/database";
import type { VideoIdea } from "@yta/database";

const logger = createLogger("youtube-core:ideation");

interface RawIdea {
  title: string;
  angle: string;
  hook: string;
  keywords: string[];
  score: number;
}

/** Generate scored video ideas for a channel based on its niche. */
export async function generateVideoIdeas(
  channelId: string,
  count = 10
): Promise<VideoIdea[]> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { niche: true },
  });
  if (!channel) throw new NotFoundError(`Channel ${channelId} not found`);

  const recentIdeas = await prisma.videoIdea.findMany({
    where: { channelId },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { title: true },
  });

  const prompt = `Generate ${count} YouTube video ideas for a faceless channel.

Channel: "${channel.name}"
${channel.description ? `Channel description: ${channel.description}` : ""}
${channel.niche ? `Niche: ${channel.niche.name} - ${channel.niche.description}` : ""}
${channel.niche?.contentFormats.length ? `Preferred formats: ${channel.niche.contentFormats.join(", ")}` : ""}
${recentIdeas.length > 0 ? `AVOID duplicating these existing ideas:\n${recentIdeas.map((i) => `- ${i.title}`).join("\n")}` : ""}

For each idea return:
- title: high-CTR title (under 70 chars, curiosity-driven, no clickbait lies)
- angle: the unique angle in one sentence
- hook: the first 15 seconds spoken hook
- keywords: 3-6 target search keywords
- score: 0-100 estimated performance potential

Return JSON: {"ideas": [ ... ]}`;

  const registry = getProviderRegistry();
  const result = await registry.complete(
    [
      {
        role: "system",
        content:
          "You are a YouTube growth expert who writes titles with high click-through rates. Respond ONLY with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, temperature: 0.9, maxTokens: 3000 }
  );

  const parsed = extractJson<{ ideas: RawIdea[] }>(result.text);
  const ideas = await Promise.all(
    (parsed.ideas ?? []).map((raw) =>
      prisma.videoIdea.create({
        data: {
          channelId,
          title: raw.title,
          angle: raw.angle,
          hook: raw.hook,
          keywords: raw.keywords ?? [],
          score: Math.min(Math.max(raw.score ?? 50, 0), 100),
        },
      })
    )
  );

  logger.info("ideas generated", { channelId, count: ideas.length });
  return ideas.sort((a, b) => b.score - a.score);
}
