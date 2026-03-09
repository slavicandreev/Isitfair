import { NextRequest, NextResponse } from 'next/server';
import { lookupBenchmark } from '@/lib/pricing/pricing-db';
import { ServiceType } from '@/types';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const serviceName = searchParams.get('service');
  const serviceType = searchParams.get('service_type') as ServiceType | null;
  const zipCode = searchParams.get('zip_code');
  const vehicleMake = searchParams.get('vehicle_make');
  const vehicleModel = searchParams.get('vehicle_model');
  const vehicleYear = searchParams.get('vehicle_year');

  if (!serviceName || !serviceType || !zipCode) {
    return NextResponse.json(
      { error: 'service, service_type, and zip_code are required' },
      { status: 400 }
    );
  }

  try {
    const vehicleInfo =
      vehicleMake && vehicleModel && vehicleYear
        ? { make: vehicleMake, model: vehicleModel, year: parseInt(vehicleYear) }
        : undefined;

    const result = await lookupBenchmark(
      serviceName,
      serviceType,
      zipCode,
      vehicleInfo
    );

    if (!result) {
      return NextResponse.json({ error: 'No pricing data found for this service' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Pricing lookup error:', error);
    return NextResponse.json({ error: 'Failed to look up pricing' }, { status: 500 });
  }
}
