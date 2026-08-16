import { z } from "zod";

/**
 * Central, validated view over environment variables.
 *
 * Every integration key is optional: modules check availability at runtime
 * and disable themselves gracefully instead of crashing the whole system.
 */
const envSchema = z.object({
  DATABASE_URL: z.string().optional(),

  GITHUB_TOKEN: z.string().optional(),

  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GROQ_API_KEY: z.string().optional(),
  TOGETHER_API_KEY: z.string().optional(),

  ELEVENLABS_API_KEY: z.string().optional(),
  PEXELS_API_KEY: z.string().optional(),

  YOUTUBE_CLIENT_ID: z.string().optional(),
  YOUTUBE_CLIENT_SECRET: z.string().optional(),
  YOUTUBE_REFRESH_TOKEN: z.string().optional(),

  API_PORT: z.coerce.number().int().positive().default(4000),
  NEXT_PUBLIC_API_URL: z.string().default("http://localhost:4000"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export type Env = z.infer<typeof envSchema>;

function normalize(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

let cached: Env | undefined;

/** Parse and cache environment variables (empty strings treated as unset). */
export function getEnv(): Env {
  if (cached) return cached;
  const raw: Record<string, string | undefined> = {};
  for (const key of Object.keys(envSchema.shape)) {
    raw[key] = normalize(process.env[key]);
  }
  cached = envSchema.parse(raw);
  return cached;
}

/** True when the given capability has all env vars it requires. */
export function hasCapability(
  capability:
    | "database"
    | "github"
    | "openai"
    | "anthropic"
    | "groq"
    | "together"
    | "elevenlabs"
    | "pexels"
    | "youtube-upload"
): boolean {
  const env = getEnv();
  switch (capability) {
    case "database":
      return Boolean(env.DATABASE_URL);
    case "github":
      return Boolean(env.GITHUB_TOKEN);
    case "openai":
      return Boolean(env.OPENAI_API_KEY);
    case "anthropic":
      return Boolean(env.ANTHROPIC_API_KEY);
    case "groq":
      return Boolean(env.GROQ_API_KEY);
    case "together":
      return Boolean(env.TOGETHER_API_KEY);
    case "elevenlabs":
      return Boolean(env.ELEVENLABS_API_KEY);
    case "pexels":
      return Boolean(env.PEXELS_API_KEY);
    case "youtube-upload":
      return Boolean(
        env.YOUTUBE_CLIENT_ID && env.YOUTUBE_CLIENT_SECRET && env.YOUTUBE_REFRESH_TOKEN
      );
  }
}
