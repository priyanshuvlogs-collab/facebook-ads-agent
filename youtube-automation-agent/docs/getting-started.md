# Getting Started

## Prerequisites

- Node.js ≥ 20
- Docker (for PostgreSQL) or an existing PostgreSQL 14+ instance
- Optional but recommended: a GitHub personal access token (classic, no scopes) and at least one AI provider key

## 1. Install

```bash
cd youtube-automation-agent
npm install
```

This installs all workspace packages (Turborepo + npm workspaces).

## 2. Configure

```bash
cp .env.example .env
```

Fill in what you have. The system degrades gracefully:

| Missing key | Effect |
| ----------- | ------ |
| `DATABASE_URL` | Nothing persists — set this one |
| `GITHUB_TOKEN` | Hunter works but at ~10 searches/min instead of 30 |
| AI keys | Niche research, ideas, scripts, SEO, recommendations return a clear 503 |
| TTS keys | Voiceover endpoint returns a clear 503 |
| YouTube OAuth | Publish endpoint returns a clear 400 with instructions |

## 3. Database

```bash
docker compose up -d          # starts postgres:16 with user/pass/db = yta
npm run db:push               # create the schema
npm run db:seed               # optional: demo APIs + demo channel
```

For production use migrations instead: `npm run db:migrate`.

## 4. Run

```bash
npm run dev
```

- API server: http://localhost:4000 (health: `/health`, capability report: `/api/capabilities`)
- Dashboard: http://localhost:3000

## 5. First hunt

```bash
npm run hunter:run                                # all 10 categories
npm run hunter:run -- TEXT_TO_SPEECH YOUTUBE_DATA # just these two
```

Or click **Start new hunt** on the dashboard's Hunter Runs page. Progress is
persisted incrementally, so you can watch counts rise while it runs.

## 6. First automated video (API walkthrough)

```bash
API=http://localhost:4000

# Research niches (requires an AI key)
curl -X POST $API/api/niches/research -H "Content-Type: application/json" -d '{"count": 5}'

# Create a channel (grab a nicheId from the previous response)
curl -X POST $API/api/channels -H "Content-Type: application/json" \
  -d '{"name": "Money Mind", "nicheId": "<nicheId>"}'

# Generate ideas
curl -X POST $API/api/channels/<channelId>/ideas -H "Content-Type: application/json" -d '{"count": 10}'

# Create a video from your favorite idea
curl -X POST $API/api/videos -H "Content-Type: application/json" \
  -d '{"channelId": "<channelId>", "ideaId": "<ideaId>", "title": "<idea title>"}'

# Script → voiceover → thumbnail → SEO
curl -X POST $API/api/videos/<videoId>/script -H "Content-Type: application/json" -d '{"targetMinutes": 8}'
curl -X POST $API/api/videos/<videoId>/voiceover -H "Content-Type: application/json" -d '{}'
curl -X POST $API/api/videos/<videoId>/thumbnail -H "Content-Type: application/json" -d '{}'
curl -X POST $API/api/videos/<videoId>/optimize

# Schedule + publish (requires YouTube OAuth and a rendered video file)
curl -X POST $API/api/videos/<videoId>/schedule -H "Content-Type: application/json" \
  -d '{"scheduledAt": "2026-09-01T15:00:00Z"}'
curl -X POST $API/api/videos/<videoId>/publish -H "Content-Type: application/json" \
  -d '{"videoFilePath": "/path/to/render.mp4"}'
```

## Troubleshooting

- **`prisma generate` fails offline** — Prisma downloads engines on first run; ensure network access once.
- **Hunter finds nothing** — check `GITHUB_TOKEN`, and look at the run's `errorLog` (`GET /api/hunter/runs`).
- **Dashboard says API offline** — the web app reads `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`).
