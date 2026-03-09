import { AICallLog } from '@/types';
import { supabaseAdmin } from './supabase';

// Cost per token estimates (USD)
const COST_PER_TOKEN: Record<string, { input: number; output: number }> = {
  'gemini-2.5-flash': { input: 0.000000075, output: 0.0000003 },
  'claude-haiku-4-5-20251001': { input: 0.00000025, output: 0.00000125 },
  'claude-sonnet-4-6': { input: 0.000003, output: 0.000015 },
  'gpt-4o-mini': { input: 0.00000015, output: 0.0000006 },
};

export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const rates = COST_PER_TOKEN[model] || { input: 0.000001, output: 0.000002 };
  return rates.input * inputTokens + rates.output * outputTokens;
}

export async function logAICall(log: AICallLog): Promise<void> {
  try {
    await supabaseAdmin.from('ai_call_logs').insert(log);
  } catch {
    // Don't fail the main pipeline if logging fails
    console.error('Failed to log AI call:', log);
  }
}
