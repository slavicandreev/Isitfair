'use client';

import { useState } from 'react';
import { UpsellType } from '@/types';

interface UpsellFlagCardProps {
  itemDescription: string;
  quotedPrice: number;
  upsellType: UpsellType;
  reason: string;
  whenActuallyNeeded?: string | null;
  estimatedFairValue?: number | null;
}

const upsellTypeBadge: Record<UpsellType, { label: string; className: string }> = {
  likely_upsell: { label: 'Likely Unnecessary', className: 'bg-red-100 text-red-700' },
  conditional: { label: 'Conditional', className: 'bg-orange-100 text-orange-700' },
  bundled_markup: { label: 'Bundled Markup', className: 'bg-yellow-100 text-yellow-700' },
};

export default function UpsellFlagCard({
  itemDescription,
  quotedPrice,
  upsellType,
  reason,
  whenActuallyNeeded,
  estimatedFairValue,
}: UpsellFlagCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = upsellTypeBadge[upsellType];

  return (
    <div className="border-l-4 border-orange-400 bg-orange-50 rounded-r-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-orange-700">⚠️ POTENTIAL UPSELL</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
            {badge.label}
          </span>
        </div>
        <span className="text-sm font-bold text-gray-700 ml-2 whitespace-nowrap">
          ${quotedPrice.toFixed(2)}
        </span>
      </div>

      <h3 className="font-medium text-gray-800 mb-2">{itemDescription}</h3>

      <p className="text-sm text-gray-600 mb-2">{reason}</p>

      {estimatedFairValue !== null && estimatedFairValue !== undefined && (
        <div className="text-xs text-gray-500 mb-2">
          If genuinely needed: ~${estimatedFairValue.toFixed(0)}
        </div>
      )}

      {whenActuallyNeeded && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-orange-600 underline"
        >
          {expanded ? 'Hide' : 'When is this actually needed?'}
        </button>
      )}

      {expanded && whenActuallyNeeded && (
        <div className="mt-2 p-2 bg-white rounded text-xs text-gray-600 border border-orange-200">
          {whenActuallyNeeded}
        </div>
      )}
    </div>
  );
}
