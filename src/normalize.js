export default function normalize(item) {
  const text = `${item.title}\n\n${item.body}`.trim();

  return {
    ...item,
    text,
    title: item.title.trim(),
    body: item.body.trim(),
  };
}
