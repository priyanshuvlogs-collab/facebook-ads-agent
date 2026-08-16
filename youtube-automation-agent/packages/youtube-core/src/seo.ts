import { NotFoundError, createLogger, extractJson } from "@yta/shared";
import type { SeoSuggestion } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { prisma } from "@yta/database";
import type { Video } from "@yta/database";

const logger = createLogger("youtube-core:seo");

/**
 * Generate optimized titles, description, tags and hashtags for a video and
 * store them on the video record (picking the first title variant).
 */
export async function optimizeVideoSeo(videoId: string): Promise<{
  video: Video;
  suggestion: SeoSuggestion;
}> {
  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { script: true, idea: true, channel: { include: { niche: true } } },
  });
  if (!video) throw new NotFoundError(`Video ${videoId} not found`);

  const scriptExcerpt = video.script?.content.slice(0, 2500) ?? "";

  const prompt = `Optimize the YouTube metadata for this video.

Current title: "${video.title}"
${video.idea?.keywords.length ? `Target keywords: ${video.idea.keywords.join(", ")}` : ""}
${video.channel.niche ? `Niche: ${video.channel.niche.name}` : ""}
${scriptExcerpt ? `Script excerpt:\n${scriptExcerpt}` : ""}

Produce:
- titles: 5 title variants ranked best-first (under 70 chars, front-load the keyword, drive curiosity)
- description: 150-300 word description; first 2 lines must sell the click (they show above the fold); include keywords naturally; end with a subscribe CTA
- tags: 15-25 tags, mixing exact keywords, long-tail phrases and broad topic tags
- hashtags: 3 hashtags for above the title

Return JSON: {"titles": [...], "description": "...", "tags": [...], "hashtags": [...]}`;

  const registry = getProviderRegistry();
  const result = await registry.complete(
    [
      {
        role: "system",
        content:
          "You are a YouTube SEO specialist who understands search intent, CTR psychology, and the YouTube algorithm. Respond ONLY with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, temperature: 0.7, maxTokens: 2500 }
  );

  const suggestion = extractJson<SeoSuggestion>(result.text);
  const bestTitle = suggestion.titles?.[0] ?? video.title;

  const updated = await prisma.video.update({
    where: { id: videoId },
    data: {
      title: bestTitle,
      description: suggestion.description,
      tags: suggestion.tags ?? [],
      seoMetadata: suggestion as unknown as object,
      status: "OPTIMIZED",
    },
  });

  logger.info("seo optimized", { videoId, provider: result.provider });
  return { video: updated, suggestion };
}
