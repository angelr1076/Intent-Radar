import 'dotenv/config';
import feeds from '../feeds.intent.json' with { type: 'json' };
import keywords from '../keywords.json' with { type: 'json' };
import verticals from '../verticals.json' with { type: 'json' };
import demandKeywords from '../demand-keywords.json' with { type: 'json' };

import fetchRedditRss from './redditRss.js';
import normalize from './normalize.js';

import scoreIntent from './leadSignals/detector/keywordScore.js';
import scoreDemand from './leadSignals/detector/demandScore.js';
import tagVerticals from './leadSignals/detector/tagVerticals.js';
import isSellerPost from './leadSignals/detector/isSellerPost.js';
import isSellerIntent from './leadSignals/detector/isSellerIntent.js';

import {
  updateAuthorReputation,
  shouldSkipAuthor,
} from './leadSignals/detector/authorReputation.js';

import { hasSeenUrl, markSeenUrl } from './leadSignals/detector/urlDedupe.js';
import { recordTheme } from './leadSignals/detector/themeTally.js';
import { AI_LIMITS, CONFIDENCE_THRESHOLDS } from './config/config.js';

import {
  canUseAiToday,
  getDailyAiCount,
  incrementDailyAiCount,
} from './leadSignals/detector/aiUsage.js';

const LOG_LEVEL = process.env.LOG_LEVEL ?? 'info';
const debug = (...args) => LOG_LEVEL === 'debug' && console.log(...args);
const isDryRun = process.argv.includes('--dry-run');
let aiCallsThisRun = 0;

// Seen-URLs are marked at final disposition only (filtered, gated, or written).
// Candidates skipped purely because the AI budget ran out stay unmarked so they
// compete again next run.
const shouldTrackSeen = !isDryRun && process.env.FORCE_SINGLE_WRITE !== '1';

if (!process.env.QB_REALM || !process.env.QB_USER_TOKEN) {
  throw new Error('Quickbase environment variables are missing');
}

console.log('[BOOT]', {
  isDryRun,
  feedsCount: Array.isArray(feeds) ? feeds.length : 'invalid',
});

if (!Array.isArray(feeds) || feeds.length === 0) {
  process.exit(0);
}

// PHASE 1 — fetch + filter, collect qualifying candidates (no AI, no writes)
const candidates = [];

for (const feed of feeds) {
  try {
    console.log('[FEED START]', feed);

    const items = await fetchRedditRss(feed);
    console.log('[FEED FETCHED]', {
      source: feed.source ?? null,
      count: Array.isArray(items) ? items.length : 'invalid',
    });

    for (const raw of items) {
      debug('[RAW ITEM]', {
        title: raw?.title ?? null,
        url: raw?.url ?? raw?.link ?? null,
      });

      const record = normalize(raw);

      debug('[NORMALIZED]', {
        title: record.title,
        subreddit: record.subreddit,
        author: record.author,
        url: record.url,
      });

      if (!record?.url) {
        console.log('[SKIP] missing url');
        continue;
      }

      if (shouldTrackSeen && hasSeenUrl(record.url)) {
        debug('[DEDUPED URL]', record.url);
        continue;
      }

      if (
        isSellerPost(record) ||
        (isSellerIntent(record) && process.env.FORCE_SINGLE_WRITE !== '1')
      ) {
        console.log('[FILTERED SELLER]', record.title);
        if (shouldTrackSeen) markSeenUrl(record.url);
        if (record.author) {
          updateAuthorReputation(
            record.author,
            record.subreddit,
            'seller',
            record.url
          );
        }
        continue;
      }

      debug('[SCORING]', record.title);

      const score = scoreIntent(record, keywords);

      if (process.env.FORCE_SINGLE_WRITE === '1') {
        score.qualifies = true;
        score.confidence = 1;
      }

      const subredditKey = record.subreddit.toLowerCase();

      const baseThreshold =
        CONFIDENCE_THRESHOLDS[subredditKey] ?? CONFIDENCE_THRESHOLDS.default;

      const threshold =
        process.env.LOWER_THRESH === '1'
          ? Math.min(0.5, baseThreshold)
          : baseThreshold;
      console.log('[SCORE RESULT]', {
        title: record.title,
        qualifies: score.qualifies,
        confidence: score.confidence,
        phrases: score.matchedPhrases,
      });
      if (!score.qualifies) {
        if (shouldTrackSeen) markSeenUrl(record.url);
        continue;
      }

      console.log('[THRESHOLD]', {
        subreddit: record.subreddit,
        threshold,
      });

      if (score.confidence < threshold) {
        console.log('[NEAR MISS]', {
          subreddit: record.subreddit,
          title: record.title,
          confidence: score.confidence,
          threshold,
          matchedPhrases: score.matchedPhrases,
          categories: score.categories,
          url: record.url,
        });
        if (shouldTrackSeen) markSeenUrl(record.url);
        continue;
      }

      if (
        record.author &&
        shouldSkipAuthor(record.author, record.subreddit, record.url)
      ) {
        console.log('[SKIP AUTHOR]', record.author);
        if (shouldTrackSeen) markSeenUrl(record.url);
        continue;
      }

      const demand = scoreDemand(record, demandKeywords);

      console.log('[CANDIDATE]', {
        title: record.title,
        confidence: score.confidence,
        demandScore: demand.score,
        demandCategories: demand.categories,
      });

      candidates.push({ record, score, demand, threshold });
    }
  } catch (error) {
    console.error(`[FEED ERROR] Failed to process feed: ${JSON.stringify(feed)}`, error);
  }
}

