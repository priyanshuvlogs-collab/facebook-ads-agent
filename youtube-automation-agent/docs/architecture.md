# Architecture

## Monorepo

Turborepo + npm workspaces. Package dependency graph (build order flows upward):

```
                 ┌─────────────┐
                 │ @yta/shared │  types · logger · env · errors · utils
                 └──────┬──────┘
        ┌───────────────┼────────────────┐
┌───────┴───────┐ ┌─────┴──────────┐ ┌───┴────────────┐
│ @yta/database │ │ @yta/ai-       │ │ (apps/web uses │
│ Prisma client │ │ providers      │ │  shared types) │
└───────┬───────┘ └─────┬──────────┘ └────────────────┘
        ├───────────────┤
┌───────┴───────┐ ┌─────┴──────────┐
│ @yta/         │ │ @yta/          │
│ api-hunter    │ │ youtube-core   │
└───────┬───────┘ └─────┬──────────┘
        └───────┬───────┘
          ┌─────┴─────┐
          │ @yta/api  │  Express REST server
          └───────────┘
```

`apps/web` (Next.js 15) talks to `@yta/api` over HTTP only and shares nothing
but the DTO types from `@yta/shared` — the dashboard never imports Prisma.

## Packages

### `@yta/shared`
Zero-dependency-ish foundation: structured logger, zod-validated environment
access (`getEnv` / `hasCapability`), typed error hierarchy (`AppError` and
friends map straight to HTTP responses), retry/backoff utilities, and all
cross-boundary DTO types (mirroring Prisma enums as string literal unions).

### `@yta/database`
Prisma schema + singleton client. Two domains:

- **Hunter**: `DiscoveredApi` (+ `ApiEndpoint`, `ApiUsageExample`), `HunterRun`
- **Pipeline**: `Niche`, `Channel`, `VideoIdea`, `Video`, `Script`, `Asset`,
  `AnalyticsSnapshot`, `Recommendation`

### `@yta/ai-providers`
A small `ChatProvider` interface with four implementations: OpenAI, Groq and
Together share one OpenAI-compatible client; Anthropic has its own. The
`ProviderRegistry` picks the first configured provider and transparently falls
back to the next on failure. All calls have timeouts, retries with exponential
backoff, and JSON-mode support.

### `@yta/api-hunter`
See [free-api-hunter.md](free-api-hunter.md). Pure TypeScript, native fetch,
no GitHub SDK — full control over rate limiting.

### `@yta/youtube-core`
One module per pipeline capability (niche research, ideation, scriptwriting,
SEO, TTS, thumbnails, publishing, analytics). Each module is independently
callable and persists its own results; the API layer only orchestrates.

### `apps/api`
Express 4 with:
- zod-validated requests (400s with field details)
- a uniform `{ ok, data | error }` envelope
- central error middleware mapping `AppError` subclasses to status codes
- BigInt-safe JSON serialization (GitHub repo ids)

### `apps/web`
Next.js 15 App Router, server components with `force-dynamic` rendering (the
dashboard is a live console, not a static site). Filters are plain GET forms —
zero client JS on the directory page; the only client component is the
"Start new hunt" button.

## Key design decisions

1. **Graceful degradation over hard requirements.** Every external key is
   optional. `GET /api/capabilities` reports what's live; the dashboard shows it.
2. **Heuristic analysis before LLM analysis.** The hunter's README analyzer is
   regex/scoring based: free, fast, deterministic, and runs on thousands of
   repos without burning tokens. LLM enrichment can be layered on later for
   the top-N repos only.
3. **Fire-and-forget hunts with persisted progress.** A hunt can take minutes
   (GitHub search throttling); the API returns 202 immediately and the run row
   updates incrementally.
4. **Status is curated, scores are computed.** Re-running the hunter refreshes
   metadata and scores but never downgrades a manually set status
   (`VERIFIED`, `INTEGRATED`, ...).
