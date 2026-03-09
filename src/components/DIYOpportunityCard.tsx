'use client';

import { DIYDifficulty, AffiliateLink } from '@/types';

interface DIYOpportunityCardProps {
  itemDescription: string;
  shopPrice: number;
  diyCost: number;
  savings: number;
  difficulty: DIYDifficulty;
  timeEstimate: string;
  affiliateLinks: AffiliateLink[];
  videoSearchTerm?: string | null;
}

const difficultyBadge: Record<DIYDifficulty, { label: string; className: string }> = {
  easy: { label: 'Easy', className: 'bg-green-100 text-green-700' },
  moderate: { label: 'Moderate', className: 'bg-yellow-100 text-yellow-700' },
  hard: { label: 'Hard', className: 'bg-orange-100 text-orange-700' },
  expert_only: { label: 'Expert Only', className: 'bg-red-100 text-red-700' },
  not_diy: { label: 'Pro Only', className: 'bg-gray-100 text-gray-500' },
};

export default function DIYOpportunityCard({
  itemDescription,
  shopPrice,
  diyCost,
  savings,
  difficulty,
  timeEstimate,
  affiliateLinks,
  videoSearchTerm,
}: DIYOpportunityCardProps) {
  const badge = difficultyBadge[difficulty];

  return (
    <div className="border-l-4 border-blue-400 bg-blue-50 rounded-r-lg p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-sm font-semibold text-blue-700">
          🚩 DIY OPPORTUNITY — Save ${Math.round(savings)}
        </span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className} ml-2 whitespace-nowrap`}>
          {badge.label}
        </span>
      </div>

      <h3 className="font-medium text-gray-800 mb-2">{itemDescription}</h3>

      <div className="flex gap-4 mb-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Shop price</div>
          <div className="font-semibold text-gray-700">${shopPrice.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">DIY part cost</div>
          <div className="font-semibold text-green-600">${diyCost.toFixed(2)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Your savings</div>
          <div className="font-bold text-green-700">${Math.round(savings)}</div>
        </div>
      </div>

      {timeEstimate && timeEstimate !== 'N/A' && (
        <div className="text-xs text-gray-500 mb-3">
          ⏱ Estimated time: {timeEstimate}
        </div>
      )}

      {/* Affiliate links */}
      {affiliateLinks.length > 0 && (
        <div className="mb-3">
          <div className="text-xs font-medium text-gray-600 mb-1">🛒 Buy the part:</div>
          <div className="flex flex-wrap gap-2">
            {affiliateLinks.map((link, i) => (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="inline-flex items-center px-3 py-1.5 bg-white border border-blue-200 rounded-lg text-xs font-medium text-blue-700 hover:bg-blue-50 active:bg-blue-100 transition-colors min-h-[44px] items-center"
              >
                {link.display_name}
                {link.estimated_price && <span className="ml-1 text-gray-500">~${link.estimated_price.toFixed(0)}</span>}
                {link.in_store_pickup && <span className="ml-1 text-green-600">✓ Store pickup</span>}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* YouTube search */}
      {videoSearchTerm && (
        <a
          href={`https://www.youtube.com/results?search_query=${encodeURIComponent(videoSearchTerm)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-xs text-red-600 hover:underline"
        >
          📺 Watch: {videoSearchTerm}
        </a>
      )}

      {/* FTC disclosure */}
      <p className="text-xs text-gray-400 mt-2 italic">
        We may earn a small commission from these links — doesn&apos;t affect your price.
      </p>
    </div>
  );
}
