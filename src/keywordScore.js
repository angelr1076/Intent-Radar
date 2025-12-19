export default function scoreIntent(record, keywordsConfig) {
  const text = record.text.toLowerCase();

  const { minimum_trigger_score, keywords } = keywordsConfig;

  let bestScore = Infinity;
  const matchedPhrases = [];
  const categories = new Set();

  for (const { phrase, score, category } of keywords) {
    if (!phrase) continue;

    if (text.includes(phrase.toLowerCase())) {
      matchedPhrases.push(phrase);
      categories.add(category);
      bestScore = Math.min(bestScore, score);
    }
  }

  const qualifies = bestScore <= minimum_trigger_score;

  let confidence = 0;

  if (qualifies) {
    const scoreWeight =
      (minimum_trigger_score - bestScore + 1) / minimum_trigger_score;
    const phraseWeight = Math.min(matchedPhrases.length / 3, 1);
    const categoryWeight = Math.min(categories.size / 2, 1);

    confidence = scoreWeight * 0.5 + phraseWeight * 0.3 + categoryWeight * 0.2;

    confidence = Math.round(confidence * 100) / 100;
  }

  return {
    qualifies,
    score: bestScore === Infinity ? null : bestScore,
    confidence,
    matchedPhrases,
    categories: Array.from(categories),
  };
}
