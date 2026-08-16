# Free API Hunter

The hunter automatically discovers, analyzes, ranks and catalogs free/public
APIs on GitHub that are useful for YouTube automation.

## Pipeline

```
categories.ts        github/client.ts       analysis/               hunter.ts
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐    ┌──────────────┐
│ 10 category  │ ──▶ │ GitHub search │ ──▶ │ README analyzer  │ ──▶│ Score + rank │
│ strategies   │     │ (throttled,   │     │ endpoints, rate  │    │ upsert to DB │
│ ~40 queries  │     │ rate-limit    │     │ limits, free-tier│    │ record run   │
└──────────────┘     │ aware)        │     │ docs quality     │    └──────────────┘
                     └───────────────┘     └──────────────────┘
```

### 1. Search strategies (`src/categories.ts`)

Each of the 10 categories (YouTube data, text generation, TTS, image gen,
video gen, thumbnails, SEO/keywords, social automation, transcription,
music/audio) defines:

- **queries** — GitHub search strings using qualifiers (`stars:>100`,
  `pushed:>2024-01-01`, `archived:false`, `topic:...`, `in:readme`)
- **signals** — keywords that boost category-fit confidence during scoring
- **weight** — how important the category is to the YouTube pipeline

Adding a category = adding one object to `CATEGORY_STRATEGIES` and one enum
value to the Prisma schema + shared types.

### 2. GitHub client (`src/github/client.ts`)

Native-fetch REST client with:

- optional `GITHUB_TOKEN` auth (30 search req/min vs 10 unauthenticated)
- self-throttling of the search endpoint (2.5s between calls)
- primary rate-limit tracking via `x-ratelimit-*` headers
- secondary rate-limit handling (`retry-after`, 403/429) with automatic waits
- retry with exponential backoff for transient failures

### 3. README analyzer (`src/analysis/readme-analyzer.ts`)

Pure heuristics (no LLM cost) extracting:

- **Endpoints** — three passes: explicit `METHOD url` patterns, `curl`
  commands in code blocks, and bare URLs that look like APIs (`/api/`, `/v1/`,
  `api.` subdomains). A blocklist rejects badges, social links, images and
  registry links. Auth requirements inferred from key/token mentions.
- **Usage examples** — up to 5 relevant code blocks (bash/python/js oriented).
- **Rate limits** — sentences mentioning `rate limit`, `N requests per X`, `quota`.
- **Free-tier quality** — weighted positive signals ("completely free",
  "no API key", "self-host", "runs locally"...) vs negative signals ("credit
  card required", "$N/mo", "paid plan only"...) → `EXCELLENT / GOOD / LIMITED /
  POOR / UNKNOWN` with human-readable notes.
- **Docs quality (0–100)** — README length, section coverage (install, usage,
  API reference, auth, rate limits, license), code block count, tables,
  hosted-docs links.

### 4. Ranking (`src/analysis/scoring.ts`)

Two sub-scores blended into `overallScore = 0.45·reliability + 0.55·usefulness`:

**Reliability (0–100)** — can you depend on it?
- log-scale stars (35), push recency decaying over 18 months (30),
  forks (10), open-issue ratio (10), license permissiveness (15)
- penalties: archived (−40), fork (−10)

**Usefulness (0–100)** — does it help YouTube automation?
- category weight (15), category signal matches (15), endpoints found (15),
  usage examples (5), free-tier quality (30), docs quality (20)

### 5. Persistence (`src/hunter.ts`)

- Repos are deduped across queries, pre-filtered (min stars, freshness,
  not archived/fork), and capped per category.
- Upserts by `githubRepoId`; re-runs refresh metadata/scores but never
  downgrade a curated `status`.
- Every run is a `HunterRun` row with live-updating counters and an error log.

## Running it

```bash
npm run hunter:run                          # CLI, all categories
npm run hunter:run -- SEO_KEYWORDS          # CLI, one category
POST /api/hunter/runs                       # REST (202, runs in background)
GET  /api/hunter/runs                       # history + live progress
GET  /api/apis?category=&minStars=&...      # the living database
PATCH /api/apis/:id {"status":"VERIFIED"}   # curation
```

## Extending

- **New category**: add to `ApiCategory` enum (Prisma + shared) and
  `CATEGORY_STRATEGIES`.
- **Smarter analysis**: pipe the top-N repos' READMEs through
  `@yta/ai-providers` for LLM-verified endpoint extraction (heuristics first
  keeps token costs near zero).
- **Endpoint probing**: a natural next step is a prober that calls extracted
  no-auth endpoints and flips status to `VERIFIED`/`BROKEN` automatically.
