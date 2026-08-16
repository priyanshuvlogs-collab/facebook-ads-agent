/**
 * Shared domain types used across the API server, the Free API Hunter and
 * the web dashboard. String literal unions mirror the Prisma enums so the
 * frontend never needs to import Prisma.
 */

export const API_CATEGORIES = [
  "YOUTUBE_DATA",
  "TEXT_GENERATION",
  "TEXT_TO_SPEECH",
  "IMAGE_GENERATION",
  "VIDEO_GENERATION",
  "THUMBNAIL",
  "SEO_KEYWORDS",
  "SOCIAL_MEDIA",
  "TRANSCRIPTION",
  "MUSIC_AUDIO",
  "OTHER",
] as const;
export type ApiCategory = (typeof API_CATEGORIES)[number];

export const FREE_TIER_QUALITIES = [
  "UNKNOWN",
  "POOR",
  "LIMITED",
  "GOOD",
  "EXCELLENT",
] as const;
export type FreeTierQuality = (typeof FREE_TIER_QUALITIES)[number];

export const API_STATUSES = [
  "DISCOVERED",
  "ANALYZED",
  "VERIFIED",
  "INTEGRATED",
  "DEPRECATED",
  "BROKEN",
] as const;
export type ApiStatus = (typeof API_STATUSES)[number];

export const HUNTER_RUN_STATUSES = ["RUNNING", "COMPLETED", "FAILED"] as const;
export type HunterRunStatus = (typeof HUNTER_RUN_STATUSES)[number];

export const VIDEO_STATUSES = [
  "IDEA",
  "SCRIPTED",
  "VOICED",
  "RENDERED",
  "THUMBNAILED",
  "OPTIMIZED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED",
] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

export const ASSET_KINDS = [
  "VOICEOVER",
  "VIDEO",
  "THUMBNAIL",
  "MUSIC",
  "SUBTITLE",
] as const;
export type AssetKind = (typeof ASSET_KINDS)[number];

/** Human-readable labels for API categories (used by the dashboard). */
export const API_CATEGORY_LABELS: Record<ApiCategory, string> = {
  YOUTUBE_DATA: "YouTube Data",
  TEXT_GENERATION: "AI Text Generation",
  TEXT_TO_SPEECH: "Text-to-Speech",
  IMAGE_GENERATION: "Image Generation",
  VIDEO_GENERATION: "Video Generation",
  THUMBNAIL: "Thumbnails",
  SEO_KEYWORDS: "SEO & Keywords",
  SOCIAL_MEDIA: "Social Media Automation",
  TRANSCRIPTION: "Transcription",
  MUSIC_AUDIO: "Music & Audio",
  OTHER: "Other",
};

// ---------------------------------------------------------------------------
// Free API Hunter DTOs
// ---------------------------------------------------------------------------

export interface DiscoveredApiDto {
  id: string;
  githubRepoId: string;
  fullName: string;
  name: string;
  description: string | null;
  url: string;
  homepage: string | null;
  category: ApiCategory;
  stars: number;
  forks: number;
  openIssues: number;
  license: string | null;
  language: string | null;
  topics: string[];
  lastCommitAt: string | null;
  archived: boolean;
  docsQualityScore: number;
  freeTierQuality: FreeTierQuality;
  freeTierNotes: string | null;
  reliabilityScore: number;
  usefulnessScore: number;
  overallScore: number;
  status: ApiStatus;
  rateLimitNotes: string | null;
  endpoints: ApiEndpointDto[];
  usageExamples: ApiUsageExampleDto[];
  firstSeenAt: string;
  lastCheckedAt: string;
}

export interface ApiEndpointDto {
  id: string;
  method: string;
  url: string;
  description: string | null;
  requiresAuth: boolean;
  source: string;
}

export interface ApiUsageExampleDto {
  id: string;
  language: string;
  code: string;
  source: string;
}

export interface HunterRunDto {
  id: string;
  status: HunterRunStatus;
  categories: ApiCategory[];
  queriesExecuted: number;
  reposScanned: number;
  apisDiscovered: number;
  apisUpdated: number;
  errorLog: string[] | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ApiListFilters {
  category?: ApiCategory;
  minStars?: number;
  /** Only APIs whose repo was pushed to within this many days. */
  updatedWithinDays?: number;
  freeTierQuality?: FreeTierQuality;
  status?: ApiStatus;
  search?: string;
  sort?: "overallScore" | "stars" | "lastCommitAt" | "firstSeenAt";
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// YouTube automation DTOs
// ---------------------------------------------------------------------------

export interface NicheDto {
  id: string;
  name: string;
  description: string;
  cpmEstimateLowUsd: number;
  cpmEstimateHighUsd: number;
  competitionScore: number;
  searchDemandScore: number;
  trendScore: number;
  overallScore: number;
  contentFormats: string[];
  exampleTitles: string[];
  createdAt: string;
}

export interface ChannelDto {
  id: string;
  name: string;
  description: string | null;
  youtubeChannelId: string | null;
  nicheId: string | null;
  niche?: NicheDto | null;
  timezone: string;
  createdAt: string;
}

export interface VideoIdeaDto {
  id: string;
  channelId: string;
  title: string;
  angle: string;
  hook: string;
  keywords: string[];
  score: number;
  status: string;
  createdAt: string;
}

export interface VideoDto {
  id: string;
  channelId: string;
  title: string;
  description: string | null;
  tags: string[];
  status: VideoStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  createdAt: string;
}

export interface SeoSuggestion {
  titles: string[];
  description: string;
  tags: string[];
  hashtags: string[];
}

// ---------------------------------------------------------------------------
// Generic API envelope
// ---------------------------------------------------------------------------

export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiFailure {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;
