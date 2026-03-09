
# Fair Estimate – Architecture Document & Implementation Plan

## 1. Overview

Fair Estimate is a web application that allows users to upload photos of service quotes (auto repair, HVAC, plumbing, electrical, etc.) and receive an AI-powered analysis determining whether the quote is fair.

The system:
- Extracts line items from uploaded quote images
- Normalizes services
- Benchmarks prices using AI + database
- Flags potential overpricing
- Identifies DIY opportunities
- Generates negotiation advice
- Generates affiliate links for parts

Primary revenue comes from affiliate commissions when users purchase parts for DIY fixes.

The MVP will focus on fast quote analysis and clear results.

The following features are **out of scope for MVP but must be accounted for in architecture**:

- User login / account creation
- Saving and retrieving user quotes
- Featured shop recommendations in results

The architecture below ensures these can be added without major refactors.

---

# 2. High Level Architecture

```
Client (Next.js)
      |
      v
API Layer (Next.js API Routes)
      |
      v
Orchestration Layer
      |
      +---- Image Processing
      |
      +---- AI Extraction Pipeline
      |
      +---- Service Normalization
      |
      +---- Pricing Engine
      |
      +---- DIY Analysis Engine
      |
      +---- Affiliate Link Engine
      |
      v
Database (Supabase / Postgres)
      |
      v
Storage (Supabase Storage)
```

External Systems:

- Gemini Vision API
- Claude Vision API (fallback)
- OpenAI reasoning model
- Affiliate partner endpoints
- Analytics

### AI Provider Fallback Strategy

The primary path uses the cheapest model per task: Gemini Flash for vision extraction, GPT-5 nano for normalization and verdict. The fallback path uses Claude for everything — both vision and text reasoning — as a single backup provider. This simplifies the failure mode: if either Gemini or OpenAI is down or rate-limited, the entire pipeline falls back to one provider rather than mixing healthy and degraded services.

```
Primary Path:
  Vision:        Gemini Flash
  Text/Verdict:  GPT-5 nano

Fallback Path (any primary failure):
  Vision:        Claude Haiku (or Sonnet for edge cases)
  Text/Verdict:  Claude Haiku
```

This reduces operational complexity — only two provider integrations need to be healthy at any given time, not three.

---

# 3. Core Components

## 3.1 Frontend (Next.js App Router)

Responsibilities:

- Quote upload UI
- Camera integration
- Image preview + cropping
- Service type selector
- Loading state during analysis
- Results display
- Upsell flag alerts
- DIY opportunities UI
- Negotiation tips
- Affiliate links
- Shareable result cards

### Upload Flow — Service Type Selector

After the user captures or uploads a quote image, prompt with a single-tap picker before submitting for analysis:

```
"What kind of quote is this?"

🚗 Auto Repair
❄️ HVAC
🔧 Plumbing
⚡ Electrical
🏠 Roofing
🔌 Appliance Repair
📋 Other
```

This serves three purposes:

1. Routes to the correct domain-specific benchmark tables (auto vs home) immediately without waiting for AI classification.
2. Eliminates a potential AI misclassification on ambiguous quotes (e.g., an "AC repair" quote could be automotive or home HVAC).
3. Provides the service type as context to the vision extraction prompt, improving extraction accuracy for industry-specific line items.

The selection is sent as `service_type` in the `POST /api/quote/analyze` request. If the user selects "Other", the AI detects the type during extraction as a fallback.

Future support:

- User authentication
- Quote history
- Saved results
- Featured shop suggestions

Key pages:

```
/
Upload screen

/results/[id]
Results page

/history (future)
Saved quotes

/account (future)
User profile
```

---

# 4. Backend Architecture

Backend runs inside Next.js API routes.

Primary endpoint:

```
POST /api/quote/analyze
```

Pipeline:

```
Upload Image
   |
Image Processing
   |
AI Quote Extraction
   |
Service Normalization
   |
Price Benchmarking
   |
Upsell Detection
   |
DIY Assessment
   |
Affiliate Generation
   |
Result Assembly
```

### Orchestration Design

The analyze endpoint is synchronous for MVP but must be structured for a future migration to async processing (SSE or polling). Each pipeline stage must be implemented as a discrete async function with its own input/output contract:

```typescript
// Each stage is an independent async function
async function processImage(raw: File): Promise<ProcessedImage>
async function extractQuote(image: ProcessedImage): Promise<QuoteExtraction>
async function normalizeServices(extraction: QuoteExtraction): Promise<NormalizedItems[]>
async function benchmarkPrices(items: NormalizedItems[], zip: string): Promise<PriceBenchmark[]>
async function detectUpsells(items: NormalizedItems[], extraction: QuoteExtraction): Promise<UpsellFlag[]>
async function assessDIY(items: NormalizedItems[], benchmarks: PriceBenchmark[]): Promise<DIYAssessment[]>
async function generateAffiliateLinks(items: DIYAssessment[]): Promise<AffiliateLink[]>
async function assembleResult(all: PipelineContext): Promise<AnalysisResult>
```

