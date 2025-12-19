export default function tagVertical(record, verticals) {
  const text = record.text.toLowerCase();

  for (const [vertical, terms] of Object.entries(verticals)) {
    if (terms.some(t => text.includes(t))) {
      return vertical;
    }
  }

  return 'unknown';
}
