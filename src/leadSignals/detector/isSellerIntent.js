const SELLER_PATTERNS = [
  'free consultation',
  'offering demos',
  'offering demo',
  'we built',
  'i built',
  'just launched',
  'launching',
  'our platform',
  'our tool',
  'sign up',
  'book a call',
  'get started',
  'pricing',
  'trial',
];

export default function isSellerIntent(record) {
  const text = `${record.title} ${record.body}`.toLowerCase();

  return SELLER_PATTERNS.some(p => text.includes(p));
}
