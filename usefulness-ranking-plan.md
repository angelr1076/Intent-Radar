# Intent Radar — Usefulness Ranking Plan

**Goal:** Rank every captured signal by how useful it is for deciding *what app to build* — so the Quickbase table reads top-down as "build this first," not just "these posts qualified."

**Hard constraints (all proposals below respect these):**

- **No architecture changes.** The pipeline stays exactly as it is: RSS → normalize → dedupe → seller filters → keyword score → confidence threshold → AI gate → vertical tag → Quickbase. Everything here is config, prompt text, or small edits inside existing files.
- **No cost increase.** AI caps stay frozen at 5 calls/run, 10/day on `gpt-4o-mini`. No new LLM calls anywhere. (Item 3 adds ~40 output tokens per *existing* call — fractions of a cent per day.)

---

## 1. What "useful for building an app" actually means

The current confidence score answers *"is this person expressing intent?"* It does not answer *"is this a buildable, monetizable opportunity?"* Those are different questions. A post can be high-confidence intent ("any recommendations for...") but useless for building (one-off question, niche of one, already well-served). The signals that predict buildability are:

| Signal | Why it matters | Example phrases |
|---|---|---|
| **Willingness to pay** | Strongest predictor — they already budget for a solution | "I'd pay for", "willing to pay", "happy to pay", "per month", "budget for" |
| **Incumbent complaint** | A named competitor + a complaint = a wedge | "too expensive", "overpriced", "bloated", "switching from", "fed up with", "cancelled my" |
| **Current workaround** | Spreadsheet/paper users are pre-qualified buyers | "spreadsheet", "excel", "google sheets", "pen and paper", "whiteboard", "manually" |
| **Urgency** | Pain with a clock on it converts | "asap", "losing clients", "losing money", "falling behind", "before busy season" |
| **Recurrence** | Same pain from many authors = market, not anecdote | (computed, not phrased — see item 4) |

The plan: capture these deterministically (free), use them to *rank* — never to qualify (precision stays where it is).

---

## 2. The four improvements (in priority order)

### 2.1 Spend the AI budget on the best candidates, not the first ones — highest leverage, $0

**Problem today:** `index.js` processes feeds in file order and gates posts first-come-first-served. The first 5 qualifying posts of a run consume the entire AI budget even if better posts appear later. Worse: when `canUseAiToday()` is false, qualifying posts hit `continue` — but their URLs were already marked seen at the top of the loop, so the best lead of the day can be **permanently dropped** because it arrived after post #10.

**Fix (inside `index.js` only, same modules, same order of filters):**

1. Run the existing filter chain as-is, but instead of gating immediately, push survivors into a `candidates` array (the cheap stages still run per-feed exactly as now).
2. After all feeds are fetched, sort candidates by demand score (2.2), tiebreak on confidence.
3. Run the AI gate on the top `MAX_CALLS_PER_RUN` only.
4. Move `markSeenUrl()` so it fires on final disposition (gated, filtered, or written) — **not** for posts skipped purely because the budget ran out. Those get another chance next run, when they're competing fresh.

Net effect: the same 10 daily AI calls now always go to the 10 most promising posts of the day. This is the single biggest quality win available and it costs nothing.

### 2.2 Demand Score — a second deterministic score, ranking only

Add the table-1 phrases as new categories and compute a **`demandScore` (0–100)** per post:

- WTP 35% · incumbent complaint 20% · workaround 20% · substance/specificity 15% · urgency 10%

**Implementation notes (kept deliberately boring):**

- New file `src/leadSignals/detector/demandScore.js`, same shape as `keywordScore.js`. Do **not** add these phrases to `keywords.json` — `keywordScore.js` carries frozen v1.0 weights and a comment saying change only with a version bump; mixing ranking phrases into it would silently shift `phraseDensity`/`categoryBreadth` and therefore qualification. A separate detector leaves confidence byte-for-byte identical.
- New phrase file `demand-keywords.json` at root, mirroring `keywords.json` format.
- `demandScore` is **never a gate** — a post with demandScore 0 still qualifies exactly as today. It only orders the AI queue (2.1) and lands in Quickbase as a sort column (one new numeric field).

