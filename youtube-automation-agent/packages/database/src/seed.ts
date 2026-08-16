/**
 * Seed script - inserts a handful of well-known free APIs and a demo
 * channel so the dashboard has data before the first hunter run.
 *
 * Run with: npm run db:seed
 */
import { ApiCategory, ApiStatus, FreeTierQuality, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

interface SeedApi {
  githubRepoId: bigint;
  fullName: string;
  name: string;
  description: string;
  url: string;
  homepage?: string;
  category: ApiCategory;
  stars: number;
  license?: string;
  language?: string;
  topics: string[];
  freeTierQuality: FreeTierQuality;
  freeTierNotes: string;
  rateLimitNotes?: string;
  docsQualityScore: number;
  reliabilityScore: number;
  usefulnessScore: number;
  overallScore: number;
  status: ApiStatus;
  endpoints: { method: string; url: string; description: string; requiresAuth: boolean }[];
}

const seedApis: SeedApi[] = [
  {
    githubRepoId: 700001n,
    fullName: "iv-org/invidious",
    name: "invidious",
    description:
      "Open source alternative front-end to YouTube with a full JSON API for videos, channels, search and trending - no API key or quota.",
    url: "https://github.com/iv-org/invidious",
    homepage: "https://invidious.io",
    category: ApiCategory.YOUTUBE_DATA,
    stars: 16000,
    license: "AGPL-3.0",
    language: "Crystal",
    topics: ["youtube", "api", "privacy"],
    freeTierQuality: FreeTierQuality.EXCELLENT,
    freeTierNotes: "Fully free, self-hostable, public instances available. No key required.",
    rateLimitNotes: "Per-instance limits; self-hosting removes limits entirely.",
    docsQualityScore: 85,
    reliabilityScore: 82,
    usefulnessScore: 95,
    overallScore: 90,
    status: ApiStatus.VERIFIED,
    endpoints: [
      { method: "GET", url: "https://invidious.io/api/v1/videos/:id", description: "Video metadata", requiresAuth: false },
      { method: "GET", url: "https://invidious.io/api/v1/search?q=", description: "Search videos/channels", requiresAuth: false },
      { method: "GET", url: "https://invidious.io/api/v1/trending", description: "Trending videos", requiresAuth: false },
    ],
  },
  {
    githubRepoId: 700002n,
    fullName: "TeamPiped/Piped",
    name: "Piped",
    description:
      "Privacy-friendly alternative YouTube frontend with an open REST API for streams, channels, playlists and search.",
    url: "https://github.com/TeamPiped/Piped",
    homepage: "https://piped.video",
    category: ApiCategory.YOUTUBE_DATA,
    stars: 8500,
    license: "AGPL-3.0",
    language: "Java",
    topics: ["youtube", "api", "privacy"],
    freeTierQuality: FreeTierQuality.EXCELLENT,
    freeTierNotes: "Free public instances plus easy self-hosting via Docker.",
    docsQualityScore: 78,
    reliabilityScore: 75,
    usefulnessScore: 90,
    overallScore: 84,
    status: ApiStatus.VERIFIED,
    endpoints: [
      { method: "GET", url: "https://pipedapi.kavin.rocks/streams/:id", description: "Stream/video info", requiresAuth: false },
      { method: "GET", url: "https://pipedapi.kavin.rocks/trending?region=US", description: "Trending", requiresAuth: false },
    ],
  },
  {
    githubRepoId: 700003n,
    fullName: "rany2/edge-tts",
    name: "edge-tts",
    description:
      "Use Microsoft Edge's online neural text-to-speech service from Python - hundreds of natural voices, completely free.",
    url: "https://github.com/rany2/edge-tts",
    category: ApiCategory.TEXT_TO_SPEECH,
    stars: 7000,
    license: "GPL-3.0",
    language: "Python",
    topics: ["tts", "text-to-speech", "edge"],
    freeTierQuality: FreeTierQuality.EXCELLENT,
    freeTierNotes: "Completely free, no API key, high-quality neural voices.",
    rateLimitNotes: "Unofficial; heavy abuse may be throttled by Microsoft.",
    docsQualityScore: 80,
    reliabilityScore: 78,
    usefulnessScore: 96,
    overallScore: 88,
    status: ApiStatus.VERIFIED,
    endpoints: [],
  },
  {
    githubRepoId: 700004n,
    fullName: "coqui-ai/TTS",
    name: "Coqui TTS",
    description:
      "Deep learning toolkit for Text-to-Speech - fully offline, open-source voice cloning and multi-speaker synthesis.",
    url: "https://github.com/coqui-ai/TTS",
    category: ApiCategory.TEXT_TO_SPEECH,
    stars: 37000,
    license: "MPL-2.0",
    language: "Python",
    topics: ["tts", "voice-cloning", "deep-learning"],
    freeTierQuality: FreeTierQuality.EXCELLENT,
    freeTierNotes: "Runs locally - zero cost, no rate limits, needs a GPU for best speed.",
    docsQualityScore: 88,
    reliabilityScore: 85,
    usefulnessScore: 88,
    overallScore: 87,
    status: ApiStatus.ANALYZED,
    endpoints: [],
  },
  {
    githubRepoId: 700005n,
    fullName: "AUTOMATIC1111/stable-diffusion-webui",
    name: "Stable Diffusion WebUI",
    description:
      "Stable Diffusion web UI with a full txt2img/img2img REST API - free local image generation for thumbnails and b-roll.",
    url: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
    category: ApiCategory.IMAGE_GENERATION,
    stars: 145000,
    license: "AGPL-3.0",
    language: "Python",
    topics: ["stable-diffusion", "image-generation", "api"],
    freeTierQuality: FreeTierQuality.EXCELLENT,
    freeTierNotes: "Free and local. GPU required. --api flag exposes REST endpoints.",
    docsQualityScore: 82,
    reliabilityScore: 90,
    usefulnessScore: 92,
    overallScore: 91,
    status: ApiStatus.VERIFIED,
    endpoints: [
      { method: "POST", url: "http://localhost:7860/sdapi/v1/txt2img", description: "Generate image from prompt", requiresAuth: false },
    ],
  },
  {
    githubRepoId: 700006n,
    fullName: "public-apis/public-apis",
    name: "public-apis",
    description:
      "A collective list of free APIs across every category - the canonical index the hunter cross-references.",
    url: "https://github.com/public-apis/public-apis",
    category: ApiCategory.OTHER,
    stars: 320000,
    license: "MIT",
    language: "Python",
    topics: ["free", "apis", "list"],
    freeTierQuality: FreeTierQuality.GOOD,
    freeTierNotes: "Directory of free APIs rather than an API itself.",
    docsQualityScore: 95,
    reliabilityScore: 95,
    usefulnessScore: 70,
    overallScore: 80,
    status: ApiStatus.ANALYZED,
    endpoints: [],
  },
];

async function main(): Promise<void> {
  console.log("Seeding discovered APIs...");
  for (const api of seedApis) {
    const { endpoints, ...data } = api;
    const record = await prisma.discoveredApi.upsert({
      where: { githubRepoId: data.githubRepoId },
      update: { ...data },
      create: { ...data },
    });
    for (const ep of endpoints) {
      await prisma.apiEndpoint.upsert({
        where: {
          apiId_method_url: { apiId: record.id, method: ep.method, url: ep.url },
        },
        update: { description: ep.description, requiresAuth: ep.requiresAuth },
        create: { apiId: record.id, source: "manual", ...ep },
      });
    }
  }

  console.log("Seeding demo niche and channel...");
  const niche = await prisma.niche.upsert({
    where: { name: "Personal Finance Explainers" },
    update: {},
    create: {
      name: "Personal Finance Explainers",
      description:
        "Animated/faceless explainers about budgeting, investing and credit. High advertiser demand keeps CPM strong.",
      cpmEstimateLowUsd: 12,
      cpmEstimateHighUsd: 35,
      competitionScore: 65,
      searchDemandScore: 85,
      trendScore: 75,
      overallScore: 80,
      contentFormats: ["listicle", "explainer", "case-study"],
      exampleTitles: [
        "7 Money Habits Keeping You Poor",
        "How Index Funds Actually Work (Simply Explained)",
      ],
      rationale: "Finance consistently ranks among the highest-CPM niches on YouTube.",
    },
  });

  const existingChannel = await prisma.channel.findFirst({
    where: { name: "Money Mind" },
  });
  if (!existingChannel) {
    await prisma.channel.create({
      data: {
        name: "Money Mind",
        description: "Faceless personal finance explainers.",
        nicheId: niche.id,
        timezone: "America/New_York",
      },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
