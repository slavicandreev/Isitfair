import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json({ error: 'Quote ID is required' }, { status: 400 });
  }

  try {
    const body = await request.json();
    const { accuracy_rating, actual_price_paid, went_with_this_shop, notes } = body;

    if (!accuracy_rating) {
      return NextResponse.json({ error: 'accuracy_rating is required' }, { status: 400 });
    }

    const validRatings = ['accurate', 'too_high', 'too_low'];
    if (!validRatings.includes(accuracy_rating)) {
      return NextResponse.json(
        { error: 'accuracy_rating must be one of: accurate, too_high, too_low' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from('feedback').insert({
      quote_id: id,
      accuracy_rating,
      actual_price_paid: actual_price_paid || null,
      notes: notes || null,
      created_at: new Date().toISOString(),
    });

    if (error) {
      throw error;
    }

    // Update the quote with user feedback
    await supabaseAdmin
      .from('quote_analyses')
      .update({ user_feedback: accuracy_rating })
      .eq('id', id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error storing feedback:', error);
    return NextResponse.json({ error: 'Failed to store feedback' }, { status: 500 });
  }
}
