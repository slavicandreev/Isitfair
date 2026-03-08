# Is It a Fair Estimate? — Product Requirements Document

## Project Overview

**App Name:** Is It a Fair Estimate?
**Tagline:** Know before you pay. Snap a photo of any service quote and get an instant fairness verdict.

**Problem:** Consumers receiving quotes from service providers (auto mechanics, plumbers, HVAC techs, electricians, roofers, etc.) have no quick way to verify whether the pricing is fair for their area. 67% of consumers don't trust repair shops and 57% believe they aren't fairly charged. Existing tools like RepairPal require manual lookups by specific repair type — they don't accept real quotes as input.

**Solution:** A mobile-first web app where users photograph or upload a service quote, AI extracts line items and pricing, and the system benchmarks each item against regional fair-price data — returning a verdict in under 30 seconds.

**Target Users:** Consumers standing in a shop or on the phone with a service provider, needing an immediate answer before committing to work.

---

## MVP Scope (Phase 1)

### Core User Flow

1. User opens the app (mobile web, no install required)
2. User snaps a photo of a quote OR uploads a PDF/image
3. App displays a loading state with progress feedback ("Reading your quote...", "Checking prices...", "Building your report...")
4. App shows results:
   - Overall fairness score (e.g., "Fair", "Above Average", "Red Flag")
   - Line-by-line breakdown with each item rated
   - Regional price range for each identifiable service/part
   - Suggested talking points if the quote is high
5. User can save or share the result

### Supported Verticals (All from Day One)

The app is **vertical-agnostic from launch**. Any service quote can be analyzed. The AI model's general knowledge provides directionally accurate pricing for most common services, even without a curated database. Every analysis feeds the proprietary pricing database, building accuracy over time across all categories.

**Primary verticals (highest consumer spend + anxiety):**
- Auto repair (oil changes, brakes, transmission, diagnostics, etc.)
- HVAC (AC install/repair, furnace replacement, duct work, tune-ups)
- Plumbing (water heater, pipe repair, drain cleaning, fixture install)
- Electrical (panel upgrades, outlet/switch work, rewiring, EV charger install)
- Roofing (replacement, repair, inspection, gutter work)
- Appliance repair (washer, dryer, refrigerator, dishwasher)

**Also supported (AI-knowledge only at launch, no seed data):**
- Auto body/collision, pest control, landscaping, painting, flooring, garage door, locksmith, tree service, foundation repair, pool maintenance, and any other service quote

**Data accuracy tiers:**
| Tier | Data Source | Expected Accuracy | Verticals |
|------|-----------|-------------------|-----------|
| Tier 1 — Database + AI | Seeded pricing data + AI knowledge | ±10-15% | Auto repair (highest seed data available) |
| Tier 2 — AI-Primary | AI model knowledge + sparse seed data | ±15-25% | HVAC, plumbing, electrical, roofing |
| Tier 3 — AI-Only | AI model knowledge, no seed data | ±20-35% | All other service categories |

The app clearly communicates confidence level to the user: "High confidence — based on 200+ local data points" vs. "Estimated — based on national averages, accuracy improves as more quotes are analyzed in your area."

---

## Technical Architecture

### Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | Next.js (React) with TypeScript | Mobile-first PWA, fast iteration, SSR for SEO |
| Styling | Tailwind CSS | Rapid prototyping, responsive design |
| Backend API | Next.js API Routes | Keep it simple, co-located with frontend |
| AI — Vision/Extraction | Google Gemini 2.5 Flash (primary), Claude Haiku 4.5 (fallback) | Free tier for validation, ~$0.003/analysis at scale |
| AI — Text Reasoning | OpenAI GPT-5 nano or DeepSeek V3.2 | Cheapest text model for normalization, verdict, and tips (~$0.0005/call) |
| Pricing Database | PostgreSQL (Supabase or Neon) | Structured pricing data with geographic queries |
| File Storage | Supabase Storage or AWS S3 | Quote images/PDFs |
| Authentication | Supabase Auth or Clerk | Simple email/social login for saving history |
| Hosting | Vercel | Zero-config Next.js deployment |
| Analytics | PostHog or Mixpanel | Usage tracking, funnel analysis |

### System Architecture

```
┌─────────────────────────────────────────────────┐
│                  Mobile Web Client               │
│         (Next.js PWA - camera/upload UI)         │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────┐
│              Next.js API Routes                   │
│                                                   │
│  POST /api/quote/analyze                          │
│    1. Receive image/PDF                           │
│    2. Send to Claude Vision for extraction         │
│    3. Parse structured line items                  │
│    4. Query pricing database for each item         │
│    5. Calculate fairness scores                    │
│    6. Return results                               │
│                                                   │
│  GET /api/quote/:id                               │
│    - Retrieve saved analysis                       │
│                                                   │
│  POST /api/feedback                               │
│    - User confirms/disputes pricing accuracy       │
└────────┬──────────────────────┬──────────────────┘
         │                      │
         ▼                      ▼
┌─────────────────┐  ┌─────────────────────────────┐
│  Gemini 2.5     │  │    PostgreSQL Database        │
│  Flash (vision) │  │                               │
│  + Claude Haiku │  │  - pricing_data               │
│  (fallback)     │  │  - service_categories          │
│  + GPT-5 nano   │  │  - quote_analyses (history)    │
│  (text/verdict) │  │  - user_feedback               │
│                 │  │  - regional_labor_rates        │
└─────────────────┘  └─────────────────────────────┘
```

### AI Model Strategy — Tiered Cost Optimization

The app performs two distinct AI tasks per analysis. Using a single expensive model for both is wasteful. Instead, we use the cheapest model that's good enough for each step, with intelligent fallback.

#### Step 1: Vision Extraction (reading the quote photo)

This is the most demanding step — the model must read potentially messy, handwritten, or low-quality photos of service quotes and output structured JSON.

| Priority | Model | Cost (per 1M tokens in/out) | When to Use |
|----------|-------|----------------------------|-------------|
| Primary | Gemini 2.5 Flash | $0.30 / $2.50 (free tier available) | All analyses — handles most printed and clear handwritten quotes |
| Fallback | Claude Haiku 4.5 | $1.00 / $5.00 | When Gemini returns low-confidence extraction or fails to parse |
| Emergency | Claude Sonnet 4.6 | $3.00 / $15.00 | Edge cases: badly damaged, multi-language, or extremely messy quotes |

**Fallback trigger logic:**
```typescript
async function extractQuote(imageBase64: string): Promise<QuoteExtraction> {
  // Try Gemini Flash first (cheapest)
  const geminiResult = await extractWithGemini(imageBase64);
  
  if (geminiResult.confidence >= 0.7 && geminiResult.line_items.length > 0) {
    return { ...geminiResult, model_used: 'gemini-2.5-flash' };
  }
  
  // Fallback to Claude Haiku if Gemini struggled
  const haikuResult = await extractWithClaude(imageBase64, 'claude-haiku-4-5-20251001');
  
  if (haikuResult.confidence >= 0.6 && haikuResult.line_items.length > 0) {
    return { ...haikuResult, model_used: 'claude-haiku-4.5' };
  }
  
  // Last resort: Claude Sonnet for difficult quotes
  const sonnetResult = await extractWithClaude(imageBase64, 'claude-sonnet-4-6');
  return { ...sonnetResult, model_used: 'claude-sonnet-4.6' };
}
```

**Confidence scoring:** Each extraction returns a confidence score based on:
- Number of line items successfully parsed (0 items = 0 confidence)
- Whether a total was found and whether line items sum to it (±10%)
- Whether prices were parseable as numbers
- Whether the document appears to be a service quote vs. something else

