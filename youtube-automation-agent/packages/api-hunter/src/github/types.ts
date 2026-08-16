/** Subset of the GitHub REST API shapes the hunter consumes. */

export interface GitHubRepo {
  id: number;
  full_name: string;
  name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  language: string | null;
  topics?: string[];
  license: { spdx_id: string | null; name: string } | null;
  pushed_at: string | null;
  archived: boolean;
  fork: boolean;
}

export interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubRepo[];
}

export interface GitHubReadmeResponse {
  content: string;
  encoding: string;
}

export interface GitHubRateLimitInfo {
  remaining: number;
  limit: number;
  resetAtEpochSec: number;
}
