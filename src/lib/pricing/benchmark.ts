import { NormalizedItem, PriceBenchmark, DealRating, DataConfidence, ServiceType, QuoteExtraction } from '@/types';
import { lookupBenchmark } from './pricing-db';
import { openAITextCall } from '../ai/openai';
import { claudeTextCall } from '../ai/claude';
import { supabaseAdmin } from '../supabase';

function calculateDealRating(percentVsAverage: number): DealRating {
  if (percentVsAverage < -25) return 'steal';
  if (percentVsAverage < -10) return 'great_deal';
  if (percentVsAverage <= 10) return 'fair';
  if (percentVsAverage <= 30) return 'above_average';
  return 'ripoff';
}

function calculateDealScore(percentVsAverage: number): number {
  if (percentVsAverage < -25) return Math.min(100, 90 + Math.round((-percentVsAverage - 25) / 5));
  if (percentVsAverage < -10) return Math.round(70 + ((-percentVsAverage - 10) / 15) * 19);
  if (percentVsAverage <= 10) return Math.round(57 - (percentVsAverage / 10) * 12);
  if (percentVsAverage <= 30) return Math.round(44 - ((percentVsAverage - 10) / 20) * 24);
  return Math.max(0, Math.round(19 - ((percentVsAverage - 30) / 20) * 19));
}

async function getAIPricingEstimate(
  item: NormalizedItem,
  serviceType: ServiceType,
  zipCode: string,
  extraction: QuoteExtraction,
  quoteId: string
): Promise<{ regional_low: number; regional_average: number; regional_high: number; notes: string }> {
  const systemPrompt = `You are an expert in service pricing for auto repair and home services. Provide realistic regional pricing estimates based on market data.
Respond with JSON only: { "regional_low": number, "regional_average": number, "regional_high": number, "notes": "string" }`;

  const vehicleDetails = extraction.vehicle_info
    ? `${extraction.vehicle_info.year} ${extraction.vehicle_info.make} ${extraction.vehicle_info.model}`
    : null;
  const propertyDetails = extraction.property_info?.details || null;

  const userPrompt = `Provide typical pricing for this service:
Service type: ${serviceType}
Service: ${item.normalized_name.replace(/_/g, ' ')}
Location: ${zipCode}
${vehicleDetails ? `Vehicle: ${vehicleDetails}` : ''}
${propertyDetails ? `Property: ${propertyDetails}` : ''}
Quantity: ${item.quantity}

Return regional pricing ranges (low, average, high) in USD for this specific service.`;

  try {
    const result = await openAITextCall(systemPrompt, userPrompt, quoteId, 'pricing_estimation');
    return JSON.parse(result);
  } catch {
    try {
      const result = await claudeTextCall(systemPrompt, userPrompt, 'claude-haiku-4-5-20251001', quoteId, 'pricing_estimation');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) return JSON.parse(jsonMatch[0]);
    } catch {}

    // Fallback: estimate based on quoted price
    const price = item.line_total;
    return {
      regional_low: price * 0.75,
      regional_average: price * 0.9,
      regional_high: price * 1.25,
      notes: 'Estimated - unable to retrieve market data',
    };
  }
}

async function cacheAIPricing(
  normalizedName: string,
  serviceType: ServiceType,
  pricing: { regional_low: number; regional_average: number; regional_high: number },
  zipCode: string
): Promise<void> {
  try {
    const table = serviceType === 'auto_repair' ? 'auto_service_benchmarks' : 'home_service_benchmarks';
    await supabaseAdmin.from(table).upsert({
      normalized_name: normalizedName,
      service_type: serviceType,
      service_name: normalizedName.replace(/_/g, ' '),
      zip_prefix: zipCode.substring(0, 3),
      low_total: pricing.regional_low,
      avg_total: pricing.regional_average,
      high_total: pricing.regional_high,
      sample_size: 0,
      source: 'ai_estimated',
      updated_at: new Date().toISOString(),
    });
  } catch {
    console.error('Failed to cache AI pricing estimate');
  }
}

export async function benchmarkPrices(
  items: NormalizedItem[],
  zipCode: string,
  serviceType: ServiceType,
  extraction: QuoteExtraction,
  quoteId: string = 'unknown'
): Promise<PriceBenchmark[]> {
  const benchmarks: PriceBenchmark[] = [];

  const vehicleInfo = extraction.vehicle_info?.make && extraction.vehicle_info?.model && extraction.vehicle_info?.year
    ? {
        make: extraction.vehicle_info.make,
        model: extraction.vehicle_info.model,
        year: extraction.vehicle_info.year,
      }
    : undefined;

  const propertyInfo = extraction.property_info?.details
    ? {
        details: extraction.property_info.details,
        equipment: extraction.property_info.equipment_specs || '',
      }
    : undefined;

  for (const item of items) {
    // Skip tax and fee items from benchmarking
    if (['tax', 'permit_fee', 'disposal_fee'].includes(item.category)) {
      benchmarks.push({
        item_description: item.original_description,
        quoted_price: item.line_total,
        regional_low: item.line_total * 0.9,
        regional_average: item.line_total,
        regional_high: item.line_total * 1.1,
        deal_rating: 'fair',
        deal_score: 50,
        percent_vs_average: 0,
        data_confidence: 'low',
        notes: 'Standard fee - not benchmarked',
      });
      continue;
    }

    let pricing: { regional_low: number; regional_average: number; regional_high: number; notes?: string };
    let dataConfidence: DataConfidence;

    // Query database
    const dbResult = await lookupBenchmark(
      item.normalized_name,
      serviceType,
      zipCode,
      vehicleInfo,
      propertyInfo
    );

    if (dbResult && dbResult.sample_size >= 5) {
      pricing = dbResult;
      dataConfidence = 'high';
    } else if (dbResult && dbResult.sample_size > 0) {
      // Blend database result with AI estimate
      const aiEstimate = await getAIPricingEstimate(item, serviceType, zipCode, extraction, quoteId);
      pricing = {
        regional_low: (dbResult.regional_low + aiEstimate.regional_low) / 2,
        regional_average: (dbResult.regional_average + aiEstimate.regional_average) / 2,
        regional_high: (dbResult.regional_high + aiEstimate.regional_high) / 2,
        notes: aiEstimate.notes,
      };
      dataConfidence = 'medium';
    } else {
      // AI estimation only
      const aiEstimate = await getAIPricingEstimate(item, serviceType, zipCode, extraction, quoteId);
      pricing = aiEstimate;
      dataConfidence = 'low';

      // Cache the AI estimate
      await cacheAIPricing(item.normalized_name, serviceType, aiEstimate, zipCode);
    }

    const quotedPrice = item.line_total;
    const average = pricing.regional_average;
    const percentVsAverage = average > 0 ? ((quotedPrice - average) / average) * 100 : 0;

    benchmarks.push({
      item_description: item.original_description,
      quoted_price: quotedPrice,
      regional_low: pricing.regional_low,
      regional_average: pricing.regional_average,
      regional_high: pricing.regional_high,
      deal_rating: calculateDealRating(percentVsAverage),
      deal_score: calculateDealScore(percentVsAverage),
      percent_vs_average: Math.round(percentVsAverage),
      data_confidence: dataConfidence,
      notes: pricing.notes || null,
    });
  }

  return benchmarks;
}
