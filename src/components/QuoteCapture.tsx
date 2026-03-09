'use client';

import { useRef, useState } from 'react';

interface QuoteCaptureProps {
  onCapture: (file: File) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/heic,image/heif,application/pdf';
const MAX_SIZE_MB = 10;

export default function QuoteCapture({ onCapture }: QuoteCaptureProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    setError(null);

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be under ${MAX_SIZE_MB}MB`);
      return;
    }

    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
    if (!allowed.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|heic|heif|pdf)$/i)) {
      setError('Please upload a JPEG, PNG, HEIC, or PDF file');
      return;
    }

    onCapture(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleCameraCapture() {
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fall back to file input with camera
      if (fileInputRef.current) {
        fileInputRef.current.setAttribute('capture', 'environment');
        fileInputRef.current.click();
      }
      return;
    }

    // Use file input with capture attribute for mobile
    if (fileInputRef.current) {
      fileInputRef.current.setAttribute('capture', 'environment');
      fileInputRef.current.click();
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Camera button */}
      <button
        onClick={handleCameraCapture}
        className="w-full py-6 bg-blue-500 text-white rounded-2xl font-semibold text-lg flex flex-col items-center gap-2 hover:bg-blue-600 active:bg-blue-700 transition-colors shadow-md min-h-[120px]"
      >
        <span className="text-4xl">📷</span>
        <span>Snap a Photo of Your Quote</span>
        <span className="text-blue-200 text-sm font-normal">Point camera at the quote</span>
      </button>

      {/* File upload drop zone */}
      <div
        className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
          dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'
        }`}
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
      >
        <p className="text-gray-500 mb-2 text-sm">Or upload a file</p>
        <button
          onClick={() => {
            if (fileInputRef.current) {
              fileInputRef.current.removeAttribute('capture');
              fileInputRef.current.click();
            }
          }}
          className="text-blue-500 font-medium text-sm underline hover:text-blue-700"
        >
          Browse files
        </button>
        <p className="text-gray-400 text-xs mt-1">JPEG, PNG, HEIC, or PDF · Max 10MB</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_TYPES}
        onChange={handleFileInput}
        className="hidden"
      />

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
