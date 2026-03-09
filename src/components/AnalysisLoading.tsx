'use client';

import { useEffect, useState } from 'react';

const MESSAGES = [
  { text: 'Reading your quote...', duration: 3000 },
  { text: 'Checking prices in your area...', duration: 4000 },
  { text: 'Looking for DIY opportunities...', duration: 3000 },
  { text: 'Building your report...', duration: 5000 },
];

export default function AnalysisLoading() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [dots, setDots] = useState('');

  useEffect(() => {
    let currentIndex = 0;
    let elapsed = 0;

    const dotsInterval = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);

    const messageInterval = setInterval(() => {
      elapsed += 500;
      const currentMessageDuration = MESSAGES[currentIndex]?.duration || 3000;
      if (elapsed >= currentMessageDuration && currentIndex < MESSAGES.length - 1) {
        currentIndex++;
        setMessageIndex(currentIndex);
        elapsed = 0;
      }
    }, 500);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(messageInterval);
    };
  }, []);

  const progress = ((messageIndex + 1) / MESSAGES.length) * 100;

  return (
    <div className="flex flex-col items-center justify-center min-h-[300px] p-8">
      {/* Animated logo/icon */}
      <div className="w-16 h-16 mb-6 relative">
        <div className="absolute inset-0 rounded-full border-4 border-blue-200"></div>
        <div
          className="absolute inset-0 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"
        ></div>
        <div className="absolute inset-0 flex items-center justify-center text-2xl">
          🔍
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-xs mb-4">
        <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Message */}
      <p className="text-gray-600 text-center font-medium text-lg">
        {MESSAGES[messageIndex]?.text}{dots}
      </p>

      <p className="text-gray-400 text-sm mt-2 text-center">
        This usually takes 15–30 seconds
      </p>
    </div>
  );
}
