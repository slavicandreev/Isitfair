import { v4 as uuidv4 } from 'uuid';
import { processImage } from './image-processing';
import { extractQuote } from './ai/extract-quote';
import { normalizeServices } from './normalization/normalization';
import { benchmarkPrices } from './pricing/benchmark';
import { detectUpsells } from './upsell/detect-upsells';
import { assessDIY } from './diy/diy-assessment';
import { generateAffiliateLinks } from './affiliate/affiliate';
import { openAITextCall } from './ai/openai';
import { claudeTextCall } from './ai/claude';
import {
  AnalysisResult,
  ServiceType,
  QuoteExtraction,
  NormalizedItem,
  PriceBenchmark,
  UpsellFlag,
  DIYAssessment,
  AffiliateLink,
  DealRating,
  DataConfidence,
  LineItemAnalysis,
} from '@/types';

interface AssembleInput {
  extraction: QuoteExtraction;
  normalized: NormalizedItem[];
  benchmarks: PriceBenchmark[];
  upsells: UpsellFlag[];
  diy: DIYAssessment[];
  affiliates: AffiliateLink[];
  processingTimeMs: number;
  quoteId: string;
}

async function generateNegotiationTips(
  extraction: QuoteExtraction,
  benchmarks: PriceBenchmark[],
  upsells: UpsellFlag[],
  diy: DIYAssessment[],
  quoteId: string
): Promise<string[]> {
  const systemPrompt = `You are an expert negotiator helping consumers get fair prices for services. Generate specific, actionable negotiation tips based on the analysis.

Generate 3-5 tips. Be specific and include dollar amounts where relevant. Respond with JSON only:
{ "tips": ["tip1", "tip2", "tip3"] }`;

  const upsellItems = upsells.filter((u) => u.is_upsell);
  const diyItems = diy.filter((d) => d.diy_flag);
  const overpriced = benchmarks.filter((b) => b.deal_rating === 'above_average' || b.deal_rating === 'ripoff');
  const totalDIYSavings = diyItems.reduce((sum, d) => sum + (d.shop_vs_diy_savings || 0), 0);

  const userPrompt = `Service type: ${extraction.service_type}
Total quoted: $${extraction.total || 0}

Overpriced items (${overpriced.length}):
${overpriced.map((b) => `- ${b.item_description}: $${b.quoted_price} (${b.percent_vs_average}% above average)`).join('\n')}

Potential upsells (${upsellItems.length}):
${upsellItems.map((u) => `- ${u.item_description}: ${u.reason}`).join('\n')}

DIY opportunities (${diyItems.length}), potential savings: $${Math.round(totalDIYSavings)}:
${diyItems.map((d) => `- ${d.item_description}: save $${Math.round(d.shop_vs_diy_savings || 0)}`).join('\n')}

Generate specific negotiation tips.`;

  try {
    const result = await openAITextCall(systemPrompt, userPrompt, quoteId, 'negotiation_tips');
    const parsed = JSON.parse(result);
    return parsed.tips || [];
  } catch {
    try {
      const result = await claudeTextCall(systemPrompt, userPrompt, 'claude-haiku-4-5-20251001', quoteId, 'negotiation_tips');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.tips || [];
      }
    } catch {}
    return [
      'Ask for an itemized breakdown of all charges before authorizing work.',
      'Get a second opinion from another shop if the total seems high.',
      'Ask which items are mandatory vs optional to complete the primary repair.',
    ];
  }
}

