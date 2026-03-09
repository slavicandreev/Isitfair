import OpenAI from 'openai';
import { logAICall, estimateCost } from '../cost-tracker';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const DEFAULT_MODEL = 'gpt-4o-mini';

export async function openAITextCall(
  systemPrompt: string,
  userPrompt: string,
  quoteId: string = 'unknown',
  step: string = 'text_reasoning',
  model: string = DEFAULT_MODEL
): Promise<string> {
  const startTime = Date.now();

  const response = await getOpenAI().chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  });

  const latency = Date.now() - startTime;

  const usage = response.usage;
  const inputTokens = usage?.prompt_tokens || 0;
  const outputTokens = usage?.completion_tokens || 0;

  await logAICall({
    model,
    provider: 'openai',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimateCost(model, inputTokens, outputTokens),
    latency_ms: latency,
    timestamp: new Date().toISOString(),
    quote_id: quoteId,
    step,
  });

  return response.choices[0]?.message?.content || '{}';
}