The orchestrator calls these sequentially and assembles the final response:

```typescript
// MVP: synchronous orchestration, returns full result
async function analyzeQuote(input: AnalyzeRequest): Promise<AnalysisResult> {
  const image = await processImage(input.file);
  const extraction = await extractQuote(image);
  const normalized = await normalizeServices(extraction);
  const benchmarks = await benchmarkPrices(normalized, input.zip_code);
  const upsells = await detectUpsells(normalized, extraction);
  const diy = await assessDIY(normalized, benchmarks);
  const affiliates = await generateAffiliateLinks(diy);
  return assembleResult({ extraction, normalized, benchmarks, upsells, diy, affiliates });
}
```

This design ensures the future async migration only changes the orchestrator — not the pipeline functions. When moving to SSE or polling, the orchestrator emits partial results after each stage completes, and individual stage functions remain untouched.

---

# 5. AI Processing Pipeline

### Step 1 — Vision Extraction

Primary Model:

Gemini Flash

Fallback:

Claude Haiku

Goal:

Extract:

- line items
- prices
- totals
- vehicle info
- service type

Output format:

```
{
 line_items:[
   {description, price}
 ]
}
```

Confidence score determines fallback.

---

### Step 2 — Service Normalization

Service descriptions are normalized into canonical names.

Example:

```
"Replace cabin air filter"
->
"Cabin Air Filter Replacement"
```

Model used:

Low-cost reasoning model.

Cache aggressively.

---

### Step 3 — Pricing Benchmarking

Lookup flow:

```
1. Exact service match in database
2. Fuzzy match
3. AI estimation fallback
```

Outputs:

```
{
 fair_low,
 fair_high,
 average
}
```

---

### Step 4 — Verdict Generation

Compute:

```
deal_score
fairness_rating
potential_savings
```

Ratings:

```
steal
good
fair
above_average
ripoff
```

---

### Step 5 — Upsell Detection

Identifies line items that are likely upsells — services that are not required but commonly added by shops and dealerships to inflate the total. The assessment considers the primary service on the quote, vehicle mileage/age, equipment age, and whether the item is contextually appropriate.

Detection logic:

```
1. Check upsell knowledge base for known upsell patterns
2. Evaluate context: primary service, vehicle mileage, equipment age
3. Flag items with upsell_confidence and explanation
```

Upsell classification:

```
likely_upsell     — Almost never needed in this context (e.g., engine flush at 20k miles)
conditional       — Legitimate at certain intervals but suspicious here (e.g., coolant flush at 30k when manufacturer says 100k)
bundled_markup    — Service is real but priced far above standalone cost when bundled (e.g., cabin air filter at 3x retail added to an oil change)
```

Outputs:

```
{
 is_upsell,
 upsell_type,
 upsell_confidence,
 reason,
 when_actually_needed,
 estimated_fair_value (if the service were genuinely needed)
}
```

The text reasoning model handles upsell detection as part of the normalization/verdict prompt. The upsell knowledge base provides the rules; the AI applies contextual judgment for items not in the knowledge base.

---

### Step 6 — DIY Assessment

Knowledge base contains:

- difficulty
- tools required
- part costs
- safety flags

Outputs:

```
{
 difficulty,
 diy_cost,
 savings,
 time_estimate
}
```

---

### Step 7 — Affiliate Link Generation

Inputs:

- part name
- vehicle
- service type

Output:

```
affiliate_links:[
 {partner, url, price}
]
```

Fallback:

Affiliate search links.

---

# 6. Database Design

Using **Supabase (Postgres)**.

Auto repair and home services have fundamentally different pricing factors. Cars require year/make/model/engine granularity. Home services depend on equipment specs, capacity, home characteristics, and permit requirements. Rather than a single benchmark table with nullable columns and branching query logic, the schema separates benchmark and knowledge tables by domain while keeping shared tables for cross-cutting concerns.

## Shared Tables

### quote_analyses

Top-level record for every analysis regardless of vertical.

```
id
created_at
service_type
shop_name
shop_zip
image_url
extracted_data (JSONB)
benchmark_results (JSONB)
overall_score
total_quoted
total_fair_estimate
data_confidence
vision_model_used
user_feedback
user_id (future, nullable)
```

### quote_items

```
id
quote_id
description
category
price
normalized_service
```

