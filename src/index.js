import 'dotenv/config';
import feeds from '../feeds.intent.json' assert { type: 'json' };
import keywords from '../keywords.json' assert { type: 'json' };
import verticals from '../verticals.json' assert { type: 'json' };

import fetchRedditRss from './redditRss.js';
import normalize from './normalize.js';

import scoreIntent from './leadSignals/detector/keywordScore.js';
import tagVerticals from './leadSignals/detector/tagVerticals.js';
import isSellerPost from './leadSignals/detector/isSellerPost.js';
import isSellerIntent from './leadSignals/detector/isSellerIntent.js';

import {
  updateAuthorReputation,
  shouldSkipAuthor,
} from './leadSignals/detector/authorReputation.js';

import { hasSeenUrl, markSeenUrl } from './leadSignals/detector/urlDedupe.js';
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

for (const feed of feeds) {
  console.log('[FEED START]', feed);

  let feedStats = {
    seen: 0,
    deduped: 0,
    sellers: 0,
    qualified: 0,
    written: 0,
  };

  const items = await fetchRedditRss(feed);
  console.log('[FEED FETCHED]', {
    source: feed.source ?? null,
    count: Array.isArray(items) ? items.length : 'invalid',
  });

  for (const raw of items) {
    feedStats.seen += 1;
    debug('[RAW ITEM]', {
      title: raw?.title ?? null,
      url: raw?.url ?? raw?.link ?? null,
    });

    console.log('[FEED SUMMARY]', {
      subreddit: feed.subreddit,
      ...feedStats,
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

    if (!isDryRun) {
      if (hasSeenUrl(record.url)) {
        feedStats.deduped += 1;
        debug('[DEDUPED URL]', record.url);
        continue;
      }
      markSeenUrl(record.url);
    }

    if (isSellerPost(record) || isSellerIntent(record)) {
      feedStats.sellers += 1;
      console.log('[FILTERED SELLER]', record.title);
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
    const subredditKey = record.subreddit.toLowerCase();
    const threshold =
      CONFIDENCE_THRESHOLDS[subredditKey] ?? CONFIDENCE_THRESHOLDS.default;
    console.log('[SCORE RESULT]', {
      title: record.title,
      qualifies: score.qualifies,
      confidence: score.confidence,
      phrases: score.matchedPhrases,
    });
    if (!score.qualifies) continue;

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
      continue;
    }

    if (
      record.author &&
      shouldSkipAuthor(record.author, record.subreddit, record.url)
    ) {
      console.log('[SKIP AUTHOR]', record.author);
      continue;
    }

    console.log('[PRE-AI]', {
      title: record.title,
      confidence: score.confidence,
      threshold,
    });

    feedStats.qualified += 1;

    // AI GATE
    let ai = { qualified: true, reason: 'dry-run bypass' };

    if (!isDryRun) {
      if (!canUseAiToday(AI_LIMITS.MAX_CALLS_PER_DAY)) break;
      if (aiCallsThisRun >= AI_LIMITS.MAX_CALLS_PER_RUN) break;

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
    console.log('[QB PAYLOAD READY]', {
      title: record.title,
      url: record.url,
    });

    const verticalsMatched = tagVerticals(record, verticals);

    const payload = {
      ...record,
      intentScore: score,
      aiQualified: true,
      aiReason: ai.reason,
      verticals: verticalsMatched,
    };

    if (isDryRun) {
      console.log('--- INBOUND LEAD SIGNAL ---');
      console.log({
        title: payload.title,
        subreddit: payload.subreddit,
        author: payload.author,
        confidence: score.confidence,
        phrases: score.matchedPhrases,
        verticals: payload.verticals,
        url: payload.url,
      });
    } else {
      console.log('[QB WRITE START]', payload.title);
      const { default: upsert } = await import('./upsert.js');
      await upsert(payload);
      feedStats.written += 1;
      console.log('[QB WRITE SUCCESS]', payload.title);
    }
  }
}

if (!isDryRun) {
  const usedToday = getDailyAiCount();
  console.log(
    `[AI USAGE] run=${aiCallsThisRun}/${AI_LIMITS.MAX_CALLS_PER_RUN} today=${usedToday}/${AI_LIMITS.MAX_CALLS_PER_DAY}`
  );
}

process.exit(0);
