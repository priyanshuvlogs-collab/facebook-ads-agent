import {
  ExternalApiError,
  RateLimitedError,
  createLogger,
  getEnv,
  sleep,
  withRetry,
} from "@yta/shared";
import type {
  GitHubRateLimitInfo,
  GitHubReadmeResponse,
  GitHubRepo,
  GitHubSearchResponse,
} from "./types";

const logger = createLogger("api-hunter:github");

const BASE_URL = "https://api.github.com";
/** Search API allows 30 req/min with a token, 10 without. Stay well below. */
const SEARCH_MIN_INTERVAL_MS = 2500;

export interface SearchRepositoriesOptions {
  query: string;
  sort?: "stars" | "updated" | "best-match";
  perPage?: number;
  maxPages?: number;
}

/**
 * Thin GitHub REST v3 client using native fetch.
 *
 * Features:
 *  - optional token auth (GITHUB_TOKEN) for higher rate limits
 *  - primary + secondary rate limit handling with automatic waits
 *  - paginated repository search
 *  - README retrieval (decoded)
 */
export class GitHubClient {
  private lastSearchAt = 0;
  private rateLimit: GitHubRateLimitInfo | null = null;

  get hasToken(): boolean {
    return Boolean(getEnv().GITHUB_TOKEN);
  }

  get lastKnownRateLimit(): GitHubRateLimitInfo | null {
    return this.rateLimit;
  }

  private headers(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "youtube-automation-agent-free-api-hunter",
    };
    const token = getEnv().GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  private async request<T>(path: string): Promise<T> {
    const execute = async (): Promise<T> => {
      const response = await fetch(`${BASE_URL}${path}`, { headers: this.headers() });

      // Track primary rate limit state from response headers.
      const remaining = Number(response.headers.get("x-ratelimit-remaining") ?? NaN);
      const limit = Number(response.headers.get("x-ratelimit-limit") ?? NaN);
      const reset = Number(response.headers.get("x-ratelimit-reset") ?? NaN);
      if (!Number.isNaN(remaining) && !Number.isNaN(reset)) {
        this.rateLimit = { remaining, limit, resetAtEpochSec: reset };
      }

      if (response.status === 403 || response.status === 429) {
        const retryAfterSec = Number(response.headers.get("retry-after") ?? NaN);
        let waitMs: number;
        if (!Number.isNaN(retryAfterSec)) {
          waitMs = retryAfterSec * 1000;
        } else if (remaining === 0 && !Number.isNaN(reset)) {
          waitMs = Math.max(0, reset * 1000 - Date.now()) + 1000;
        } else {
          waitMs = 60_000; // secondary rate limit without hints
        }
        throw new RateLimitedError("github", Math.min(waitMs, 15 * 60_000));
      }

      if (response.status === 404) {
        throw new ExternalApiError(`Not found: ${path}`, "github", 404);
      }
      if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new ExternalApiError(
          `GitHub request failed (${response.status}): ${body.slice(0, 300)}`,
          "github",
          response.status
        );
      }
      return (await response.json()) as T;
    };

    return withRetry(execute, {
      attempts: 4,
      baseDelayMs: 2000,
      shouldRetry: (error) => {
        if (error instanceof RateLimitedError) return true;
        if (error instanceof ExternalApiError) return error.statusCode >= 500;
        return true; // network errors
      },
      onRetry: async (error, attempt) => {
        if (error instanceof RateLimitedError && error.retryAfterMs) {
          logger.warn("rate limited, waiting", {
            waitMs: error.retryAfterMs,
            attempt,
          });
          await sleep(error.retryAfterMs);
        }
      },
    });
  }

  /** Throttled repository search with pagination. */
  async searchRepositories(options: SearchRepositoriesOptions): Promise<GitHubRepo[]> {
    const { query, sort = "best-match", perPage = 30, maxPages = 1 } = options;
    const repos: GitHubRepo[] = [];

    for (let page = 1; page <= maxPages; page++) {
      // Self-throttle the search endpoint (it has a much lower limit).
      const sinceLast = Date.now() - this.lastSearchAt;
      if (sinceLast < SEARCH_MIN_INTERVAL_MS) {
        await sleep(SEARCH_MIN_INTERVAL_MS - sinceLast);
      }
      this.lastSearchAt = Date.now();

      const params = new URLSearchParams({
        q: query,
        per_page: String(perPage),
        page: String(page),
      });
      if (sort !== "best-match") {
        params.set("sort", sort);
        params.set("order", "desc");
      }

      const result = await this.request<GitHubSearchResponse>(
        `/search/repositories?${params.toString()}`
      );
      repos.push(...result.items);
      logger.debug("search page fetched", {
        query,
        page,
        found: result.items.length,
        total: result.total_count,
      });
      if (result.items.length < perPage) break;
    }
    return repos;
  }

  /** Fetch full repository metadata. */
  async getRepo(fullName: string): Promise<GitHubRepo> {
    return this.request<GitHubRepo>(`/repos/${fullName}`);
  }

  /** Fetch and decode a repository README. Returns null when absent. */
  async getReadme(fullName: string): Promise<string | null> {
    try {
      const readme = await this.request<GitHubReadmeResponse>(
        `/repos/${fullName}/readme`
      );
      if (readme.encoding === "base64") {
        return Buffer.from(readme.content, "base64").toString("utf8");
      }
      return readme.content;
    } catch (error) {
      if (error instanceof ExternalApiError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }
}
