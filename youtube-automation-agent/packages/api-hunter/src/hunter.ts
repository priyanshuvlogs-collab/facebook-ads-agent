import { createLogger, errorMessage, uniqueBy } from "@yta/shared";
import type { ApiCategory } from "@yta/shared";
import { prisma } from "@yta/database";
import type { Prisma } from "@yta/database";
import { CATEGORY_STRATEGIES, type CategoryStrategy } from "./categories";
import { GitHubClient } from "./github/client";
import type { GitHubRepo } from "./github/types";
import { analyzeReadme } from "./analysis/readme-analyzer";
import { scoreApi } from "./analysis/scoring";

const logger = createLogger("api-hunter");

export interface HunterOptions {
  /** Categories to hunt. Defaults to all. */
  categories?: ApiCategory[];
  /** Max repos analyzed per category (after dedupe). Default 15. */
  maxReposPerCategory?: number;
  /** Skip repos below this star count. Default 50. */
  minStars?: number;
  /** Skip repos not pushed to within this many days. Default 730. */
  maxStaleDays?: number;
}

export interface HunterRunResult {
  runId: string;
  status: "COMPLETED" | "FAILED";
  queriesExecuted: number;
  reposScanned: number;
  apisDiscovered: number;
  apisUpdated: number;
  errors: string[];
}

/**
 * Free API Hunter.
 *
 * Pipeline per category:
 *   1. Execute the category's GitHub search queries
 *   2. Merge + dedupe + pre-filter results (stars, freshness, archived)
 *   3. Fetch each repo's README and run the heuristic analyzer
 *   4. Score reliability/usefulness and upsert into the database
 *
 * Every run is recorded as a HunterRun row for observability.
 */
export class FreeApiHunter {
  private readonly github: GitHubClient;

  constructor(github?: GitHubClient) {
    this.github = github ?? new GitHubClient();
  }

  async run(options: HunterOptions = {}): Promise<HunterRunResult> {
    const {
      categories = CATEGORY_STRATEGIES.map((s) => s.category),
      maxReposPerCategory = 15,
      minStars = 50,
      maxStaleDays = 730,
    } = options;

    const strategies = CATEGORY_STRATEGIES.filter((s) =>
      categories.includes(s.category)
    );

    const run = await prisma.hunterRun.create({
      data: { categories: strategies.map((s) => s.category) },
    });

    logger.info("hunter run started", {
      runId: run.id,
      categories: strategies.length,
      authenticated: this.github.hasToken,
    });
    if (!this.github.hasToken) {
      logger.warn(
        "GITHUB_TOKEN not set - unauthenticated GitHub search is limited to ~10 requests/min"
      );
    }

    let queriesExecuted = 0;
    let reposScanned = 0;
    let apisDiscovered = 0;
    let apisUpdated = 0;
    const errors: string[] = [];

    for (const strategy of strategies) {
      try {
        const repos = await this.searchCategory(strategy, (count) => {
          queriesExecuted += count;
        });

        const filtered = this.preFilter(repos, minStars, maxStaleDays).slice(
          0,
          maxReposPerCategory
        );
        logger.info("category search complete", {
          category: strategy.category,
          rawResults: repos.length,
          analyzing: filtered.length,
        });

        for (const repo of filtered) {
          reposScanned++;
          try {
            const { created } = await this.analyzeAndPersist(repo, strategy);
            if (created) apisDiscovered++;
            else apisUpdated++;
          } catch (error) {
            const message = `analyze ${repo.full_name}: ${errorMessage(error)}`;
            errors.push(message);
            logger.error("repo analysis failed", { repo: repo.full_name, error });
          }
        }
      } catch (error) {
        const message = `category ${strategy.category}: ${errorMessage(error)}`;
        errors.push(message);
        logger.error("category hunt failed", { category: strategy.category, error });
      }

      // Persist incremental progress so the dashboard can watch live.
      await prisma.hunterRun.update({
        where: { id: run.id },
        data: { queriesExecuted, reposScanned, apisDiscovered, apisUpdated },
      });
    }

    const status = errors.length > 0 && reposScanned === 0 ? "FAILED" : "COMPLETED";
    await prisma.hunterRun.update({
      where: { id: run.id },
      data: {
        status,
        queriesExecuted,
        reposScanned,
        apisDiscovered,
        apisUpdated,
        errorLog: errors.length > 0 ? errors : undefined,
        finishedAt: new Date(),
      },
    });

    logger.info("hunter run finished", {
      runId: run.id,
      status,
      reposScanned,
      apisDiscovered,
      apisUpdated,
      errors: errors.length,
    });

    return {
      runId: run.id,
      status,
      queriesExecuted,
      reposScanned,
      apisDiscovered,
      apisUpdated,
      errors,
    };
  }

