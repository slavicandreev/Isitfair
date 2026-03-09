'use client';

import { useState } from 'react';
import { DIYDifficulty, AffiliateLink } from '@/types';
import DIYOpportunityCard from './DIYOpportunityCard';

interface DIYItem {
  description: string;
  shop_price: number;
  diy_cost: number;
  savings: number;
  difficulty: DIYDifficulty;
  time_estimate: string;
  affiliate_links: AffiliateLink[];
  video_search_term?: string | null;
}

interface DIYOpportunityBannerProps {
  opportunitiesCount: number;
  totalDIYSavings: number;
  items: DIYItem[];
}

export default function DIYOpportunityBanner({
  opportunitiesCount,
  totalDIYSavings,
  items,
}: DIYOpportunityBannerProps) {
  const [expanded, setExpanded] = useState(false);

  if (opportunitiesCount === 0) return null;

  return (
    <div className="rounded-xl border border-blue-200 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-lg">🚩</span>
          <div>
            <div className="font-semibold text-blue-800">
              {opportunitiesCount} DIY opportunit{opportunitiesCount > 1 ? 'ies' : 'y'} found
            </div>
            <div className="text-sm text-blue-600">
              Save up to ${Math.round(totalDIYSavings)}
            </div>
          </div>
        </div>
        <span className="text-blue-500 text-sm">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="p-4 space-y-3">
          {items.map((item, i) => (
            <DIYOpportunityCard
              key={i}
              itemDescription={item.description}
              shopPrice={item.shop_price}
              diyCost={item.diy_cost}
              savings={item.savings}
              difficulty={item.difficulty}
              timeEstimate={item.time_estimate}
              affiliateLinks={item.affiliate_links}
              videoSearchTerm={item.video_search_term}
            />
          ))}
        </div>
      )}
    </div>
  );
}
