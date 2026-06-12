import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve('./data');
const FILE_PATH = path.join(DATA_DIR, 'theme-tally.json');

const MAX_SAMPLE_URLS = 5;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function load() {
  ensureDir();

  if (!fs.existsSync(FILE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

function save(data) {
  ensureDir();
  fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2));
}

function monthKey(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

// One pain point is an anecdote; the same pain from many authors is a market.
// Tallies vertical + demand category per month for each record written to QB.
export function recordTheme(payload, date = new Date()) {
  const vertical = payload.verticals?.[0]?.name ?? 'unknown';
  const demandCategories = payload.demandScore?.categories?.length
    ? payload.demandScore.categories
    : ['general'];

  const data = load();
  const month = monthKey(date);

  if (!data[month]) {
    data[month] = {};
  }

  for (const category of demandCategories) {
    const key = `${vertical}|${category}`;

    if (!data[month][key]) {
      data[month][key] = { count: 0, sampleUrls: [] };
    }

    data[month][key].count += 1;

    if (
      payload.url &&
      data[month][key].sampleUrls.length < MAX_SAMPLE_URLS &&
      !data[month][key].sampleUrls.includes(payload.url)
    ) {
      data[month][key].sampleUrls.push(payload.url);
    }
  }

  save(data);
}
