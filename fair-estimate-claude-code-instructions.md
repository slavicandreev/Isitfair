# Fair Estimate — Claude Code Implementation Instructions

This document provides step-by-step implementation instructions for building the Fair Estimate MVP. Reference the architecture document (`fair-estimate-architecture.md`) and requirements document (`fair-estimate-requirements-1.md`) for full context on design decisions.

---

## 1. Project Setup

### Initialize the Project

```bash
npx create-next-app@latest fair-estimate --typescript --tailwind --app --src-dir
cd fair-estimate
npm install @google/generative-ai @anthropic-ai/sdk openai @supabase/supabase-js sharp
npm install -D @types/node
```

### Environment Variables

Create `.env.local` at the project root:

```env
# AI Providers
GOOGLE_GEMINI_API_KEY=           # Primary vision model (Gemini 2.5 Flash)
ANTHROPIC_API_KEY=               # Fallback provider — vision + text (Claude Haiku/Sonnet)
OPENAI_API_KEY=                  # Primary text reasoning model (GPT-5 nano)

# Database
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Affiliate Programs
AMAZON_AFFILIATE_TAG=fairestimate-20
AUTOZONE_AFFILIATE_ID=
HOME_DEPOT_AFFILIATE_ID=
```

---

## 2. File Structure

Create this directory structure under `src/`. Every file listed below must be created during implementation.

```
src/
├── app/
│   ├── page.tsx                        # Landing / upload screen
│   ├── layout.tsx                      # Root layout with meta, fonts, global styles
│   ├── results/[id]/page.tsx           # Results display page
│   └── api/
│       ├── quote/
│       │   ├── analyze/route.ts        # POST — main analysis endpoint
│       │   ├── [id]/route.ts           # GET — retrieve saved analysis
│       │   └── [id]/feedback/route.ts  # POST — user feedback
│       └── pricing/
│           └── lookup/route.ts         # GET — manual price lookup
├── components/
│   ├── QuoteCapture.tsx                # Camera + file upload + service type selector
│   ├── ImagePreview.tsx                # Preview with crop/rotate before submission
│   ├── ServiceTypeSelector.tsx         # Single-tap picker for quote category
│   ├── AnalysisLoading.tsx             # Progressive loading messages
│   ├── OverallVerdict.tsx              # Top-level verdict with deal meter
│   ├── DealMeter.tsx                   # Horizontal gradient bar (steal → ripoff)
│   ├── DIYMeter.tsx                    # DIY difficulty indicator
│   ├── DIYOpportunityBanner.tsx        # Collapsible banner for DIY-flagged items
│   ├── DIYOpportunityCard.tsx          # Individual DIY flag card with savings + affiliate links
│   ├── UpsellFlagCard.tsx              # Upsell alert card with explanation
│   ├── LineItemCard.tsx                # Single item with deal meter + DIY meter + upsell badge
│   ├── LineItemList.tsx                # Scrollable list of all line items
│   ├── NegotiationTips.tsx             # AI-generated actionable suggestions
│   ├── ShareCard.tsx                   # Social-shareable summary image
│   └── VehicleInput.tsx                # Optional vehicle details form
├── lib/
│   ├── ai/
│   │   ├── gemini.ts                   # Gemini Flash client
│   │   ├── claude.ts                   # Claude Haiku/Sonnet client
│   │   ├── openai.ts                   # GPT-5 nano client
│   │   └── extract-quote.ts           # Tiered extraction with fallback chain
│   ├── pricing/
│   │   ├── benchmark.ts               # Price comparison engine
│   │   └── pricing-db.ts              # Database query helpers (auto vs home routing)
│   ├── upsell/
│   │   └── detect-upsells.ts          # Upsell detection logic + knowledge base queries
│   ├── diy/
│   │   └── diy-assessment.ts          # DIY scoring, flag logic, knowledge base queries
│   ├── affiliate/
│   │   └── affiliate.ts               # Affiliate link generation (Amazon, AutoZone, Home Depot)
│   ├── normalization/
│   │   └── normalization.ts           # Service name normalization with cache-first lookup
│   ├── orchestrator.ts                # Pipeline orchestrator — calls all stages sequentially
│   ├── image-processing.ts            # sharp-based compression and validation
│   ├── cost-tracker.ts                # AI API cost logging
│   ├── confidence.ts                  # Confidence score calculation
│   └── supabase.ts                    # Supabase client initialization
├── types/
│   └── index.ts                       # All TypeScript interfaces
└── data/
    └── seed/
        ├── labor-rates.json           # BLS regional labor rates
        ├── common-repairs-auto.json   # Pre-loaded auto repair benchmarks
        ├── common-home-services.json  # Pre-loaded HVAC/plumbing/electrical benchmarks
        ├── diy-knowledge.json         # DIY difficulty + part costs (all verticals)
        ├── upsell-knowledge-auto.json # Known auto repair upsell patterns
        ├── upsell-knowledge-home.json # Known home service upsell patterns
        └── cost-of-living-index.json  # Regional adjustment factors by zip prefix
```