#### Step 2: Normalization & Verdict (text-only reasoning)

After extraction, we need to normalize service names ("front brake pads replacement" → `brake_pad_replacement_front`), query the pricing database, and generate the fairness verdict with negotiation tips. This is text-only — no vision needed.

| Priority | Model | Cost (per 1M tokens in/out) | Notes |
|----------|-------|----------------------------|-------|
| Primary | GPT-5 nano | $0.05 / $0.40 | Cheapest viable text model, excellent for structured tasks |
| Alternative | DeepSeek V3.2 | $0.28 / $0.42 | Good alternative if OpenAI rate limits are an issue |

This step receives ~500-800 tokens of extracted JSON and returns ~300-500 tokens of verdict JSON. At GPT-5 nano pricing, this costs approximately $0.0003 per analysis.

#### Cost Projections

| Monthly Volume | Vision (Gemini Flash) | Text (GPT-5 nano) | Fallback Budget (5% Haiku) | Total AI Cost |
|---------------|----------------------|-------------------|-----------------------------|---------------|
| 500 (validation) | $0 (free tier) | $0.15 | $0.50 | ~$0.65 |
| 5,000 | $15 | $1.50 | $5.00 | ~$21.50 |
| 10,000 | $30 | $3.00 | $10.00 | ~$43.00 |
| 50,000 | $150 | $15.00 | $50.00 | ~$215.00 |
| 100,000 | $300 | $30.00 | $100.00 | ~$430.00 |

*Assumptions: ~1,500 input tokens + ~800 output tokens per vision call; ~600 input + ~400 output per text call; 5% of analyses trigger Haiku fallback.*

#### Prompt Caching Strategy

Both Anthropic and Google offer prompt caching discounts. Since every analysis uses the same system prompt:

- **Gemini:** Cache the system prompt and few-shot examples. Cached input tokens are significantly cheaper.
- **Claude (fallback):** Anthropic's prompt caching gives 90% discount on cached input tokens. The extraction system prompt (~500 tokens) should be cached.
- **GPT-5 nano:** OpenAI cached input is $0.005/1M (90% savings). Cache the normalization prompt.

#### Pre-Launch Model Evaluation

Before committing to a primary model, run this evaluation:

1. Collect 30+ real quote photos across these categories:
   - Printed/typed quotes (easy)
   - Handwritten estimates (medium)
   - Carbon copy forms (hard)
   - Phone photos at angles / with glare (hard)
   - Multi-page quotes (medium)

2. Run each photo through Gemini Flash, Claude Haiku, and Claude Sonnet

3. Score each result on:
   - Line item count accuracy (did it find all items?)
   - Price extraction accuracy (within $1 of actual?)
   - Category classification accuracy
   - Total/subtotal accuracy
   - Processing time

4. Decision criteria:
   - If Gemini Flash scores ≥ 80% accuracy → use as primary (saves ~70% on AI costs)
   - If Gemini Flash scores < 80% but Haiku scores ≥ 80% → use Haiku as primary
   - If only Sonnet scores ≥ 80% → use Sonnet but budget accordingly (~10x higher cost)

---

## Feature Specifications

### F1: Quote Capture

**Description:** User captures or uploads a quote document.

**Requirements:**
- Camera integration using browser `getUserMedia` API for direct photo capture
- File upload accepting: JPEG, PNG, HEIC, PDF
- Image preview with crop/rotate before submission
- Maximum file size: 10MB
- Client-side image compression before upload (target < 2MB for API efficiency)
- Support for multi-page quotes (allow multiple photos stitched into one analysis)

**UI States:**
- Empty state with clear CTA: "Snap a photo of your quote"
- Camera viewfinder with capture button
- Upload alternative: "Or upload a file"
- Preview state with "Analyze" button

### F2: AI Quote Extraction

**Description:** Extract structured data from the quote image using the tiered AI model strategy (see AI Model Strategy section above). Primary model: Gemini 2.5 Flash. Fallback: Claude Haiku 4.5 → Claude Sonnet 4.6.

**Extraction Prompt (used across all models — adjust API format per provider):**

```
System: You are an expert at reading service quotes, estimates, and 
invoices from any type of service provider — auto repair shops, HVAC 
companies, plumbers, electricians, roofers, appliance repair techs, 
and more. Extract every line item from this quote image.

First, identify:
- service_type: The type of service provider (e.g., "auto_repair", 
  "hvac", "plumbing", "electrical", "roofing", "appliance_repair", 
  "general_contractor", "other")

For each line item, extract:
- description: The service or part name exactly as written
- category: Classify into one of: [labor, parts, materials, 
  diagnostic, permit_fee, disposal_fee, trip_charge, 
  equipment_rental, shop_supplies, tax, warranty, other]
- quantity: Number of units (default 1)
- unit_price: Price per unit if shown
- line_total: Total for this line item
- labor_hours: If this is a labor charge, estimated hours if shown
- part_number: If a part/model number is visible

Also extract:
- shop_name: Name of the business if visible
- vehicle_info: Year, make, model if this is an auto repair quote
- property_info: Any property details if this is a home service quote
  (e.g., "2-story home", "3-ton AC unit", "40-gallon water heater")
- quote_date: Date if shown
- subtotal, tax, total: If shown
- warranty_info: Any warranty terms mentioned

Respond in JSON format only. If a field is not visible or unclear, 
set it to null. If you cannot read a value with confidence, set it 
to null and add a note in a "confidence_notes" field.
```

**Output Schema:**

```typescript
interface QuoteExtraction {
  service_type: 'auto_repair' | 'hvac' | 'plumbing' | 'electrical' | 
                'roofing' | 'appliance_repair' | 'general_contractor' | 'other';
  shop_name: string | null;
  vehicle_info: {
    year: number | null;
    make: string | null;
    model: string | null;
  } | null;
  property_info: {
    details: string | null;      // e.g., "3-ton AC unit", "2-story home"
    equipment_specs: string | null; // e.g., "Carrier 24ACC636A003", "50-gal Rheem water heater"
  } | null;
  quote_date: string | null;
  line_items: LineItem[];
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  warranty_info: string | null;
  confidence_notes: string[];
}

interface LineItem {
  description: string;
  category: 'labor' | 'parts' | 'materials' | 'diagnostic' | 
             'permit_fee' | 'disposal_fee' | 'trip_charge' |
             'equipment_rental' | 'shop_supplies' | 'tax' | 
             'warranty' | 'other';
  quantity: number;
  unit_price: number | null;
  line_total: number;
  labor_hours: number | null;
  part_number: string | null;
}
```

### F3: Price Benchmarking Engine

**Description:** Compare extracted line items against regional pricing data to produce fairness scores. Uses a **database-first, AI-fallback** approach: check the local pricing database first, then fall back to AI model knowledge for items/verticals without enough data. Every analysis enriches the database regardless of which path was used.

**Pricing Lookup Chain:**
1. Query local `service_benchmarks` table for normalized service name + zip prefix + service type
2. If found with sample_size ≥ 5 → use database pricing (Tier 1, high confidence)
3. If found with sample_size < 5 → blend database data with AI estimate (Tier 2, medium confidence)
4. If not found → ask AI model for typical pricing in this region (Tier 3, lower confidence)
5. Cache AI responses in `service_benchmarks` for future lookups

