# YouTube Automation Pipeline

Every stage is a module in `@yta/youtube-core`, exposed via REST in `apps/api`
and visible on the dashboard's Pipeline page.

## Stages

| # | Stage | Module | Endpoint | Requires |
| - | ----- | ------ | -------- | -------- |
| 1 | Niche research | `niche-research.ts` | `POST /api/niches/research` | AI key |
| 2 | Idea generation | `ideation.ts` | `POST /api/channels/:id/ideas` | AI key |
| 3 | Scriptwriting | `scriptwriter.ts` | `POST /api/videos/:id/script` | AI key |
| 4 | Voiceover | `tts.ts` | `POST /api/videos/:id/voiceover` | ElevenLabs or OpenAI key |
| 5 | Thumbnail | `thumbnail.ts` | `POST /api/videos/:id/thumbnail` | nothing (free local SVG) |
| 6 | SEO optimization | `seo.ts` | `POST /api/videos/:id/optimize` | AI key |
| 7 | Scheduling | — | `POST /api/videos/:id/schedule` | nothing |
| 8 | Publishing | `publisher.ts` | `POST /api/videos/:id/publish` | YouTube OAuth |
| 9 | Analytics + recommendations | `analytics.ts` | `GET/POST /api/channels/:id/analytics`, `POST /api/channels/:id/recommendations` | AI key for recs |

Video status walks through:
`IDEA → SCRIPTED → VOICED → RENDERED → THUMBNAILED → OPTIMIZED → SCHEDULED → PUBLISHED`.

## Module notes

### Niche research
Prompts the AI for high-CPM faceless-friendly niches with CPM ranges,
competition/demand/trend scores and example titles. A deterministic formula
blends these into `overallScore` (CPM 35%, demand 25%, trend 20%, inverse
competition 20%) so ranking is stable across providers.

### Scriptwriting
Produces hook + sections + outro JSON tuned for retention (open loops,
short sentences, re-hooks every ~90s), stores word count and estimated
duration (150 wpm).

### Voiceover
Provider chain: ElevenLabs (best quality, ~10k free credits/mo) → OpenAI TTS.
For a 100% free pipeline, the Free API Hunter surfaces alternatives like
`rany2/edge-tts` (free Microsoft neural voices) and `coqui-ai/TTS` (local) —
wire one in by adding a `TtsProvider` to `tts.ts`.

### Video rendering
Rendering is intentionally left pluggable: pair the voiceover MP3 with stock
footage (Pexels free API — `PEXELS_API_KEY`) or AI-generated imagery, and
assemble with `ffmpeg`. Repos discovered under the `VIDEO_GENERATION` category
are candidates for full automation. Register the rendered file as an `Asset`
of kind `VIDEO`, then publish.

### Thumbnails
The built-in generator produces bold 1280×720 SVGs locally (zero cost —
convert to PNG with `ffmpeg -i thumb.svg thumb.png` before upload). Swap in an
AI image API from the hunter's `IMAGE_GENERATION` category for photorealistic
thumbnails.

### Publishing
Raw-fetch implementation of the YouTube Data API v3 resumable upload plus
thumbnail set. Uses an OAuth2 refresh token (`youtube.upload` scope). If
`scheduledAt` is set on the video, the upload is private with `publishAt`, so
YouTube itself flips it public at the scheduled time. Each upload costs
~1600 quota units of the default 10,000/day.

### Analytics & recommendations
`AnalyticsSnapshot` rows can be recorded manually or synced from the YouTube
Analytics API. `POST /api/channels/:id/recommendations` sends the aggregate +
recent video stats to the AI and stores 3–6 prioritized, concrete actions
(titles, thumbnails, topics, upload timing, retention fixes).

## REST reference (summary)

```
GET  /health
GET  /api/capabilities

GET  /api/apis                 ?category&minStars&updatedWithinDays&freeTierQuality&status&search&sort&order&page&pageSize
GET  /api/apis/stats
GET  /api/apis/:id
PATCH /api/apis/:id            {status?, category?, freeTierNotes?}

GET  /api/hunter/categories
POST /api/hunter/runs          {categories?, maxReposPerCategory?, minStars?}
GET  /api/hunter/runs
GET  /api/hunter/runs/:id

GET  /api/niches
POST /api/niches/research      {seedTopic?, count?}

GET  /api/channels
POST /api/channels             {name, description?, nicheId?, timezone?}
GET  /api/channels/:id
POST /api/channels/:id/ideas   {count?}
GET  /api/channels/:id/analytics
POST /api/channels/:id/analytics    {views?, impressions?, clickThroughRate?, ...}
POST /api/channels/:id/recommendations

GET  /api/videos               ?channelId
POST /api/videos               {channelId, ideaId?, title}
GET  /api/videos/:id
POST /api/videos/:id/script    {targetMinutes?, tone?}
POST /api/videos/:id/voiceover {voice?}
POST /api/videos/:id/thumbnail {punchText?, accentColor?}
POST /api/videos/:id/optimize
POST /api/videos/:id/schedule  {scheduledAt}
POST /api/videos/:id/publish   {videoFilePath, privacyStatus?, thumbnailFilePath?}
```

All responses use the envelope `{ "ok": true, "data": ... }` or
`{ "ok": false, "error": { "code", "message", "details?" } }`.