---

## 3. TypeScript Interfaces

Create `src/types/index.ts` with all shared type definitions. Every module imports from here.

```typescript
// === EXTRACTION TYPES ===

export type ServiceType =
  | 'auto_repair' | 'hvac' | 'plumbing' | 'electrical'
  | 'roofing' | 'appliance_repair' | 'general_contractor' | 'other';

export type LineItemCategory =
  | 'labor' | 'parts' | 'materials' | 'diagnostic'
  | 'permit_fee' | 'disposal_fee' | 'trip_charge'
  | 'equipment_rental' | 'shop_supplies' | 'tax'
  | 'warranty' | 'other';

export interface LineItem {
  description: string;
  category: LineItemCategory;
  quantity: number;
  unit_price: number | null;
  line_total: number;
  labor_hours: number | null;
  part_number: string | null;
}

export interface QuoteExtraction {
  service_type: ServiceType;
  shop_name: string | null;
  vehicle_info: {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;
  property_info: {
    details: string | null;
    equipment_specs: string | null;
  } | null;
  quote_date: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  warranty_info: string | null;
  confidence_notes: string[];
  confidence_score: number;   // 0.0 - 1.0
  model_used: string;         // which AI model produced this extraction
}

// === NORMALIZED ITEMS ===

export interface NormalizedItem {
  original_description: string;
  normalized_name: string;
  category: LineItemCategory;
  quantity: number;
  unit_price: number | null;
  line_total: number;
  labor_hours: number | null;
  part_number: string | null;
}

// === PRICING TYPES ===

export type DealRating = 'steal' | 'great_deal' | 'fair' | 'above_average' | 'ripoff';
export type DataConfidence = 'high' | 'medium' | 'low';

export interface PriceBenchmark {
  item_description: string;
  quoted_price: number;
  regional_low: number;
  regional_average: number;
  regional_high: number;
  deal_rating: DealRating;
  deal_score: number;           // 0-100
  percent_vs_average: number;
  data_confidence: DataConfidence;
  notes: string | null;
}

// === UPSELL TYPES ===

export type UpsellType = 'likely_upsell' | 'conditional' | 'bundled_markup';

export interface UpsellFlag {
  item_description: string;
  normalized_name: string;
  is_upsell: boolean;
  upsell_type: UpsellType | null;
  upsell_confidence: number;    // 0.0 - 1.0
  reason: string | null;
  when_actually_needed: string | null;
  estimated_fair_value: number | null;
}

// === DIY TYPES ===

export type DIYDifficulty = 'easy' | 'moderate' | 'hard' | 'expert_only' | 'not_diy';

export interface DIYAssessment {
  item_description: string;
  diy_difficulty: DIYDifficulty;
  diy_score: number;            // 0-100 (100 = easiest)
  estimated_diy_time: string;
  tools_required: string[];
  diy_part_cost: number | null;
  shop_vs_diy_savings: number | null;
  diy_flag: boolean;
  diy_flag_reason: string | null;
  video_search_term: string | null;
  safety_warning: string | null;
  affiliate_links: AffiliateLink[];
}

// === AFFILIATE TYPES ===

export type AffiliatePartner = 'amazon' | 'autozone' | 'rockauto' | 'oreilly' | 'advance' | 'homedepot' | 'lowes';

export interface AffiliateLink {
  partner: AffiliatePartner;
  display_name: string;
  url: string;
  estimated_price: number | null;
  in_store_pickup: boolean;
}

// === LINE ITEM ANALYSIS (combined) ===

export interface LineItemAnalysis {
  price_benchmark: PriceBenchmark;
  upsell_flag: UpsellFlag;
  diy_assessment: DIYAssessment;
}

// === FULL ANALYSIS RESULT ===

export interface AnalysisResult {
  id: string;
  extraction: QuoteExtraction;
  line_item_analyses: LineItemAnalysis[];
  overall_verdict: {
    deal_rating: DealRating;
    deal_score: number;
    total_quoted: number;
    estimated_fair_range: { low: number; high: number };
    potential_savings: number | null;
    summary: string;
  };
  upsell_summary: {
    upsell_count: number;
    total_upsell_value: number;
    flagged_items: Array<{
      description: string;
      upsell_type: UpsellType;
      quoted_price: number;
      estimated_fair_value: number | null;
      reason: string;
    }>;
  };
  diy_summary: {
    opportunities_count: number;
    total_diy_savings: number;
    flagged_items: Array<{
      description: string;
      shop_price: number;
      diy_cost: number;
      savings: number;
      difficulty: DIYDifficulty;
      time_estimate: string;
      affiliate_links: AffiliateLink[];
    }>;
    shopping_list_total: number | null;
  };
  negotiation_tips: string[];
  metadata: {
    data_confidence: DataConfidence;
    items_matched: number;
    items_unmatched: number;
    processing_time_ms: number;
    vision_model_used: string;
    fallback_triggered: boolean;
  };
}

// === API REQUEST/RESPONSE ===

export interface AnalyzeRequest {
  image: File;
  zip_code: string;
  service_type: ServiceType;
  vehicle?: { year: number; make: string; model: string };
  property?: { details: string; equipment: string };
}

// === PIPELINE CONTEXT ===

export interface PipelineContext {
  extraction: QuoteExtraction;
  normalized: NormalizedItem[];
  benchmarks: PriceBenchmark[];
  upsells: UpsellFlag[];
  diy: DIYAssessment[];
  affiliates: AffiliateLink[];
}

// === PROCESSED IMAGE ===

export interface ProcessedImage {
  base64: string;
  mimeType: string;
  originalSize: number;
  compressedSize: number;
}

// === COST TRACKING ===

export interface AICallLog {
  model: string;
  provider: 'gemini' | 'anthropic' | 'openai';
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  latency_ms: number;
  timestamp: string;
  quote_id: string;
  step: string;
}
```

