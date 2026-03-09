-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =====================
-- SHARED TABLES
-- =====================

CREATE TABLE IF NOT EXISTS quote_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  service_type TEXT NOT NULL,
  shop_name TEXT,
  shop_zip TEXT,
  image_url TEXT,
  extracted_data JSONB,
  benchmark_results JSONB,
  overall_score INTEGER,
  total_quoted NUMERIC(10,2),
  total_fair_estimate NUMERIC(10,2),
  data_confidence TEXT DEFAULT 'low',
  vision_model_used TEXT,
  user_feedback TEXT,
  user_id UUID  -- nullable for future auth
);

CREATE INDEX idx_quote_analyses_created_at ON quote_analyses(created_at DESC);
CREATE INDEX idx_quote_analyses_service_type ON quote_analyses(service_type);
CREATE INDEX idx_quote_analyses_shop_zip ON quote_analyses(shop_zip);

CREATE TABLE IF NOT EXISTS quote_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID NOT NULL REFERENCES quote_analyses(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT,
  price NUMERIC(10,2),
  normalized_service TEXT
);

CREATE INDEX idx_quote_items_quote_id ON quote_items(quote_id);

CREATE TABLE IF NOT EXISTS price_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_analysis_id UUID REFERENCES quote_analyses(id) ON DELETE SET NULL,
  service_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  normalized_name TEXT,
  category TEXT,
  price NUMERIC(10,2),
  labor_hours NUMERIC(5,2),
  zip_code TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  vehicle_year INTEGER,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated BOOLEAN DEFAULT FALSE
);

CREATE INDEX idx_price_reports_normalized_name ON price_reports(normalized_name);
CREATE INDEX idx_price_reports_service_type ON price_reports(service_type);
CREATE INDEX idx_price_reports_zip_code ON price_reports(zip_code);

CREATE TABLE IF NOT EXISTS labor_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  zip_prefix TEXT,
  metro_area TEXT,
  state TEXT,
  avg_hourly_rate NUMERIC(8,2),
  low_hourly_rate NUMERIC(8,2),
  high_hourly_rate NUMERIC(8,2),
  source TEXT DEFAULT 'seed',
  sample_size INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_labor_rates_service_type_zip ON labor_rates(service_type, zip_prefix);

CREATE TABLE IF NOT EXISTS normalization_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_description TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  service_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_normalization_mappings_unique ON normalization_mappings(raw_description, service_type);
CREATE INDEX idx_normalization_mappings_raw ON normalization_mappings USING gin(raw_description gin_trgm_ops);

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id UUID REFERENCES quote_analyses(id) ON DELETE CASCADE,
  accuracy_rating TEXT NOT NULL CHECK (accuracy_rating IN ('accurate', 'too_high', 'too_low')),
  actual_price_paid NUMERIC(10,2),
  went_with_this_shop BOOLEAN,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ai_call_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  provider TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(10,6),
  latency_ms INTEGER,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quote_id UUID,
  step TEXT
);

CREATE INDEX idx_ai_call_logs_quote_id ON ai_call_logs(quote_id);
CREATE INDEX idx_ai_call_logs_timestamp ON ai_call_logs(timestamp DESC);

-- =====================
-- AUTO-SPECIFIC TABLES
-- =====================

CREATE TABLE IF NOT EXISTS auto_service_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  vehicle_make TEXT,
  vehicle_model TEXT,
  year_range_start INTEGER,
  year_range_end INTEGER,
  engine_type TEXT,
  drive_type TEXT,
  oem_vs_aftermarket TEXT DEFAULT 'aftermarket',
  zip_prefix TEXT,
  metro_area TEXT,
  avg_total NUMERIC(10,2),
  low_total NUMERIC(10,2),
  high_total NUMERIC(10,2),
  avg_parts_cost NUMERIC(10,2),
  avg_labor_cost NUMERIC(10,2),
  avg_labor_hours NUMERIC(5,2),
  sample_size INTEGER DEFAULT 0,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_benchmarks_normalized_name ON auto_service_benchmarks USING gin(normalized_name gin_trgm_ops);
CREATE INDEX idx_auto_benchmarks_vehicle ON auto_service_benchmarks(vehicle_make, vehicle_model);
CREATE INDEX idx_auto_benchmarks_zip ON auto_service_benchmarks(zip_prefix);

