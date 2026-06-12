// Demand (buildability) score — v1.0
// Ranking only. Never used to qualify a post; confidence scoring stays untouched.
const DEMAND_WEIGHTS_V1 = {
  wtp: 35,
  incumbent: 20,
  workaround: 20,
  substance: 15,
  urgency: 10,
};

export default function scoreDemand(record, demandKeywordsConfig) {
  const text = record.text.toLowerCase();
  const wordCount = text.split(/\s+/).length;

  const matchedPhrases = [];
  const categories = new Set();

  for (const { phrase, category } of demandKeywordsConfig.keywords) {
    if (!phrase) continue;

    if (text.includes(phrase.toLowerCase())) {
      matchedPhrases.push(phrase);
      categories.add(category);
    }
  }

  let substance = 0;
  if (wordCount >= 40) substance = 1;
  else if (wordCount >= 20) substance = 0.7;
  else if (wordCount >= 10) substance = 0.4;
  else substance = 0.2;

  let score = substance * DEMAND_WEIGHTS_V1.substance;
  for (const category of categories) {
    score += DEMAND_WEIGHTS_V1[category] ?? 0;
  }

  return {
    score: Math.round(score),
    matchedPhrases,
    categories: Array.from(categories),
  };
}