---

## 4. Implementation Order

Build in this sequence. Each step produces a testable unit before moving to the next.

### Step 1: Supabase Client + Database Schema

**File: `src/lib/supabase.ts`**

Initialize the Supabase client. Export two clients: one with the anon key for client-side use, one with the service role key for server-side API routes.

```typescript
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**File: `supabase/migrations/001_initial_schema.sql`**

Create all tables defined in the architecture document Section 6 (Database Design). The schema is split into shared, auto-specific, and home-specific tables. Key requirements:

Shared tables:
- `quote_analyses` — top-level record with `user_id` nullable for future auth
- `quote_items` — individual line items linked to quote_analyses
- `price_reports` — crowdsourced raw data, feeds benchmark tables
- `labor_rates` — by service_type, zip_prefix, metro_area
- `normalization_mappings` — caches raw description → normalized name
- `feedback` — user accuracy ratings

Auto-specific tables:
- `auto_service_benchmarks` — keyed on normalized_name + vehicle_make + vehicle_model + year_range + engine_type + drive_type + zip_prefix
- `auto_diy_knowledge` — vehicle-aware difficulty ratings
- `auto_parts_catalog` — part numbers for affiliate matching
- `auto_upsell_knowledge` — known upsell patterns with mileage_threshold_min/max, manufacturer_interval, primary_service_context, reason_template, when_actually_needed

Home-specific tables:
- `home_service_benchmarks` — keyed on normalized_name + service_type + equipment specs + zip_prefix
- `home_diy_knowledge` — equipment-aware difficulty with permit/license flags
- `home_upsell_knowledge` — known upsell patterns with equipment_age_threshold, primary_service_context

All tables use UUID primary keys via `gen_random_uuid()`. All knowledge/benchmark tables include `source` (seed, crowdsourced, ai_estimated) and `updated_at` columns. Enable the `pg_trgm` extension for fuzzy text matching on service names.

**Test:** Verify tables exist by querying Supabase dashboard or running a select on each table.

---

### Step 2: Image Processing

**File: `src/lib/image-processing.ts`**

Use `sharp` to process uploaded images server-side before sending to AI models.

Requirements:
- Accept JPEG, PNG, HEIC, PDF (first page only for PDF)
- Resize to max 1568px on longest side (preserving aspect ratio)
- Compress to target < 2MB
- Output base64-encoded string with MIME type
- Validate file size (reject > 10MB uploads)
- Return a `ProcessedImage` object

```typescript
export async function processImage(raw: File): Promise<ProcessedImage>
```

**Test:** Process a sample image, verify output is base64, under 2MB, and dimensions are correct.

---

### Step 3: AI Vision Extraction

Build three provider-specific clients, then the tiered extraction orchestrator.

**File: `src/lib/ai/gemini.ts`**

Gemini Flash client using `@google/generative-ai` SDK. Sends the base64 image with the extraction system prompt. Returns parsed JSON matching `QuoteExtraction`. Include the `service_type` hint from user selection in the prompt when available (not "Other").

**File: `src/lib/ai/claude.ts`**

Claude client using `@anthropic-ai/sdk`. Supports both Haiku and Sonnet model strings. Same prompt structure, same output schema. Also handles text-only calls for the fallback path (normalization + verdict when primary providers fail).

**File: `src/lib/ai/openai.ts`**

GPT-5 nano client using `openai` SDK. Text-only — used for normalization, verdict, upsell detection, and DIY assessment. Does NOT handle vision.

**File: `src/lib/ai/extract-quote.ts`**

Tiered fallback extraction chain:

```typescript
export async function extractQuote(image: ProcessedImage, serviceTypeHint?: ServiceType): Promise<QuoteExtraction> {
  // 1. Try Gemini Flash (cheapest)
  const geminiResult = await extractWithGemini(image, serviceTypeHint);
  if (geminiResult.confidence_score >= 0.7 && geminiResult.line_items.length > 0) {
    return { ...geminiResult, model_used: 'gemini-2.5-flash' };
  }

  // 2. Fallback to Claude Haiku
  const haikuResult = await extractWithClaude(image, 'claude-haiku-4-5-20251001', serviceTypeHint);
  if (haikuResult.confidence_score >= 0.6 && haikuResult.line_items.length > 0) {
    return { ...haikuResult, model_used: 'claude-haiku-4.5' };
  }

  // 3. Last resort: Claude Sonnet
  const sonnetResult = await extractWithClaude(image, 'claude-sonnet-4-6', serviceTypeHint);
  return { ...sonnetResult, model_used: 'claude-sonnet-4.6' };
}
```

**Extraction prompt:** Use the full prompt from the requirements doc (Section F2). Include the service_type hint: "The user has indicated this is a {service_type} quote." Instruct the model to respond in JSON only.

**Confidence score calculation (`src/lib/confidence.ts`):**
- Start at 1.0
- Subtract 0.3 if zero line items parsed
- Subtract 0.2 if no total found
- Subtract 0.15 if line items don't sum to total (±10%)
- Subtract 0.1 if any prices are non-numeric
- Subtract 0.2 if document doesn't appear to be a service quote

**Cost tracking:** Every AI call must log to `src/lib/cost-tracker.ts` — model name, provider, token counts, estimated cost, latency, quote_id, and pipeline step name. Store in Supabase `ai_call_logs` table (add this table to the migration).

**Test:** Run against 5+ sample quote images. Verify JSON output parses correctly, confidence scores are reasonable, and fallback triggers when Gemini returns low confidence.

---

### Step 4: Service Normalization

**File: `src/lib/normalization/normalization.ts`**

Normalizes raw service descriptions to canonical names for database lookup. Cache-first approach:

```typescript
export async function normalizeServices(extraction: QuoteExtraction): Promise<NormalizedItem[]> {
  const results: NormalizedItem[] = [];
  for (const item of extraction.line_items) {
    // 1. Check normalization_mappings table for exact match
    const cached = await lookupNormalization(item.description, extraction.service_type);
    if (cached) {
      results.push(buildNormalizedItem(item, cached.normalized_name));
      continue;
    }

    // 2. AI normalization via GPT-5 nano (primary) or Claude Haiku (fallback)
    const normalized = await aiNormalize(item.description, extraction.service_type);

    // 3. Cache the mapping for future lookups
    await cacheNormalization(item.description, normalized, extraction.service_type);

    results.push(buildNormalizedItem(item, normalized));
  }
  return results;
}
```

The AI normalization prompt should instruct the model to return a single canonical name in snake_case format. Batch multiple items into a single AI call when possible to reduce API costs — send all line item descriptions in one prompt, get all normalized names back.

**Test:** Normalize "Replace cabin air filter", "cabin air filter replacement", "Cabin A/C Filter" — all should map to the same canonical name.

---

### Step 5: Pricing Benchmark Engine

**File: `src/lib/pricing/pricing-db.ts`**

Database query helpers that route to the correct domain-specific table based on service_type:

```typescript
export async function lookupBenchmark(
  normalizedName: string,
  serviceType: ServiceType,
  zipCode: string,
  vehicleInfo?: { make: string; model: string; year: number },
  propertyInfo?: { details: string; equipment: string }
): Promise<BenchmarkResult | null>
```

For `auto_repair`: query `auto_service_benchmarks` matching on normalized_name, vehicle_make, vehicle_model, and year within range. Fall back to vehicle_make-only match, then any-vehicle match.

For home services: query `home_service_benchmarks` matching on normalized_name, service_type, and equipment_capacity if available.

Always try exact match → fuzzy match (using `pg_trgm` similarity) → return null for AI fallback.

**File: `src/lib/pricing/benchmark.ts`**

Main benchmarking function:

```typescript
export async function benchmarkPrices(
  items: NormalizedItem[],
  zipCode: string,
  serviceType: ServiceType,
  extraction: QuoteExtraction
): Promise<PriceBenchmark[]>
```

For each item:
1. Query local database via `pricing-db.ts`
2. If found with sample_size >= 5 → use database pricing, confidence = "high"
3. If found with sample_size < 5 → blend with AI estimate, confidence = "medium"
4. If not found → AI estimation via GPT-5 nano, confidence = "low"
5. Cache AI responses in the appropriate benchmark table with source = "ai_estimated"

AI pricing prompt: "Given the following service line item, provide typical pricing for the specified area. Service type: {type}. Item: {name}. Location: {zip_code}. Vehicle/Property: {details}. Respond in JSON: { regional_low, regional_average, regional_high, typical_labor_hours, typical_labor_rate, notes }"

**Deal score calculation:**
- \> 25% below average → deal_score 90-100 (steal)
- 10-25% below → deal_score 70-89 (great_deal)
- Within ±10% → deal_score 45-69 (fair)
- 10-30% above → deal_score 20-44 (above_average)
- \> 30% above → deal_score 0-19 (ripoff)

**Test:** Benchmark "brake_pad_replacement_front" for a 2019 Toyota Camry in 75024. Verify deal_score and rating are reasonable.

---

### Step 6: Upsell Detection

**File: `src/lib/upsell/detect-upsells.ts`**

```typescript
export async function detectUpsells(
  items: NormalizedItem[],
  extraction: QuoteExtraction
): Promise<UpsellFlag[]>
```

Detection flow for each line item:
1. Query the upsell knowledge base (`auto_upsell_knowledge` or `home_upsell_knowledge` based on service_type)
2. If a match is found, evaluate context:
   - For auto: check vehicle mileage (from extraction) against mileage_threshold_min/max
   - For home: check equipment age against equipment_age_threshold
   - Check if the primary service on the quote matches primary_service_context
3. If no knowledge base match, include the item in a batch AI prompt for contextual upsell detection
4. Return UpsellFlag for each item

Upsell classifications:
- `likely_upsell` — almost never needed in this context
- `conditional` — legitimate at certain intervals but suspicious here
- `bundled_markup` — real service but priced far above standalone cost

The AI prompt for upsell detection should be batched with the normalization/verdict step to minimize API calls. Add to the GPT-5 nano verdict prompt: "For each line item, also assess whether it appears to be an upsell or add-on that may not be necessary. Consider the primary service, vehicle mileage, and typical manufacturer recommendations."

**Seed data files:**

`src/data/seed/upsell-knowledge-auto.json` — pre-load with common auto repair upsells:
- Engine flush / oil system flush (rarely needed before 75k miles, most manufacturers don't recommend)
- Fuel injector cleaning / fuel system service (rarely needed on modern cars with quality gas)
- Coolant flush (most manufacturers say 100k+, shops push at 30k)
- Transmission flush (many manufacturers say lifetime fluid, shops push at 30-60k)
- Nitrogen tire fill (no meaningful benefit over regular air for most drivers)
- BG products / additive packages (third-party chemical treatments, rarely necessary)
- Cabin air filter bundled at 3x retail with oil change
- Alignment added to brake job (not required unless pulling or uneven wear)
- Serpentine belt replacement on vehicles under 60k miles (typically 60-100k)

`src/data/seed/upsell-knowledge-home.json` — pre-load with common home service upsells:
- UV light / air purifier add-on with AC install
- Duct cleaning bundled with every HVAC service call
- Water softener pitched during basic plumbing repair
- Whole-home surge protector added to single outlet repair
- Annual maintenance plan sold at point of one-time repair
- Condensate line treatment packages with AC tune-up
- Unnecessary ductwork modifications with equipment replacement

**Test:** Submit a quote containing "Engine Flush" on a 25k-mile vehicle alongside an oil change. Verify it flags as `likely_upsell` with an appropriate reason.

---

### Step 7: DIY Assessment

**File: `src/lib/diy/diy-assessment.ts`**

```typescript
export async function assessDIY(
  items: NormalizedItem[],
  benchmarks: PriceBenchmark[],
  extraction: QuoteExtraction
): Promise<DIYAssessment[]>
```

For each item:
1. Query DIY knowledge base (`auto_diy_knowledge` or `home_diy_knowledge`)
2. If found, use stored difficulty, time estimate, tools, part costs
3. If not found, include in batch AI prompt for DIY assessment
4. Apply DIY flag logic: flag = true if BOTH conditions met:
   - difficulty is "easy" or "moderate"
   - AND (quoted_price > 3x diy_part_cost OR savings exceed $50)

The AI DIY prompt (from requirements Section F3) should assess:
- diy_difficulty (easy/moderate/hard/expert_only/not_diy)
- estimated_diy_time
- tools_required
- diy_part_cost
- video_search_term (specific to vehicle/equipment)
- safety_warning for electrical, gas, or structural work

CRITICAL SAFETY RULE: Always rate as "not_diy" for gas lines, main electrical panels, sewer lines, structural changes, or refrigerant handling — regardless of technical difficulty.

**Seed data:** Use the detailed DIY tables from the requirements doc (Section F3) covering auto repair, HVAC, plumbing, electrical, and appliance repair with difficulty ratings, time estimates, and part cost ranges.

**Test:** Assess "cabin_air_filter_replacement" for a 2019 Camry quoted at $100. Should flag as DIY (easy, 5 min, ~$12 part, $88 savings).

---

### Step 8: Affiliate Link Generation

**File: `src/lib/affiliate/affiliate.ts`**

```typescript
export async function generateAffiliateLinks(
  diyAssessments: DIYAssessment[],
  extraction: QuoteExtraction
): Promise<AffiliateLink[]>
```

Generate affiliate links only for items where `diy_flag === true`.

Routing by service_type:
- `auto_repair` → Amazon + AutoZone links
- `hvac | plumbing | electrical | appliance_repair` → Amazon + Home Depot links

MVP approach: construct tagged search URLs rather than exact product matches:
- Amazon: `https://www.amazon.com/s?k={search_query}&tag={AMAZON_AFFILIATE_TAG}`
- AutoZone: use affiliate deep link to search results
- Home Depot: use affiliate deep link to search results