CREATE TABLE IF NOT EXISTS auto_diy_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_service_name TEXT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  year_range_start INTEGER,
  year_range_end INTEGER,
  engine_type TEXT,
  diy_difficulty TEXT NOT NULL CHECK (diy_difficulty IN ('easy', 'moderate', 'hard', 'expert_only', 'not_diy')),
  diy_score INTEGER,
  estimated_time_minutes INTEGER,
  tools_required TEXT[],
  diy_part_cost_low NUMERIC(8,2),
  diy_part_cost_high NUMERIC(8,2),
  safety_notes TEXT,
  pro_tip TEXT,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_diy_service_name ON auto_diy_knowledge(normalized_service_name);

CREATE TABLE IF NOT EXISTS auto_parts_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_service_name TEXT NOT NULL,
  vehicle_make TEXT,
  vehicle_model TEXT,
  year_range_start INTEGER,
  year_range_end INTEGER,
  part_name TEXT NOT NULL,
  part_number TEXT,
  oem_price NUMERIC(8,2),
  aftermarket_price NUMERIC(8,2),
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auto_upsell_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_service_name TEXT NOT NULL,
  upsell_type TEXT NOT NULL CHECK (upsell_type IN ('likely_upsell', 'conditional', 'bundled_markup')),
  primary_service_context TEXT[],
  mileage_threshold_min INTEGER,
  mileage_threshold_max INTEGER,
  manufacturer_interval TEXT,
  reason_template TEXT,
  when_actually_needed TEXT,
  typical_shop_charge NUMERIC(8,2),
  estimated_fair_value NUMERIC(8,2),
  upsell_confidence NUMERIC(3,2) DEFAULT 0.7,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auto_upsell_service_name ON auto_upsell_knowledge(normalized_service_name);

-- =====================
-- HOME SERVICE TABLES
-- =====================

CREATE TABLE IF NOT EXISTS home_service_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  service_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  category TEXT,
  equipment_brand TEXT,
  equipment_model TEXT,
  equipment_capacity TEXT,
  home_stories INTEGER,
  home_age_range TEXT,
  permits_required BOOLEAN DEFAULT FALSE,
  zip_prefix TEXT,
  metro_area TEXT,
  avg_total NUMERIC(10,2),
  low_total NUMERIC(10,2),
  high_total NUMERIC(10,2),
  avg_parts_cost NUMERIC(10,2),
  avg_labor_cost NUMERIC(10,2),
  avg_labor_hours NUMERIC(5,2),
  sample_size INTEGER DEFAULT 0,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_home_benchmarks_normalized_name ON home_service_benchmarks USING gin(normalized_name gin_trgm_ops);
CREATE INDEX idx_home_benchmarks_service_type ON home_service_benchmarks(service_type);
CREATE INDEX idx_home_benchmarks_zip ON home_service_benchmarks(zip_prefix);

CREATE TABLE IF NOT EXISTS home_diy_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  normalized_service_name TEXT NOT NULL,
  equipment_brand TEXT,
  equipment_capacity TEXT,
  diy_difficulty TEXT NOT NULL CHECK (diy_difficulty IN ('easy', 'moderate', 'hard', 'expert_only', 'not_diy')),
  diy_score INTEGER,
  estimated_time_minutes INTEGER,
  tools_required TEXT[],
  diy_part_cost_low NUMERIC(8,2),
  diy_part_cost_high NUMERIC(8,2),
  safety_notes TEXT,
  requires_permit BOOLEAN DEFAULT FALSE,
  requires_license BOOLEAN DEFAULT FALSE,
  pro_tip TEXT,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_home_diy_service_name ON home_diy_knowledge(normalized_service_name);

CREATE TABLE IF NOT EXISTS home_upsell_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type TEXT NOT NULL,
  normalized_service_name TEXT NOT NULL,
  upsell_type TEXT NOT NULL CHECK (upsell_type IN ('likely_upsell', 'conditional', 'bundled_markup')),
  primary_service_context TEXT[],
  equipment_age_threshold INTEGER,
  reason_template TEXT,
  when_actually_needed TEXT,
  typical_shop_charge NUMERIC(8,2),
  estimated_fair_value NUMERIC(8,2),
  upsell_confidence NUMERIC(3,2) DEFAULT 0.7,
  source TEXT DEFAULT 'seed',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_home_upsell_service_name ON home_upsell_knowledge(normalized_service_name);
