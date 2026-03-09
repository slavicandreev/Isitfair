'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AnalysisResult } from '@/types';
import OverallVerdict from '@/components/OverallVerdict';
import DIYOpportunityBanner from '@/components/DIYOpportunityBanner';
import LineItemList from '@/components/LineItemList';
import NegotiationTips from '@/components/NegotiationTips';
import ShareCard from '@/components/ShareCard';
import UpsellFlagCard from '@/components/UpsellFlagCard';

export default function ResultsPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    // Try to get result from sessionStorage first (passed from analyze)
    const cached = sessionStorage.getItem(`result_${id}`);
    if (cached) {
      try {
        setResult(JSON.parse(cached));
        setLoading(false);
        return;
      } catch {}
    }

    // Fetch from API
    fetch(`/api/quote/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error('Not found');
        return res.json();
      })
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load results. Please try again.');
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">Loading results...</p>
        </div>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Results not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-6 py-3 bg-blue-500 text-white rounded-xl font-medium"
          >
            Analyze Another Quote
          </button>
        </div>
      </div>
    );
  }

  const { overall_verdict, upsell_summary, diy_summary, line_item_analyses, negotiation_tips, extraction, metadata } = result;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => router.push('/')}
            className="text-blue-500 text-sm hover:underline flex items-center gap-1"
          >
            ← New Analysis
          </button>
          <div className="text-xs text-gray-400">
            {extraction.shop_name && <span>{extraction.shop_name} · </span>}
            {new Date().toLocaleDateString()}
          </div>
        </div>

        {/* 1. Overall Verdict */}
        <OverallVerdict
          dealRating={overall_verdict.deal_rating}
          dealScore={overall_verdict.deal_score}
          totalQuoted={overall_verdict.total_quoted}
          estimatedFairRange={overall_verdict.estimated_fair_range}
          potentialSavings={overall_verdict.potential_savings}
          summary={overall_verdict.summary}
          upsellCount={upsell_summary.upsell_count}
          diyCount={diy_summary.opportunities_count}
          dataConfidence={metadata.data_confidence}
        />

        {/* 2. Upsell Alerts */}
        {upsell_summary.upsell_count > 0 && (
          <div className="rounded-xl border border-orange-200 overflow-hidden">
            <div className="p-4 bg-orange-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div>
                  <div className="font-semibold text-orange-800">
                    {upsell_summary.upsell_count} potential upsell{upsell_summary.upsell_count > 1 ? 's' : ''} detected
                  </div>
                  <div className="text-sm text-orange-600">
                    ${Math.round(upsell_summary.total_upsell_value)} in questionable charges
                  </div>
                </div>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {upsell_summary.flagged_items.map((item, i) => (
                <UpsellFlagCard
                  key={i}
                  itemDescription={item.description}
                  quotedPrice={item.quoted_price}
                  upsellType={item.upsell_type}
                  reason={item.reason}
                  estimatedFairValue={item.estimated_fair_value}
                />
              ))}
            </div>
          </div>
        )}

        {/* 3. DIY Opportunities */}
        {diy_summary.opportunities_count > 0 && (
          <DIYOpportunityBanner
            opportunitiesCount={diy_summary.opportunities_count}
            totalDIYSavings={diy_summary.total_diy_savings}
            items={diy_summary.flagged_items.map((item) => ({
              description: item.description,
              shop_price: item.shop_price,
              diy_cost: item.diy_cost,
              savings: item.savings,
              difficulty: item.difficulty,
              time_estimate: item.time_estimate,
              affiliate_links: item.affiliate_links,
            }))}
          />
        )}

        {/* 4. Line Items */}
        <LineItemList lineItemAnalyses={line_item_analyses} />

        {/* 5. Negotiation Tips */}
        {negotiation_tips.length > 0 && (
          <NegotiationTips tips={negotiation_tips} />
        )}

        {/* 6. Action Buttons */}
        <ShareCard
          dealRating={overall_verdict.deal_rating}
          dealScore={overall_verdict.deal_score}
          totalQuoted={overall_verdict.total_quoted}
          summary={overall_verdict.summary}
          quoteId={result.id}
        />

        {/* Analysis metadata */}
        <div className="text-center text-xs text-gray-400 pb-4">
          <p>Analyzed with {metadata.vision_model_used}</p>
          <p>{metadata.items_matched} items matched · {metadata.items_unmatched} estimated</p>
          <p>Processed in {(metadata.processing_time_ms / 1000).toFixed(1)}s</p>
        </div>
      </div>
    </div>
  );
}