Build the search query from: `{vehicle_year} {vehicle_make} {vehicle_model} {part_description}` for auto, or `{equipment_brand} {equipment_model} {part_description}` for home.

Attach generated links to the corresponding DIYAssessment objects.

**Test:** Generate links for a 2019 Camry cabin air filter. Verify Amazon URL contains the affiliate tag and a reasonable search query.

---

### Step 9: Pipeline Orchestrator

**File: `src/lib/orchestrator.ts`**

This is the central pipeline that calls all stages sequentially. Every stage is a discrete async function — this is critical for future async migration.

```typescript
import { processImage } from './image-processing';
import { extractQuote } from './ai/extract-quote';
import { normalizeServices } from './normalization/normalization';
import { benchmarkPrices } from './pricing/benchmark';
import { detectUpsells } from './upsell/detect-upsells';
import { assessDIY } from './diy/diy-assessment';
import { generateAffiliateLinks } from './affiliate/affiliate';

export async function analyzeQuote(input: AnalyzeRequest): Promise<AnalysisResult> {
  const startTime = Date.now();

  const image = await processImage(input.image);
  const extraction = await extractQuote(image, input.service_type);
  const normalized = await normalizeServices(extraction);
  const benchmarks = await benchmarkPrices(normalized, input.zip_code, extraction.service_type, extraction);
  const upsells = await detectUpsells(normalized, extraction);
  const diy = await assessDIY(normalized, benchmarks, extraction);
  const affiliates = await generateAffiliateLinks(diy, extraction);

  return assembleResult({
    extraction, normalized, benchmarks, upsells, diy, affiliates,
    processingTimeMs: Date.now() - startTime,
  });
}
```

