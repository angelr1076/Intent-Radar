# Inbound Lead Signals

This project monitors online discussions to identify real people expressing real business problems.

Actual posts where someone is clearly stuck, frustrated, or looking for a better way to do something.

---

## What this is

Inbound Lead Signals is a signal-detection system. It watches selected public sources, evaluates posts using a set of rules, and surfaces only the ones that show **genuine intent**; The kind that usually precedes a buying decision. Every record is explainable and nothing is guesswork.

---

## Project structure

```
src/
  index.js              — main pipeline orchestrator
  redditRss.js          — Reddit RSS fetcher
  normalize.js          — data normalization
  aiGate.js             — OpenAI validation gate
  qb.js                 — Quickbase API client
  upsert.js             — database write logic
  config/
    config.js           — AI limits, confidence thresholds
    sellerRules.js      — seller detection phrases
  leadSignals/
    detector/
      keywordScore.js   — 4-factor scoring algorithm
      isSellerPost.js   — hard seller filter
      isSellerIntent.js — soft seller intent filter
      tagVerticals.js   — vertical categorization
      authorReputation.js — author behavior tracking
      urlDedupe.js      — URL deduplication (14-day TTL)
      aiUsage.js        — daily AI call tracking
    utils/
      getConfidenceThreshold.js
data/                   — persisted local state
feeds.intent.json       — feed source configuration
keywords.json           — intent signal keywords (v2)
verticals.json          — vertical taxonomy (v1)
```

---

## How it works — pipeline

- Sources are defined explicitly
- Language is evaluated, not popularity
- Signals are scored conservatively
- Posts are categorized for organization
- Outputs are designed for downstream review and action
- Qualified signals are written to a db for review, filtering, and follow-up.

The system favors **precision over coverage**.

### Filter chain (in order)

1. **Fetch** — Reddit RSS (`/r/{subreddit}/new/.rss`)
2. **Normalize** — combine title + body into unified text
3. **URL Dedup** — skip if URL seen within 14 days; normalizes URLs (strips UTM params, fixes reddit domains)
4. **Seller Post Filter** — hard triggers: "free", "demo", "consultation"; soft phrases (2+ hits): "book a call", "dm me", "we built", "just launched", etc.
5. **Seller Intent Filter** — detects solicitation language patterns
6. **Keyword Scoring** — evaluates text against 47 phrases across 6 categories; qualifies if best match score <= 3
7. **Confidence Threshold** — subreddit-specific thresholds (0.40–0.50); near-misses logged but skipped
8. **Author Reputation** — skip if sellerCount >= 3 AND qualifiedCount == 0
9. **AI Gate** — GPT-4o-mini validation; rate-limited to 5/run, 10/day
10. **Vertical Tagging** — categorize into 6 domains
11. **Quickbase Upsert** — write qualified signal to database (merge on URL)

---

## Scoring

Full breakdown of the confidence algorithm (frozen weights — v1.0).

### Keyword categories (from keywords.json)

| Category | Example Phrases | Score |
|----------|----------------|-------|
| Implicit intent | "best way to", "how do you", "any recommendations" | 3 |
| Explicit intent | "what do you use", "can anyone recommend", "looking for something" | 1–2 |
| Pain points | "spending too much time", "frustrated with", "struggling with" | 2 |
| Automation | "automate", "workflow" | 2–3 |
| Comparison | "switching from", "alternatives to", "replaced" | 2 |

### Confidence formula

- **Intent strength (40%)**: `(3 - bestScore + 1) / 3`
- **Phrase density (25%)**: `min(matchedCount / 3, 1)`
- **Category breadth (20%)**: `min(uniqueCategories / 2, 1)`
- **Substance (15%)**: word count — 40+ = 1.0, 20+ = 0.7, 10+ = 0.4, <10 = 0.2

**Minimum trigger score**: 3 (post qualifies if any matched phrase has score <= 3)

### Confidence thresholds (from config.js)

