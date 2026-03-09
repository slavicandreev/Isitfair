import Anthropic from '@anthropic-ai/sdk';
import { ProcessedImage, QuoteExtraction, ServiceType } from '@/types';
import { calculateConfidenceScore } from '../confidence';
import { logAICall, estimateCost } from '../cost-tracker';

let _anthropic: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!_anthropic) {
    _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _anthropic;
}

const EXTRACTION_SYSTEM_PROMPT = `You are an expert at reading service quotes and invoices. Extract all line items, pricing, and relevant information from the provided image.

Return a JSON object with this exact structure:
{
  "service_type": "auto_repair|hvac|plumbing|electrical|roofing|appliance_repair|general_contractor|other",
  "shop_name": "string or null",
  "vehicle_info": { "year": number|null, "make": string|null, "model": string|null } or null,
  "property_info": { "details": string|null, "equipment_specs": string|null } or null,
  "quote_date": "YYYY-MM-DD or null",
  "line_items": [
    {
      "description": "string",
      "category": "labor|parts|materials|diagnostic|permit_fee|disposal_fee|trip_charge|equipment_rental|shop_supplies|tax|warranty|other",
      "quantity": number,
      "unit_price": number|null,
      "line_total": number,
      "labor_hours": number|null,
      "part_number": string|null
    }
  ],
  "subtotal": number|null,
  "tax": number|null,
  "total": number|null,
  "warranty_info": string|null,
  "confidence_notes": ["array of notes about unclear items"]
}

IMPORTANT:
- Extract ALL line items visible on the quote
- Use exact prices from the document
- If a value is unclear, include a note in confidence_notes
- Respond with JSON ONLY, no markdown formatting`;

export async function extractWithClaude(
  image: ProcessedImage,
  model: string = 'claude-haiku-4-5-20251001',
  serviceTypeHint?: ServiceType,
  quoteId: string = 'unknown'
): Promise<QuoteExtraction> {
  const startTime = Date.now();

  const userPrompt = serviceTypeHint && serviceTypeHint !== 'other'
    ? `The user has indicated this is a ${serviceTypeHint.replace('_', ' ')} quote. Extract all line items and information from this service quote image.`
    : 'Extract all line items and information from this service quote image.';

  const response = await getAnthropic().messages.create({
    model,
    max_tokens: 2000,
    system: EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: image.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: image.base64,
            },
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  });

  const latency = Date.now() - startTime;

  const textContent = response.content.find((c) => c.type === 'text');
  const text = textContent && textContent.type === 'text' ? textContent.text : '';

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Claude returned non-JSON response');
  }

  const parsed = JSON.parse(jsonMatch[0]) as Partial<QuoteExtraction>;
  const confidence_score = calculateConfidenceScore(parsed);

  const extraction: QuoteExtraction = {
    service_type: parsed.service_type || serviceTypeHint || 'other',
    shop_name: parsed.shop_name || null,
    vehicle_info: parsed.vehicle_info || null,
    property_info: parsed.property_info || null,
    quote_date: parsed.quote_date || null,
    line_items: parsed.line_items || [],
    subtotal: parsed.subtotal || null,
    tax: parsed.tax || null,
    total: parsed.total || null,
    warranty_info: parsed.warranty_info || null,
    confidence_notes: parsed.confidence_notes || [],
    confidence_score,
    model_used: model,
  };

  const provider = model.startsWith('claude') ? 'anthropic' : 'anthropic';
  await logAICall({
    model,
    provider,
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    estimated_cost_usd: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
    latency_ms: latency,
    timestamp: new Date().toISOString(),
    quote_id: quoteId,
    step: 'vision_extraction',
  });

  return extraction;
}

export async function claudeTextCall(
  systemPrompt: string,
  userPrompt: string,
  model: string = 'claude-haiku-4-5-20251001',
  quoteId: string = 'unknown',
  step: string = 'text_reasoning'
): Promise<string> {
  const startTime = Date.now();

  const response = await getAnthropic().messages.create({
    model,
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const latency = Date.now() - startTime;

  await logAICall({
    model,
    provider: 'anthropic',
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    estimated_cost_usd: estimateCost(model, response.usage.input_tokens, response.usage.output_tokens),
    latency_ms: latency,
    timestamp: new Date().toISOString(),
    quote_id: quoteId,
    step,
  });

  const textContent = response.content.find((c) => c.type === 'text');
  return textContent && textContent.type === 'text' ? textContent.text : '';
}
