'use client';

interface NegotiationTipsProps {
  tips: string[];
}

export default function NegotiationTips({ tips }: NegotiationTipsProps) {
  if (tips.length === 0) return null;

  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
      <h2 className="text-lg font-semibold text-indigo-800 mb-3 flex items-center gap-2">
        💬 Negotiation Tips
      </h2>
      <ol className="space-y-2">
        {tips.map((tip, i) => (
          <li key={i} className="flex gap-2 text-sm text-indigo-700">
            <span className="font-bold shrink-0">{i + 1}.</span>
            <span>{tip}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
