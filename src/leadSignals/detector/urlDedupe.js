import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const FILE_PATH = path.join(DATA_DIR, 'seen-urls.json');

const DEFAULT_TTL_DAYS = 14;

let cache = {}; // { normalizedUrl: lastSeenISO }

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadCache() {
  ensureDir();

  if (!fs.existsSync(FILE_PATH)) {
    cache = {};
    return;
  }

  try {
    cache = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    cache = {};
  }
}

function saveCache() {
  fs.writeFileSync(FILE_PATH, JSON.stringify(cache, null, 2));
}

function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function prune(ttlDays) {
  const cutoff = daysAgo(ttlDays);

  for (const [url, iso] of Object.entries(cache)) {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts) || ts < cutoff) {
      delete cache[url];
    }
  }
}

export function normalizeUrl(input) {
  if (!input) return null;

  try {
    const u = new URL(input);

    // strip tracking
    const dropParams = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'utm_id',
      'ref',
      'ref_src',
    ];

    for (const p of dropParams) {
      u.searchParams.delete(p);
    }

    // force www + drop trailing slash
    if (u.hostname === 'reddit.com') u.hostname = 'www.reddit.com';
    if (u.hostname === 'old.reddit.com') u.hostname = 'www.reddit.com';

    // drop fragment
    u.hash = '';

    const out = u.toString().replace(/\/$/, '');
    return out;
  } catch {
    // not a valid URL; fallback to raw
    return String(input).trim();
  }
}

loadCache();

export function hasSeenUrl(url, { ttlDays = DEFAULT_TTL_DAYS } = {}) {
  prune(ttlDays);
  const normalized = normalizeUrl(url);
  if (!normalized) return false;

  return Boolean(cache[normalized]);
}

export function markSeenUrl(url) {
  const normalized = normalizeUrl(url);
  if (!normalized) return;

  cache[normalized] = new Date().toISOString();
  saveCache();
}