### price_reports

Crowdsourced raw data from every analysis. Feeds the benchmark tables after validation.

```
id
quote_analysis_id
service_type
service_name
normalized_name
category
price
labor_hours
zip_code
reported_at
```

### labor_rates

```
id
service_type
zip_prefix
metro_area
state
avg_hourly_rate
low_hourly_rate
high_hourly_rate
source
sample_size
updated_at
```

### normalization_mappings

Caches raw service descriptions to canonical names. Checked before calling the AI normalization model to reduce repeat API calls.

```
id
raw_description
normalized_name
service_type
created_at
```

### feedback

```
id
quote_id
accuracy_rating
actual_price_paid
notes
created_at
```

## Auto-Specific Tables

### auto_service_benchmarks

Keyed on service + vehicle attributes. A brake job on a 2012 Civic and a 2024 BMW X5 are different benchmarks.

```
id
service_name
normalized_name
category
vehicle_make
vehicle_model
year_range_start
year_range_end
engine_type
drive_type (FWD, RWD, AWD)
oem_vs_aftermarket
zip_prefix
metro_area
avg_total
low_total
high_total
avg_parts_cost
avg_labor_cost
avg_labor_hours
sample_size
source
updated_at
```

### auto_diy_knowledge

Vehicle-aware difficulty ratings. Spark plugs on an inline-4 Camry vs a transverse V6 with buried rear bank are completely different jobs.

```
id
normalized_service_name
vehicle_make
vehicle_model
year_range_start
year_range_end
engine_type
diy_difficulty
diy_score
estimated_time_minutes
tools_required (TEXT[])
diy_part_cost_low
diy_part_cost_high
safety_notes
pro_tip
source
updated_at
```

### auto_parts_catalog

Supports affiliate link matching with specific part numbers.

```
id
normalized_service_name
vehicle_make
vehicle_model
year_range_start
year_range_end
part_name
part_number
oem_price
aftermarket_price
source
updated_at
```

### auto_upsell_knowledge

Known upsell patterns in auto repair. Used to flag line items that are likely unnecessary add-ons given the context of the quote.

```
id
normalized_service_name
upsell_type (likely_upsell, conditional, bundled_markup)
primary_service_context (TEXT[])
  — e.g., ["oil_change", "brake_service"] — when this upsell is commonly attached
mileage_threshold_min
  — below this mileage, almost never needed (e.g., engine flush < 75k)
mileage_threshold_max
  — above this mileage, becomes legitimate
manufacturer_interval
  — what the manufacturer actually recommends (e.g., "100k miles", "never")
reason_template
  — e.g., "Engine flushes are rarely needed before {mileage_threshold_min} miles. Most manufacturers do not recommend them."
when_actually_needed
  — e.g., "If you have sludge buildup from missed oil changes or are buying a used car with unknown history."
typical_shop_charge
estimated_fair_value
  — what the service is worth if genuinely needed
source
updated_at
```

## Home Service Tables

### home_service_benchmarks

Keyed on service + equipment/property attributes. A 3-ton Carrier AC install in a single-story ranch vs a 5-ton Trane in a two-story colonial are not comparable.

```
id
service_type (hvac, plumbing, electrical, roofing, appliance_repair)
service_name
normalized_name
category
equipment_brand
equipment_model
equipment_capacity
home_stories
home_age_range
permits_required (BOOLEAN)
zip_prefix
metro_area
avg_total
low_total
high_total
avg_parts_cost
avg_labor_cost
avg_labor_hours
sample_size
source
updated_at
```

### home_diy_knowledge

Equipment-aware difficulty and safety flags.

```
id
service_type
normalized_service_name
equipment_brand
equipment_capacity
diy_difficulty
diy_score
estimated_time_minutes
tools_required (TEXT[])
diy_part_cost_low
diy_part_cost_high
safety_notes
requires_permit (BOOLEAN)
requires_license (BOOLEAN)
pro_tip
source
updated_at
```

### home_upsell_knowledge

Known upsell patterns in home services. HVAC, plumbing, and electrical trades each have common add-ons that are frequently unnecessary.

```
id
service_type (hvac, plumbing, electrical, roofing, appliance_repair)
normalized_service_name
upsell_type (likely_upsell, conditional, bundled_markup)
primary_service_context (TEXT[])
  — e.g., ["ac_install", "ac_repair"] — when this upsell is commonly attached
equipment_age_threshold
  — e.g., below 5 years, duct cleaning with a new AC install is rarely needed
reason_template
  — e.g., "UV lights are an add-on that most homeowners do not need with a standard AC install."
when_actually_needed
  — e.g., "If household members have severe allergies or respiratory conditions."
typical_shop_charge
estimated_fair_value
source
updated_at
```

