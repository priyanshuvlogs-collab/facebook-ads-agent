import { NotFoundError, createLogger, extractJson } from "@yta/shared";
import { getProviderRegistry } from "@yta/ai-providers";
import { prisma } from "@yta/database";
import type { Script } from "@yta/database";

const logger = createLogger("youtube-core:scriptwriter");

export interface ScriptOptions {
  /** Target video length in minutes. Default 8 (good mid-roll ad length). */
  targetMinutes?: number;
  tone?: string;
}

interface RawScript {
  hook: string;
  sections: { heading: string; narration: string }[];
  outro: string;
}

const WORDS_PER_MINUTE = 150;

/** Write a full narration script for a video and persist it. */
export async function writeScript(
  videoId: string,
  options: ScriptOptions = {}
): Promise<Script> {
  const { targetMinutes = 8, tone = "engaging, conversational, confident" } = options;

  const video = await prisma.video.findUnique({
    where: { id: videoId },
    include: { idea: true, channel: { include: { niche: true } } },
  });
  if (!video) throw new NotFoundError(`Video ${videoId} not found`);

  const targetWords = targetMinutes * WORDS_PER_MINUTE;

  const prompt = `Write a complete narration script for a faceless YouTube video.

Title: "${video.title}"
${video.idea ? `Angle: ${video.idea.angle}\nOpening hook idea: ${video.idea.hook}` : ""}
${video.channel.niche ? `Niche: ${video.channel.niche.name}` : ""}
Tone: ${tone}
Target length: about ${targetWords} words (~${targetMinutes} minutes of narration).

Rules:
- Hook must create an open loop within the first 2 sentences (retention is everything)
- Use short sentences; write for the EAR, not the eye
- Add a soft re-hook every ~90 seconds to reset attention
- No visual directions, ONLY the spoken narration
- End with one clear call to action

Return JSON: {"hook": "...", "sections": [{"heading": "...", "narration": "..."}], "outro": "..."}`;

  const registry = getProviderRegistry();
  const result = await registry.complete(
    [
      {
        role: "system",
        content:
          "You are a professional YouTube scriptwriter known for extremely high audience retention. Respond ONLY with valid JSON.",
      },
      { role: "user", content: prompt },
    ],
    { jsonMode: true, temperature: 0.8, maxTokens: 8000 }
  );

  const parsed = extractJson<RawScript>(result.text);
  const fullText = [
    parsed.hook,
    ...(parsed.sections ?? []).map((s) => s.narration),
    parsed.outro,
  ]
    .filter(Boolean)
    .join("\n\n");
  const wordCount = fullText.split(/\s+/).filter(Boolean).length;

  const script = await prisma.script.upsert({
    where: { videoId },
    update: {
      content: fullText,
      hook: parsed.hook,
      sections: parsed.sections as object[],
      wordCount,
      estimatedDurationSec: Math.round((wordCount / WORDS_PER_MINUTE) * 60),
      provider: result.provider,
      model: result.model,
    },
    create: {
      videoId,
      content: fullText,
      hook: parsed.hook,
      sections: parsed.sections as object[],
      wordCount,
      estimatedDurationSec: Math.round((wordCount / WORDS_PER_MINUTE) * 60),
      provider: result.provider,
      model: result.model,
    },
  });

  await prisma.video.update({
    where: { id: videoId },
    data: { status: "SCRIPTED" },
  });

  logger.info("script written", { videoId, wordCount, provider: result.provider });
  return script;
}
