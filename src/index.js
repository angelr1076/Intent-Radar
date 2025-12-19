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
  markAuthorSeen,
  updateAuthorReputation,
  shouldSkipAuthor,
} from './leadSignals/detector/authorReputation.js';

import { hasSeenUrl, markSeenUrl } from './leadSignals/detector/urlDedupe.js';
import { AI_LIMITS } from './config/config.js';

const isDryRun = process.argv.includes('--dry-run');

let aiCallsThisRun = 0;

if (!Array.isArray(feeds) || feeds.length === 0) {
  process.exit(0);
}

for (const feed of feeds) {
  const items = await fetchRedditRss(feed);
  console.log(`[DEBUG] ${feed.source}: fetched ${items.length} items`);

  for (const raw of items) {
    const record = normalize(raw);

    if (!record?.url) continue;

    if (hasSeenUrl(record.url)) {
      continue;
    }
    markSeenUrl(record.url);

    if (isSellerPost(record) || isSellerIntent(record)) {
      if (record.author) {
        updateAuthorReputation(record.author, record.subreddit, 'seller');
      }
      continue;
    }

    if (record.author) {
      markAuthorSeen(record.author, record.subreddit);
    }

    console.log(
      `[DEBUG] sr:${record.subreddit} / checking post: ${record.title}`
    );

    const score = scoreIntent(record, keywords);
    if (!score.qualifies) continue;

    const threshold = getConfidenceThreshold(record.subreddit);

    if (score.confidence < threshold) {
      console.log(
        `[NEAR-MISS] sr:${record.subreddit} conf:${score.confidence} < ${threshold}`,
        score.matchedPhrases
      );
      continue;
    }

    if (shouldSkipAuthor(record.author, record.subreddit)) {
      continue;
    }

    let ai = { qualified: true, reason: 'dry-run bypass' };

    if (!isDryRun) {
      if (aiCallsThisRun >= AI_LIMITS.MAX_CALLS_PER_RUN) {
        break;
      }

      const { default: aiGate } = await import('./aiGate.js');
      aiCallsThisRun += 1;
      ai = await aiGate(record);

      if (!ai.qualified) continue;
    }

    updateAuthorReputation(record.author, record.subreddit, 'qualified');

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
        intentScore: payload.intentScore,
        verticals: payload.verticals,
        aiReason: payload.aiReason,
        url: payload.url,
      });
    } else {
      const { default: upsert } = await import('./upsert.js');
      await upsert(payload);
    }
  }
}

if (!isDryRun) {
  console.log(
    `[AI USAGE] ${aiCallsThisRun} AI calls used (cap: ${AI_LIMITS.MAX_CALLS_PER_RUN})`
  );
}

process.exit(0);
