'use client';

import { DIYDifficulty } from '@/types';

interface DIYMeterProps {
  difficulty: DIYDifficulty;
  timeEstimate?: string;
}

const difficultyConfig: Record<DIYDifficulty, { label: string; color: string; icon: string; bars: number }> = {
  easy: { label: 'Easy DIY', color: 'text-green-600', icon: '🔧', bars: 1 },
  moderate: { label: 'Moderate DIY', color: 'text-yellow-600', icon: '🔧', bars: 2 },
  hard: { label: 'Hard DIY', color: 'text-orange-500', icon: '🔧', bars: 3 },
  expert_only: { label: 'Expert Only', color: 'text-red-500', icon: '⚙️', bars: 4 },
  not_diy: { label: 'Professional Only', color: 'text-gray-500', icon: '🚫', bars: 0 },
};

export default function DIYMeter({ difficulty, timeEstimate }: DIYMeterProps) {
  const config = difficultyConfig[difficulty];

  if (difficulty === 'not_diy') {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-400">
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs">{config.icon}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4].map((level) => (
          <div
            key={level}
            className={`w-1.5 h-3 rounded-sm ${
              level <= config.bars ? 'bg-current' : 'bg-gray-200'
            } ${config.color}`}
          />
        ))}
      </div>
      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
      {timeEstimate && timeEstimate !== 'N/A' && timeEstimate !== 'Unknown' && (
        <span className="text-xs text-gray-400">· {timeEstimate}</span>
      )}
    </div>
  );
}
