export default function scoreIntent(record, keywords) {
  const text = record.text.toLowerCase();

  let best = Infinity;

  for (const { phrase, score } of keywords) {
    if (text.includes(phrase.toLowerCase())) {
      best = Math.min(best, score);
    }
  }

  return best === Infinity ? 99 : best;
}