The `assembleResult` function combines all pipeline outputs into the final `AnalysisResult`:
- Calculates overall_verdict (weighted average of deal_scores, weighted by dollar amount)
- Builds upsell_summary from UpsellFlag items where is_upsell === true
- Builds diy_summary from DIYAssessment items where diy_flag === true
- Generates negotiation_tips using GPT-5 nano with full analysis context
- Sets metadata including processing time, model used, confidence

**Negotiation tips prompt:** Include all line items with their deal ratings, upsell flags, and DIY assessments. Instruct the model to generate 3-5 actionable tips. Examples from requirements:
- If easy DIY item is overpriced: "Ask to remove the [item] charge — this is a 5-minute DIY job."
- If upsell detected: "The [item] is likely an unnecessary add-on. Ask why it's recommended and whether it can be removed."
- If labor rate is high: "Ask if the labor rate is negotiable."
- If total DIY savings > $100: "You could save over $X by doing N items yourself."

**Test:** Run full pipeline end-to-end against a sample quote image. Verify all sections of AnalysisResult are populated.

---

### Step 10: API Route — Analyze

**File: `src/app/api/quote/analyze/route.ts`**

```typescript
export async function POST(request: Request) {
  // 1. Parse multipart form data (image, zip_code, service_type, vehicle?, property?)
  // 2. Validate inputs (image size, required fields)
  // 3. Rate limit check (10/hour/IP)
  // 4. Call orchestrator.analyzeQuote()
  // 5. Store results in quote_analyses + quote_items tables
  // 6. Store anonymized price data in price_reports table (data flywheel)
  // 7. Return AnalysisResult JSON with generated quote ID
}
```

