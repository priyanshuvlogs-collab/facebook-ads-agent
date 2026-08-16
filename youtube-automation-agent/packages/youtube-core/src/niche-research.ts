import { createLogger, extractJson } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { prisma } from "@yta/database";
import type { Niche } from "@yta/database";

const logger = createLogger("youtube-core:niche-research");

export interface NicheResearchOptions {
  /** Optional interest area to bias research towards, e.g. "technology". */
  seedTopic?: string;
  count?: number;
}

interface RawNiche {
  name: string;
  description: string;
  cpmEstimateLowUsd: number;
  cpmEstimateHighUsd: number;
  competitionScore: number;
  searchDemandScore: number;
  trendScore: number;
  contentFormats: string[];
  exampleTitles: string[];
  rationale: string;
}

const SYSTEM_PROMPT = `You are a YouTube monetization strategist specializing in faceless channels.
You know current CPM ranges by vertical (finance/business/tech highest; entertainment lowest),
competition dynamics, and which formats work without showing a face
(listicles, explainers, documentaries, data stories, tutorials, relaxation).
Respond ONLY with valid JSON.`;

/**
 * Research high-CPM niches suitable for faceless channels using the
 * configured AI provider, then persist them for ranking and reuse.
 */
export async function researchNiches(
  options: NicheResearchOptions = {}
): Promise<Niche[]> {
  const { seedTopic, count = 5 } = options;

  const prompt = `Identify ${count} high-CPM YouTube niches that are ideal for FACELESS automated channels right now.
${seedTopic ? `Bias the research towards the interest area: "${seedTopic}".` : ""}

For each niche return:
- name: short niche name
- description: 1-2 sentences on the content
- cpmEstimateLowUsd / cpmEstimateHighUsd: realistic RPM-adjusted CPM range in USD
- competitionScore: 0-100 (100 = brutally competitive)
- searchDemandScore: 0-100 (100 = huge search demand)
- trendScore: 0-100 (100 = strongly growing)
- contentFormats: array of formats that work faceless (e.g. "listicle", "explainer")
- exampleTitles: 2 clickable example video titles
- rationale: why this niche monetizes well

Return JSON: {"niches": [ ... ]}`;

  const registry = getProviderRegistry();
  const result = await registry.complete(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, temperature: 0.8, maxTokens: 3000 }
  );

  const parsed = extractJson<{ niches: RawNiche[] }>(result.text);
  const niches: Niche[] = [];

  for (const raw of parsed.niches ?? []) {
    const overallScore = computeNicheScore(raw);
    const niche = await prisma.niche.upsert({
      where: { name: raw.name },
      update: {
        description: raw.description,
        cpmEstimateLowUsd: raw.cpmEstimateLowUsd,
        cpmEstimateHighUsd: raw.cpmEstimateHighUsd,
        competitionScore: raw.competitionScore,
        searchDemandScore: raw.searchDemandScore,
        trendScore: raw.trendScore,
        overallScore,
        contentFormats: raw.contentFormats ?? [],
        exampleTitles: raw.exampleTitles ?? [],
        rationale: raw.rationale,
      },
      create: {
        name: raw.name,
        description: raw.description,
        cpmEstimateLowUsd: raw.cpmEstimateLowUsd,
        cpmEstimateHighUsd: raw.cpmEstimateHighUsd,
        competitionScore: raw.competitionScore,
        searchDemandScore: raw.searchDemandScore,
        trendScore: raw.trendScore,
        overallScore,
        contentFormats: raw.contentFormats ?? [],
        exampleTitles: raw.exampleTitles ?? [],
        rationale: raw.rationale,
      },
    });
    niches.push(niche);
  }

  logger.info("niche research complete", {
    provider: result.provider,
    niches: niches.length,
  });
  return niches.sort((a, b) => b.overallScore - a.overallScore);
}

/** Blend CPM, demand, trend and (inverted) competition into one score. */
function computeNicheScore(raw: RawNiche): number {
  const cpmScore = Math.min(((raw.cpmEstimateLowUsd + raw.cpmEstimateHighUsd) / 2 / 30) * 100, 100);
  const score =
    cpmScore * 0.35 +
    raw.searchDemandScore * 0.25 +
    raw.trendScore * 0.2 +
    (100 - raw.competitionScore) * 0.2;
  return Math.round(Math.min(Math.max(score, 0), 100));
}
