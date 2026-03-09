import { ProcessedImage, QuoteExtraction, ServiceType } from '@/types';
import { extractWithGemini } from './gemini';
import { extractWithClaude } from './claude';

export async function extractQuote(
  image: ProcessedImage,
  serviceTypeHint?: ServiceType,
  quoteId: string = 'unknown'
): Promise<QuoteExtraction> {
  // 1. Try Gemini Flash (cheapest)
  try {
    const geminiResult = await extractWithGemini(image, serviceTypeHint, quoteId);
    if (geminiResult.confidence_score >= 0.7 && geminiResult.line_items.length > 0) {
      return { ...geminiResult, model_used: 'gemini-2.0-flash' };
    }
    console.log('Gemini confidence too low, falling back to Claude Haiku');
  } catch (error) {
    console.error('Gemini extraction failed:', error);
  }

  // 2. Fallback to Claude Haiku
  try {
    const haikuResult = await extractWithClaude(image, 'claude-haiku-4-5-20251001', serviceTypeHint, quoteId);
    if (haikuResult.confidence_score >= 0.6 && haikuResult.line_items.length > 0) {
      return { ...haikuResult, model_used: 'claude-haiku-4-5-20251001' };
    }
    console.log('Claude Haiku confidence too low, falling back to Claude Sonnet');
  } catch (error) {
    console.error('Claude Haiku extraction failed:', error);
  }

  // 3. Last resort: Claude Sonnet
  const sonnetResult = await extractWithClaude(image, 'claude-sonnet-4-6', serviceTypeHint, quoteId);
  return { ...sonnetResult, model_used: 'claude-sonnet-4-6' };
}
