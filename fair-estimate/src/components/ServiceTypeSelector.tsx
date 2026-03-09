'use client';

import { ServiceType } from '@/types';

interface ServiceOption {
  value: ServiceType;
  label: string;
  emoji: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  { value: 'auto_repair', label: 'Auto Repair', emoji: '🚗' },
  { value: 'hvac', label: 'HVAC', emoji: '❄️' },
  { value: 'plumbing', label: 'Plumbing', emoji: '🔧' },
  { value: 'electrical', label: 'Electrical', emoji: '⚡' },
  { value: 'roofing', label: 'Roofing', emoji: '🏠' },
  { value: 'appliance_repair', label: 'Appliance Repair', emoji: '🔌' },
  { value: 'other', label: 'Other', emoji: '📋' },
];

interface ServiceTypeSelectorProps {
  selected: ServiceType | null;
  onSelect: (type: ServiceType) => void;
}

export default function ServiceTypeSelector({ selected, onSelect }: ServiceTypeSelectorProps) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-3">What kind of quote is this?</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SERVICE_OPTIONS.map((option) => (
          <button
            key={option.value}
            onClick={() => onSelect(option.value)}
            className={`flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all min-h-[80px] ${
              selected === option.value
                ? 'border-blue-500 bg-blue-50 text-blue-700'
                : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span className="text-2xl mb-1">{option.emoji}</span>
            <span className="text-sm font-medium text-center">{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
