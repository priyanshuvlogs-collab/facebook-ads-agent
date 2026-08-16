import { clamp } from "@yta/shared";
import type { FreeTierQuality } from "@yta/shared";
import type { GitHubRepo } from "../github/types";
import type { CategoryStrategy } from "../categories";
import type { ReadmeAnalysis } from "./readme-analyzer";

export interface ApiScores {
  reliabilityScore: number; // 0..100
  usefulnessScore: number; // 0..100
  overallScore: number; // 0..100
}

const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "Unlicense",
  "MPL-2.0",
  "0BSD",
]);

const COPYLEFT_LICENSES = new Set(["GPL-2.0", "GPL-3.0", "AGPL-3.0", "LGPL-3.0", "LGPL-2.1"]);

const FREE_TIER_POINTS: Record<FreeTierQuality, number> = {
  EXCELLENT: 30,
  GOOD: 22,
  LIMITED: 12,
  UNKNOWN: 6,
  POOR: 0,
};

/**
 * Ranking engine.
 *
 * reliability = can we depend on this? (popularity, maintenance, health, license)
 * usefulness  = does it actually help YouTube automation? (category fit,
 *               endpoints found, free tier, docs quality)
 * overall     = weighted blend, what the dashboard sorts by default.
 */
export function scoreApi(
  repo: GitHubRepo,
  analysis: ReadmeAnalysis,
  strategy: CategoryStrategy
): ApiScores {
  const reliabilityScore = scoreReliability(repo);
  const usefulnessScore = scoreUsefulness(repo, analysis, strategy);
  const overallScore = Math.round(
    clamp(reliabilityScore * 0.45 + usefulnessScore * 0.55, 0, 100)
  );
  return { reliabilityScore, usefulnessScore, overallScore };
}

function scoreReliability(repo: GitHubRepo): number {
  let score = 0;

  // Popularity: log-scale stars, up to 35 points (100 stars ~17, 10k ~33).
  score += clamp(Math.log10(Math.max(repo.stargazers_count, 1)) * 8.5, 0, 35);

  // Maintenance recency: up to 30 points, decaying over 18 months.
  if (repo.pushed_at) {
    const daysSincePush = (Date.now() - Date.parse(repo.pushed_at)) / 86_400_000;
    score += clamp(30 * (1 - daysSincePush / 540), 0, 30);
  }

  // Community: forks indicate reuse, up to 10 points.
  score += clamp(Math.log10(Math.max(repo.forks_count, 1)) * 3.5, 0, 10);

  // Issue health: heavily issue-laden repos relative to stars lose points.
  const issueRatio = repo.open_issues_count / Math.max(repo.stargazers_count, 1);
  score += issueRatio < 0.02 ? 10 : issueRatio < 0.1 ? 6 : issueRatio < 0.3 ? 3 : 0;

  // License: permissive is best for integration; copyleft still usable.
  const license = repo.license?.spdx_id ?? null;
  if (license && PERMISSIVE_LICENSES.has(license)) score += 15;
  else if (license && COPYLEFT_LICENSES.has(license)) score += 10;
  else if (license && license !== "NOASSERTION") score += 5;

  // Red flags.
  if (repo.archived) score -= 40;
  if (repo.fork) score -= 10;

  return Math.round(clamp(score, 0, 100));
}

function scoreUsefulness(
  repo: GitHubRepo,
  analysis: ReadmeAnalysis,
  strategy: CategoryStrategy
): number {
  let score = 0;

  // Category importance for the YouTube pipeline: up to 15 points.
  score += strategy.weight * 15;

  // Category signal match in name/description/topics: up to 15 points.
  const haystack = [
    repo.name,
    repo.description ?? "",
    ...(repo.topics ?? []),
    analysis.excerpt ?? "",
  ]
    .join(" ")
    .toLowerCase();
  const matches = strategy.signals.filter((signal) =>
    haystack.includes(signal.toLowerCase())
  ).length;
  score += clamp((matches / Math.max(strategy.signals.length, 1)) * 15, 0, 15);

  // Concrete endpoints extracted: up to 15 points.
  score += clamp(analysis.endpoints.length * 3, 0, 15);

  // Usage examples: up to 5 points.
  score += clamp(analysis.usageExamples.length * 1.5, 0, 5);

  // Free tier quality: up to 30 points (this is a *free* API hunter).
  score += FREE_TIER_POINTS[analysis.freeTierQuality];

  // Docs quality: up to 20 points.
  score += analysis.docsQualityScore * 0.2;

  return Math.round(clamp(score, 0, 100));
}
