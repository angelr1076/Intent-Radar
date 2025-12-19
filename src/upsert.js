import qb from './quickbase.js';

export default async function upsert(record) {
  return qb.upsert('Inbound Lead Signals', {
    'Post URL': record.url,
    Title: record.title,
    Body: record.body,
    Source: record.source,
    Subreddit: record.subreddit,
    Author: record.author,
    'Intent Score': record.intentScore,
    'AI Qualified': record.aiQualified,
    'AI Reason': record.aiReason,
    Vertical: record.vertical,
  });
}
