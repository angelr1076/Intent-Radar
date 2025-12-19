import feeds from '../feeds.intent.json' assert { type: 'json' };
import keywords from '../keywords.json' assert { type: 'json' };
import verticals from '../verticals.json' assert { type: 'json' };

import fetchRedditRss from './redditRss.js';
import normalize from './normalize.js';
import scoreIntent from './keywordScore.js';
import tagVertical from './tagVerticals.js';
// import aiGate from './aiGate.js';
// import upsert from './upsert.js';

const isDryRun = process.argv.includes('--dry-run');

if (!Array.isArray(feeds) || feeds.length === 0) {
  console.warn('[WARN] No feeds found in feeds.intent.json');
  process.exit(0);
}

for (const feed of feeds) {
  const items = await fetchRedditRss(feed);
  console.log(`[DEBUG] ${feed.source}: fetched ${items.length} items`);

  for (const raw of items) {
    const record = normalize(raw);

    console.log(
      `[DEBUG] sr:${record.subreddit} / checking post: ${record.title}`
    );

    const score = scoreIntent(record, keywords);
    if (!score.qualifies) continue;

    console.log('[DEBUG] score result:', score);

    let ai = { qualified: true, reason: 'dry-run bypass' };

    if (!isDryRun) {
      const { default: aiGate } = await import('./aiGate.js');
      ai = await aiGate(record);
      if (!ai.qualified) continue;
    }

    const verticalsMatched = tagVertical(record, verticals);

    verticals: verticalsMatched.map(v => ({
      name: v.name,
      confidence: v.confidence,
    }));

    const payload = {
      ...record,
      intentScore: score,
      aiQualified: true,
      aiReason: ai.reason,
      verticalsMatched,
    };

    if (isDryRun) {
      console.log('--- INBOUND LEAD SIGNAL ---');
      console.log({
        title: payload.title,
        subreddit: payload.subreddit,
        author: payload.author,
        intentScore: payload.intentScore,
        vertical: payload.vertical,
        aiReason: payload.aiReason,
        url: payload.url,
      });
    } else {
      const { default: upsert } = await import('./upsert.js');
      await upsert(payload);
    }
  }
}

console.log('Done.');
process.exit(0);
