import { clamp, uniqueBy } from "@yta/shared";
import type { FreeTierQuality } from "@yta/shared";

/** Structured intelligence extracted from a repository README. */
export interface ReadmeAnalysis {
  endpoints: ExtractedEndpoint[];
  usageExamples: ExtractedExample[];
  rateLimitNotes: string | null;
  freeTierQuality: FreeTierQuality;
  freeTierNotes: string | null;
  docsQualityScore: number; // 0..100
  excerpt: string | null;
}

export interface ExtractedEndpoint {
  method: string;
  url: string;
  description: string | null;
  requiresAuth: boolean;
}

export interface ExtractedExample {
  language: string;
  code: string;
}

const HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** URLs that are never real API endpoints (badges, social, registries). */
const ENDPOINT_BLOCKLIST =
  /shields\.io|badge|img\.|\.(png|jpe?g|gif|svg|webp|ico)([?#]|$)|twitter\.com|x\.com\/|discord\.(gg|com)|t\.me\/|youtube\.com\/watch|youtu\.be|npmjs\.com|pypi\.org|hub\.docker\.com|github\.com\/.+\/(issues|pulls|actions|releases|wiki|blob|tree|raw)|opencollective|patreon|ko-fi|buymeacoffee|paypal|license|choosealicense/i;

/** Signals that a URL looks like an API endpoint. */
const ENDPOINT_HINT =
  /\/api\/|\/v[0-9]+(\/|$)|api\.|\/graphql|\/rest\/|\/rpc\/|\/endpoint|openapi|swagger|\.json(\?|$)|\/search\?|\/query\?/i;

const AUTH_HINT = /api[_-]?key|token|bearer|authorization|auth[_-]?header|x-api-key/i;

/**
 * Heuristic README analyzer.
 *
 * Extracts API endpoints, code examples, rate-limit notes and free-tier
 * signals from unstructured markdown, and scores documentation quality.
 * Everything is regex/heuristic based (fast, free, no LLM required), but
 * the output feeds the ranking engine so precision matters more than recall.
 */
export function analyzeReadme(readme: string | null): ReadmeAnalysis {
  if (!readme || readme.trim().length === 0) {
    return {
      endpoints: [],
      usageExamples: [],
      rateLimitNotes: null,
      freeTierQuality: "UNKNOWN",
      freeTierNotes: null,
      docsQualityScore: 0,
      excerpt: null,
    };
  }

  const text = readme.slice(0, 200_000); // guard against pathological READMEs
  const codeBlocks = extractCodeBlocks(text);

  return {
    endpoints: extractEndpoints(text, codeBlocks),
    usageExamples: extractUsageExamples(codeBlocks),
    rateLimitNotes: extractRateLimitNotes(text),
    ...assessFreeTier(text),
    docsQualityScore: scoreDocsQuality(text, codeBlocks),
    excerpt: buildExcerpt(text),
  };
}

interface CodeBlock {
  language: string;
  code: string;
}

function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  const regex = /```([a-zA-Z0-9+-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const code = (match[2] ?? "").trim();
    if (code.length === 0) continue;
    blocks.push({ language: (match[1] || "text").toLowerCase(), code });
  }
  return blocks;
}

function extractEndpoints(text: string, codeBlocks: CodeBlock[]): ExtractedEndpoint[] {
  const found: ExtractedEndpoint[] = [];
  const requiresAuthGlobally = AUTH_HINT.test(text);

  // 1. Explicit "METHOD https://..." or "METHOD /path" patterns (common in API docs).
  const methodPattern = new RegExp(
    `\\b(${HTTP_METHODS.join("|")})\\s+(https?://[^\\s\`"'<>\\)]+|/[a-zA-Z0-9_./:{}?&=-]{3,})`,
    "g"
  );
  let match: RegExpExecArray | null;
  while ((match = methodPattern.exec(text)) !== null) {
    const url = cleanUrl(match[2] ?? "");
    if (!url || isBlockedUrl(url)) continue;
    found.push({
      method: (match[1] ?? "GET").toUpperCase(),
      url,
      description: nearbyDescription(text, match.index),
      requiresAuth: requiresAuthGlobally,
    });
  }

  // 2. curl commands inside code blocks.
  for (const block of codeBlocks) {
    const curlPattern = /curl\s+(?:-X\s*(GET|POST|PUT|PATCH|DELETE)\s+)?[^\n]*?(https?:\/\/[^\s"'\\]+)/gi;
    while ((match = curlPattern.exec(block.code)) !== null) {
      const url = cleanUrl(match[2] ?? "");
      if (!url || isBlockedUrl(url)) continue;
      found.push({
        method: (match[1] ?? "GET").toUpperCase(),
        url,
        description: "Extracted from curl example",
        requiresAuth: AUTH_HINT.test(block.code),
      });
    }
  }

  // 3. Bare URLs that look strongly like API endpoints.
  const urlPattern = /https?:\/\/[^\s`"'<>()\][]+/g;
  while ((match = urlPattern.exec(text)) !== null) {
    const url = cleanUrl(match[0]);
    if (!url || isBlockedUrl(url) || !ENDPOINT_HINT.test(url)) continue;
    found.push({
      method: "GET",
      url,
      description: null,
      requiresAuth: requiresAuthGlobally,
    });
  }

  return uniqueBy(found, (e) => `${e.method} ${e.url}`).slice(0, 25);
}

function cleanUrl(raw: string): string | null {
  const url = raw.replace(/[.,;:!?)\]}>]+$/, "").trim();
  if (url.length < 8 || url.length > 500) return null;
  return url;
}

function isBlockedUrl(url: string): boolean {
  return ENDPOINT_BLOCKLIST.test(url);
}

/** Grab a short plain-text description around a match position. */
function nearbyDescription(text: string, index: number): string | null {
  const lineStart = text.lastIndexOf("\n", index);
  const prevLineStart = text.lastIndexOf("\n", Math.max(0, lineStart - 1));
  const context = text
    .slice(Math.max(0, prevLineStart), index)
    .replace(/[#*`>|-]/g, "")
    .trim();
  if (context.length < 8) return null;
  return context.slice(-160);
}

function extractUsageExamples(codeBlocks: CodeBlock[]): ExtractedExample[] {
  const interesting = codeBlocks.filter((block) => {
    const looksLikeApiUsage =
      /curl|fetch\(|requests\.|axios|http|api/i.test(block.code) ||
      ["bash", "shell", "sh", "python", "javascript", "typescript", "js", "ts"].includes(
        block.language
      );
    return looksLikeApiUsage && block.code.length >= 30 && block.code.length <= 3000;
  });
  return interesting.slice(0, 5).map((block) => ({
    language: block.language,
    code: block.code,
  }));
}

function extractRateLimitNotes(text: string): string | null {
  const patterns = [
    /[^.\n]*rate[ -]?limit[^.\n]*[.\n]/gi,
    /[^.\n]*\b\d+\s*(requests?|calls?|queries)\s*(per|\/)\s*(second|sec|minute|min|hour|day|month)[^.\n]*[.\n]/gi,
    /[^.\n]*\bquota\b[^.\n]*[.\n]/gi,
  ];
  const notes: string[] = [];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null && notes.length < 5) {
      const note = match[0].replace(/\s+/g, " ").replace(/[#*`>|]/g, "").trim();
      if (note.length >= 15 && note.length <= 300) notes.push(note);
    }
  }
  const unique = [...new Set(notes)];
  return unique.length > 0 ? unique.slice(0, 3).join(" | ") : null;
}

const FREE_POSITIVE: [RegExp, number, string][] = [
  [/\b(100%|completely|totally|fully)\s+free\b/i, 3, "explicitly completely free"],
  [/\bno\s+(api[ -]?key|key|token|signup|sign[ -]?up|registration|account)\s*(required|needed)?\b/i, 3, "no API key / signup required"],
  [/\bfree\s+(and\s+)?open[ -]?source\b/i, 2, "free and open source"],
  [/\bself[ -]?host/i, 2, "self-hostable"],
  [/\bfree\s+(tier|plan|forever|to\s+use)\b/i, 2, "has a free tier"],
  [/\bunlimited\b/i, 1, "mentions unlimited usage"],
  [/\bfree\b/i, 1, "mentions free"],
  [/\bruns?\s+(locally|offline)\b/i, 2, "runs locally/offline"],
];

const FREE_NEGATIVE: [RegExp, number, string][] = [
  [/\bcredit\s+card\s+required\b/i, 3, "credit card required"],
  [/\bpaid\s+(plan|tier|subscription)\s+(required|only)\b/i, 3, "paid plan required"],
  [/\bpricing\b/i, 1, "has pricing"],
  [/\$\d+\s*\/?\s*(mo|month|year|yr)/i, 2, "paid subscription pricing found"],
  [/\btrial\s+(expires|period|only)\b/i, 2, "trial-limited"],
  [/\bapi[ -]?key\s+required\b/i, 1, "API key required"],
];

function assessFreeTier(text: string): {
  freeTierQuality: FreeTierQuality;
  freeTierNotes: string | null;
} {
  let score = 0;
  const notes: string[] = [];
  for (const [pattern, weight, note] of FREE_POSITIVE) {
    if (pattern.test(text)) {
      score += weight;
      notes.push(`+ ${note}`);
    }
  }
  for (const [pattern, weight, note] of FREE_NEGATIVE) {
    if (pattern.test(text)) {
      score -= weight;
      notes.push(`- ${note}`);
    }
  }

  let quality: FreeTierQuality;
  if (notes.length === 0) quality = "UNKNOWN";
  else if (score >= 5) quality = "EXCELLENT";
  else if (score >= 3) quality = "GOOD";
  else if (score >= 1) quality = "LIMITED";
  else quality = "POOR";

  return {
    freeTierQuality: quality,
    freeTierNotes: notes.length > 0 ? notes.slice(0, 6).join("; ") : null,
  };
}

/**
 * Documentation quality 0..100 based on structure, examples, and coverage
 * of the sections an integrator actually needs.
 */
function scoreDocsQuality(text: string, codeBlocks: CodeBlock[]): number {
  let score = 0;

  // Length: up to 20 points (README with real substance).
  score += clamp(text.length / 500, 0, 20);

  // Section coverage: 8 points each.
  const sections: RegExp[] = [
    /^#+\s*(installation|install|getting started|quick ?start|setup)/im,
    /^#+\s*(usage|examples?|how to use)/im,
    /^#+\s*(api|endpoints?|reference|documentation)/im,
    /^#+\s*(authentication|auth|api ?keys?)/im,
    /^#+\s*(rate ?limits?|limits|quota)/im,
    /^#+\s*(license|licence)/im,
  ];
  for (const section of sections) {
    if (section.test(text)) score += 8;
  }

  // Code examples: up to 20 points.
  score += clamp(codeBlocks.length * 4, 0, 20);

  // Tables (often endpoint/parameter docs): up to 6 points.
  const tableRows = (text.match(/^\|.*\|$/gm) ?? []).length;
  score += clamp(tableRows, 0, 6);

  // Links to hosted docs: 6 points.
  if (/\b(docs?\.[a-z0-9-]+\.[a-z]{2,}|readthedocs|gitbook|swagger|openapi)\b/i.test(text)) {
    score += 6;
  }

  return Math.round(clamp(score, 0, 100));
}

function buildExcerpt(text: string): string | null {
  const withoutBadges = text
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/<[^>]+>/g, "");
  const paragraphs = withoutBadges
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").replace(/[#*`>|]/g, "").trim())
    .filter((p) => p.length >= 40 && !p.startsWith("["));
  const first = paragraphs[0];
  return first ? first.slice(0, 500) : null;
}
