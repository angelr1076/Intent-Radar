import feeds from '../feeds.intent.json' assert { type: 'json' };
import keywords from '../keywords.json' assert { type: 'json' };
import verticals from '../verticals.json' assert { type: 'json' };

import fetchRedditRss from './redditRss.js';
import normalize from './normalize.js';
import scoreIntent from './keywordScore.js';
import aiGate from './aiGate.js';
import tagVertical from './tagVertical.js';
import upsert from './upsert.js';

for (const feed of feeds) {
  const items = await fetchRedditRss(feed);

  for (const raw of items) {
    const record = normalize(raw);
    const score = scoreIntent(record, keywords);

    if (score > 2) continue;

    const ai = await aiGate(record);
    if (!ai.qualified) continue;

    const vertical = tagVertical(record, verticals);

    await upsert({
      ...record,
      intentScore: score,
      aiQualified: true,
      aiReason: ai.reason,
      vertical,
    });
  }
}

console.log('Done.');
process.exit(0);
