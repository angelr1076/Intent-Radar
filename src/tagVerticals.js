export default function tagVerticals(record, verticalConfig) {
  const text = `${record.title} ${record.body}`.toLowerCase();

  if (!verticalConfig?.verticals?.length) {
    return [];
  }

  const results = [];

  for (const vertical of verticalConfig.verticals) {
    const { name, keywords } = vertical;
    if (!Array.isArray(keywords) || !name) continue;

    const matchedKeywords = keywords.filter(k =>
      text.includes(k.toLowerCase())
    );

    if (matchedKeywords.length === 0) continue;

    const confidence =
      Math.round((matchedKeywords.length / keywords.length) * 100) / 100;

    results.push({
      name,
      confidence,
      matchedKeywords,
    });
  }

  if (results.length === 0) {
    return [
      {
        name: 'unknown',
        confidence: 0,
        matchedKeywords: [],
      },
    ];
  }

  // Sort strongest signal first
  return results.sort((a, b) => b.confidence - a.confidence);
}
