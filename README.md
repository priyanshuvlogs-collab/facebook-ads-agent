# Facebook Ads Agent

An autonomous Facebook (Meta) Ads agent laser-focused on **lead generation**. Plug it into **any business** with a single YAML file and it plans, launches, optimizes and reports on lead-gen campaigns like a full-time media buyer — 24/7.

```text
business profile (YAML)              the agent
┌──────────────────────┐   ┌─────────────────────────────────────────────┐
│ who you are          │   │ 1. STRATEGY   funnel design + budget split  │
│ what you offer       │──▶│ 2. LAUNCH     campaign / ad sets / lead form│
│ who to target        │   │ 3. COPY       AI or template ad variants    │
│ how much to spend    │   │ 4. OPTIMIZE   kill / scale / trim ad sets   │
│ your max cost/lead   │   │ 5. LEADS      fetch, score, CSV + webhook   │
└──────────────────────┘   │ 6. REPORT     KPIs, digests, Slack alerts   │
                           └─────────────────────────────────────────────┘
```

## Why it's powerful

- **Plug and play for any business model.** One YAML profile adapts everything: funnel structure, audiences, ad copy, CTAs, optimization thresholds. Ships with ready-made profiles for dental, real estate, fitness, B2B SaaS and e-commerce — and works for industries it has never seen.
- **Proven lead-gen funnel out of the box.** Prospecting (interest stacks) + Broad (Meta Advantage audience) + Retargeting (when you supply warm audiences), each testing 3 creative angles (pain point, offer, social proof).
- **A real optimizer, not a dashboard.** Every cycle it kills ad sets whose cost-per-lead blows past your threshold, scales winners stepwise up to your cap, trims the middle, protects ad sets still learning, and flags creative fatigue — every decision logged with a human-readable reason.
- **Leads land where you work.** Instant-form leads are deduped, scored (A/B/C with keyword intent signals), appended to CSV and pushed to any webhook (Zapier, Make, n8n, your CRM). Slack digests keep you informed.
- **AI copywriting, optional.** Point it at OpenAI or Anthropic for generated copy; without a key it falls back to a strong tone-aware template engine. A launch never blocks on an LLM.
- **Safe by default.** No credentials = automatic dry-run with a realistic simulator, so you can test the entire loop end-to-end before a single dollar is spent. Live entities are created PAUSED and only activated once the whole tree exists.

## Quick start (zero credentials needed)

```bash
pip install -r requirements.txt

# 1. See the plan + ad copy preview for a bundled example business
python -m fbads_agent plan --profile profiles/dental_clinic.yaml

# 2. Launch the campaign (simulated in dry-run)
python -m fbads_agent launch --profile profiles/dental_clinic.yaml

# 3. Run a full agent heartbeat: optimize spend, pull + score leads, report
python -m fbads_agent cycle --profile profiles/dental_clinic.yaml

# 4. Or keep it running like an employee (one cycle every 6 hours)
python -m fbads_agent run --profile profiles/dental_clinic.yaml --every 6
```

## Plug in YOUR business

Copy any file in `profiles/` and edit it — that's the whole integration:

```yaml
business:
  name: "Your Business"
  industry: home_services        # free-form; known industries get preset audiences
  website: https://example.com
  unique_selling_points:
    - "Same-day service"
    - "5-star rated by 900+ customers"

offer:
  headline_offer: "free inspection + quote"
  urgency: "Booking calendar fills up fast in summer."

targeting:
  cities:
    - { name: "Miami", radius_km: 40 }
  age_min: 25
  age_max: 65
  interests: ["Home improvement"]

budget:
  daily_budget: 75               # account currency per day
  currency: USD
  max_cpl: 20                    # the number everything is optimized around

lead_form:
  privacy_policy_url: https://example.com/privacy
  questions: [FULL_NAME, EMAIL, PHONE]
  custom_questions:
    - "What do you need help with?"

brand:
  tone: friendly                 # friendly | professional | bold | playful

optimization:
  kill_multiplier: 1.5           # pause ad set when CPL > 1.5x max_cpl
  scale_step_pct: 20             # raise winning budgets 20% per cycle
  max_daily_budget: 200          # never scale one ad set past this

lead_scoring:
  hot_keywords: [urgent, asap, today]
```

