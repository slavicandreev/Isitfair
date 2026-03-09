import { NormalizedItem, DIYAssessment, DIYDifficulty, PriceBenchmark, QuoteExtraction, ServiceType, AffiliateLink } from '@/types';
import { supabaseAdmin } from '../supabase';
import { openAITextCall } from '../ai/openai';
import { claudeTextCall } from '../ai/claude';

// Services that are NEVER DIY regardless of difficulty
const NON_DIY_SERVICES = [
  'gas_line',
  'main_electrical_panel',
  'sewer_line',
  'structural',
  'refrigerant',
  'asbestos',
  'load_bearing',
];

function isNonDIY(normalizedName: string): boolean {
  return NON_DIY_SERVICES.some((s) => normalizedName.includes(s));
}

function isAutoService(serviceType: ServiceType): boolean {
  return serviceType === 'auto_repair';
}

async function lookupDIYKnowledge(
  normalizedName: string,
  serviceType: ServiceType,
  vehicleInfo?: QuoteExtraction['vehicle_info']
): Promise<Record<string, unknown> | null> {
  const table = isAutoService(serviceType) ? 'auto_diy_knowledge' : 'home_diy_knowledge';

  let query = supabaseAdmin
    .from(table)
    .select('*')
    .eq('normalized_service_name', normalizedName);

  // For auto, try to match vehicle if available
  if (isAutoService(serviceType) && vehicleInfo?.make) {
    const { data: vehicleData } = await query
      .eq('vehicle_make', vehicleInfo.make)
      .limit(1)
      .single();
    if (vehicleData) return vehicleData;
  }

  const { data } = await query.limit(1).single();
  return data || null;
}

async function batchAIDIYAssessment(
  items: NormalizedItem[],
  benchmarks: PriceBenchmark[],
  extraction: QuoteExtraction,
  quoteId: string
): Promise<Record<string, {
  difficulty: DIYDifficulty;
  time_estimate: string;
  tools_required: string[];
  part_cost: number | null;
  safety_warning: string | null;
  video_search_term: string | null;
}>> {
  const systemPrompt = `You are an expert mechanic and home repair specialist. Assess the DIY difficulty of each service.

Difficulty levels:
- easy: Anyone can do it, basic tools, <30 min
- moderate: Some mechanical skill, standard tools, 30min-2hr
- hard: Significant experience needed, specialty tools, 2-4hr
- expert_only: Professional training needed
- not_diy: Requires license/permit or is dangerous

CRITICAL SAFETY RULE: Always rate as "not_diy" for:
- Gas lines or gas appliances
- Main electrical panels or subpanels
- Sewer line work
- Structural changes
- Refrigerant handling (requires EPA 608 certification)

Respond with JSON only:
{
  "items": {
    "item_name": {
      "difficulty": "easy|moderate|hard|expert_only|not_diy",
      "time_estimate": "string (e.g., '15 minutes')",
      "tools_required": ["tool1", "tool2"],
      "part_cost": number or null,
      "safety_warning": "string or null",
      "video_search_term": "string - specific YouTube search for this job"
    }
  }
}`;

  const vehicleDetails = extraction.vehicle_info
    ? `${extraction.vehicle_info.year} ${extraction.vehicle_info.make} ${extraction.vehicle_info.model}`
    : null;

  const itemsWithPrices = items.map((item) => {
    const benchmark = benchmarks.find((b) => b.item_description === item.original_description);
    return `- ${item.normalized_name} (shop price: $${item.line_total})`;
  });

  const userPrompt = `Service type: ${extraction.service_type}
${vehicleDetails ? `Vehicle: ${vehicleDetails}` : ''}
${extraction.property_info?.details ? `Property: ${extraction.property_info.details}` : ''}

Assess DIY difficulty for these services:
${itemsWithPrices.join('\n')}`;

  try {
    const result = await openAITextCall(systemPrompt, userPrompt, quoteId, 'diy_assessment');
    const parsed = JSON.parse(result);
    return parsed.items || {};
  } catch {
    try {
      const result = await claudeTextCall(systemPrompt, userPrompt, 'claude-haiku-4-5-20251001', quoteId, 'diy_assessment');
      const jsonMatch = result.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed.items || {};
      }
    } catch {}
    return {};
  }
}

function shouldFlagDIY(
  difficulty: DIYDifficulty,
  shopPrice: number,
  diyPartCost: number | null
): { flag: boolean; reason: string | null } {
  if (difficulty === 'not_diy' || difficulty === 'expert_only' || difficulty === 'hard') {
    return { flag: false, reason: null };
  }

  if (diyPartCost !== null) {
    const savings = shopPrice - diyPartCost;
    if (savings >= 50 || shopPrice > diyPartCost * 3) {
      return {
        flag: true,
        reason: `Save $${Math.round(savings)} by doing this yourself (${difficulty} difficulty)`,
      };
    }
  }

  return { flag: false, reason: null };
}