Rate limiting: implement IP-based rate limiting at 10 analyses per hour. For MVP, use an in-memory Map with TTL cleanup. Move to Upstash Redis in Phase 2.

Error handling — return appropriate HTTP status codes and user-friendly messages for:
- 400: Image is not a quote, too blurry, non-English
- 413: Image exceeds 10MB
- 429: Rate limit exceeded
- 500: AI API timeout or failure (include retry guidance)
- 503: All AI providers unavailable

Always attempt to return partial results when possible. If vision extraction succeeds but pricing fails, return the extracted line items with "pricing unavailable" rather than a generic error.

---

### Step 11: API Route — Get Quote + Feedback

**File: `src/app/api/quote/[id]/route.ts`**

```typescript
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Query quote_analyses by ID, return stored AnalysisResult JSON
}
```

**File: `src/app/api/quote/[id]/feedback/route.ts`**

```typescript
export async function POST(request: Request, { params }: { params: { id: string } }) {
  // Accept: { accuracy_rating, actual_price_paid?, went_with_this_shop, notes? }
  // Store in feedback table linked to quote_id
}
```

---

### Step 12: Frontend — Upload Page

**File: `src/app/page.tsx`**

Mobile-first landing page. The upload flow is:
1. Show clear CTA: "Snap a photo of your quote"
2. Camera button (using browser `getUserMedia` API) + "Or upload a file" alternative
3. After capture/upload → show `ImagePreview` component with crop/rotate
4. After preview confirmed → show `ServiceTypeSelector` (single-tap picker with icons)
5. Optional vehicle/property details input based on selected service type
6. "Analyze" button → submit to API → show `AnalysisLoading`
7. On response → redirect to `/results/[id]`