function calculateOverallVerdict(
  extraction: QuoteExtraction,
  benchmarks: PriceBenchmark[]
): {
  deal_rating: DealRating;
  deal_score: number;
  total_quoted: number;
  estimated_fair_range: { low: number; high: number };
  potential_savings: number | null;
  summary: string;
} {
  const total = extraction.total || extraction.line_items.reduce((s, i) => s + i.line_total, 0);

  if (benchmarks.length === 0) {
    return {
      deal_rating: 'fair',
      deal_score: 50,
      total_quoted: total,
      estimated_fair_range: { low: total * 0.8, high: total * 1.2 },
      potential_savings: null,
      summary: 'Unable to benchmark prices. Consider getting a second quote.',
    };
  }

  // Weighted average by dollar amount
  let totalWeight = 0;
  let weightedScore = 0;
  let fairLow = 0;
  let fairHigh = 0;

  for (const b of benchmarks) {
    const weight = b.quoted_price;
    totalWeight += weight;
    weightedScore += b.deal_score * weight;
    fairLow += b.regional_low;
    fairHigh += b.regional_high;
  }

  const avgScore = totalWeight > 0 ? weightedScore / totalWeight : 50;

  let dealRating: DealRating;
  if (avgScore >= 90) dealRating = 'steal';
  else if (avgScore >= 70) dealRating = 'great_deal';
  else if (avgScore >= 45) dealRating = 'fair';
  else if (avgScore >= 20) dealRating = 'above_average';
  else dealRating = 'ripoff';

  const potentialSavings = total > fairHigh ? total - fairHigh : null;

  const summaryMap: Record<DealRating, string> = {
    steal: 'This is an excellent deal — well below market rates!',
    great_deal: 'This quote is better than most — below average market rates.',
    fair: 'This quote is within the normal range for your area.',
    above_average: 'This quote is higher than typical market rates. Consider negotiating.',
    ripoff: 'This quote is significantly above market rates. Get a second opinion.',
  };

  return {
    deal_rating: dealRating,
    deal_score: Math.round(avgScore),
    total_quoted: total,
    estimated_fair_range: { low: Math.round(fairLow), high: Math.round(fairHigh) },
    potential_savings: potentialSavings !== null ? Math.round(potentialSavings) : null,
    summary: summaryMap[dealRating],
  };
}

