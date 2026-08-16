import { readFile, stat } from "node:fs/promises";
import {
  ConfigurationError,
  ExternalApiError,
  createLogger,
  getEnv,
  hasCapability,
} from "@yta/shared";

const logger = createLogger("youtube-core:publisher");

export interface UploadOptions {
  videoFilePath: string;
  title: string;
  description: string;
  tags: string[];
  categoryId?: string; // 27 = Education, 28 = Science & Tech, 24 = Entertainment
  privacyStatus?: "private" | "unlisted" | "public";
  /** ISO datetime for scheduled publishing (requires privacyStatus=private). */
  publishAt?: string;
}

export interface UploadResult {
  youtubeVideoId: string;
  watchUrl: string;
}

/** True when YouTube OAuth credentials are configured. */
export function isPublishingConfigured(): boolean {
  return hasCapability("youtube-upload");
}

/** Exchange the stored refresh token for a short-lived access token. */
async function getAccessToken(): Promise<string> {
  const env = getEnv();
  if (!isPublishingConfigured()) {
    throw new ConfigurationError(
      "YouTube publishing not configured. Set YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET and YOUTUBE_REFRESH_TOKEN."
    );
  }
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.YOUTUBE_CLIENT_ID as string,
      client_secret: env.YOUTUBE_CLIENT_SECRET as string,
      refresh_token: env.YOUTUBE_REFRESH_TOKEN as string,
      grant_type: "refresh_token",
    }),
  });
  const json = (await response.json()) as { access_token?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new ExternalApiError(
      `OAuth token refresh failed: ${json.error ?? response.status}`,
      "youtube",
      response.status
    );
  }
  return json.access_token;
}

/**
 * Upload a video via the YouTube Data API v3 resumable upload protocol.
 * Uses raw fetch (no googleapis dependency).
 *
 * Note: each upload costs ~1600 quota units of the default 10k/day quota.
 */
export async function uploadVideo(options: UploadOptions): Promise<UploadResult> {
  const {
    videoFilePath,
    title,
    description,
    tags,
    categoryId = "27",
    privacyStatus = "private",
    publishAt,
  } = options;

  const accessToken = await getAccessToken();
  const fileInfo = await stat(videoFilePath);

  const metadata = {
    snippet: { title: title.slice(0, 100), description, tags: tags.slice(0, 30), categoryId },
    status: {
      privacyStatus: publishAt ? "private" : privacyStatus,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: false,
    },
  };

  // Step 1: initiate the resumable session.
  const initResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(fileInfo.size),
        "X-Upload-Content-Type": "video/*",
      },
      body: JSON.stringify(metadata),
    }
  );
  if (!initResponse.ok) {
    const body = await initResponse.text().catch(() => "");
    throw new ExternalApiError(
      `Upload session init failed (${initResponse.status}): ${body.slice(0, 300)}`,
      "youtube",
      initResponse.status
    );
  }
  const uploadUrl = initResponse.headers.get("location");
  if (!uploadUrl) {
    throw new ExternalApiError("Upload session returned no location header", "youtube");
  }

  // Step 2: upload the bytes.
  const fileBuffer = await readFile(videoFilePath);
  const uploadResponse = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/*",
      "Content-Length": String(fileInfo.size),
    },
    body: new Uint8Array(fileBuffer),
  });
  const uploadJson = (await uploadResponse.json()) as { id?: string };
  if (!uploadResponse.ok || !uploadJson.id) {
    throw new ExternalApiError(
      `Video upload failed (${uploadResponse.status})`,
      "youtube",
      uploadResponse.status
    );
  }

  const result: UploadResult = {
    youtubeVideoId: uploadJson.id,
    watchUrl: `https://www.youtube.com/watch?v=${uploadJson.id}`,
  };
  logger.info("video uploaded", { ...result, scheduled: Boolean(publishAt) });
  return result;
}

/** Set a custom thumbnail for an uploaded video (JPG/PNG, max 2MB). */
export async function setThumbnail(
  youtubeVideoId: string,
  thumbnailFilePath: string
): Promise<void> {
  const accessToken = await getAccessToken();
  const image = await readFile(thumbnailFilePath);
  const contentType = thumbnailFilePath.endsWith(".png") ? "image/png" : "image/jpeg";

  const response = await fetch(
    `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${youtubeVideoId}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": contentType,
      },
      body: new Uint8Array(image),
    }
  );
  if (!response.ok) {
    throw new ExternalApiError(
      `Thumbnail upload failed (${response.status})`,
      "youtube",
      response.status
    );
  }
  logger.info("thumbnail set", { youtubeVideoId });
}
