'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import QuoteCapture from '@/components/QuoteCapture';
import ImagePreview from '@/components/ImagePreview';
import ServiceTypeSelector from '@/components/ServiceTypeSelector';
import VehicleInput from '@/components/VehicleInput';
import AnalysisLoading from '@/components/AnalysisLoading';
import { ServiceType } from '@/types';

type Step = 'capture' | 'preview' | 'service_type' | 'details' | 'loading';

interface VehicleInfo {
  year: string;
  make: string;
  model: string;
}

export default function HomePage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('capture');
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<ServiceType | null>(null);
  const [zipCode, setZipCode] = useState('');
  const [vehicle, setVehicle] = useState<VehicleInfo>({ year: '', make: '', model: '' });
  const [error, setError] = useState<string | null>(null);

  const handleCapture = useCallback((file: File) => {
    setCapturedFile(file);
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    setStep('preview');
  }, []);

  const handlePreviewConfirm = () => {
    setStep('service_type');
  };

  const handleRetake = () => {
    setPreviewUrl(null);
    setCapturedFile(null);
    setStep('capture');
  };

  const handleServiceTypeSelect = (type: ServiceType) => {
    setServiceType(type);
    setStep('details');
  };

  const handleAnalyze = async () => {
    if (!capturedFile || !serviceType) return;

    if (!zipCode || zipCode.length < 5) {
      setError('Please enter a valid 5-digit ZIP code');
      return;
    }

    setError(null);
    setStep('loading');

    try {
      const formData = new FormData();
      formData.append('image', capturedFile);
      formData.append('zip_code', zipCode);
      formData.append('service_type', serviceType);

      if (serviceType === 'auto_repair' && vehicle.year && vehicle.make && vehicle.model) {
        formData.append('vehicle_year', vehicle.year);
        formData.append('vehicle_make', vehicle.make);
        formData.append('vehicle_model', vehicle.model);
      }

      const response = await fetch('/api/quote/analyze', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Analysis failed');
      }

      const result = await response.json();
      router.push(`/results/${result.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setError(message);
      setStep('details');
    }
  };

  const stepIndex = ['capture', 'preview', 'service_type', 'details'].indexOf(step);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Is It a Fair Estimate?</h1>
          <p className="text-gray-500 text-sm mt-1">Know before you pay.</p>
        </div>

        {/* Step indicator */}
        {step !== 'loading' && (
          <div className="flex gap-1 mb-6">
            {(['capture', 'preview', 'service_type', 'details'] as Step[]).map((s, i) => (
              <div
                key={s}
                className={`flex-1 h-1 rounded-full transition-colors ${
                  stepIndex >= i ? 'bg-blue-500' : 'bg-gray-200'
                }`}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          {step === 'capture' && (
            <QuoteCapture onCapture={handleCapture} />
          )}

          {step === 'preview' && previewUrl && (
            <ImagePreview
              imageSrc={previewUrl}
              onConfirm={handlePreviewConfirm}
              onRetake={handleRetake}
            />
          )}

          {step === 'service_type' && (
            <ServiceTypeSelector
              selected={serviceType}
              onSelect={handleServiceTypeSelect}
            />
          )}

          {step === 'details' && (
            <div className="space-y-4">
              {/* ZIP code */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Your ZIP Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="75024"
                  maxLength={5}
                  value={zipCode}
                  onChange={(e) => setZipCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                />
                <p className="text-xs text-gray-400 mt-1">Used to find local pricing data</p>
              </div>

              {/* Vehicle details for auto repair */}
              {serviceType === 'auto_repair' && (
                <VehicleInput value={vehicle} onChange={setVehicle} />
              )}

              {/* Error */}
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleAnalyze}
                disabled={!zipCode || zipCode.length < 5}
                className="w-full py-4 bg-blue-500 text-white rounded-xl font-semibold text-lg hover:bg-blue-600 active:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[56px]"
              >
                Analyze This Quote →
              </button>

              <button
                onClick={() => setStep('service_type')}
                className="w-full py-3 text-gray-500 text-sm hover:text-gray-700"
              >
                ← Change quote type
              </button>
            </div>
          )}

          {step === 'loading' && <AnalysisLoading />}
        </div>

        {/* Trust signals */}
        {step === 'capture' && (
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-400">
              📸 Upload any quote image · 🔒 Your data is private · ⚡ Results in ~20 seconds
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
