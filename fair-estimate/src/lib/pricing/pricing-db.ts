import { ServiceType, DataConfidence } from '@/types';
import { supabaseAdmin } from '../supabase';

export interface BenchmarkResult {
  regional_low: number;
  regional_average: number;
  regional_high: number;
  avg_labor_hours: number | null;
  sample_size: number;
  data_confidence: DataConfidence;
}

function isAutoService(serviceType: ServiceType): boolean {
  return serviceType === 'auto_repair';
}

export async function lookupBenchmark(
  normalizedName: string,
  serviceType: ServiceType,
  zipCode: string,
  vehicleInfo?: { make: string; model: string; year: number },
  propertyInfo?: { details: string; equipment: string }
): Promise<BenchmarkResult | null> {
  const zipPrefix = zipCode.substring(0, 3);

  if (isAutoService(serviceType)) {
    return lookupAutoBenchmark(normalizedName, zipPrefix, vehicleInfo);
  } else {
    return lookupHomeBenchmark(normalizedName, serviceType, zipPrefix, propertyInfo);
  }
}

async function lookupAutoBenchmark(
  normalizedName: string,
  zipPrefix: string,
  vehicleInfo?: { make: string; model: string; year: number }
): Promise<BenchmarkResult | null> {
  // Try exact match with vehicle info
  if (vehicleInfo) {
    const { data } = await supabaseAdmin
      .from('auto_service_benchmarks')
      .select('*')
      .eq('normalized_name', normalizedName)
      .eq('vehicle_make', vehicleInfo.make)
      .eq('vehicle_model', vehicleInfo.model)
      .lte('year_range_start', vehicleInfo.year)
      .gte('year_range_end', vehicleInfo.year)
      .eq('zip_prefix', zipPrefix)
      .limit(1)
      .single();

    if (data) {
      return formatBenchmarkResult(data);
    }

    // Try make-only match
    const { data: makeData } = await supabaseAdmin
      .from('auto_service_benchmarks')
      .select('*')
      .eq('normalized_name', normalizedName)
      .eq('vehicle_make', vehicleInfo.make)
      .limit(1)
      .single();

    if (makeData) {
      return { ...formatBenchmarkResult(makeData), data_confidence: 'medium' };
    }
  }

  // Try any-vehicle match
  const { data: anyData } = await supabaseAdmin
    .from('auto_service_benchmarks')
    .select('*')
    .eq('normalized_name', normalizedName)
    .limit(1)
    .single();

  if (anyData) {
    return { ...formatBenchmarkResult(anyData), data_confidence: 'low' };
  }

  // Fuzzy match using pg_trgm
  const { data: fuzzyData } = await supabaseAdmin
    .from('auto_service_benchmarks')
    .select('*')
    .textSearch('normalized_name', normalizedName.replace(/_/g, ' '), { type: 'websearch' })
    .limit(1)
    .single();

  if (fuzzyData) {
    return { ...formatBenchmarkResult(fuzzyData), data_confidence: 'low' };
  }

  return null;
}

async function lookupHomeBenchmark(
  normalizedName: string,
  serviceType: ServiceType,
  zipPrefix: string,
  propertyInfo?: { details: string; equipment: string }
): Promise<BenchmarkResult | null> {
  const { data } = await supabaseAdmin
    .from('home_service_benchmarks')
    .select('*')
    .eq('normalized_name', normalizedName)
    .eq('service_type', serviceType)
    .eq('zip_prefix', zipPrefix)
    .limit(1)
    .single();

  if (data) {
    return formatBenchmarkResult(data);
  }

  // Try without zip code
  const { data: anyData } = await supabaseAdmin
    .from('home_service_benchmarks')
    .select('*')
    .eq('normalized_name', normalizedName)
    .eq('service_type', serviceType)
    .limit(1)
    .single();

  if (anyData) {
    return { ...formatBenchmarkResult(anyData), data_confidence: 'medium' };
  }

  return null;
}

function formatBenchmarkResult(data: Record<string, unknown>): BenchmarkResult {
  const sampleSize = (data.sample_size as number) || 0;
  const confidence: DataConfidence = sampleSize >= 5 ? 'high' : sampleSize >= 1 ? 'medium' : 'low';

  return {
    regional_low: (data.low_total as number) || 0,
    regional_average: (data.avg_total as number) || 0,
    regional_high: (data.high_total as number) || 0,
    avg_labor_hours: (data.avg_labor_hours as number) || null,
    sample_size: sampleSize,
    data_confidence: confidence,
  };
}
