'use client';

import { LineItemAnalysis } from '@/types';
import LineItemCard from './LineItemCard';

interface LineItemListProps {
  lineItemAnalyses: LineItemAnalysis[];
}

export default function LineItemList({ lineItemAnalyses }: LineItemListProps) {
  if (lineItemAnalyses.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        No line items to display
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-gray-800 mb-3">Line Items</h2>
      {lineItemAnalyses.map((analysis, i) => (
        <LineItemCard key={i} analysis={analysis} />
      ))}
    </div>
  );
}