## Routing

The orchestration layer routes to the correct benchmark table based on the `service_type` detected during extraction:

```
service_type = auto_repair  →  auto_service_benchmarks + auto_diy_knowledge + auto_upsell_knowledge
service_type = hvac|plumbing|electrical|roofing|appliance_repair  →  home_service_benchmarks + home_diy_knowledge + home_upsell_knowledge
```

No branching logic inside a single table. The pricing engine receives the service type and queries the appropriate domain tables.

---

# 7. Storage

Images stored in:

```
Supabase Storage
```

Lifecycle:

```
upload
process
store temporarily
delete after 30 days
```

Future:

Persist indefinitely for authenticated users.

---

# 8. API Endpoints

### Analyze Quote

```
POST /api/quote/analyze
```

Input:

```
image
zip_code
vehicle(optional)
```

Output:

Full analysis JSON.

---

### Get Quote

```
GET /api/quote/:id
```

---

### Feedback

```
POST /api/quote/:id/feedback
```

---

### Pricing Lookup

```
GET /api/pricing/lookup
```

---

# 9. Future Feature Architecture

## 9.1 User Accounts (Future)

Add:

```
users table
user_sessions
```

Quotes table already includes:

```
user_id
```

Authentication provider options:

- Supabase Auth
- Clerk
- Auth0

Minimal changes required.

---

## 9.2 Saved Quote History

Enable:

```
GET /api/user/quotes
```

Quotes associated with:

```
user_id
```

Frontend:

```
/history page
```

---

## 9.3 Featured Shop Suggestions

Future results enhancement.

Flow:

```
Quote analyzed
   |
If ripoff detected
   |
Query partner shops
   |
Show "Fair Price Shops Near You"
```

New tables:

```
shops
shop_services
shop_ratings
```

Matching logic:

```
service_type
zip_code proximity
pricing reputation
```

---

# 10. Scalability Strategy

Expected bottleneck:

AI calls.

Mitigations:

- queue processing
- retry logic
- caching normalized services
- caching benchmark results

Horizontal scaling:

Stateless API.

Database sharding by:

```
zip_prefix
```

---

# 11. Security

Requirements:

- TLS everywhere
- encrypted storage
- image deletion policy
- rate limiting
- abuse detection

Rate limits:

```
10 analyses / hour / IP
```

---

# 12. Performance Targets

Quote analysis:

```
< 15 seconds
```

Ideal:

```
< 10 seconds
```

Image upload:

```
< 3 seconds
```

---

# 13. Observability

Track:

- AI model usage
- extraction failures
- fallback rate
- cost per analysis
- affiliate clicks
- conversion rate

Tools:

- Vercel analytics
- Supabase logs
- custom cost tracker

---

# 14. Implementation Plan

## Phase 0 — Model Evaluation

Goal:

Validate vision model accuracy.

Tasks:

- collect 30 real quotes
- test Gemini vs Claude
- measure extraction accuracy
- measure pricing estimate accuracy

Deliverable:

Model selection decision.

---

## Phase 1 — MVP (Weeks 1‑4)

Build:

- Next.js app
- Upload UI
- Image processing
- AI extraction pipeline
- Pricing engine
- Upsell detection
- DIY analysis
- Results UI
- Affiliate links
- Deploy to Vercel

---

## Phase 2 — Data & UX (Weeks 5‑8)

Add:

- feedback collection
- normalization improvements
- better DIY knowledge base
- caching layers
- shareable results
- PDF exports

---

## Phase 3 — Accounts (Weeks 9‑10)

Add:

- authentication
- saved quotes
- quote history
- persistent storage

---

## Phase 4 — Marketplace (Weeks 11‑14)

Add:

- shop directory
- fair-price certified shops
- partner shop integrations
- quote comparison tools

---

# 15. File Structure

```
src/
  app/
    page.tsx
    results/[id]/page.tsx
    api/
      quote/
      pricing/

  components/
    QuoteCapture
    LineItemCard
    DealMeter
    DIYOpportunityCard
    UpsellFlagCard

  lib/
    ai/
    pricing/
    upsell/
    diy/
    affiliate/
    normalization/

  types/

  data/
    seed/
```

---

# 16. Key Risks

AI extraction accuracy.

Mitigations:

- fallback models
- user correction UI
- feedback loop

Pricing accuracy.

Mitigation:

- hybrid AI + database model
- crowdsourced validation.

---

# 17. Success Criteria

Launch metrics:

```
500 analyses first month
80% completion rate
30% DIY opportunity rate
```

Growth metrics:

```
10k analyses / month
15% affiliate CTR
```

---

End of Architecture Document