// PHASE 2 — rank candidates, spend the AI budget on the best ones first
candidates.sort(
  (a, b) =>
    b.demand.score - a.demand.score ||
    b.score.confidence - a.score.confidence
);

console.log('[RANKED]', candidates.map(({ record, score, demand }) => ({
  title: record.title,
  demandScore: demand.score,
  confidence: score.confidence,
})));

for (const { record, score, demand, threshold } of candidates) {
  try {
    console.log('[PRE-AI]', {
      title: record.title,
      confidence: score.confidence,
      demandScore: demand.score,
      threshold,
    });

    // AI GATE
    let ai = { qualified: true, reason: 'force-write bypass' };

    if (!isDryRun && process.env.FORCE_SINGLE_WRITE !== '1') {
      if (!canUseAiToday(AI_LIMITS.MAX_CALLS_PER_DAY)) {
        console.log('[AI BUDGET] daily cap reached — remaining candidates left unseen for next run');
        break;
      }

      if (aiCallsThisRun >= AI_LIMITS.MAX_CALLS_PER_RUN) {
        console.log('[AI BUDGET] run cap reached — remaining candidates left unseen for next run');
        break;
      }

      markSeenUrl(record.url);

      const { default: aiGate } = await import('./aiGate.js');

      aiCallsThisRun += 1;
      incrementDailyAiCount(1);

      ai = await aiGate(record);
      if (!ai.qualified) continue;
    }
    // END AI GATE

    if (record.author) {
      updateAuthorReputation(
        record.author,
        record.subreddit,
        'qualified',
        record.url
      );
    }

    const verticalsMatched = tagVerticals(record, verticals);

    const payload = {
      ...record,
      intentScore: score,
      demandScore: demand,
      aiQualified: true,
      aiReason: ai.reason,
      aiUsefulness: ai.usefulness ?? null,
      aiSignalType: ai.signal_type ?? '',
      aiWillingnessToPay: ai.willingness_to_pay ?? '',
      aiPersona: ai.persona ?? '',
      verticals: verticalsMatched,
    };

    if (isDryRun) {
      console.log('--- INBOUND LEAD SIGNAL ---');
      console.log({
        title: payload.title,
        subreddit: payload.subreddit,
        author: payload.author,
        confidence: score.confidence,
        demandScore: demand.score,
        demandCategories: demand.categories,
        phrases: score.matchedPhrases,
        verticals: payload.verticals,
        url: payload.url,
      });
    } else {
      console.log('[QB WRITE START]', payload.title);
      const { default: upsert } = await import('./upsert.js');
      await upsert(payload);
      console.log('[QB WRITE SUCCESS]', payload.title);
      recordTheme(payload);
    }
  } catch (error) {
    console.error(`[CANDIDATE ERROR] ${record.url}`, error);
  }
}

if (!isDryRun) {
  const usedToday = getDailyAiCount();
  console.log(
    `[AI USAGE] run=${aiCallsThisRun}/${AI_LIMITS.MAX_CALLS_PER_RUN} today=${usedToday}/${AI_LIMITS.MAX_CALLS_PER_DAY}`
  );
}

process.exit(0);