  private async searchCategory(
    strategy: CategoryStrategy,
    onQueries: (count: number) => void
  ): Promise<GitHubRepo[]> {
    const results: GitHubRepo[] = [];
    for (const query of strategy.queries) {
      try {
        const repos = await this.github.searchRepositories({
          query,
          sort: "best-match",
          perPage: 20,
          maxPages: 1,
        });
        results.push(...repos);
      } catch (error) {
        logger.warn("search query failed", { query, error: errorMessage(error) });
      } finally {
        onQueries(1);
      }
    }
    return uniqueBy(results, (r) => r.id);
  }

  private preFilter(
    repos: GitHubRepo[],
    minStars: number,
    maxStaleDays: number
  ): GitHubRepo[] {
    const staleCutoff = Date.now() - maxStaleDays * 86_400_000;
    return repos
      .filter((repo) => {
        if (repo.archived || repo.fork) return false;
        if (repo.stargazers_count < minStars) return false;
        if (repo.pushed_at && Date.parse(repo.pushed_at) < staleCutoff) return false;
        return true;
      })
      .sort((a, b) => b.stargazers_count - a.stargazers_count);
  }

  private async analyzeAndPersist(
    repo: GitHubRepo,
    strategy: CategoryStrategy
  ): Promise<{ created: boolean }> {
    const readme = await this.github.getReadme(repo.full_name);
    const analysis = analyzeReadme(readme);
    const scores = scoreApi(repo, analysis, strategy);

    const data = {
      fullName: repo.full_name,
      name: repo.name,
      description: repo.description,
      url: repo.html_url,
      homepage: repo.homepage || null,
      category: strategy.category,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      openIssues: repo.open_issues_count,
      license: repo.license?.spdx_id ?? repo.license?.name ?? null,
      language: repo.language,
      topics: repo.topics ?? [],
      lastCommitAt: repo.pushed_at ? new Date(repo.pushed_at) : null,
      archived: repo.archived,
      docsQualityScore: analysis.docsQualityScore,
      freeTierQuality: analysis.freeTierQuality,
      freeTierNotes: analysis.freeTierNotes,
      rateLimitNotes: analysis.rateLimitNotes,
      readmeExcerpt: analysis.excerpt,
      reliabilityScore: scores.reliabilityScore,
      usefulnessScore: scores.usefulnessScore,
      overallScore: scores.overallScore,
      lastCheckedAt: new Date(),
    } satisfies Omit<
      Prisma.DiscoveredApiUncheckedCreateInput,
      "githubRepoId" | "status"
    >;

    // Match by repo id OR full name (manually seeded rows may carry
    // placeholder ids that get corrected on first real hunt).
    const existing = await prisma.discoveredApi.findFirst({
      where: {
        OR: [{ githubRepoId: BigInt(repo.id) }, { fullName: repo.full_name }],
      },
      select: { id: true, status: true },
    });

    const record = existing
      ? await prisma.discoveredApi.update({
          where: { id: existing.id },
          // never downgrade a manually-set status
          data: { ...data, githubRepoId: BigInt(repo.id) },
        })
      : await prisma.discoveredApi.create({
          data: { ...data, githubRepoId: BigInt(repo.id), status: "ANALYZED" },
        });

    // Refresh extracted endpoints and examples.
    for (const endpoint of analysis.endpoints) {
      await prisma.apiEndpoint.upsert({
        where: {
          apiId_method_url: {
            apiId: record.id,
            method: endpoint.method,
            url: endpoint.url,
          },
        },
        update: {
          description: endpoint.description,
          requiresAuth: endpoint.requiresAuth,
        },
        create: {
          apiId: record.id,
          method: endpoint.method,
          url: endpoint.url,
          description: endpoint.description,
          requiresAuth: endpoint.requiresAuth,
          source: "readme",
        },
      });
    }

    if (analysis.usageExamples.length > 0) {
      await prisma.apiUsageExample.deleteMany({ where: { apiId: record.id } });
      await prisma.apiUsageExample.createMany({
        data: analysis.usageExamples.map((example) => ({
          apiId: record.id,
          language: example.language,
          code: example.code,
          source: "readme",
        })),
      });
    }

    logger.debug("repo persisted", {
      repo: repo.full_name,
      score: scores.overallScore,
      endpoints: analysis.endpoints.length,
      created: !existing,
    });

    return { created: !existing };
  }
}
