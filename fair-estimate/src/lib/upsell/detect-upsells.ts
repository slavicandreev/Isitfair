import { NormalizedItem, UpsellFlag, UpsellType, QuoteExtraction, ServiceType } from '@/types';
import { supabaseAdmin } from '../supabase';
import { openAITextCall } from '../ai/openai';
import { claudeTextCall } from '../ai/claude';

function isAutoService(serviceType: ServiceType): boolean {
  return serviceType === 'auto_repair';
}

async function lookupUpsellKnowledge(
  normalizedName: string,
  serviceType: ServiceType
): Promise<Record<string, unknown> | null> {
  const table = isAutoService(serviceType) ? 'auto_upsell_knowledge' : 'home_upsell_knowledge';

  const { data } = await supabaseAdmin
    .from(table)
    .select('*')
    .eq('normalized_service_name', normalizedName)
    .limit(1)
    .single();

  return data || null;
}

function evaluateAutoUpsell(
  knowledge: Record<string, unknown>,
  extraction: QuoteExtraction
): { isUpsell: boolean; confidence: number; reason: string } {
  const mileage = null; // Not extracted in current schema; could be added

  let isUpsell = false;
  let confidence = 0.5;
  let reason = (knowledge.reason_template as string) || 'This service may not be necessary.';

  // Check if this is a common upsell context
  const primaryServiceContext = (knowledge.primary_service_context as string[]) || [];
  const mainServices = extraction.line_items
    .map((i) => i.description.toLowerCase())
    .filter((d) => !d.includes(knowledge.normalized_service_name as string));

  const contextMatch = primaryServiceContext.some((ctx) =>
    mainServices.some((s) => s.includes(ctx.replace('_', ' ').toLowerCase()))
  );

  if (contextMatch) {
    isUpsell = true;
    confidence = (knowledge.upsell_confidence as number) || 0.8;
  }

  if (mileage !== null) {
    const mileageMin = (knowledge.mileage_threshold_min as number) || 0;
    const mileageMax = (knowledge.mileage_threshold_max as number) || Infinity;
    if (mileage < mileageMin) {
      isUpsell = true;
      confidence = 0.9;
      reason = (reason as string).replace('{mileage_threshold_min}', mileageMin.toString());
    } else if (mileage > mileageMax) {
      isUpsell = false;
      confidence = 0.3;
    }
  }

  return { isUpsell, confidence, reason };
}

function evaluateHomeUpsell(
  knowledge: Record<string, unknown>,
  extraction: QuoteExtraction
): { isUpsell: boolean; confidence: number; reason: string } {
  const primaryServiceContext = (knowledge.primary_service_context as string[]) || [];
  const mainServices = extraction.line_items.map((i) => i.description.toLowerCase());

  const contextMatch = primaryServiceContext.some((ctx) =>
    mainServices.some((s) => s.includes(ctx.replace('_', ' ').toLowerCase()))
  );

  return {
    isUpsell: contextMatch,
    confidence: contextMatch ? 0.8 : 0.4,
    reason: (knowledge.reason_template as string) || 'This service may be an unnecessary add-on.',
  };
}

