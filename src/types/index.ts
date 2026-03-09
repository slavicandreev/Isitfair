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
