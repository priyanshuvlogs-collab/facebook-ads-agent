# YouTube Automation Agent

An intelligent, modular agent system that automates **faceless YouTube channel creation and management** — plus a built-in **Free API Hunter** that automatically discovers, analyzes, ranks and catalogs free/public APIs from GitHub so the pipeline can keep running on free and open-source infrastructure.

## What it does

**YouTube Automation core**

- Research high-CPM niches (AI-powered, scored and ranked)
- Generate video ideas and full narration scripts optimized for retention
- Generate AI voiceovers (ElevenLabs / OpenAI TTS, free-tier friendly)
- Generate thumbnails (free local SVG generator, pluggable AI image providers)
- Optimize titles, descriptions, tags and hashtags for SEO
- Schedule and publish videos through the YouTube Data API (resumable upload)
- Track analytics snapshots and generate AI recommendations

**Free API Hunter** (the special sauce)

- Searches GitHub across 10 categories (YouTube data alternatives, text generation, TTS, image/video generation, thumbnails, SEO & keywords, social automation, transcription, music)
- Analyzes each repository: stars, freshness, license, docs quality
- Extracts **API endpoints, rate limits and usage examples** straight from READMEs
- Detects free-tier quality (no-key APIs, self-hostable, freemium, paid-only)
- Ranks everything by **reliability** and **usefulness for YouTube automation**
- Maintains a living, filterable database rendered in the dashboard

## Tech stack

| Layer     | Tech                                              |
| --------- | ------------------------------------------------- |
| Frontend  | Next.js 15 (App Router) + TypeScript              |
| Backend   | Node.js + Express + TypeScript                    |
| Database  | PostgreSQL + Prisma                               |
| Monorepo  | Turborepo + npm workspaces                        |
| AI        | OpenAI, Anthropic, Groq, Together (auto-fallback) |

## Monorepo layout

```
youtube-automation-agent/
├── apps/
│   ├── api/            # Express REST API (port 4000)
│   └── web/            # Next.js 15 dashboard (port 3000)
├── packages/
│   ├── shared/         # Types, logger, env config, utilities
│   ├── database/       # Prisma schema, client, seed
│   ├── ai-providers/   # Multi-provider LLM abstraction with fallback
│   ├── api-hunter/     # ★ Free API Hunter (GitHub search + analysis + ranking)
│   └── youtube-core/   # Niches, ideas, scripts, TTS, thumbnails, SEO, publish, analytics
└── docs/               # Architecture and module documentation
```

## Quick start

```bash
cd youtube-automation-agent

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env      # then fill in what you have (everything is optional except DATABASE_URL)

# 3. Start PostgreSQL
docker compose up -d

# 4. Create the schema and seed demo data
npm run db:push
npm run db:seed

# 5. Run everything (API on :4000, dashboard on :3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Run your first API hunt

```bash
# via CLI (all categories)
npm run hunter:run

# specific categories
npm run hunter:run -- TEXT_TO_SPEECH YOUTUBE_DATA

# or via REST
curl -X POST http://localhost:4000/api/hunter/runs -H "Content-Type: application/json" -d '{}'
```

Set `GITHUB_TOKEN` in `.env` first — it raises GitHub search limits from ~10 to 30 requests/min (a classic token with **no scopes** is enough for public data).

## Environment variables

All keys are optional; modules disable themselves gracefully when unconfigured. See [`.env.example`](.env.example) for the full annotated list. Highlights:

| Variable | Used for |
| -------- | -------- |
| `DATABASE_URL` | PostgreSQL connection (required for persistence) |
| `GITHUB_TOKEN` | Free API Hunter rate limits |
| `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GROQ_API_KEY` / `TOGETHER_API_KEY` | AI text generation (first configured wins, auto-fallback) |
| `ELEVENLABS_API_KEY` | Premium voiceovers (falls back to OpenAI TTS) |
| `YOUTUBE_CLIENT_ID` / `YOUTUBE_CLIENT_SECRET` / `YOUTUBE_REFRESH_TOKEN` | Publishing to YouTube |

## Documentation

- [Getting started](docs/getting-started.md) — setup, first hunt, first video
- [Architecture](docs/architecture.md) — packages, data flow, design decisions
- [Free API Hunter](docs/free-api-hunter.md) — how discovery, analysis and ranking work
- [YouTube automation](docs/youtube-automation.md) — the content pipeline, endpoint reference

## Design principles

1. **Free-first** — every capability prefers free/open-source options; the hunter exists to keep finding more
2. **Graceful degradation** — missing API keys disable features, never crash the system
3. **Modular** — new APIs/providers plug in behind small interfaces (`ChatProvider`, TTS providers, category strategies)
4. **Typed end-to-end** — shared DTOs in `@yta/shared` keep the API and dashboard in sync
5. **Observable** — every hunter run is recorded; structured logging everywhere

## License

MIT
