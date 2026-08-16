import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createLogger } from "@yta/shared";

const logger = createLogger("youtube-core:thumbnail");

export interface ThumbnailOptions {
  title: string;
  /** Short punch text overlaid big, e.g. "$10,000/mo". Defaults to derived from title. */
  punchText?: string;
  accentColor?: string;
  backgroundColor?: string;
  outputDir?: string;
  fileName?: string;
}

export interface ThumbnailResult {
  filePath: string;
  format: "svg";
  width: number;
  height: number;
}

const WIDTH = 1280;
const HEIGHT = 720;

/**
 * Free, local, zero-dependency thumbnail generator.
 *
 * Produces a bold SVG thumbnail (YouTube accepts JPG/PNG - convert with any
 * tool, e.g. `ffmpeg -i thumb.svg thumb.png`, or swap in an AI image
 * provider discovered by the Free API Hunter for photorealistic thumbnails).
 */
export async function generateThumbnail(
  options: ThumbnailOptions
): Promise<ThumbnailResult> {
  const {
    title,
    punchText,
    accentColor = "#ff3d3d",
    backgroundColor = "#0d1117",
    outputDir = path.join(process.cwd(), "storage", "thumbnails"),
    fileName = `thumbnail-${Date.now()}.svg`,
  } = options;

  const big = punchText ?? derivePunchText(title);
  const lines = wrapText(title.toUpperCase(), 18).slice(0, 3);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${backgroundColor}"/>
      <stop offset="100%" stop-color="#1a2233"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${accentColor}"/>
      <stop offset="100%" stop-color="#ff8a3d"/>
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="1150" cy="120" r="260" fill="${accentColor}" opacity="0.12"/>
  <circle cx="120" cy="640" r="200" fill="#3d7bff" opacity="0.10"/>
  <rect x="70" y="90" width="18" height="${lines.length * 96 + 20}" fill="url(#accent)" rx="9"/>
  ${lines
    .map(
      (line, i) =>
        `<text x="120" y="${170 + i * 96}" font-family="Arial Black, Arial, sans-serif" font-size="76" font-weight="900" fill="#ffffff" stroke="#000000" stroke-width="2">${escapeXml(line)}</text>`
    )
    .join("\n  ")}
  <text x="120" y="${HEIGHT - 110}" font-family="Arial Black, Arial, sans-serif" font-size="120" font-weight="900" fill="url(#accent)" stroke="#000000" stroke-width="3">${escapeXml(big)}</text>
</svg>`;

  await mkdir(outputDir, { recursive: true });
  const filePath = path.join(outputDir, fileName);
  await writeFile(filePath, svg, "utf8");

  logger.info("thumbnail generated", { filePath });
  return { filePath, format: "svg", width: WIDTH, height: HEIGHT };
}

/** Pull a number/money phrase out of the title, else use a strong default. */
function derivePunchText(title: string): string {
  const money = title.match(/\$[\d,.]+k?(\s*\/\s*(mo|month|day|yr|year))?/i);
  if (money) return money[0].toUpperCase();
  const number = title.match(/\b\d+\b/);
  if (number) return `TOP ${number[0]}`;
  return "REVEALED";
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars && current) {
      lines.push(current.trim());
      current = word;
    } else {
      current = `${current} ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