**AI Pricing Prompt (for Tier 2/3 items):**
```
Given the following service line item, provide typical pricing for 
the specified area. Consider regional cost-of-living differences.

Service type: {service_type}
Item: {description}
Location: {zip_code} ({city, state})
Property/Vehicle: {vehicle_info or property_info}

Respond in JSON:
{
  "regional_low": <25th percentile price>,
  "regional_average": <median price>,
  "regional_high": <75th percentile price>,
  "typical_labor_hours": <if applicable>,
  "typical_labor_rate": <for this region>,
  "notes": "<any context about price variation>"
}
```

**Benchmarking Logic:**

```typescript
interface PriceBenchmark {
  item_description: string;
  quoted_price: number;
  regional_low: number;      // 25th percentile for this zip code region
  regional_average: number;  // median for this zip code region
  regional_high: number;     // 75th percentile for this zip code region
  deal_rating: 'steal' | 'great_deal' | 'fair' | 'above_average' | 'ripoff';
  deal_score: number;        // 0-100 scale for visual meter positioning
  percent_vs_average: number; // e.g., +22% or -10%
  data_confidence: 'high' | 'medium' | 'low';
  notes: string | null;
}

interface DIYAssessment {
  item_description: string;
  diy_difficulty: 'easy' | 'moderate' | 'hard' | 'expert_only' | 'not_diy';
  diy_score: number;          // 0-100 scale (100 = easiest DIY)
  estimated_diy_time: string; // e.g., "5 minutes", "1-2 hours"
  tools_required: string[];   // e.g., ["none"], ["socket wrench", "jack stands"]
  diy_part_cost: number | null;       // retail part cost if DIY
  shop_vs_diy_savings: number | null; // how much you'd save doing it yourself
  diy_flag: boolean;          // TRUE if this is a high-value DIY opportunity
  diy_flag_reason: string | null;     // e.g., "This is a 5-minute job. The part costs $12."
  video_search_term: string | null;   // e.g., "2019 Toyota Camry cabin air filter replacement"
  affiliate_links: AffiliateLink[];   // 2-3 purchase links sorted by price
  affiliate_search_query: string | null; // fallback search term for generating affiliate URLs
}

interface AffiliateLink {
  partner: 'amazon' | 'autozone' | 'rockauto' | 'oreilly' | 'advance';
  display_name: string;       // e.g., "Amazon" or "AutoZone (pickup today)"
  url: string;                // affiliate-tagged URL
  estimated_price: number | null;
  in_store_pickup: boolean;
}

interface LineItemAnalysis {
  price_benchmark: PriceBenchmark;
  diy_assessment: DIYAssessment;
}
```

#### Deal Rating Meter

Each line item gets a visual meter showing where the quoted price falls on a scale from "Steal" to "Ripoff."

**Visual: Horizontal gradient bar** — green (left) → yellow (center) → red (right) with a marker showing where this quote lands.

```
  STEAL    GREAT DEAL     FAIR     ABOVE AVG    RIPOFF
  ├──────────┼──────────┼──────────┼──────────┤
  ◄ $120                 $200                 $350+ ►
                            ▲
                      Your quote: $210 (Fair)
```

**Scoring Thresholds → deal_score mapping:**

| Rating | vs. Regional Average | deal_score | Color |
|--------|---------------------|------------|-------|
| Steal | > 25% below | 90-100 | Bright green |
| Great Deal | 10-25% below | 70-89 | Green |
| Fair | Within ±10% | 45-69 | Yellow/neutral |
| Above Average | 10-30% above | 20-44 | Orange |
| Ripoff | > 30% above | 0-19 | Red |

**Overall Quote Meter:** Same visual at the top of the results page, using a weighted average (by dollar amount) of all line item deal_scores.

#### DIY Difficulty Meter

Each line item also gets a DIY assessment showing whether the consumer could reasonably do this themselves.

**Visual: Icon-based difficulty scale** — wrench icons or a simple gauge.

```
  DIY DIFFICULTY
  
  🟢 Easy          "5 min, no tools needed"
  🟡 Moderate      "30-60 min, basic tools"  
  🟠 Hard          "2-4 hours, specialized tools"
  🔴 Expert Only   "Requires lift, diagnostic equipment"
  ⛔ Not DIY       "Safety-critical or requires certification"
```

**DIY Flag Logic — the "You're Getting Ripped Off" Alert:**

When BOTH conditions are true, show a prominent flag/alert on that line item:
1. DIY difficulty is `easy` or `moderate`
2. Shop price is > 3x the DIY part cost, OR savings exceed $50

**Flag display example:**
```
┌─────────────────────────────────────────────────────┐
│  🚩 DIY OPPORTUNITY — Save $88                      │
│                                                      │
│  Cabin Air Filter Replacement                        │
│  Shop charges: $100                                  │
│  DIY cost: ~$12 (part) + 5 minutes of your time     │
│  Difficulty: 🟢 Easy — no tools needed               │
│                                                      │
│  🛒 Buy the part:                                    │
│     Amazon — $11.97                                  │
│     AutoZone — $14.99 (pickup today)                 │
│                                                      │
│  📺 Search "2019 Toyota Camry cabin air filter       │
│     replacement" on YouTube                          │
│                                                      │
│  ⓘ We may earn a small commission — doesn't          │
│    affect your price                                 │
└─────────────────────────────────────────────────────┘
```

**Common DIY-flagged services (pre-loaded knowledge):**

**Auto Repair:**

| Service | Typical DIY Difficulty | Typical Shop Price | DIY Part Cost | Savings |
|---------|----------------------|-------------------|---------------|---------|
| Cabin air filter | Easy (5 min) | $60-120 | $10-20 | $50-100 |
| Engine air filter | Easy (5 min) | $40-80 | $15-25 | $25-55 |
| Wiper blade replacement | Easy (5 min) | $40-80 | $15-30 | $25-50 |
| Battery replacement | Easy (15 min) | $200-350 | $100-180 | $100-170 |
| Headlight/taillight bulb | Easy (10 min) | $40-100 | $10-30 | $30-70 |
| Tire rotation | Moderate (30 min) | $50-80 | $0 (just labor) | $50-80 |
| Oil change | Moderate (30 min) | $50-120 | $25-45 | $25-75 |
| Brake pads (front/rear) | Moderate (1-2 hrs) | $200-400 | $30-60 | $170-340 |
| Spark plugs | Moderate (1 hr) | $150-300 | $20-60 | $130-240 |
| Serpentine belt | Hard (1-2 hrs) | $150-250 | $25-50 | $125-200 |
| Alternator replacement | Hard (2-3 hrs) | $400-700 | $150-300 | $250-400 |
| Timing belt | Expert only | $500-1000 | $50-150 | N/A — not recommended |
| Transmission repair | Not DIY | $1500-4000 | N/A | N/A |

**HVAC:**

| Service | Typical DIY Difficulty | Typical Pro Price | DIY Part Cost | Savings |
|---------|----------------------|-------------------|---------------|---------|
| Thermostat replacement | Easy (15 min) | $150-350 | $25-100 | $125-250 |
| Air filter replacement | Easy (5 min) | $50-100 | $5-20 | $45-80 |
| Condensate drain cleaning | Easy (15 min) | $100-200 | $0 (vinegar) | $100-200 |
| Capacitor replacement | Moderate (30 min) | $200-400 | $10-30 | $190-370 |
| HVAC tune-up/cleaning | Moderate (1 hr) | $100-200 | $10-20 | $90-180 |
| Blower motor replacement | Hard (1-2 hrs) | $400-700 | $100-250 | $300-450 |
| Refrigerant recharge | Not DIY | $200-500 | N/A | N/A — requires EPA cert |
| Compressor replacement | Not DIY | $1500-3000 | N/A | N/A |
| Full system install | Not DIY | $5000-15000 | N/A | N/A |

**Plumbing:**

