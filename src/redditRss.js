import Parser from 'rss-parser';
const parser = new Parser();

function buildRedditRssUrl(feed) {
  const sort = feed.sort || 'new';
  return `https://www.reddit.com/r/${feed.subreddit}/${sort}/.rss`;
}

export default async function fetchRedditRss(feed) {
  if (feed.type !== 'reddit') {
    throw new Error(`Unsupported feed type: ${feed.type}`);
  }

  if (!feed.subreddit) {
    throw new Error(`Missing subreddit in feed: ${JSON.stringify(feed)}`);
  }

  const url = buildRedditRssUrl(feed);
  const rss = await parser.parseURL(url);

  return rss.items.map(item => ({
    source: feed.source,
    subreddit: feed.subreddit,
    title: item.title || '',
    body: item.contentSnippet || '',
    url: item.link,
    author: item.creator || '',
    publishedAt: item.pubDate,
  }));
}