**File: `src/components/QuoteCapture.tsx`**

Camera integration using `navigator.mediaDevices.getUserMedia`. Accept JPEG, PNG, HEIC, PDF via file input. Client-side validation for file type and size (< 10MB).

**File: `src/components/ServiceTypeSelector.tsx`**

Grid of tappable cards with emoji icons:
- 🚗 Auto Repair
- ❄️ HVAC
- 🔧 Plumbing
- ⚡ Electrical
- 🏠 Roofing
- 🔌 Appliance Repair
- 📋 Other

Returns the selected `ServiceType` value.

**File: `src/components/AnalysisLoading.tsx`**

Progressive loading messages displayed on a timer:
- "Reading your quote..." (0-3s)
- "Checking prices in your area..." (3-7s)
- "Looking for DIY opportunities..." (7-10s)
- "Building your report..." (10-15s)

These are cosmetic for MVP (synchronous endpoint). The timer advances regardless of actual pipeline progress.

---

### Step 13: Frontend — Results Page

**File: `src/app/results/[id]/page.tsx`**

Fetches analysis from `GET /api/quote/:id` and renders the full results UI. The layout order matters — it's designed so users get the answer to "is this fair?" in the first second.

**Section order:**

1. **OverallVerdict** — deal_rating, deal_score on the DealMeter, total_quoted, fair range, summary text. If upsells detected, show count badge.

2. **Upsell Alerts** (only if upsell_summary.upsell_count > 0) — prominent orange/yellow banner: "⚠️ {N} potential upsell(s) detected — ${total_upsell_value}". Expandable list of UpsellFlagCard components showing item name, upsell_type badge, reason, when_actually_needed, and estimated_fair_value.

3. **DIY Opportunities Banner** (only if diy_summary.opportunities_count > 0) — collapsible banner: "🚩 {N} DIY opportunities found — save up to ${total_diy_savings}". Expandable list of DIYOpportunityCard components with part costs, affiliate links, and YouTube search terms.

4. **Line Item Cards** — scrollable list. Each `LineItemCard` shows:
   - Item description + quoted price
   - DealMeter (horizontal gradient bar with marker)
   - DIYMeter (icon-based difficulty scale)
   - Upsell badge (if flagged) — orange "Likely Upsell" / yellow "Review This" / red "Overpriced Bundle"
   - Expandable details section

5. **Negotiation Tips** — numbered list of AI-generated tips

6. **Action Buttons** — Save, Share, PDF Export (Share and PDF are Phase 2, but render disabled buttons now)

**File: `src/components/DealMeter.tsx`**

Horizontal gradient bar: green (left) → yellow (center) → red (right). A marker shows where the quoted price falls. Accepts deal_score (0-100) to position the marker. Show the deal_rating label and percent_vs_average below.

**File: `src/components/UpsellFlagCard.tsx`**

Card with orange/yellow left border. Shows:
- "⚠️ POTENTIAL UPSELL" header with upsell_type badge
- Item name and quoted price
- Reason text (from knowledge base or AI)
- "When is this actually needed?" collapsible section
- Estimated fair value if the service were genuinely required

**File: `src/components/DIYOpportunityCard.tsx`**

Card showing savings opportunity:
- "🚩 DIY OPPORTUNITY — Save ${savings}" header
- Item name, shop price, DIY part cost
- Difficulty badge with time estimate
- Affiliate links ("🛒 Buy the part: Amazon — $X, AutoZone — $Y")
- YouTube search link ("📺 Search: {video_search_term}")
- FTC disclosure: "We may earn a small commission — doesn't affect your price"

---

## 5. Seed Data

Populate the seed data files before first deployment. These JSON files are loaded into the database via a seed script.

**Create a seed script: `scripts/seed-database.ts`**

Reads all files from `src/data/seed/` and inserts into the corresponding Supabase tables. Run with `npx tsx scripts/seed-database.ts`.

