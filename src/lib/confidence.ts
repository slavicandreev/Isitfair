import { QuoteExtraction } from '@/types';

export function calculateConfidenceScore(extraction: Partial<QuoteExtraction>): number {
  let score = 1.0;

  // No line items parsed
  if (!extraction.line_items || extraction.line_items.length === 0) {
    score -= 0.3;
  }

  // No total found
  if (extraction.total === null || extraction.total === undefined) {
    score -= 0.2;
  }

  // Line items don't sum to total (±10%)
  if (
    extraction.line_items &&
    extraction.line_items.length > 0 &&
    extraction.total !== null &&
    extraction.total !== undefined
  ) {
    const itemsTotal = extraction.line_items.reduce((sum, item) => sum + (item.line_total || 0), 0);
    const diff = Math.abs(itemsTotal - extraction.total);
    const tolerance = extraction.total * 0.1;
    if (diff > tolerance) {
      score -= 0.15;
    }
  }

  // Any prices are null/non-numeric
  if (extraction.line_items && extraction.line_items.length > 0) {
    const hasNullPrices = extraction.line_items.some(
      (item) => item.line_total === null || item.line_total === undefined || isNaN(item.line_total)
    );
    if (hasNullPrices) {
      score -= 0.1;
    }
  }

  // Document doesn't appear to be a service quote
  if (!extraction.line_items || extraction.line_items.length === 0) {
    if (!extraction.shop_name && !extraction.total) {
      score -= 0.2;
    }
  }

  return Math.max(0, Math.min(1, score));
}