export async function assessDIY(
  items: NormalizedItem[],
  benchmarks: PriceBenchmark[],
  extraction: QuoteExtraction,
  quoteId: string = 'unknown'
): Promise<DIYAssessment[]> {
  const assessments: DIYAssessment[] = [];
  const itemsForAI: NormalizedItem[] = [];

  for (const item of items) {
    // CRITICAL SAFETY: Check for non-DIY services
    if (isNonDIY(item.normalized_name)) {
      assessments.push({
        item_description: item.original_description,
        diy_difficulty: 'not_diy',
        diy_score: 0,
        estimated_diy_time: 'N/A',
        tools_required: [],
        diy_part_cost: null,
        shop_vs_diy_savings: null,
        diy_flag: false,
        diy_flag_reason: 'This service requires professional licensing or involves safety hazards.',
        video_search_term: null,
        safety_warning: 'Do not attempt this yourself. Requires professional certification.',
        affiliate_links: [],
      });
      continue;
    }

    // Skip fees and taxes
    if (['tax', 'permit_fee', 'disposal_fee', 'trip_charge'].includes(item.category)) {
      assessments.push({
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
      });
      continue;
    }

    // Check knowledge base
    const knowledge = await lookupDIYKnowledge(
      item.normalized_name,
      extraction.service_type,
      extraction.vehicle_info
    );

    if (knowledge) {
      const difficulty = (knowledge.diy_difficulty as DIYDifficulty) || 'moderate';
      const diyPartCostLow = (knowledge.diy_part_cost_low as number) || null;
      const diyPartCostHigh = (knowledge.diy_part_cost_high as number) || null;
      const avgPartCost = diyPartCostLow !== null && diyPartCostHigh !== null
        ? (diyPartCostLow + diyPartCostHigh) / 2
        : diyPartCostLow || diyPartCostHigh;

      const { flag, reason } = shouldFlagDIY(difficulty, item.line_total, avgPartCost);
      const savings = avgPartCost !== null ? item.line_total - avgPartCost : null;

      const difficultyScoreMap: Record<DIYDifficulty, number> = {
        easy: 90,
        moderate: 65,
        hard: 35,
        expert_only: 10,
        not_diy: 0,
      };

      assessments.push({
        item_description: item.original_description,
        diy_difficulty: difficulty,
        diy_score: difficultyScoreMap[difficulty],
        estimated_diy_time: `${knowledge.estimated_time_minutes} minutes`,
        tools_required: (knowledge.tools_required as string[]) || [],
        diy_part_cost: avgPartCost,
        shop_vs_diy_savings: savings,
        diy_flag: flag,
        diy_flag_reason: reason,
        video_search_term: null, // Generated by AI
        safety_warning: (knowledge.safety_notes as string) || null,
        affiliate_links: [],
      });
    } else {
      itemsForAI.push(item);
      assessments.push({
        item_description: item.original_description,
        diy_difficulty: 'moderate',
        diy_score: 50,
        estimated_diy_time: 'Unknown',
        tools_required: [],
        diy_part_cost: null,
        shop_vs_diy_savings: null,
        diy_flag: false,
        diy_flag_reason: null,
        video_search_term: null,
        safety_warning: null,
        affiliate_links: [],
      });
    }
  }

  // Batch AI assessment for uncached items
  if (itemsForAI.length > 0) {
    const aiResults = await batchAIDIYAssessment(itemsForAI, benchmarks, extraction, quoteId);

    for (const item of itemsForAI) {
      const aiResult = aiResults[item.normalized_name];
      if (aiResult) {
        const difficulty = aiResult.difficulty as DIYDifficulty;
        const { flag, reason } = shouldFlagDIY(difficulty, item.line_total, aiResult.part_cost);
        const savings = aiResult.part_cost !== null ? item.line_total - aiResult.part_cost : null;

        const difficultyScoreMap: Record<DIYDifficulty, number> = {
          easy: 90,
          moderate: 65,
          hard: 35,
          expert_only: 10,
          not_diy: 0,
        };

        const assessmentIndex = assessments.findIndex(
          (a) => a.item_description === item.original_description
        );

        if (assessmentIndex >= 0) {
          assessments[assessmentIndex] = {
            item_description: item.original_description,
            diy_difficulty: difficulty,
            diy_score: difficultyScoreMap[difficulty] || 50,
            estimated_diy_time: aiResult.time_estimate,
            tools_required: aiResult.tools_required,
            diy_part_cost: aiResult.part_cost,
            shop_vs_diy_savings: savings,
            diy_flag: flag,
            diy_flag_reason: reason,
            video_search_term: aiResult.video_search_term,
            safety_warning: aiResult.safety_warning,
            affiliate_links: [],
          };
        }
      }
    }
  }

  return assessments;
}
