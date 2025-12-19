import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const FILE_PATH = path.join(DATA_DIR, 'author-reputation.json');

let cache = {};

function loadCache() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (fs.existsSync(FILE_PATH)) {
    try {
      cache = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    } catch {
      cache = {};
    }
  }
}

function saveCache() {
  fs.writeFileSync(FILE_PATH, JSON.stringify(cache, null, 2));
}

function keyFor(author, subreddit) {
  if (!author || !subreddit) return null;
  return `${subreddit}:${author}`;
}

loadCache();

export function markAuthorSeen(author, subreddit) {
  const key = keyFor(author, subreddit);
  if (!key) return;

  if (!cache[key]) {
    cache[key] = {
      sellerCount: 0,
      qualifiedCount: 0,
      totalSeen: 0,
      lastSeen: null,
    };
  }

  cache[key].totalSeen += 1;
  cache[key].lastSeen = new Date().toISOString();

  saveCache();
}

export function updateAuthorReputation(author, subreddit, type) {
  const key = keyFor(author, subreddit);
  if (!key || !cache[key]) return;

  if (type === 'seller') {
    cache[key].sellerCount += 1;
  }

  if (type === 'qualified') {
    cache[key].qualifiedCount += 1;
  }

  cache[key].lastSeen = new Date().toISOString();

  saveCache();
}

export function shouldSkipAuthor(author, subreddit) {
  const key = keyFor(author, subreddit);
  if (!key || !cache[key]) return false;

  const { sellerCount, qualifiedCount } = cache[key];

  if (sellerCount >= 3 && qualifiedCount === 0) {
    return true;
  }

  return false;
}