function assembleResult(input: AssembleInput): AnalysisResult {
  const { extraction, normalized, benchmarks, upsells, diy, affiliates, processingTimeMs, quoteId } = input;

  // Build line item analyses
  const lineItemAnalyses: LineItemAnalysis[] = normalized.map((item, i) => ({
    price_benchmark: benchmarks[i] || {
      item_description: item.original_description,
      quoted_price: item.line_total,
      regional_low: 0,
      regional_average: 0,
      regional_high: 0,
      deal_rating: 'fair' as DealRating,
      deal_score: 50,
      percent_vs_average: 0,
      data_confidence: 'low' as DataConfidence,
      notes: null,
    },
    upsell_flag: upsells[i] || {
      item_description: item.original_description,
      normalized_name: item.normalized_name,
      is_upsell: false,
      upsell_type: null,
      upsell_confidence: 0,
      reason: null,
      when_actually_needed: null,
      estimated_fair_value: null,
    },
    diy_assessment: diy[i] || {
      item_description: item.original_description,
      diy_difficulty: 'not_diy',
      diy_score: 0,
      estimated_diy_time: 'N/A',
      tools_required: [],
      diy_part_cost: null,
      shop_vs_diy_savings: null,
      diy_flag: false,
      diy_flag_reason: null,
      video_search_term: null,
      safety_warning: null,
      affiliate_links: [],
    },
  }));

  // Build upsell summary
  const upsellItems = upsells.filter((u) => u.is_upsell);
  const upsellSummary = {
    upsell_count: upsellItems.length,
    total_upsell_value: upsellItems.reduce((sum, u) => {
      const item = normalized.find((n) => n.normalized_name === u.normalized_name);
      return sum + (item?.line_total || 0);
    }, 0),
    flagged_items: upsellItems.map((u) => {
      const item = normalized.find((n) => n.normalized_name === u.normalized_name);
      return {
        description: u.item_description,
        upsell_type: u.upsell_type!,
        quoted_price: item?.line_total || 0,
        estimated_fair_value: u.estimated_fair_value,
        reason: u.reason || 'Possible unnecessary service',
      };
    }),
  };

  // Build DIY summary
  const diyItems = diy.filter((d) => d.diy_flag);
  const totalDIYSavings = diyItems.reduce((sum, d) => sum + (d.shop_vs_diy_savings || 0), 0);
  const totalPartsCost = diyItems.reduce((sum, d) => sum + (d.diy_part_cost || 0), 0);

  const diySummary = {
    opportunities_count: diyItems.length,
    total_diy_savings: Math.round(totalDIYSavings),
    flagged_items: diyItems.map((d) => {
      const item = normalized.find((n) => n.original_description === d.item_description);
      return {
        description: d.item_description,
        shop_price: item?.line_total || 0,
        diy_cost: d.diy_part_cost || 0,
        savings: d.shop_vs_diy_savings || 0,
        difficulty: d.diy_difficulty,
        time_estimate: d.estimated_diy_time,
        affiliate_links: d.affiliate_links,
      };
    }),
    shopping_list_total: totalPartsCost > 0 ? Math.round(totalPartsCost) : null,
  };

  // Calculate overall verdict
  const overallVerdict = calculateOverallVerdict(extraction, benchmarks);

  // Count matched items
  const matchedItems = benchmarks.filter((b) => b.data_confidence !== 'low').length;
  const unmatchedItems = benchmarks.filter((b) => b.data_confidence === 'low').length;
  const overallConfidence: DataConfidence =
    matchedItems > unmatchedItems ? 'medium' : unmatchedItems === benchmarks.length ? 'low' : 'medium';

  return {
    id: quoteId,
    extraction,
    line_item_analyses: lineItemAnalyses,
    overall_verdict: overallVerdict,
    upsell_summary: upsellSummary,
    diy_summary: diySummary,
    negotiation_tips: [], // Filled in by analyzeQuote
    metadata: {
      data_confidence: overallConfidence,
      items_matched: matchedItems,
      items_unmatched: unmatchedItems,
      processing_time_ms: processingTimeMs,
      vision_model_used: extraction.model_used,
      fallback_triggered: extraction.model_used !== 'gemini-2.0-flash-exp',
    },
  };
}

export interface OrchestratorInput {
  imageBuffer: Buffer;
  imageMimeType: string;
  imageSize: number;
  zip_code: string;
  service_type: ServiceType;
  vehicle?: { year: number; make: string; model: string };
  property?: { details: string; equipment: string };
}

export async function analyzeQuote(input: OrchestratorInput): Promise<AnalysisResult> {
  const startTime = Date.now();
  const quoteId = uuidv4();

  // Convert to ProcessedImage format (image already processed at API layer)
  const processedImage = {
    base64: input.imageBuffer.toString('base64'),
    mimeType: input.imageMimeType,
    originalSize: input.imageSize,
    compressedSize: input.imageBuffer.length,
  };

  const extraction = await extractQuote(processedImage, input.service_type, quoteId);

  // Override vehicle/property info if provided by user
  if (input.vehicle && extraction.vehicle_info) {
    extraction.vehicle_info = {
      year: input.vehicle.year,
      make: input.vehicle.make,
      model: input.vehicle.model,
    };
  }

  const normalized = await normalizeServices(extraction, quoteId);
  const benchmarks = await benchmarkPrices(normalized, input.zip_code, input.service_type, extraction, quoteId);
  const upsells = await detectUpsells(normalized, extraction, quoteId);
  const diy = await assessDIY(normalized, benchmarks, extraction, quoteId);
  const affiliates = await generateAffiliateLinks(diy, extraction);

  const result = assembleResult({
    extraction,
    normalized,
    benchmarks,
    upsells,
    diy,
    affiliates,
    processingTimeMs: Date.now() - startTime,
    quoteId,
  });

  // Generate negotiation tips
  result.negotiation_tips = await generateNegotiationTips(
    extraction,
    benchmarks,
    upsells,
    diy,
    quoteId
  );

  return result;
}