| Service | Typical DIY Difficulty | Typical Pro Price | DIY Part Cost | Savings |
|---------|----------------------|-------------------|---------------|---------|
| Toilet flapper/fill valve | Easy (15 min) | $100-200 | $8-20 | $92-180 |
| Faucet replacement | Moderate (1 hr) | $200-400 | $50-150 | $150-250 |
| Garbage disposal install | Moderate (1 hr) | $250-500 | $80-200 | $170-300 |
| Toilet replacement | Moderate (2 hrs) | $300-600 | $100-300 | $200-300 |
| Water heater flush | Easy (30 min) | $100-250 | $0 (just a hose) | $100-250 |
| Drain cleaning (simple clog) | Moderate (30 min) | $150-350 | $20-50 | $130-300 |
| Water heater replacement | Hard (3-4 hrs) | $1000-2500 | $400-1000 | $600-1500 |
| Pipe leak repair | Expert only | $200-800 | N/A | N/A |
| Sewer line work | Not DIY | $2000-10000 | N/A | N/A |

**Electrical:**

| Service | Typical DIY Difficulty | Typical Pro Price | DIY Part Cost | Savings |
|---------|----------------------|-------------------|---------------|---------|
| Light switch/outlet replace | Easy (15 min) | $100-200 | $3-15 | $97-185 |
| Light fixture install | Moderate (30 min) | $150-350 | $0 (just labor) | $150-350 |
| Ceiling fan install (existing wiring) | Moderate (1 hr) | $200-400 | $0 (just labor) | $200-400 |
| GFCI outlet install | Moderate (20 min) | $150-250 | $15-25 | $135-225 |
| Panel upgrade | Not DIY | $1500-4000 | N/A | N/A — requires permit/license |
| Full house rewiring | Not DIY | $8000-20000 | N/A | N/A |

**Appliance Repair:**

| Service | Typical DIY Difficulty | Typical Pro Price | DIY Part Cost | Savings |
|---------|----------------------|-------------------|---------------|---------|
| Dryer lint vent cleaning | Easy (15 min) | $100-200 | $0-15 | $100-185 |
| Refrigerator water filter | Easy (2 min) | $75-150 | $15-40 | $60-110 |
| Dishwasher filter cleaning | Easy (10 min) | $100-150 | $0 | $100-150 |
| Washing machine hose replace | Easy (15 min) | $100-200 | $15-30 | $85-170 |
| Dryer belt replacement | Moderate (1 hr) | $200-350 | $10-25 | $190-325 |
| Refrigerator compressor | Not DIY | $500-1200 | N/A | N/A |

#### DIY Assessment AI Prompt

The DIY assessment is generated by the text reasoning model (GPT-5 nano) as part of Step 2. Add this to the verdict prompt:

```
For each line item, also assess DIY feasibility. The service type 
for this quote is: {service_type}

1. diy_difficulty: How hard is this for an average homeowner or car 
   owner with basic tools?
   - "easy": Under 15 minutes, no special tools, anyone can do it
   - "moderate": 30-120 minutes, needs basic hand tools
   - "hard": 2+ hours, needs specialized tools or significant knowledge
   - "expert_only": Requires professional equipment or advanced skills
   - "not_diy": Safety-critical, requires certification/license, 
     or requires permits (e.g., gas lines, electrical panel, 
     refrigerant handling, sewer lines)

2. estimated_diy_time: How long for a first-timer following a 
   YouTube video?

3. tools_required: List specific tools needed (or "none")

4. diy_part_cost: Approximate retail cost of the part at a major 
   retailer (Amazon, Home Depot, AutoZone, etc. depending on 
   service type). For labor-only services, set to 0.

5. diy_flag: Set to true if BOTH:
   - difficulty is "easy" or "moderate"  
   - AND (quoted_price > 3x diy_part_cost OR 
     quoted_price - diy_part_cost > $50)

6. video_search_term: A YouTube search query specific to the user's 
   situation. Include vehicle year/make/model for auto, or equipment 
   brand/model for appliances and HVAC.
   Examples: 
   - "2019 Toyota Camry cabin air filter replacement"
   - "Honeywell thermostat T6 pro installation"
   - "Moen kitchen faucet cartridge replacement"
   - "Samsung dryer belt replacement DV45R6100AW"

7. safety_warning: For electrical, gas, or structural work, add 
   appropriate safety warnings even if rated as moderate/hard.

IMPORTANT: For any work involving gas lines, main electrical panels, 
sewer lines, structural changes, or refrigerant handling — ALWAYS 
rate as "not_diy" regardless of technical difficulty. These require 
licensed professionals and/or permits in most jurisdictions.

Consider specifics when assessing difficulty:
- Auto: spark plugs on a 4-cyl Camry = moderate, on a V6 with 
  buried rear plugs = hard
- Plumbing: replacing a toilet flapper = easy, but if the shutoff 
  valve is corroded = moderate
- Electrical: swapping an outlet = easy, but if the house has 
  aluminum wiring = not_diy (safety)
- HVAC: replacing a thermostat = easy, but if the system uses 
  proprietary wiring = moderate
```

**Scoring Thresholds:**
- **Steal:** > 25% below regional average
- **Great Deal:** 10-25% below regional average
- **Fair:** Within ±10% of regional average
- **Above Average:** 10-30% above regional average
- **Ripoff:** > 30% above regional average

**Overall Quote Score:** Weighted average of line item deal_scores, weighted by dollar amount. Displayed as the main visual meter at the top of results.

**Labor Rate Check:** Compare the shop's implied hourly rate against the regional average. Extract by dividing labor charges by labor hours if both are available.

### F4: Results Display

**Description:** Present the analysis with visual meters and actionable DIY flags.

**Results Screen Layout:**

```
┌──────────────────────────────────────────────────────┐
│  OVERALL VERDICT                                      │
│                                                        │
│  ⬤ Your quote: $847                                   │
│                                                        │
│  STEAL ━━━━━━━━━━━▶━━━━━━━━━━━━━━━━ RIPOFF            │
│  ├─────────┼──────▲──┼──────────┼─────────┤           │
│  $500     $650   $847 $900     $1100    $1400          │
│                                                        │
│  FAIR — This quote is about average for your area.     │
│  Typical range: $650 – $1,050 in 75024                │
│                                                        │
│  ⚡ 2 DIY opportunities found — save up to $188       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  🚩 DIY OPPORTUNITIES (tap to expand)                 │
│                                                        │
│  Cabin Air Filter — Save $88 │ 🟢 Easy, 5 min        │
│  Engine Air Filter — Save $55 │ 🟢 Easy, 5 min       │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  LINE-BY-LINE BREAKDOWN                               │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ Brake Pad Replacement (Front)          $350     │   │
│  │                                                  │   │
│  │ Deal:  STEAL ━━━▶━━━━━━━━━━━━━ RIPOFF           │   │
│  │        Great Deal — 15% below average            │   │
│  │                                                  │   │
│  │ DIY:   🟡 Moderate — 1-2 hrs, basic tools       │   │
│  │        Part cost: ~$45  │  Save: ~$305           │   │
│  │        📺 "2019 Camry front brake pad replace"   │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ Cabin Air Filter Replacement           $100     │   │
│  │                                                  │   │
│  │ Deal:  STEAL ━━━━━━━━━━━━━━━━━▶ RIPOFF          │   │
│  │        🔴 Ripoff — 67% above average             │   │
│  │                                                  │   │
│  │ DIY:   🟢 Easy — 5 min, no tools                │   │
│  │        🚩 Part cost: ~$12  │  Save: ~$88         │   │
│  │        📺 "2019 Camry cabin air filter replace"  │   │
│  └────────────────────────────────────────────────┘   │
│                                                        │
│  ┌────────────────────────────────────────────────┐   │
│  │ Transmission Fluid Flush               $250     │   │
│  │                                                  │   │
│  │ Deal:  STEAL ━━━━━━━━━▶━━━━━━━ RIPOFF           │   │
│  │        Fair — within typical range               │   │
│  │                                                  │   │
│  │ DIY:   🔴 Expert Only — requires equipment      │   │
│  │        Leave this one to the pros.               │   │
│  └────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  💬 NEGOTIATION TIPS                                  │
│                                                        │
│  • Ask to remove the cabin air filter charge —        │
│    offer to do it yourself for $12.                    │
│  • Request aftermarket brake pads if OEM is quoted.   │
│  • Your overall quote is fair, but you could save     │
│    $143 by DIYing the two filters.                    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│  [💾 Save]  [📤 Share]  [📄 PDF Export]              │
└──────────────────────────────────────────────────────┘
```

