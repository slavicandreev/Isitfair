import { NextRequest, NextResponse } from 'next/server';
import { analyzeQuote } from '@/lib/orchestrator';
import { supabaseAdmin } from '@/lib/supabase';
import { ServiceType } from '@/types';
import sharp from 'sharp';

export const maxDuration = 30;

// In-memory rate limit store
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour

function getClientIP(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0] || request.headers.get('x-real-ip') || 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; resetInMinutes: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, resetInMinutes: 60 };
  }

  if (entry.count >= RATE_LIMIT) {
    const resetInMinutes = Math.ceil((entry.resetAt - now) / 60000);
    return { allowed: false, resetInMinutes };
  }

  entry.count++;
  return { allowed: true, resetInMinutes: Math.ceil((entry.resetAt - now) / 60000) };
}

// Cleanup old rate limit entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap.entries()) {
    if (now > entry.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}, 5 * 60 * 1000);

export async function POST(request: NextRequest) {
  const ip = getClientIP(request);
  const { allowed, resetInMinutes } = checkRateLimit(ip);

  if (!allowed) {
    return NextResponse.json(
      { error: `You've reached the analysis limit. Try again in ${resetInMinutes} minutes.` },
      { status: 429 }
    );
  }

  try {
    const formData = await request.formData();

    const imageFile = formData.get('image') as File | null;
    const zipCode = formData.get('zip_code') as string | null;
    const serviceType = formData.get('service_type') as ServiceType | null;
    const vehicleYear = formData.get('vehicle_year') as string | null;
    const vehicleMake = formData.get('vehicle_make') as string | null;
    const vehicleModel = formData.get('vehicle_model') as string | null;
    const propertyDetails = formData.get('property_details') as string | null;
    const propertyEquipment = formData.get('property_equipment') as string | null;

    // Validate required fields
    if (!imageFile) {
      return NextResponse.json({ error: 'Image is required' }, { status: 400 });
    }

    if (!zipCode) {
      return NextResponse.json({ error: 'ZIP code is required' }, { status: 400 });
    }

    if (!serviceType) {
      return NextResponse.json({ error: 'Service type is required' }, { status: 400 });
    }

    // Validate file size
    if (imageFile.size > 10 * 1024 * 1024) {
      return NextResponse.json(
        { error: 'Image exceeds 10MB limit. Please upload a smaller image.' },
        { status: 413 }
      );
    }

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
    if (!allowedTypes.includes(imageFile.type)) {
      return NextResponse.json(
        { error: 'Unsupported file type. Please upload a JPEG, PNG, HEIC, or PDF.' },
        { status: 400 }
      );
    }

    // Process image with sharp
    const arrayBuffer = await imageFile.arrayBuffer();
    const rawBuffer = Buffer.from(arrayBuffer);

    let processedBuffer: Buffer;
    const MAX_DIMENSION = 1568;
    const TARGET_SIZE = 2 * 1024 * 1024;

    let quality = 85;
    processedBuffer = await sharp(rawBuffer)
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();

    while (processedBuffer.length > TARGET_SIZE && quality > 40) {
      quality -= 10;
      processedBuffer = await sharp(rawBuffer)
        .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality })
        .toBuffer();
    }

    // Build vehicle/property info
    const vehicle =
      vehicleYear && vehicleMake && vehicleModel
        ? { year: parseInt(vehicleYear), make: vehicleMake, model: vehicleModel }
        : undefined;

    const property =
      propertyDetails
        ? { details: propertyDetails, equipment: propertyEquipment || '' }
        : undefined;

    // Run analysis pipeline
    const result = await analyzeQuote({
      imageBuffer: processedBuffer,
      imageMimeType: 'image/jpeg',
      imageSize: imageFile.size,
      zip_code: zipCode,
      service_type: serviceType,
      vehicle,
      property,
    });

    // Store results in Supabase
    try {
      await supabaseAdmin.from('quote_analyses').insert({
        id: result.id,
        service_type: result.extraction.service_type,
        shop_name: result.extraction.shop_name,
        shop_zip: zipCode,
        extracted_data: result.extraction,
        benchmark_results: result.line_item_analyses,
        overall_score: result.overall_verdict.deal_score,
        total_quoted: result.overall_verdict.total_quoted,
        total_fair_estimate: result.overall_verdict.estimated_fair_range.low,
        data_confidence: result.metadata.data_confidence,
        vision_model_used: result.metadata.vision_model_used,
      });

      // Store line items
      const lineItems = result.extraction.line_items.map((item, i) => ({
        quote_id: result.id,
        description: item.description,
        category: item.category,
        price: item.line_total,
        normalized_service: result.extraction.line_items[i]?.description || item.description,
      }));

      if (lineItems.length > 0) {
        await supabaseAdmin.from('quote_items').insert(lineItems);
      }

      // Store price reports (data flywheel)
      const priceReports = result.line_item_analyses
        .filter((la) => la.price_benchmark.data_confidence !== 'low')
        .map((la) => ({
          quote_analysis_id: result.id,
          service_type: result.extraction.service_type,
          service_name: la.price_benchmark.item_description,
          normalized_name: la.upsell_flag.normalized_name,
          category: 'other',
          price: la.price_benchmark.quoted_price,
          zip_code: zipCode,
          reported_at: new Date().toISOString(),
        }));

      if (priceReports.length > 0) {
        await supabaseAdmin.from('price_reports').insert(priceReports);
      }
    } catch (dbError) {
      // Don't fail the request if DB storage fails
      console.error('Failed to store analysis in DB:', dbError);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Analysis error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    if (errorMessage.includes('not a quote') || errorMessage.includes('no line items')) {
      return NextResponse.json(
        { error: "This doesn't look like a service quote. Try uploading a repair estimate or invoice." },
        { status: 400 }
      );
    }

    if (errorMessage.includes('confidence')) {
      return NextResponse.json(
        { error: "We couldn't read this image clearly. Try taking a new photo with better lighting." },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Analysis failed. Please try again.' },
      { status: 500 }
    );
  }
}
