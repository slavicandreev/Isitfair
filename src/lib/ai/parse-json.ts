/**
 * Robustly extract and parse JSON from a model response.
 * Handles: markdown code fences, leading/trailing text, nested objects.
 */
export function parseJSONFromText(text: string): Record<string, unknown> {
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const stripped = text
    .replace(/^```(?:json)?\s*/m, '')
    .replace(/\s*```\s*$/m, '')
    .trim();

  // Try direct parse first (model obeyed "JSON only" instruction)
  try {
    const parsed = JSON.parse(stripped);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  } catch {}

  // Fall back to extracting the outermost JSON object
  const match = stripped.match(/\{[\s\S]*\}/);
  if (match) {
    const parsed = JSON.parse(match[0]);
    if (typeof parsed === 'object' && parsed !== null) return parsed as Record<string, unknown>;
  }

  throw new Error('No valid JSON object found in model response');
}

/**
 * Validate that a parsed extraction has the minimum required fields.
 * Coerces obviously wrong types rather than throwing.
 */
export function validateExtraction(raw: Record<string, unknown>): void {
  if (!Array.isArray(raw.line_items)) {
    raw.line_items = [];
  }

  // Ensure each line_item has numeric totals
  (raw.line_items as Record<string, unknown>[]).forEach((item) => {
    if (typeof item.line_total !== 'number') {
      item.line_total = parseFloat(String(item.line_total)) || 0;
    }
    if (typeof item.quantity !== 'number') {
      item.quantity = parseFloat(String(item.quantity)) || 1;
    }
  });

  if (raw.total !== null && typeof raw.total !== 'number') {
    raw.total = parseFloat(String(raw.total)) || null;
  }
}