Priority seed data:
1. `labor-rates.json` — BLS regional labor rates by trade and state
2. `diy-knowledge.json` — all DIY tables from requirements doc Section F3 (auto, HVAC, plumbing, electrical, appliance)
3. `upsell-knowledge-auto.json` — auto repair upsell patterns listed in Step 6 above
4. `upsell-knowledge-home.json` — home service upsell patterns listed in Step 6 above
5. `common-repairs-auto.json` — top 30 most common auto repairs with regional price ranges
6. `common-home-services.json` — top 20 most common home services with price ranges
7. `cost-of-living-index.json` — regional adjustment factors by 3-digit zip prefix

---

## 6. AI Prompt Optimization

### Batch AI Calls to Reduce Cost

The normalization, verdict, upsell detection, and DIY assessment can all be handled in a SINGLE GPT-5 nano call per analysis. Structure the prompt to return a combined JSON response:

```
Given the following extracted line items from a {service_type} quote:

{line_items_json}

Vehicle/Property: {details}
Location: {zip_code}

For each line item, return JSON with:
1. normalized_name: canonical snake_case service name
2. pricing: { regional_low, regional_average, regional_high } — typical price for this area
3. upsell_assessment: { is_upsell, upsell_type, confidence, reason, when_actually_needed }
4. diy_assessment: { difficulty, time_estimate, tools_required, part_cost, safety_warning }
5. negotiation_tip: one specific tip for this item if applicable

Also return:
- overall_summary: one-sentence verdict
- negotiation_tips: 3-5 actionable tips considering all items together

Respond in JSON only.
```

This collapses Steps 4, 5, 6, and 7 of the pipeline into a single AI call for items not found in the database, dramatically reducing per-analysis cost.

### Prompt Caching

Both Anthropic and Google offer prompt caching discounts. Cache the system prompt and few-shot examples since they're identical across all analyses. The system prompt is ~500 tokens — caching gives 90% discount on repeated input tokens.

---

## 7. Data Flywheel

Every analysis enriches the pricing database regardless of which pricing path was used:

1. After analysis completes, write each line item to `price_reports` with:
   - normalized_name, service_type, price, labor_hours, zip_code
   - vehicle_class or equipment_class as applicable
2. Do NOT immediately update benchmark tables — raw price reports may include overpriced quotes
3. A scheduled job (Phase 2) aggregates validated price reports into benchmarks when sample_size reaches threshold (n >= 5)
4. User feedback (accuracy_rating = "accurate") marks a price report as validated

---

## 8. Error Handling

Handle these error states with user-friendly messages, not generic errors:

| Error | Detection | User Message |
|-------|-----------|--------------|
| Not a quote | AI returns 0 line items or classifies as non-quote | "This doesn't look like a service quote. Try uploading a repair estimate or invoice." |
| Too blurry | AI confidence < 0.3 | "We couldn't read this image clearly. Try taking a new photo with better lighting." |
| Non-English | AI detects non-English text | "We currently only support English-language quotes." |
| AI timeout | API call exceeds 30s | "Analysis is taking longer than expected. Please try again." |
| Rate limited | 10/hour/IP exceeded | "You've reached the analysis limit. Try again in {minutes} minutes." |
| Partial failure | Vision succeeds but pricing fails | Show extracted line items with "Pricing unavailable — try again" per item |

Always prefer partial results over complete failure.

---

## 9. Mobile-First Design Guidelines

The primary use case is someone standing in a shop on their phone. Design accordingly:

- Touch targets minimum 44x44px
- Service type selector cards large enough to tap without misfire
- Results page scrolls vertically — no horizontal scrolling
- DealMeter must be readable on a 375px-wide screen
- Affiliate link buttons must be large and clearly tappable
- Loading states must feel fast — avoid spinners, use progressive text messages
- Camera viewfinder should fill most of the screen
- All text at minimum 16px to avoid iOS zoom on input focus

---

## 10. Deployment

Deploy to Vercel:

```bash
vercel
```

Configure environment variables in Vercel dashboard (same as `.env.local`).

Set the Vercel function timeout to 30 seconds for the analyze endpoint (default is 10s, which is not enough for the full pipeline).

```javascript
// next.config.js
module.exports = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};
```

---

## 11. Post-MVP Tracking

Log these metrics from day one for Phase 2 decisions:

- p50/p95 response time for full analysis pipeline
- Gemini → Haiku fallback rate (target: < 10%)
- Haiku → Sonnet fallback rate (target: < 2%)
- AI cost per analysis (target: < $0.005)
- Upsell detection rate (what % of quotes have at least one upsell flagged)
- DIY opportunity rate (target: ~30%)
- Affiliate link click-through rate
- User feedback submission rate
- Accuracy rating distribution (accurate / too_high / too_low)
