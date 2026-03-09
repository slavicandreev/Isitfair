'use client';

import { DealRating, DataConfidence } from '@/types';
import DealMeter from './DealMeter';

interface OverallVerdictProps {
  dealRating: DealRating;
  dealScore: number;
  totalQuoted: number;
  estimatedFairRange: { low: number; high: number };
  potentialSavings: number | null;
  summary: string;
  upsellCount?: number;
  diyCount?: number;
  dataConfidence: DataConfidence;
}

const ratingEmoji: Record<DealRating, string> = {
  steal: '🟢',
  great_deal: '🟢',
  fair: '🟡',
  above_average: '🟠',
  ripoff: '🔴',
};

const ratingBg: Record<DealRating, string> = {
  steal: 'bg-green-50 border-green-200',
  great_deal: 'bg-green-50 border-green-200',
  fair: 'bg-yellow-50 border-yellow-200',
  above_average: 'bg-orange-50 border-orange-200',
  ripoff: 'bg-red-50 border-red-200',
};

const confidenceLabel: Record<DataConfidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — limited data available',
};

export default function OverallVerdict({
  dealRating,
  dealScore,
  totalQuoted,
  estimatedFairRange,
  potentialSavings,
  summary,
  upsellCount = 0,
  diyCount = 0,
  dataConfidence,
}: OverallVerdictProps) {
  return (
    <div className={`rounded-xl border-2 p-5 ${ratingBg[dealRating]}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">{ratingEmoji[dealRating]}</span>
            <h2 className="text-xl font-bold text-gray-800">{summary}</h2>
          </div>
          <p className="text-sm text-gray-500">{confidenceLabel[dataConfidence]}</p>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-gray-800">${totalQuoted.toLocaleString()}</div>
          <div className="text-xs text-gray-500">Total quoted</div>
        </div>
      </div>

      {/* Deal Meter */}
      <div className="mb-4">
        <DealMeter dealScore={dealScore} dealRating={dealRating} size="lg" />
      </div>

      {/* Fair range */}
      <div className="flex gap-4 mb-4 p-3 bg-white bg-opacity-60 rounded-lg">
        <div className="text-center flex-1">
          <div className="text-xs text-gray-500 mb-0.5">Fair price range</div>
          <div className="font-semibold text-gray-700">
            ${estimatedFairRange.low.toLocaleString()} – ${estimatedFairRange.high.toLocaleString()}
          </div>
        </div>
        {potentialSavings !== null && potentialSavings > 0 && (
          <div className="text-center flex-1 border-l border-gray-200 pl-4">
            <div className="text-xs text-gray-500 mb-0.5">Potential savings</div>
            <div className="font-semibold text-red-500">
              Up to ${potentialSavings.toLocaleString()}
            </div>
          </div>
        )}
      </div>

      {/* Alert badges */}
      {(upsellCount > 0 || diyCount > 0) && (
        <div className="flex gap-2 flex-wrap">
          {upsellCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
              ⚠️ {upsellCount} potential upsell{upsellCount > 1 ? 's' : ''}
            </span>
          )}
          {diyCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              🔧 {diyCount} DIY opportunit{diyCount > 1 ? 'ies' : 'y'}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