Starter phrase list (tune against logged `[NEAR MISS]` / `[SCORE RESULT]` output):

```json
{
  "version": 1,
  "keywords": [
    { "phrase": "i'd pay", "weight": "wtp" },
    { "phrase": "would pay", "weight": "wtp" },
    { "phrase": "willing to pay", "weight": "wtp" },
    { "phrase": "happy to pay", "weight": "wtp" },
    { "phrase": "per month", "weight": "wtp" },
    { "phrase": "worth paying", "weight": "wtp" },

    { "phrase": "too expensive", "weight": "incumbent" },
    { "phrase": "overpriced", "weight": "incumbent" },
    { "phrase": "bloated", "weight": "incumbent" },
    { "phrase": "switching from", "weight": "incumbent" },
    { "phrase": "fed up with", "weight": "incumbent" },
    { "phrase": "cancelled my", "weight": "incumbent" },
    { "phrase": "canceling my", "weight": "incumbent" },
    { "phrase": "price increase", "weight": "incumbent" },

    { "phrase": "spreadsheet", "weight": "workaround" },
    { "phrase": "excel", "weight": "workaround" },
    { "phrase": "google sheets", "weight": "workaround" },
    { "phrase": "pen and paper", "weight": "workaround" },
    { "phrase": "whiteboard", "weight": "workaround" },
    { "phrase": "manually", "weight": "workaround" },
    { "phrase": "by hand", "weight": "workaround" },

    { "phrase": "asap", "weight": "urgency" },
    { "phrase": "losing clients", "weight": "urgency" },
    { "phrase": "losing money", "weight": "urgency" },
    { "phrase": "falling behind", "weight": "urgency" },
    { "phrase": "busy season", "weight": "urgency" }
  ]
}
```

### 2.3 Make each AI call return more — same call, same cap

The AI gate already reads the full post; today it returns only `{qualified, reason}` and throws everything else it inferred away. Extend `SYSTEM_PROMPT` in `aiGate.js` to return:

```json
{
  "qualified": true,
  "reason": "one sentence",
  "usefulness": 0-100,
  "signal_type": "pain_point | tool_request | incumbent_complaint | none",
  "willingness_to_pay": "explicit | implied | none",
  "persona": "e.g. solo HVAC contractor"
}
```

Same single call, temperature 0, ~40 extra output tokens. `extractJson` already handles arbitrary JSON; the only validation change is keeping the existing `typeof parsed.qualified !== 'boolean'` check. Quickbase needs ~4 new fields (usefulness, signal_type, WTP, persona) added to `qb.js`'s field map. After this, the table sorts by `usefulness` and filters by `willingness_to_pay = explicit` — that view *is* the "what should I build" ranking.

### 2.4 Recurring-theme tally — later, optional, still $0

One pain point from one author is an anecdote; the same pain from nine authors in a month is a market. Add a file-backed tally (same pattern as `author-reputation.json`): for each written record, increment `data/theme-tally.json` keyed by `vertical + demand category` with month buckets. A monthly look at that file answers "which vertical keeps screaming about scheduling?" No clustering, no embeddings, no LLM — defer until 2.1–2.3 have run for a few weeks and you know whether you want it.

---

## 3. Recommended new feeds

Two cautions first:

1. **More feeds ≠ more output.** The AI cap is fixed, so every feed added increases competition for the same 10 daily calls. Add feeds **in waves of 3–4**, watch `[NEAR MISS]` and `[AI USAGE]` logs for a week, then add the next wave. Ship 2.1 (ranked budget) *before* expanding, otherwise new noisy feeds will eat the budget positionally.
2. Each feed is one more RSS fetch per run — free, but the 403-evasion headers in `redditRss.js` are doing load-bearing work; if Reddit tightens up, fewer feeds fail more gracefully.

### Wave 1 — highest signal density (matches existing verticals)

