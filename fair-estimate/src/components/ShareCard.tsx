'use client';

import { DealRating } from '@/types';

interface ShareCardProps {
  dealRating: DealRating;
  dealScore: number;
  totalQuoted: number;
  summary: string;
  quoteId: string;
}

const ratingEmoji: Record<DealRating, string> = {
  steal: '🟢',
  great_deal: '🟢',
  fair: '🟡',
  above_average: '🟠',
  ripoff: '🔴',
};

export default function ShareCard({ dealRating, dealScore, totalQuoted, summary, quoteId }: ShareCardProps) {
  const shareUrl = typeof window !== 'undefined' ? `${window.location.origin}/results/${quoteId}` : '';

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Is It a Fair Estimate?',
          text: `${ratingEmoji[dealRating]} My quote verdict: ${summary}`,
          url: shareUrl,
        });
      } catch {
        // User cancelled or not supported
      }
    } else {
      // Fallback: copy link
      await navigator.clipboard.writeText(shareUrl);
      alert('Link copied to clipboard!');
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleShare}
        className="flex-1 py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 active:bg-gray-300 transition-colors min-h-[44px] flex items-center justify-center gap-2"
      >
        <span>📤</span>
        <span>Share Result</span>
      </button>
      <button
        disabled
        className="flex-1 py-3 px-4 bg-gray-100 text-gray-400 rounded-xl font-medium cursor-not-allowed min-h-[44px] flex items-center justify-center gap-2"
        title="Coming soon"
      >
        <span>📄</span>
        <span>Export PDF</span>
      </button>
    </div>
  );
}
