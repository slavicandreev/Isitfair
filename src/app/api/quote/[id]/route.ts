import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Quote ID is required' }, { status: 400 });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('quote_analyses')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching quote:', error);
    return NextResponse.json({ error: 'Failed to retrieve quote' }, { status: 500 });
  }
}