| Subreddit | Vertical | Why | Suggested threshold |
|---|---|---|---|
| r/sweatystartup | trades / smallbusiness | Service-business owners openly discussing quoting, scheduling, invoicing pain; the single best tool-intent sub for your verticals | 0.45 |
| r/PropertyManagement | realestatetechnology | Constant "what software do you use for X" threads, named incumbents (AppFolio, Buildium) with price complaints | 0.45 |
| r/Landscaping | trades | Owner-operators, heavy spreadsheet/paper workarounds, seasonal urgency | 0.45 |
| r/WeddingPhotography | photography | Business side of photography (contracts, galleries, client comms) vs. r/photography's gear talk | 0.40 |

### Wave 2 — adjacent verticals, moderate noise

| Subreddit | Vertical | Why | Suggested threshold |
|---|---|---|---|
| r/realtors | realestatetechnology | Working agents complaining about CRM/lead-gen tooling; some seller noise — the seller filters will earn their keep | 0.50 |
| r/Roofing | trades | Estimating/bidding pain, photo documentation workflows | 0.45 |
| r/AutoDetailing | trades | Booking + deposits + route pain from solo operators | 0.45 |
| r/Bookkeeping | smallbusiness | Practice-management tool requests, client-portal complaints | 0.45 |

### Wave 3 — direct app-request subs (different flavor of signal)

| Subreddit | Vertical | Why | Suggested threshold |
|---|---|---|---|
| r/SomebodyMakeThis | (new: `appideas`) | Literal app requests — weak WTP but pure "what to build" signal | 0.50 |
| r/AppIdeas | (new: `appideas`) | Same; treat as idea-mining, not lead-gen | 0.50 |
| r/freelance | smallbusiness | Invoicing/contract/client-management pain across niches | 0.50 |
| r/PressureWashing | trades | Small but intensely operational; quoting and scheduling threads weekly | 0.45 |

**Deliberately skipped:** r/Entrepreneur and r/startups (overwhelming self-promo — the seller filters would do more work than the scorer), r/SaaS (audience is builders, not buyers), r/productivity (intent is high but buyers are consumers with ~$0 WTP), r/sysadmin and r/msp (good pain density but enterprise-procurement buyers — different motion than the current verticals).

### Ready to paste into `feeds.intent.json` (Wave 1)

```json
{ "source": "Reddit: r/sweatystartup", "type": "reddit", "subreddit": "sweatystartup", "sort": "new" },
{ "source": "Reddit: r/PropertyManagement", "type": "reddit", "subreddit": "PropertyManagement", "sort": "new" },
{ "source": "Reddit: r/Landscaping", "type": "reddit", "subreddit": "Landscaping", "sort": "new" },
{ "source": "Reddit: r/WeddingPhotography", "type": "reddit", "subreddit": "WeddingPhotography", "sort": "new" }
```

Matching `config.js` threshold entries: `sweatystartup: 0.45, propertymanagement: 0.45, landscaping: 0.45, weddingphotography: 0.40` (keys are lowercased subreddit names — that's how `index.js` looks them up).

---

## 4. Cost check

| Change | New LLM calls | New cost |
|---|---|---|
| 2.1 Ranked AI budget | 0 (same caps, better targets) | $0 |
| 2.2 Demand score | 0 (pure string matching) | $0 |
| 2.3 Richer gate output | 0 (+~40 output tokens × ≤10 calls/day) | < $0.01/day |
| 2.4 Theme tally | 0 | $0 |
| 3 New feeds | 0 (RSS fetches only) | $0 |

---

## 5. Build order

1. **M1 — Ranked AI budget** (small `index.js` edit): collect → sort → gate top-N; fix `markSeenUrl` timing for budget-skipped posts. Verify with `--dry-run` that filter behavior is unchanged.
2. **M2 — Demand score** (`demandScore.js` + `demand-keywords.json` + 1 QB field): wire into the M1 sort and the QB payload.
3. **M3 — Richer AI gate** (prompt edit + 4 QB fields): confirm JSON parses across a day of runs before trusting the new fields.
4. **M4 — Wave 1 feeds** (config only): add 4 feeds + thresholds, watch logs for a week, then Wave 2.
5. **M5 — Theme tally** (optional, only if M1–M4 leave you wanting trend visibility).

Each milestone is independently shippable and reversible; none touches the filter chain's order or the frozen v1.0 confidence weights.
