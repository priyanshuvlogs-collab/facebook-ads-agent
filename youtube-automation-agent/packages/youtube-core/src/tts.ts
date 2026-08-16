import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ConfigurationError,
  ExternalApiError,
  createLogger,
  getEnv,
  hasCapability,
} from "@yta/shared";

const logger = createLogger("youtube-core:tts");

export interface TtsOptions {
  voice?: string;
  outputDir?: string;
  fileName?: string;
}

export interface TtsResult {
  filePath: string;
  provider: string;
  voice: string;
  bytes: number;
}

interface TtsProvider {
  name: string;
  isAvailable(): boolean;
  synthesize(text: string, voice: string | undefined): Promise<{ audio: Buffer; voice: string }>;
}

/** ElevenLabs - best quality, has a free tier (~10k credits/month). */
const elevenLabsProvider: TtsProvider = {
  name: "elevenlabs",
  isAvailable: () => hasCapability("elevenlabs"),
  async synthesize(text, voice) {
    const voiceId = voice ?? "21m00Tcm4TlvDq8ikWAM"; // "Rachel" default voice
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": getEnv().ELEVENLABS_API_KEY as string,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    );
    if (!response.ok) {
      throw new ExternalApiError(
        `ElevenLabs TTS failed: HTTP ${response.status}`,
        "elevenlabs",
        response.status
      );
    }
    return { audio: Buffer.from(await response.arrayBuffer()), voice: voiceId };
  },
};

/** OpenAI TTS - cheap, reliable, good quality. */
const openAiTtsProvider: TtsProvider = {
  name: "openai",
  isAvailable: () => hasCapability("openai"),
  async synthesize(text, voice) {
    const chosenVoice = voice ?? "onyx";
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getEnv().OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        input: text.slice(0, 4096), // API hard limit per request
        voice: chosenVoice,
        response_format: "mp3",
      }),
    });
    if (!response.ok) {
      throw new ExternalApiError(
        `OpenAI TTS failed: HTTP ${response.status}`,
        "openai",
        response.status
      );
    }
    return { audio: Buffer.from(await response.arrayBuffer()), voice: chosenVoice };
  },
};

const providers: TtsProvider[] = [elevenLabsProvider, openAiTtsProvider];

/** Providers that are ready to use right now. */
export function availableTtsProviders(): string[] {
  return providers.filter((p) => p.isAvailable()).map((p) => p.name);
}

/**
 * Generate a voiceover MP3 for the given text using the best available
 * provider (ElevenLabs > OpenAI). For a completely free local pipeline,
 * see docs/youtube-automation.md for the edge-tts / Coqui integration notes
 * surfaced by the Free API Hunter.
 */
export async function synthesizeVoiceover(
  text: string,
  options: TtsOptions = {}
): Promise<TtsResult> {
  const provider = providers.find((p) => p.isAvailable());
  if (!provider) {
    throw new ConfigurationError(
      "No TTS provider configured. Set ELEVENLABS_API_KEY or OPENAI_API_KEY."
    );
  }

  const { audio, voice } = await provider.synthesize(text, options.voice);

  const outputDir = options.outputDir ?? path.join(process.cwd(), "storage", "voiceovers");
  await mkdir(outputDir, { recursive: true });
  const fileName = options.fileName ?? `voiceover-${Date.now()}.mp3`;
  const filePath = path.join(outputDir, fileName);
  await writeFile(filePath, audio);

  logger.info("voiceover generated", {
    provider: provider.name,
    voice,
    bytes: audio.length,
    filePath,
  });
  return { filePath, provider: provider.name, voice, bytes: audio.length };
}
