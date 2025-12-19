export default function scoreIntent(record, keywordsConfig) {
  const text = record.text.toLowerCase();
  const { minimum_trigger_score, keywords } = keywordsConfig;

  let bestScore = Infinity;
  const matchedPhrases = [];
  const matchedCategories = new Set();

  for (const { phrase, score, category } of keywords) {
    if (!phrase) continue;

    if (text.includes(phrase.toLowerCase())) {
      matchedPhrases.push(phrase);
      matchedCategories.add(category);
      bestScore = Math.min(bestScore, score);
    }
  }

  const qualifies = bestScore <= minimum_trigger_score;

  let confidence = 0;

  if (qualifies) {
    const scoreBase =
      bestScore === 1 ? 0.9 : bestScore === 2 ? 0.6 : bestScore === 3 ? 0.3 : 0;

    const categoryWeights = {
      explicit_intent: 1.0,
      comparison: 0.8,
      pain: 0.6,
      automation: 0.4,
    };

    let strongestCategoryWeight = 0;

    for (const category of matchedCategories) {
      strongestCategoryWeight = Math.max(
        strongestCategoryWeight,
        categoryWeights[category] || 0
      );
    }

    const phraseBoost =
      matchedPhrases.length === 1
        ? 0.1
        : matchedPhrases.length === 2
        ? 0.15
        : matchedPhrases.length >= 3
        ? 0.2
        : 0;

    confidence = scoreBase * 0.6 + strongestCategoryWeight * 0.3 + phraseBoost;

    confidence = Math.min(1, Math.round(confidence * 100) / 100);
  }

  return {
    qualifies,
    score: bestScore === Infinity ? null : bestScore,
    confidence,
    matchedPhrases,
    categories: Array.from(matchedCategories),
  };
  console.log('[DEBUG] text length:', record.text?.length);
}
