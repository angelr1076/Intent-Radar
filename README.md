# Inbound Lead Signals

This project monitors online discussions to identify real people expressing real business problems.

Actual posts where someone is clearly stuck, frustrated, or looking for a better way to do something.

---

## What this is

Inbound Lead Signals is a signal-detection system. It watches selected public sources, evaluates posts using a set of rules, and surfaces only the ones that show **genuine intent**; The kind that usually precedes a buying decision. Every record is explainable and nothing is guesswork.

---

## How it works (high level)

- Sources are defined explicitly
- Language is evaluated, not popularity
- Signals are scored conservatively
- Posts are categorized for organization
- Outputs are designed for downstream review and action
- Qualified signals are written to a db for review, filtering, and follow-up.

The system favors **precision over coverage**.

---

## Intended use

This project is designed to support:

- Lead research
- Market discovery
- Pattern recognition
- Opportunity tracking

It intentionally does **not** handle outreach or engagement.

---

## AI usage

AI is used as a secondary validation layer, not as a discovery mechanism.

- All posts must pass deterministic scoring first
- AI calls are rate-limited per run and per day
- AI is never required for ingestion to function
- The system is safe to run with AI fully disabled

---

## Persistence

The system maintains lightweight local state to improve signal quality over time:

- Seen URLs (deduplication)
- Author reputation (seller vs qualified behavior)
- Daily AI usage counters

All state is file-backed and explainable.

---

## Basic mental model

| Layer    | Purpose                      | File              |
| -------- | ---------------------------- | ----------------- |
| Feeds    | Where to listen              | feeds.intent.json |
| Keywords | What language signals intent | keywords.json     |
| Scoring  | Should this pass?            | keywordScore.js   |
| Tagging  | How to organize it           | verticals.json    |

---

## Status

Production (v1)

- Deployed on Railway
- Runs on a scheduled cron
- Writes qualified signals to a database
- Conservative defaults frozen