**Section Priority Order:**
1. **Overall Verdict Meter** — the first thing users see. Answers "is this fair?" in 1 second.
2. **DIY Opportunities Banner** — only shown if DIY flags exist. Collapsed by default, tap to expand. This is the viral/shareable moment.
3. **Line Item Cards** — each item has BOTH meters (deal rating + DIY difficulty) and is expandable for details.
4. **Negotiation Tips** — AI-generated, context-aware, referencing specific line items. Incorporates DIY savings into the tips (e.g., "offer to do X yourself").
5. **Action Buttons** — Save, Share, PDF export.

**Share Feature Priority:** When a user shares, generate a card-style image summary showing the overall verdict, DIY savings amount, and the worst-rated line items. Optimized for texting to friends/family or posting on social media.

**Negotiation Tips Engine (updated):**

Generate contextual tips that now factor in DIY assessments:
- If an easy DIY item is overpriced: "Ask to remove the [item] charge — this is a 5-minute DIY job. The part costs $X at AutoZone."
- If a moderate DIY item is overpriced: "Consider doing [item] yourself. It takes about [time] with basic tools and saves you $X."
- If labor rate is high: "Ask if the labor rate is negotiable or if there's a discount for paying cash."
- If parts are high: "Ask whether aftermarket parts are available. They're often 30-50% less than OEM with comparable quality."
- If diagnostic fee is high: "Ask if the diagnostic fee is waived if you proceed with the repair."
- If total DIY savings > $100: "You could save over $X by doing [N] items yourself. Focus on the easy ones first."
- Generic high quote: "Consider getting a second quote. Mention you're comparing prices — shops often match competitors."

### F5: User Accounts & History (Optional for MVP)

**Description:** Allow users to save analyses and build quote history.

**Requirements:**
- Email or Google sign-in
- Save past analyses with quote images
- Track shops over time
- Export analysis as PDF (for sharing or disputes)

---

## Data Strategy

### AI-First, Database-Enriched Approach

The core insight: **AI models already know typical pricing for most common services.** Rather than waiting to build a comprehensive database before launching, we use AI knowledge as the baseline and let every analysis enrich the database. Over time, the database replaces AI estimates with real market data, improving accuracy organically.

**Phase 1 (Launch): AI-primary with seed data**
- Seed the database with whatever structured data is freely available (BLS labor rates, public cost guides)
- For everything else, rely on the AI model's training knowledge for price benchmarks
- Clearly label confidence: "Based on national averages" vs. "Based on 50+ local quotes"
- Every analysis stores anonymized pricing data regardless of source

**Phase 2 (Months 2-6): Database growing, AI as fallback**
- Crowdsourced data from user analyses starts providing local benchmarks
- Database covers common services in active markets
- AI fills gaps for uncommon services or new markets
- Confidence labels shift as sample sizes grow

**Phase 3 (Months 6+): Database-primary, AI for long tail**
- High-volume services have robust local pricing data
- AI only needed for rare/niche services
- Can start licensing data to third parties

### Seed Data Sources (Pre-loaded)

