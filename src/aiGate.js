import OpenAI from 'openai';
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function aiGate(record) {
  const prompt = `
Return ONLY JSON.

Is this a high-intent B2B buying signal?

Post:
${record.text}
`;

  const res = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
  });

  return JSON.parse(res.choices[0].message.content);
}
