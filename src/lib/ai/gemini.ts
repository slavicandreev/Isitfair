import { GoogleGenerativeAI } from '@google/generative-ai';
import { ProcessedImage, QuoteExtraction, ServiceType } from '@/types';
import { calculateConfidenceScore } from '../confidence';
import { logAICall, estimateCost } from '../cost-tracker';

let _genAI: GoogleGenerativeAI | null = null;

function getGenAI(): GoogleGenerativeAI {
  if (!_genAI) {
    _genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY || '');
  }
  return _genAI;
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

export async function extractWithGemini(
  image: ProcessedImage,
  serviceTypeHint?: ServiceType,
  quoteId: string = 'unknown'
): Promise<QuoteExtraction> {
  const startTime = Date.now();
  const model = getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });

  const prompt = serviceTypeHint && serviceTypeHint !== 'other'
    ? `${EXTRACTION_SYSTEM_PROMPT}\n\nNote: The user has indicated this is a ${serviceTypeHint.replace('_', ' ')} quote.`
    : EXTRACTION_SYSTEM_PROMPT;

  const imagePart = {
    inlineData: {
      data: image.base64,
      mimeType: image.mimeType,
    },
  };

  const result = await model.generateContent([prompt, imagePart]);
  const response = await result.response;
  const text = response.text();

  const latency = Date.now() - startTime;

  // Extract JSON from response
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Gemini returned non-JSON response');
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
    model_used: 'gemini-2.0-flash',
  };

  // Log AI call
  const usageMetadata = response.usageMetadata;
  const inputTokens = usageMetadata?.promptTokenCount || 500;
  const outputTokens = usageMetadata?.candidatesTokenCount || 200;

  await logAICall({
    model: 'gemini-2.0-flash',
    provider: 'gemini',
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    estimated_cost_usd: estimateCost('gemini-2.5-flash', inputTokens, outputTokens),
    latency_ms: latency,
    timestamp: new Date().toISOString(),
    quote_id: quoteId,
    step: 'vision_extraction',
  });

  return extraction;
}
