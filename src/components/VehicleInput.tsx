'use client';

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
}

interface VehicleInputProps {
  value: VehicleInfo;
  onChange: (value: VehicleInfo) => void;
  optional?: boolean;
}

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 30 }, (_, i) => currentYear - i);

export default function VehicleInput({ value, onChange, optional = true }: VehicleInputProps) {
  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">
        Vehicle Details {optional && <span className="text-gray-400 font-normal">(optional — improves accuracy)</span>}
      </h3>
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Year</label>
          <select
            value={value.year}
            onChange={(e) => onChange({ ...value, year: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Make</label>
          <input
            type="text"
            placeholder="Toyota"
            value={value.make}
            onChange={(e) => onChange({ ...value, make: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Model</label>
          <input
            type="text"
            placeholder="Camry"
            value={value.model}
            onChange={(e) => onChange({ ...value, model: e.target.value })}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
          />
        </div>
      </div>
    </div>
  );
}
