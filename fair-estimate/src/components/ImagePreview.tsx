'use client';

import { useState } from 'react';

interface ImagePreviewProps {
  imageSrc: string;
  onConfirm: () => void;
  onRetake: () => void;
}

export default function ImagePreview({ imageSrc, onConfirm, onRetake }: ImagePreviewProps) {
  const [rotation, setRotation] = useState(0);

  const rotate = () => {
    setRotation((r) => (r + 90) % 360);
  };

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-gray-800">Does this look clear?</h2>
      <p className="text-sm text-gray-500">Make sure the quote text is readable before continuing.</p>

      <div className="relative overflow-hidden rounded-xl bg-gray-100 flex items-center justify-center min-h-[200px]">
        <img
          src={imageSrc}
          alt="Quote preview"
          className="max-w-full max-h-80 object-contain transition-transform duration-300"
          style={{ transform: `rotate(${rotation}deg)` }}
        />
      </div>

      <div className="flex gap-2">
        <button
          onClick={rotate}
          className="flex-1 py-3 px-4 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
        >
          ↻ Rotate
        </button>
        <button
          onClick={onRetake}
          className="flex-1 py-3 px-4 border border-gray-200 rounded-xl text-gray-600 font-medium hover:bg-gray-50 active:bg-gray-100 transition-colors min-h-[44px]"
        >
          Retake
        </button>
        <button
          onClick={onConfirm}
          className="flex-2 py-3 px-6 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 active:bg-blue-700 transition-colors min-h-[44px]"
        >
          Looks Good ✓
        </button>
      </div>
    </div>
  );
}