Then: `python -m fbads_agent launch --profile profiles/your_business.yaml`

## Going live

1. Create a Meta app with Marketing API access ([developers.facebook.com](https://developers.facebook.com/)), generate a system-user token with `ads_management`, `leads_retrieval` and `pages_manage_ads` permissions.
2. `cp .env.example .env` and fill in `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, then set `DRY_RUN=false` (or pass `--live`).
3. Recommended first live run: `launch --paused`, review everything in Ads Manager, then activate.

```bash
python -m fbads_agent launch --profile profiles/your_business.yaml --live --paused
```

Optional integrations (all in `.env`):

| Variable | What it unlocks |
|---|---|
| `LLM_PROVIDER` + `LLM_API_KEY` | AI-generated ad copy (openai or anthropic) |
| `LEAD_WEBHOOK_URL` | Every scored lead POSTed as JSON to your CRM/Zapier/Make/n8n |
| `SLACK_WEBHOOK_URL` | Digest + optimizer decisions in your Slack channel |

## Commands

| Command | What it does |
|---|---|
| `plan` | Show funnel, budget split, audiences and an ad copy preview. No changes. |
| `launch` | Create lead form, campaign, ad sets and ads. `--paused` for review-first. |
| `optimize` | One optimization pass over live insights (kill / scale / trim / alert). |
| `leads` | Fetch new leads, score, export CSV, push webhook. |
| `cycle` | Full heartbeat: optimize + leads + JSON report + Slack digest. |
| `run` | `cycle` forever, every `--every N` hours. |
| `status` | Launched entities and the agent's recent action log. |

## How the optimizer thinks

For every ad set, each cycle, against your `max_cpl`:

| Situation | Action |
|---|---|
| Spent past the kill threshold with **zero** leads | **KILL** (pause) |
| Fewer leads than `min_leads_before_judgement` | **HOLD** (still learning) |
| CPL > `kill_multiplier` × max_cpl | **KILL** |
| CPL < `scale_trigger` × max_cpl | **SCALE** budget +`scale_step_pct`% (capped) |
| CPL between target and kill threshold | **TRIM** budget −`scale_step_pct`% |
| Frequency above cap / CTR below floor | **ALERT** (creative fatigue advisory) |

Every decision is written to the action log with its reason, so you can always answer *"why did the agent do that?"*.

## Project layout

```
fbads_agent/
  profile.py           business profile schema + validation (the plug-and-play input)
  strategy.py          funnel design, industry presets, budget splits
  audience.py          Meta targeting spec builder (geo, interests, custom audiences)
  copywriter.py        LLM + template ad copy engine
  campaign_builder.py  materializes the plan into campaign/ad sets/lead form/ads
  optimizer.py         kill/scale/trim/alert rules engine
  leads.py             lead fetch, dedupe, scoring, CSV + webhook delivery
  reporter.py          KPI tables, digests, JSON reports
  meta_client.py       Graph API client (live) + deterministic simulator (dry-run)
  orchestrator.py      the agent loop tying it all together
  cli.py               command-line interface
profiles/              ready-made business profiles (copy one and edit)
tests/                 31 tests incl. an end-to-end dry-run of the whole loop
```

## Tests

```bash
python -m pytest tests/ -q
```

## Notes & disclaimers

- Special Ad Categories (housing, credit, employment, politics): Meta restricts targeting for these. The strategy engine warns for likely-affected industries; verify your category in Ads Manager before going live.
- Lead ads require a published Facebook Page and an approved privacy policy URL.
- This tool spends real money in live mode. Start with `--paused`, small budgets and a conservative `max_cpl`.