async function batchAIUpsellDetection(
  items: NormalizedItem[],
  extraction: QuoteExtraction,
  quoteId: string
): Promise<Record<string, { is_upsell: boolean; upsell_type: string | null; confidence: number; reason: string | null; when_actually_needed: string | null }>> {
  const systemPrompt = `You are an expert at identifying unnecessary upsells in service quotes. Analyze each line item and determine if it's likely an upsell.

Upsell types:
- likely_upsell: Almost never needed in this context
- conditional: Legitimate at certain intervals but suspicious here
- bundled_markup: Real service but priced far above what's necessary

Respond with JSON only:
{
  "items": {
    "item_name": {
      "is_upsell": boolean,
      "upsell_type": "likely_upsell|conditional|bundled_markup|null",
      "confidence": 0.0-1.0,
      "reason": "string or null",
      "when_actually_needed": "string or null"
    }
  }
}`;

  const mainServices = extraction.line_items
    .filter((i) => !['tax', 'permit_fee', 'disposal_fee'].includes(i.category))
    .map((i) => i.description);

  const userPrompt = `Service type: ${extraction.service_type}
Vehicle/Property: ${extraction.vehicle_info ? `${extraction.vehicle_info.year} ${extraction.vehicle_info.make} ${extraction.vehicle_info.model}` : extraction.property_info?.details || 'Not specified'}

Analyze these line items for potential upsells:
${items.map((i) => `- ${i.normalized_name} (quoted: $${i.line_total})`).join('\n')}

Primary services in this quote: ${mainServices.slice(0, 5).join(', ')}`;

  try {
    const result = await openAITextCall(systemPrompt, userPrompt, quoteId, 'upsell_detection');
    const parsed = JSON.parse(result);
    return parsed.items || {};
  } catch {
    try {
      const result = await claudeTextCall(systemPrompt, userPrompt, 'claude-haiku-4-5-20251001', quoteId, 'upsell_detection');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.items || {};
      }
    } catch {}
    return {};
  }
}

export async function detectUpsells(
  items: NormalizedItem[],
  extraction: QuoteExtraction,
  quoteId: string = 'unknown'
): Promise<UpsellFlag[]> {
  const flags: UpsellFlag[] = [];
  const itemsForAI: NormalizedItem[] = [];

  for (const item of items) {
    // Skip tax and standard fees
    if (['tax', 'permit_fee', 'disposal_fee'].includes(item.category)) {
      flags.push({
        item_description: item.original_description,
        normalized_name: item.normalized_name,
        is_upsell: false,
        upsell_type: null,
        upsell_confidence: 0,
        reason: null,
        when_actually_needed: null,
        estimated_fair_value: null,
      });
      continue;
    }

    // Check knowledge base
    const knowledge = await lookupUpsellKnowledge(item.normalized_name, extraction.service_type);

    if (knowledge) {
      const evaluation = isAutoService(extraction.service_type)
        ? evaluateAutoUpsell(knowledge, extraction)
        : evaluateHomeUpsell(knowledge, extraction);

      flags.push({
        item_description: item.original_description,
        normalized_name: item.normalized_name,
        is_upsell: evaluation.isUpsell,
        upsell_type: (knowledge.upsell_type as UpsellType) || null,
        upsell_confidence: evaluation.confidence,
        reason: evaluation.reason,
        when_actually_needed: (knowledge.when_actually_needed as string) || null,
        estimated_fair_value: (knowledge.estimated_fair_value as number) || null,
      });
    } else {
      // Queue for AI analysis
      itemsForAI.push(item);
      flags.push({
        item_description: item.original_description,
        normalized_name: item.normalized_name,
        is_upsell: false,
        upsell_type: null,
        upsell_confidence: 0,
        reason: null,
        when_actually_needed: null,
        estimated_fair_value: null,
      });
    }
  }

  // Batch AI analysis for items not in knowledge base
  if (itemsForAI.length > 0) {
    const aiResults = await batchAIUpsellDetection(itemsForAI, extraction, quoteId);

    for (const item of itemsForAI) {
      const aiResult = aiResults[item.normalized_name];
      if (aiResult) {
        const flagIndex = flags.findIndex((f) => f.normalized_name === item.normalized_name);
        if (flagIndex >= 0) {
          flags[flagIndex] = {
            item_description: item.original_description,
            normalized_name: item.normalized_name,
            is_upsell: aiResult.is_upsell,
            upsell_type: (aiResult.upsell_type as UpsellType) || null,
            upsell_confidence: aiResult.confidence,
            reason: aiResult.reason,
            when_actually_needed: aiResult.when_actually_needed,
            estimated_fair_value: null,
          };
        }
      }
    }
  }

  return flags;
}
