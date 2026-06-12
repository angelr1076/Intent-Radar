import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

const LLM_PROVIDER = (process.env.LLM_PROVIDER || 'openai').toLowerCase();
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

const openaiClient = (LLM_PROVIDER === 'openai')
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

const anthropicClient = (LLM_PROVIDER === 'anthropic')
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function extractJson(text) {
  if (!text) return null;

  const cleaned = text
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = `You are a signal detector for SaaS/tool opportunity research.

You will receive a Reddit post (title, subreddit, and body text). Decide whether the author is expressing an UNMET NEED for a tool, app, software, or better process/workflow.

QUALIFIED — the author is:
- Asking for tool/app/software recommendations
- Describing a pain point that could be solved by software
- Comparing or searching for alternatives to existing tools
- Expressing frustration with a manual process or current tool
- Asking how others handle/manage a specific workflow

NOT QUALIFIED — the author is:
- Selling, promoting, or advertising a product/service
- Sharing a guide, tutorial, or informational content
- Asking a general question with no tool/software angle
- Posting memes, jokes, or off-topic content
- Already satisfied with their current solution (no unmet need)

Return ONLY valid JSON with this exact shape:
{
  "qualified": true/false,
  "reason": "one sentence explaining why",
  "usefulness": 0-100,
  "signal_type": "pain_point" | "tool_request" | "incumbent_complaint" | "none",
  "willingness_to_pay": "explicit" | "implied" | "none",
  "persona": "short description of who the author is, e.g. 'solo HVAC contractor'"
}

Field guidance:
- usefulness: how useful this post is for deciding what app to build — weigh willingness to pay, a named incumbent with a complaint, a manual workaround (spreadsheets, paper), urgency, and specificity. A vague question scores low even if qualified.
- signal_type: the single best-fit label; "none" if not qualified.
- willingness_to_pay: "explicit" only if they mention paying or a price; "implied" if they already pay for a tool they're unhappy with.
- persona: best guess from the post and subreddit; empty string if unclear.`;

export default async function aiGate(record) {
  const userMessage = [
    `Subreddit: r/${record.subreddit}`,
    `Title: ${record.title}`,
    '',
    record.text,
  ].join('\n');

  let raw;

  if (LLM_PROVIDER === 'anthropic') {
    const response = await anthropicClient.messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      temperature: 0,
    });
    raw = response.content?.[0]?.text;
  } else {
    const response = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0,
    });
    raw = response.choices?.[0]?.message?.content;
  }
  const parsed = extractJson(raw);

  if (!parsed || typeof parsed.qualified !== 'boolean') {
    console.log('[AI GATE] invalid response:', raw);
    return {
      qualified: false,
      reason: 'invalid_ai_response',
    };
  }

  console.log('[AI GATE]', {
    title: record.title,
    qualified: parsed.qualified,
    reason: parsed.reason,
  });

  return parsed;
}
