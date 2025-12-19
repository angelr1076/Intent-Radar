import thresholds from '../../config/subredditThresholds.js';

export default function getConfidenceThreshold(subreddit) {
  if (!subreddit) return thresholds.default;

  const key = subreddit.toLowerCase();
  return thresholds[key] ?? thresholds.default;
}
