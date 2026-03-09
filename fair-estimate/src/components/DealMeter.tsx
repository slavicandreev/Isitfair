'use client';

import { DealRating } from '@/types';

interface DealMeterProps {
  dealScore: number;
  dealRating: DealRating;
  percentVsAverage?: number;
  size?: 'sm' | 'md' | 'lg';
}

const ratingLabels: Record<DealRating, string> = {
  steal: 'Great Steal!',
  great_deal: 'Great Deal',
  fair: 'Fair Price',
  above_average: 'Above Average',
  ripoff: 'Overpriced',
};

const ratingColors: Record<DealRating, string> = {
  steal: 'text-green-600',
  great_deal: 'text-green-500',
  fair: 'text-yellow-500',
  above_average: 'text-orange-500',
  ripoff: 'text-red-600',
};

export default function DealMeter({ dealScore, dealRating, percentVsAverage, size = 'md' }: DealMeterProps) {
  // Convert deal_score (0-100) to position on bar
  // Score 100 = leftmost (steal/cheap), Score 0 = rightmost (ripoff/expensive)
  // We invert: position = (100 - dealScore) to place marker
  const position = Math.max(0, Math.min(100, 100 - dealScore));

  const barHeight = size === 'sm' ? 'h-2' : size === 'lg' ? 'h-4' : 'h-3';
  const markerSize = size === 'sm' ? 'w-3 h-3' : size === 'lg' ? 'w-5 h-5' : 'w-4 h-4';

  return (
    <div className="w-full">
      {/* Gradient bar */}
      <div className="relative">
        <div
          className={`w-full ${barHeight} rounded-full`}
          style={{
            background: 'linear-gradient(to right, #22c55e, #84cc16, #eab308, #f97316, #ef4444)',
          }}
        />
        {/* Marker */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 ${markerSize} rounded-full bg-white border-2 border-gray-700 shadow-md`}
          style={{ left: `${position}%` }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between mt-1 text-xs text-gray-400">
        <span>Steal</span>
        <span>Fair</span>
        <span>Ripoff</span>
      </div>

      {/* Rating */}
      <div className="mt-1 flex items-center gap-2">
        <span className={`font-semibold text-sm ${ratingColors[dealRating]}`}>
          {ratingLabels[dealRating]}
        </span>
        {percentVsAverage !== undefined && (
          <span className="text-xs text-gray-500">
            ({percentVsAverage > 0 ? '+' : ''}{percentVsAverage}% vs average)
          </span>
        )}
      </div>
    </div>
  );
}
