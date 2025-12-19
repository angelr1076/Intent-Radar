import Parser from 'rss-parser';
const parser = new Parser();

export default async function fetchRedditRss(feed) {
  const rss = await parser.parseURL(feed.url);

  return rss.items.map(item => ({
    source: feed.source,
    subreddit: feed.source,
    title: item.title || '',
    body: item.contentSnippet || '',
    url: item.link,
    author: item.creator || '',
    publishedAt: item.pubDate,
  }));
}
