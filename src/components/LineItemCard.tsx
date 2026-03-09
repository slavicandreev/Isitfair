'use client';

import { useState } from 'react';
import { LineItemAnalysis } from '@/types';
import DealMeter from './DealMeter';
import DIYMeter from './DIYMeter';

interface LineItemCardProps {
  analysis: LineItemAnalysis;
}

export default function LineItemCard({ analysis }: LineItemCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { price_benchmark, upsell_flag, diy_assessment } = analysis;

  const upsellBadgeClass = upsell_flag.is_upsell
    ? upsell_flag.upsell_type === 'likely_upsell'
      ? 'bg-red-100 text-red-700'
      : upsell_flag.upsell_type === 'conditional'
      ? 'bg-orange-100 text-orange-700'
      : 'bg-yellow-100 text-yellow-700'
    : '';

  const upsellBadgeLabel = upsell_flag.is_upsell
    ? upsell_flag.upsell_type === 'likely_upsell'
      ? '⚠️ Likely Upsell'
      : upsell_flag.upsell_type === 'conditional'
      ? '⚠️ Review This'
      : '⚠️ Overpriced Bundle'
    : '';

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-gray-800 text-sm truncate">
                {price_benchmark.item_description}
              </h3>
              {upsell_flag.is_upsell && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${upsellBadgeClass}`}>
                  {upsellBadgeLabel}
                </span>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="font-bold text-gray-800">${price_benchmark.quoted_price.toFixed(2)}</div>
          </div>
        </div>

        <div className="mb-2">
          <DealMeter
            dealScore={price_benchmark.deal_score}
            dealRating={price_benchmark.deal_rating}
            percentVsAverage={price_benchmark.percent_vs_average}
            size="sm"
          />
        </div>

        {diy_assessment.diy_difficulty !== 'not_diy' && (
          <DIYMeter
            difficulty={diy_assessment.diy_difficulty}
            timeEstimate={diy_assessment.estimated_diy_time}
          />
        )}
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 space-y-3 pt-3">
          {/* Price range */}
          <div>
            <div className="text-xs font-medium text-gray-500 mb-1">Regional price range</div>
            <div className="flex gap-3 text-sm">
              <div>
                <span className="text-gray-400 text-xs">Low: </span>
                <span className="text-green-600 font-medium">${price_benchmark.regional_low.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs">Avg: </span>
                <span className="text-gray-600 font-medium">${price_benchmark.regional_average.toFixed(0)}</span>
              </div>
              <div>
                <span className="text-gray-400 text-xs">High: </span>
                <span className="text-red-500 font-medium">${price_benchmark.regional_high.toFixed(0)}</span>
              </div>
              <div>
                <span className={`text-xs ${price_benchmark.data_confidence === 'high' ? 'text-green-500' : price_benchmark.data_confidence === 'medium' ? 'text-yellow-500' : 'text-gray-400'}`}>
                  {price_benchmark.data_confidence} confidence
                </span>
              </div>
            </div>
          </div>

          {/* Upsell details */}
          {upsell_flag.is_upsell && upsell_flag.reason && (
            <div className="p-2 bg-orange-50 rounded text-xs text-orange-700">
              <strong>Why this may be an upsell:</strong> {upsell_flag.reason}
            </div>
          )}

          {/* DIY details */}
          {diy_assessment.diy_flag && (
            <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
              <strong>DIY opportunity:</strong> {diy_assessment.diy_flag_reason}
              {diy_assessment.tools_required.length > 0 && (
                <div className="mt-1">Tools needed: {diy_assessment.tools_required.join(', ')}</div>
              )}
            </div>
          )}

          {/* Safety warning */}
          {diy_assessment.safety_warning && (
            <div className="p-2 bg-red-50 rounded text-xs text-red-700">
              ⚠️ {diy_assessment.safety_warning}
            </div>
          )}

          {/* Notes */}
          {price_benchmark.notes && (
            <p className="text-xs text-gray-400">{price_benchmark.notes}</p>
          )}
        </div>
      )}
    </div>
  );
}