| Subreddit | Threshold |
|-----------|-----------|
| photography, askphotography | 0.40 |
| writing, selfpublish, freelancewriters | 0.45 |
| selfimprovement, getdisciplined | 0.45 |
| realestatetechnology | 0.45 |
| realestatemarketing | 0.50 |
| smallbusiness, entrepreneurridealong | 0.50 |
| plumbing, hvac, electricians, construction | 0.45 |
| default | 0.45 |

---

## Feeds

Currently monitors 14 subreddits:

- r/smallbusiness, r/RealEstateTechnology
- r/selfimprovement, r/GetDisciplined
- r/writing, r/selfpublish, r/freelanceWriters
- r/photography, r/AskPhotography, r/RealEstatePhotography
- r/Plumbing, r/HVAC, r/electricians, r/Construction

All configured in `feeds.intent.json`, using `new` sort via Reddit RSS.

---

## AI gate

AI is used as a secondary validation layer, not as a discovery mechanism.

- All posts must pass deterministic scoring first
- AI calls are rate-limited per run and per day
- AI is never required for ingestion to function
- The system is safe to run with AI fully disabled

### Specifics

- **Model**: GPT-4o-mini, temperature 0
- **Rate limits**: 5 calls/run, 10 calls/day (tracked in `data/ai-usage.json`)
- **Evaluates**: "Does the author express an unmet need for a tool or SaaS?"
- **Output**: `{ qualified: boolean, reason: string }`

**Qualified signals**: tool recommendations, pain points solvable by software, workflow frustration, comparing/searching for alternatives

**Not qualified**: selling/promoting, tutorials, general questions with no tool angle, satisfied users, memes

---

## Output

- **Database**: Quickbase (table `bvn3rebnv`)
- **Upsert strategy**: merge on URL field
- **Fields written**: URL, title, body, source, subreddit, author, intent score, AI qualified, AI reason, verticals, timestamp
- **Auth**: `QB_REALM` + `QB_USER_TOKEN` env vars

---

## Persistence

The system maintains lightweight local state to improve signal quality over time:

- Seen URLs (deduplication)
- Author reputation (seller vs qualified behavior)
- Daily AI usage counters

All state is file-backed and explainable.

---

## Intended use

This project is designed to support:

- Lead research
- Market discovery
- Pattern recognition
- Opportunity tracking

It intentionally does **not** handle outreach or engagement.

---

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with your credentials
```

### Required env vars

- `QB_REALM` — Quickbase realm hostname
- `QB_USER_TOKEN` — Quickbase API token

### Optional env vars

- `OPENAI_API_KEY` — required if `LLM_PROVIDER=openai`
- `ANTHROPIC_API_KEY` — required if `LLM_PROVIDER=anthropic`
- `LLM_PROVIDER` — `openai` (default) or `anthropic`
- `OPENAI_MODEL` — OpenAI model to use (default: `gpt-4o-mini`)
- `ANTHROPIC_MODEL` — Anthropic model to use (default: `claude-haiku-4-5-20251001`)
- `LOG_LEVEL` — `info` (default) or `debug`

### Available AI models

| Provider | Model | Default | Relative cost |
|----------|-------|---------|---------------|
| OpenAI | `gpt-4o` | — | Mid-range |
| OpenAI | `gpt-4o-mini` | Yes | ~15x cheaper than gpt-4o |
| Anthropic | `claude-sonnet-4-5-20250929` | — | Mid-range |
| Anthropic | `claude-haiku-4-5-20251001` | Yes | ~10x cheaper than Sonnet |

---

## Running

```bash
npm start              # full pipeline
npm run dry-run        # preview only, no DB writes, no AI calls
```

### Testing flags

- `FORCE_SINGLE_WRITE=1` — bypass all filters
- `LOWER_THRESH=1` — cap confidence threshold at 0.50
- `LOG_LEVEL=debug` — verbose output

---

## Dependencies

- `dotenv` — environment variable loading
- `openai` — OpenAI API client (GPT-4o-mini)
- `rss-parser` — RSS feed parsing

---

## Status

Production (v1)

- Deployed on Railway
- Runs on a scheduled cron
- Writes qualified signals to a database
- Conservative defaults frozen
