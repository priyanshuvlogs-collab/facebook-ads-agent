import type { ApiCategory } from "@yta/shared";

/**
 * Search strategy per API category.
 *
 * Each category defines several GitHub search queries. Queries use GitHub
 * search qualifiers (stars, pushed, topic, in:...) to pre-filter noise at
 * the source. The hunter merges + dedupes results across queries.
 */
export interface CategoryStrategy {
  category: ApiCategory;
  label: string;
  /** GitHub search queries executed for this category. */
  queries: string[];
  /** Keywords that boost the confidence a repo belongs to this category. */
  signals: string[];
  /** Relative importance of this category for YouTube automation, 0..1. */
  weight: number;
}

const RECENT = "pushed:>2024-01-01";
const QUALITY = "stars:>100 archived:false";

export const CATEGORY_STRATEGIES: CategoryStrategy[] = [
  {
    category: "YOUTUBE_DATA",
    label: "YouTube Data API alternatives",
    queries: [
      `youtube api alternative ${QUALITY} ${RECENT}`,
      `youtube data api free in:readme,description ${QUALITY} ${RECENT}`,
      `topic:youtube-api ${QUALITY}`,
      `invidious OR piped youtube frontend api ${QUALITY}`,
      `youtube scraper api ${QUALITY} ${RECENT}`,
    ],
    signals: ["youtube", "video metadata", "no api key", "quota", "trending", "yt-dlp"],
    weight: 1.0,
  },
  {
    category: "TEXT_GENERATION",
    label: "AI text generation",
    queries: [
      `free llm api in:readme,description ${QUALITY} ${RECENT}`,
      `topic:llm-api free ${QUALITY}`,
      `openai compatible api free ${QUALITY} ${RECENT}`,
      `gpt free api reverse ${QUALITY} ${RECENT}`,
    ],
    signals: ["llm", "gpt", "completion", "chat", "free tier", "openai-compatible"],
    weight: 0.9,
  },
  {
    category: "TEXT_TO_SPEECH",
    label: "Text-to-speech",
    queries: [
      `text to speech free api ${QUALITY} ${RECENT}`,
      `topic:text-to-speech api ${QUALITY} ${RECENT}`,
      `topic:tts neural voices ${QUALITY}`,
      `voice synthesis open source ${QUALITY} ${RECENT}`,
    ],
    signals: ["tts", "voice", "speech synthesis", "neural voice", "voice cloning"],
    weight: 1.0,
  },
  {
    category: "IMAGE_GENERATION",
    label: "Image generation",
    queries: [
      `free image generation api ${QUALITY} ${RECENT}`,
      `topic:stable-diffusion api ${QUALITY} ${RECENT}`,
      `topic:image-generation free ${QUALITY}`,
      `flux OR sdxl inference api ${QUALITY} ${RECENT}`,
    ],
    signals: ["txt2img", "diffusion", "image generation", "flux", "sdxl"],
    weight: 0.85,
  },
  {
    category: "VIDEO_GENERATION",
    label: "Video generation",
    queries: [
      `ai video generation open source ${QUALITY} ${RECENT}`,
      `topic:video-generation api ${QUALITY} ${RECENT}`,
      `text to video free ${QUALITY} ${RECENT}`,
      `faceless video automation youtube ${QUALITY} ${RECENT}`,
    ],
    signals: ["text-to-video", "video generation", "ffmpeg", "render", "moviepy"],
    weight: 0.95,
  },
  {
    category: "THUMBNAIL",
    label: "Thumbnail generation",
    queries: [
      `thumbnail generator api ${QUALITY} ${RECENT}`,
      `og image generation api ${QUALITY} ${RECENT}`,
      `image template api open source ${QUALITY}`,
    ],
    signals: ["thumbnail", "og-image", "banner", "cover image", "template"],
    weight: 0.7,
  },
  {
    category: "SEO_KEYWORDS",
    label: "SEO & keyword research",
    queries: [
      `keyword research free api ${QUALITY} ${RECENT}`,
      `google trends api unofficial ${QUALITY} ${RECENT}`,
      `topic:seo api free ${QUALITY}`,
      `youtube tags seo tool api ${QUALITY} ${RECENT}`,
      `autocomplete suggest api scraper ${QUALITY} ${RECENT}`,
    ],
    signals: ["keyword", "search volume", "trends", "seo", "suggest", "serp"],
    weight: 0.9,
  },
  {
    category: "SOCIAL_MEDIA",
    label: "Social media automation",
    queries: [
      `social media automation api ${QUALITY} ${RECENT}`,
      `topic:social-media-automation ${QUALITY} ${RECENT}`,
      `cross posting scheduler open source ${QUALITY} ${RECENT}`,
    ],
    signals: ["scheduler", "cross-post", "publish", "automation", "buffer"],
    weight: 0.6,
  },
  {
    category: "TRANSCRIPTION",
    label: "Transcription & subtitles",
    queries: [
      `topic:whisper transcription api ${QUALITY} ${RECENT}`,
      `speech to text free api ${QUALITY} ${RECENT}`,
      `subtitles generator open source ${QUALITY} ${RECENT}`,
    ],
    signals: ["whisper", "transcribe", "speech-to-text", "srt", "subtitles"],
    weight: 0.75,
  },
  {
    category: "MUSIC_AUDIO",
    label: "Music & audio",
    queries: [
      `royalty free music api ${QUALITY} ${RECENT}`,
      `ai music generation open source ${QUALITY} ${RECENT}`,
      `sound effects free api ${QUALITY}`,
    ],
    signals: ["music", "audio", "royalty free", "sound effects", "bgm"],
    weight: 0.5,
  },
];

export function getStrategy(category: ApiCategory): CategoryStrategy | undefined {
  return CATEGORY_STRATEGIES.find((s) => s.category === category);
}

export function allCategories(): ApiCategory[] {
  return CATEGORY_STRATEGIES.map((s) => s.category);
}