**Auto Repair (richest available data):**
- Bureau of Labor Statistics (BLS) regional labor rate data
- Industry labor time guides (Mitchell, ALLDATA — may require licensing)
- Common parts pricing from public sources (RockAuto, AutoZone, O'Reilly)
- RepairPal public cost ranges (for validation, not direct copying)

**HVAC, Plumbing, Electrical, Roofing:**
- HomeAdvisor/Angi published cost guides (public editorial data)
- Thumbtack average pricing by service and metro area
- BLS labor rates for trades by region
- RS Means construction cost data (if licensable)

**All Verticals:**
- Regional cost-of-living indices (to adjust AI estimates by location)
- ZIP code to metro area mapping for regional pricing

**Database Schema:**

```sql
-- Regional labor rates (by trade/vertical)
CREATE TABLE labor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR(50) NOT NULL,    -- auto_repair, hvac, plumbing, electrical, roofing, etc.
  zip_prefix VARCHAR(5) NOT NULL,
  metro_area VARCHAR(100),
  state VARCHAR(2) NOT NULL,
  avg_hourly_rate DECIMAL(6,2) NOT NULL,
  low_hourly_rate DECIMAL(6,2),
  high_hourly_rate DECIMAL(6,2),
  source VARCHAR(100),                  -- 'bls', 'crowdsourced', 'ai_estimated'
  sample_size INTEGER DEFAULT 0,
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Service pricing benchmarks (all verticals)
CREATE TABLE service_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR(50) NOT NULL,    -- which vertical
  service_name VARCHAR(255) NOT NULL,
  normalized_name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL,
  vehicle_class VARCHAR(50),            -- for auto: compact, midsize, truck, SUV, luxury
  equipment_class VARCHAR(100),         -- for home: "3-ton AC", "40-gal water heater", etc.
  zip_prefix VARCHAR(5),
  avg_total DECIMAL(8,2),
  low_total DECIMAL(8,2),
  high_total DECIMAL(8,2),
  avg_parts_cost DECIMAL(8,2),
  avg_labor_cost DECIMAL(8,2),
  avg_labor_hours DECIMAL(4,1),
  sample_size INTEGER DEFAULT 0,        -- 0 = AI-estimated, 5+ = crowdsourced
  source VARCHAR(100),                  -- 'seed', 'crowdsourced', 'ai_estimated'
  updated_at TIMESTAMP DEFAULT NOW()
);

-- DIY knowledge base (pre-loaded + AI-enriched over time)
CREATE TABLE diy_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type VARCHAR(50) NOT NULL,
  normalized_service_name VARCHAR(255) NOT NULL,
  vehicle_class VARCHAR(50),
  equipment_class VARCHAR(100),
  diy_difficulty VARCHAR(20) NOT NULL,
  diy_score INTEGER NOT NULL,
  estimated_time_minutes INTEGER,
  tools_required TEXT[],
  diy_part_cost_low DECIMAL(8,2),
  diy_part_cost_high DECIMAL(8,2),
  safety_notes TEXT,
  requires_permit BOOLEAN DEFAULT FALSE,   -- e.g., electrical panel, some plumbing
  requires_license BOOLEAN DEFAULT FALSE,  -- e.g., EPA cert for refrigerant
  pro_tip TEXT,
  source VARCHAR(100),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(service_type, normalized_service_name, vehicle_class, equipment_class)
);

-- User-submitted quote data (the flywheel — all verticals)
CREATE TABLE quote_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  service_type VARCHAR(50) NOT NULL,    -- detected or user-specified vertical
  shop_name VARCHAR(255),
  shop_zip VARCHAR(10),
  -- Auto-specific
  vehicle_year INTEGER,
  vehicle_make VARCHAR(50),
  vehicle_model VARCHAR(50),
  -- Home service-specific
  property_info JSONB,                  -- equipment specs, home details
  -- Common
  quote_image_url VARCHAR(500),
  extracted_data JSONB,
  benchmark_results JSONB,
  overall_score VARCHAR(20),
  total_quoted DECIMAL(8,2),
  total_fair_estimate DECIMAL(8,2),
  data_confidence VARCHAR(20),          -- 'high', 'medium', 'low'
  vision_model_used VARCHAR(50),        -- which AI model extracted the quote
  user_feedback VARCHAR(20),            -- 'accurate' | 'too_high' | 'too_low'
  created_at TIMESTAMP DEFAULT NOW()
);

-- Crowdsourced price reports (all verticals)
CREATE TABLE price_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_analysis_id UUID REFERENCES quote_analyses(id),
  service_type VARCHAR(50) NOT NULL,
  service_name VARCHAR(255),
  normalized_name VARCHAR(255),
  category VARCHAR(50),
  price DECIMAL(8,2),
  labor_hours DECIMAL(4,1),
  zip_code VARCHAR(10),
  vehicle_class VARCHAR(50),
  equipment_class VARCHAR(100),
  reported_at TIMESTAMP DEFAULT NOW()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE,
  display_name VARCHAR(100),
  default_zip VARCHAR(10),
  default_vehicle JSONB,          -- saved car details for quick re-use
  default_property JSONB,         -- saved home details (AC tonnage, water heater size, etc.)
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Data Flywheel Strategy

Every quote analyzed feeds back into the pricing database, regardless of vertical:
1. Extract line items, prices, and service type from user-submitted quotes
2. Normalize service names using AI (e.g., "front brake pads replacement" → "brake_pad_replacement_front", "install new Honeywell T6 thermostat" → "thermostat_replacement")
3. Store anonymized price points with zip code, service type, and vehicle/equipment class
4. Use aggregated data to improve benchmarks over time
5. Require minimum sample size (n ≥ 5) before using crowdsourced data over AI estimates
6. Track data coverage dashboard: which services in which zip codes have strong data vs. AI-only
7. Prioritize marketing/user acquisition in metros where data coverage is growing fastest

---

## API Endpoints

### POST /api/quote/analyze

**Request:**
```typescript
{
  image: File;          // quote image or PDF
  zip_code: string;     // user's location for regional pricing
  service_type?: string; // optional hint — auto-detected if not provided
  vehicle?: {           // for auto repair quotes
    year: number;
    make: string;
    model: string;
  };
  property?: {          // for home service quotes
    details: string;    // e.g., "2-story, 2000 sqft"
    equipment: string;  // e.g., "3-ton Carrier AC", "50-gal Rheem water heater"
  };
}
```

**Response:**
```typescript
{
  id: string;
  extraction: QuoteExtraction;
  line_item_analyses: LineItemAnalysis[];  // deal rating + DIY for each item
  overall_verdict: {
    deal_rating: 'steal' | 'great_deal' | 'fair' | 'above_average' | 'ripoff';
    deal_score: number;                    // 0-100 for meter positioning
    total_quoted: number;
    estimated_fair_range: { low: number; high: number };
    potential_savings: number | null;       // savings if priced at average
    summary: string;                        // human-readable summary
  };
  diy_summary: {
    opportunities_count: number;            // number of DIY-flagged items
    total_diy_savings: number;              // sum of savings across all DIY items
    flagged_items: Array<{
      description: string;
      shop_price: number;
      diy_cost: number;
      savings: number;
      difficulty: string;
      time_estimate: string;
      affiliate_links: AffiliateLink[];
    }>;
    shopping_list_total: number | null;     // total cost if user buys all DIY parts
  };
  negotiation_tips: string[];               // now includes DIY-aware tips
  metadata: {
    data_confidence: 'high' | 'medium' | 'low';
    items_matched: number;
    items_unmatched: number;
    processing_time_ms: number;
    vision_model_used: string;              // which model extracted the quote
    fallback_triggered: boolean;
  };
}
```

### GET /api/quote/:id

Retrieve a previously analyzed quote.

### POST /api/quote/:id/feedback

```typescript
{
  accuracy_rating: 'accurate' | 'too_high' | 'too_low';
  actual_price_paid?: number;
  went_with_this_shop: boolean;
  notes?: string;
}
```

### GET /api/pricing/lookup

Manual lookup endpoint (secondary feature):
```typescript
{
  service: string;
  zip_code: string;
  vehicle?: { year: number; make: string; model: string };
}
```

---

## Non-Functional Requirements

### Performance
- Quote analysis end-to-end: < 15 seconds (target: < 10 seconds)
- Image upload and compression: < 3 seconds
- Results page load: < 1 second
- API cold start: < 2 seconds

### Security
- All images encrypted at rest and in transit (TLS 1.3)
- Quote images auto-deleted after 30 days unless user saves
- No PII stored from quotes beyond what user explicitly provides
- Rate limiting: 10 analyses per hour per IP (unauthenticated), 50 per day (authenticated)

### Scalability
- Support 1,000 concurrent analyses at launch
- Database designed for sharding by zip_prefix
- AI calls are the bottleneck — implement queue with retry for Claude API

### Accessibility
- WCAG 2.1 AA compliant
- Screen reader support for results
- High contrast mode for results display
- Works on mobile browsers (Safari iOS, Chrome Android minimum)

---

## Monetization Strategy — Affiliate Revenue

### Overview

All features are free to users. Revenue comes from affiliate commissions on auto parts linked within DIY opportunity flags. Every time the app tells a user "This is a $12 part you can replace yourself," the part name links to an affiliate purchase page. This model has zero user friction, aligns incentives (the app saves users money, and earns when they act on it), and generates revenue from day one.

### Affiliate Programs to Integrate

**Auto Parts:**

| Partner | Commission Rate | Cookie Duration | Best For | Priority |
|---------|----------------|-----------------|----------|----------|
| Amazon Associates | 4-8% on auto parts | 24 hours | Widest selection, user trust, one-click purchase | P0 — integrate first |
| AutoZone | 4-6% | 30 days | Same-day in-store pickup (user is already out) | P0 — key for "buy it now" |
| RockAuto | ~5% | 30 days | Best prices on parts, enthusiast audience | P1 |
| O'Reilly Auto Parts | 4-6% | 30 days | Strong retail presence, loaner tool program | P1 |
| Advance Auto Parts | 4-6% | 30 days | Retail alternative | P2 |

**Home Service Parts & Materials:**

| Partner | Commission Rate | Cookie Duration | Best For | Priority |
|---------|----------------|-----------------|----------|----------|
| Amazon Associates | 3-8% (varies by category) | 24 hours | Thermostats, filters, faucets, fixtures, tools | P0 — same account as auto |
| Home Depot | 2-8% | varies | HVAC parts, plumbing fixtures, electrical, tools (same-day pickup) | P0 |
| Lowe's | 2-8% | varies | Same as Home Depot, alternative option | P1 |
| SupplyHouse.com | 5-8% | 30 days | Specialty HVAC and plumbing parts | P2 |
| Ferguson (build.com) | 3-5% | varies | Premium plumbing/HVAC fixtures | P2 |

**Affiliate routing logic:** Based on the detected `service_type`, the app serves the most relevant affiliate links. Auto repair quotes get AutoZone/RockAuto links. HVAC/plumbing/electrical quotes get Home Depot/Lowe's links. Amazon appears for all verticals as the universal fallback.

### Affiliate Link Placement

Links appear in three locations within the results UI, always in context:

**1. DIY Opportunity Flag Cards (highest conversion)**
```
┌─────────────────────────────────────────────────────┐
│  🚩 DIY OPPORTUNITY — Save $88                      │
│                                                      │
│  Cabin Air Filter Replacement                        │
│  Shop charges: $100                                  │
│  DIY cost: ~$12 + 5 minutes of your time            │
│                                                      │
│  🛒 Buy the part:                                    │
│     Amazon — $11.97  ← affiliate link                │
│     AutoZone — $14.99 (pickup today) ← affiliate     │
│                                                      │
│  📺 Watch how: "2019 Camry cabin filter replacement" │
└─────────────────────────────────────────────────────┘
```

**2. Line Item Detail View (when expanded)**
For any item with `diy_difficulty` of easy or moderate, show a "DIY this repair" section at the bottom of the expanded line item card with part links.

**3. Summary "DIY Shopping List" (bottom of results)**
If multiple DIY opportunities exist, generate a combined shopping list with affiliate links:
```
┌─────────────────────────────────────────────────────┐
│  🛒 YOUR DIY SHOPPING LIST                           │
│                                                      │
│  □ Cabin Air Filter — $11.97          [Buy on Amazon]│
│  □ Engine Air Filter — $18.49         [Buy on Amazon]│
│  □ Wiper Blades (pair) — $24.99     [Buy at AutoZone]│
│                                                      │
│  Total: $55.45  │  You save: $233 vs. shop quote     │
└─────────────────────────────────────────────────────┘
```

### Part Matching Logic

The AI already extracts part descriptions and vehicle info. Use this to generate specific affiliate links:

```typescript
interface AffiliateLink {
  partner: 'amazon' | 'autozone' | 'rockauto' | 'oreilly' | 'advance';
  product_name: string;       // e.g., "FRAM CF10285 Cabin Air Filter"
  url: string;                // affiliate-tagged URL
  price: number | null;       // current price if available
  in_store_pickup: boolean;   // important for urgency — user may be at the shop right now
}

interface DIYOpportunityCard {
  // ... existing fields ...
  affiliate_links: AffiliateLink[];  // 2-3 links, sorted by price
  shopping_search_url: string;       // fallback: Amazon search with affiliate tag
}
```

**Part matching approach:**
1. Use the extracted part description + vehicle year/make/model to generate a search query
2. For Amazon: use the Product Advertising API or construct a tagged search URL (`amazon.com/s?k=2019+camry+cabin+air+filter&tag=YOUR_TAG`)
3. For AutoZone/O'Reilly: use their affiliate program's deep linking to search results or specific parts
4. If exact part match isn't possible, link to a search results page (still earns commission on any purchase within cookie window)

**Important: always default to a search URL as fallback.** Exact product matching is nice-to-have, but a search link like `amazon.com/s?k=2019+toyota+camry+cabin+air+filter&tag=fairest-20` still converts and earns commission on anything the user buys in the next 24 hours (Amazon) or 30 days (others).

### Revenue Projections

Conservative assumptions:
- 30% of analyses surface at least one DIY opportunity
- 15% of users with DIY flags click an affiliate link
- 50% of clickers purchase (high because they're pre-qualified and motivated)
- Average order value: $25
- Average commission rate: 5%

| Monthly Analyses | DIY Flagged | Click-throughs | Purchases | Revenue |
|-----------------|-------------|----------------|-----------|---------|
| 1,000 | 300 | 45 | 23 | $29 |
| 5,000 | 1,500 | 225 | 113 | $141 |
| 10,000 | 3,000 | 450 | 225 | $281 |
| 50,000 | 15,000 | 2,250 | 1,125 | $1,406 |
| 100,000 | 30,000 | 4,500 | 2,250 | $2,813 |

*Note: These projections are conservative. Amazon's cookie tracks ALL purchases in 24 hours, not just the linked part. Users who click through to Amazon and buy anything — groceries, electronics, etc. — generate commission. Real revenue could be 2-3x these numbers.*

### Disclosure & Compliance

FTC requires clear affiliate disclosure. Include:
- A small disclosure line under each affiliate link: "We may earn a small commission — this doesn't affect your price"
- A general disclosure in the app footer/about page explaining the affiliate model
- Affiliate links must be clearly distinguishable from non-commercial content

### Future Monetization (Not for MVP)

These can be layered on once there's user traction:
- **Fair Price Certified Shops** — charge shops $200-500/mo to be listed as certified fair-price alternatives when a user's quote comes back high
- **Lead generation** — sell qualified leads to competing shops (user has a diagnosis + benchmark price)
- **Per-analysis premium tier** — charge $1.49 for enhanced features (PDF export, negotiation scripts, price history)
- **Data licensing** — sell anonymized pricing data to insurance companies, fleet managers, warranty providers

---

## Success Metrics

| Metric | Target (Month 1) | Target (Month 6) |
|--------|-------------------|-------------------|
| Quote analyses completed | 500 | 10,000 / month |
| Completion rate (upload → results) | 70% | 80% |
| Analyses with DIY flags | 30% | 35% |
| Affiliate link click-through rate | 10% | 15% |
| Affiliate conversion rate (click → purchase) | 40% | 50% |
| Affiliate revenue | $15 | $280+ / month |
| User feedback submitted | 10% of analyses | 20% of analyses |
| Accuracy rating ("accurate") | 60% | 75% |
| Return users | 15% | 30% |

---

## Development Phases

### Phase 0 — Model Evaluation (Week 0, before building)
- [ ] Collect 30+ real quote photos across verticals (auto, HVAC, plumbing, electrical)
- [ ] Include variety: printed, handwritten, carbon copy, phone photos with glare
- [ ] Run each through Gemini Flash, Claude Haiku, and Claude Sonnet
- [ ] Score extraction accuracy per model (line items, prices, totals, service type detection)
- [ ] Test AI pricing accuracy: for 20 known services with known fair prices, compare AI estimates to reality
- [ ] Confirm Gemini Flash meets ≥ 80% extraction accuracy threshold for primary use
- [ ] Document edge cases that require fallback models
- [ ] Estimate real-world fallback rate (target: < 10% of analyses)

### Phase 1 — MVP (Weeks 1-4)
- [ ] Project setup: Next.js, Tailwind, Supabase
- [ ] Camera/upload UI with image preview
- [ ] Gemini 2.5 Flash integration for primary vision extraction
- [ ] Claude Haiku/Sonnet fallback integration for difficult quotes
- [ ] GPT-5 nano integration for normalization and verdict generation
- [ ] Tiered extraction fallback chain with confidence scoring
- [ ] Service type auto-detection (auto, HVAC, plumbing, electrical, etc.)
- [ ] AI-first pricing engine (AI model knowledge as default, database when available)
- [ ] Seed database with available data (BLS labor rates, public cost guides)
- [ ] DIY knowledge base seeded across all primary verticals (see F3 tables)
- [ ] Confidence indicator on results ("Based on 50+ local data points" vs. "Estimated from national averages")
- [ ] Results display with deal rating meters per line item
- [ ] DIY difficulty meters and DIY opportunity flags (with safety warnings for home services)
- [ ] DIY-aware negotiation tips
- [ ] Affiliate link generation — auto-route by service type (Amazon + AutoZone for auto, Amazon + Home Depot for home)
- [ ] Affiliate disclosure compliance (FTC)
- [ ] Affiliate click tracking and analytics
- [ ] AI cost tracking and logging
- [ ] Data collection pipeline (every analysis enriches the pricing database)
- [ ] Mobile-responsive design
- [ ] Deploy to Vercel

### Phase 2 — Data & Polish (Weeks 5-8)
- [ ] User accounts and quote history
- [ ] Feedback loop (user confirms accuracy)
- [ ] Crowdsourced data pipeline with sample_size tracking per service/region
- [ ] Improved service name normalization across all verticals
- [ ] PDF export of analysis
- [ ] Share results via link
- [ ] Loading state animations and micro-interactions
- [ ] Error handling and edge cases (blurry images, non-quote uploads)

### Phase 3 — Growth (Weeks 9-12)
- [ ] Landing page with SEO content ("Is $X fair for brake repair in Dallas?")
- [ ] Email capture and notifications
- [ ] Monetization tier implementation
- [ ] Analytics dashboard for usage patterns
- [ ] A/B testing framework for pricing and features
- [ ] App Store wrapper (Capacitor or PWA)

### Phase 4 — Expansion (Months 4+)
- [ ] Shop/provider ratings based on aggregated quote data
- [ ] "Get a Second Quote" — connect users with competing service providers
- [ ] Partnerships with shop management software (auto) and field service platforms (home)
- [ ] API for third-party integrations
- [ ] Data licensing to insurance companies, fleet managers, warranty providers
- [ ] Niche vertical expansion (auto body, pest control, landscaping, etc.) with curated seed data

---

## Claude Code Setup Instructions

### Project Initialization

```bash
npx create-next-app@latest fair-estimate --typescript --tailwind --app --src-dir
cd fair-estimate
npm install @google/generative-ai @anthropic-ai/sdk openai @supabase/supabase-js sharp
npm install -D @types/node
```

### Environment Variables

```env
# AI Providers (tiered model strategy)
GOOGLE_GEMINI_API_KEY=AIza...          # Primary vision model (Gemini 2.5 Flash)
ANTHROPIC_API_KEY=sk-ant-...           # Fallback vision model (Claude Haiku/Sonnet)
OPENAI_API_KEY=sk-...                  # Text reasoning model (GPT-5 nano)

# Database
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Affiliate Programs
AMAZON_AFFILIATE_TAG=fairestimate-20    # Amazon Associates tracking tag (all verticals)
AUTOZONE_AFFILIATE_ID=...               # AutoZone affiliate program ID (auto)
HOME_DEPOT_AFFILIATE_ID=...             # Home Depot affiliate ID (home services)
ROCKAUTO_AFFILIATE_ID=...               # RockAuto affiliate ID (Phase 2)
LOWES_AFFILIATE_ID=...                  # Lowe's affiliate ID (Phase 2)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Key Implementation Notes

1. **Image handling:** Use `sharp` for server-side image compression before sending to AI models. Resize to max 1568px on longest side. Both Gemini and Claude accept base64-encoded images.

2. **Vision extraction (tiered fallback):** Implement the `extractQuote()` fallback chain from the AI Model Strategy section. Start with Gemini 2.5 Flash via `@google/generative-ai` SDK. If confidence is low, retry with Claude Haiku via `@anthropic-ai/sdk`. Log which model was used per analysis for cost tracking.

3. **Service name normalization:** Use GPT-5 nano (text-only, cheapest option) to normalize extracted service names to canonical forms for database lookup. Cache normalization mappings aggressively — most service names repeat across quotes.

4. **Pricing fallback chain:**
   - Check local database for exact match on normalized name
   - Check local database for fuzzy match (Levenshtein or trigram similarity)
   - Fall back to GPT-5 nano with a prompt like "What is the typical price range for [service] on a [vehicle] in [zip code]?" — less accurate but better than nothing
   - Cache all results

5. **Rate limiting:** Use Vercel's built-in rate limiting or implement with Redis/Upstash.

6. **Cost tracking:** Log every AI API call with model name, token counts, and estimated cost. Build a simple admin dashboard to monitor daily/weekly AI spend and fallback rates.

7. **Error states to handle:**
   - Image is not a quote (receipt, menu, random photo)
   - Image is too blurry to read
   - Quote is in a language other than English
   - Service type not in database and real-time lookup fails
   - AI API timeout or rate limit (implement retry with exponential backoff)
   - Gemini free tier exhausted (auto-switch to paid tier or Haiku)

---

## File Structure

```
fair-estimate/
├── src/
│   ├── app/
│   │   ├── page.tsx                    # Landing / upload screen
│   │   ├── layout.tsx                  # Root layout
│   │   ├── results/[id]/page.tsx       # Results display
│   │   ├── history/page.tsx            # User quote history
│   │   └── api/
│   │       ├── quote/
│   │       │   ├── analyze/route.ts    # Main analysis endpoint
│   │       │   ├── [id]/route.ts       # Get saved analysis
│   │       │   └── [id]/feedback/route.ts
│   │       └── pricing/
│   │           └── lookup/route.ts     # Manual price lookup
│   ├── components/
│   │   ├── QuoteCapture.tsx            # Camera + upload component
│   │   ├── ImagePreview.tsx            # Preview with crop/rotate
│   │   ├── AnalysisLoading.tsx         # Progress animation
│   │   ├── OverallVerdict.tsx          # Top-level verdict with deal meter
│   │   ├── DealMeter.tsx              # Horizontal gradient bar (steal → ripoff)
│   │   ├── DIYMeter.tsx               # DIY difficulty indicator (easy → not DIY)
│   │   ├── DIYOpportunityBanner.tsx   # Collapsible banner for DIY-flagged items
│   │   ├── DIYOpportunityCard.tsx     # Individual DIY flag card with savings
│   │   ├── LineItemCard.tsx           # Single item with both meters + details
│   │   ├── LineItemList.tsx           # Scrollable list of all line items
│   │   ├── NegotiationTips.tsx        # DIY-aware actionable suggestions
│   │   ├── ShareCard.tsx              # Social-shareable summary image
│   │   └── VehicleInput.tsx           # Optional vehicle details
│   ├── lib/
│   │   ├── ai/
│   │   │   ├── gemini.ts              # Gemini Flash client (primary vision)
│   │   │   ├── claude.ts              # Claude Haiku/Sonnet client (fallback vision)
│   │   │   ├── openai.ts             # GPT-5 nano client (text reasoning)
│   │   │   └── extract-quote.ts      # Tiered extraction with fallback chain
│   │   ├── benchmarking.ts            # Price comparison engine
│   │   ├── diy-assessment.ts         # DIY scoring, flag logic, and knowledge base queries
│   │   ├── affiliate.ts              # Affiliate link generation (Amazon, AutoZone, etc.)
│   │   ├── normalization.ts           # Service name normalization (GPT-5 nano)
│   │   ├── pricing-db.ts             # Database query helpers
│   │   ├── image-processing.ts        # Compression and validation (sharp)
│   │   ├── cost-tracker.ts           # AI API cost logging and monitoring
│   │   └── supabase.ts               # Supabase client
│   ├── types/
│   │   └── index.ts                   # All TypeScript interfaces
│   └── data/
│       └── seed/
│           ├── labor-rates.json       # BLS regional labor rates (all trades)
│           ├── common-repairs.json    # Pre-loaded repair benchmarks (auto)
│           ├── common-home-services.json # Pre-loaded benchmarks (HVAC, plumbing, electrical)
│           ├── diy-knowledge.json     # Pre-loaded DIY difficulty + part costs (all verticals)
│           └── cost-of-living-index.json # Regional adjustment factors by zip prefix
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql     # Database setup
├── public/
│   └── icons/                         # PWA icons
├── .env.local
├── next.config.js
├── tailwind.config.ts
└── package.json
```
