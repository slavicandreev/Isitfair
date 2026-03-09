import { QuoteExtraction, NormalizedItem, LineItemCategory, ServiceType } from '@/types';
import { supabaseAdmin } from '../supabase';
import { openAITextCall } from '../ai/openai';
import { claudeTextCall } from '../ai/claude';

interface NormalizationCache {
  raw_description: string;
  normalized_name: string;
  service_type: ServiceType;
}

async function lookupNormalization(
  description: string,
  serviceType: ServiceType
): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from('normalization_mappings')
      .select('normalized_name')
      .eq('service_type', serviceType)
      .ilike('raw_description', description)
      .limit(1)
      .single();

    return data?.normalized_name || null;
  } catch {
    return null;
  }
}

async function cacheNormalization(
  rawDescription: string,
  normalizedName: string,
  serviceType: ServiceType
): Promise<void> {
  try {
    await supabaseAdmin.from('normalization_mappings').upsert({
      raw_description: rawDescription,
      normalized_name: normalizedName,
      service_type: serviceType,
    });
  } catch {
    // Non-critical, just log
    console.error('Failed to cache normalization mapping');
  }
}

async function batchNormalizeWithAI(
  descriptions: string[],
  serviceType: ServiceType,
  quoteId: string
): Promise<string[]> {
  const systemPrompt = `You are a service description normalizer. Convert service descriptions to canonical snake_case names.
Rules:
- Use snake_case format (e.g., "brake_pad_replacement_front")
- Be specific but concise
- Match canonical industry terminology
- Include location qualifiers for parts (front/rear, left/right) when specified

Respond with JSON only: { "normalized": ["name1", "name2", ...] }`;

  const userPrompt = `Service type: ${serviceType}

Normalize these service descriptions to canonical names:
${descriptions.map((d, i) => `${i + 1}. "${d}"`).join('\n')}`;

  try {
    const result = await openAITextCall(systemPrompt, userPrompt, quoteId, 'normalization');
    const parsed = JSON.parse(result);
    return parsed.normalized || descriptions.map((d) => d.toLowerCase().replace(/\s+/g, '_'));
  } catch {
    // Fallback to Claude
    try {
      const result = await claudeTextCall(systemPrompt, userPrompt, 'claude-haiku-4-5-20251001', quoteId, 'normalization');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.normalized || descriptions.map((d) => d.toLowerCase().replace(/\s+/g, '_'));
      }
    } catch {}
    // Final fallback: basic normalization
    return descriptions.map((d) => d.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''));
  }
}

function buildNormalizedItem(
  item: QuoteExtraction['line_items'][0],
  normalizedName: string
): NormalizedItem {
  return {
    original_description: item.description,
    normalized_name: normalizedName,
    category: item.category as LineItemCategory,
    quantity: item.quantity,
    unit_price: item.unit_price,
    line_total: item.line_total,
    labor_hours: item.labor_hours,
    part_number: item.part_number,
  };
}

export async function normalizeServices(
  extraction: QuoteExtraction,
  quoteId: string = 'unknown'
): Promise<NormalizedItem[]> {
  const results: NormalizedItem[] = [];
  const itemsToNormalize: Array<{ item: QuoteExtraction['line_items'][0]; index: number }> = [];

  // First pass: check cache for each item
  for (const item of extraction.line_items) {
    const cached = await lookupNormalization(item.description, extraction.service_type);
    if (cached) {
      results.push(buildNormalizedItem(item, cached));
    } else {
      itemsToNormalize.push({ item, index: results.length });
      results.push(buildNormalizedItem(item, item.description)); // placeholder
    }
  }

  // Batch normalize uncached items
  if (itemsToNormalize.length > 0) {
    const descriptions = itemsToNormalize.map(({ item }) => item.description);
    const normalizedNames = await batchNormalizeWithAI(descriptions, extraction.service_type, quoteId);

    for (let i = 0; i < itemsToNormalize.length; i++) {
      const { item, index } = itemsToNormalize[i];
      const normalizedName = normalizedNames[i] || item.description.toLowerCase().replace(/\s+/g, '_');
      results[index] = buildNormalizedItem(item, normalizedName);

      // Cache for future use
      await cacheNormalization(item.description, normalizedName, extraction.service_type);
    }
  }

  return results;
}
