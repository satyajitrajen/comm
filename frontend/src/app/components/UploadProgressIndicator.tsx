'use client';

import { Loader2 } from 'lucide-react';

type UploadProgressIndicatorProps = {
  label?: string;
  className?: string;
  variant?: 'inline' | 'banner';
};

export default function UploadProgressIndicator({
  label = 'Uploading...',
  className = '',
  variant = 'inline',
}: UploadProgressIndicatorProps) {
  if (variant === 'banner') {
    return (
      <div
        className={`rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-blue-700" />
          <span className="text-sm font-semibold text-blue-900">{label}</span>
        </div>
        <div className="upload-progress-track mt-2">
          <div className="upload-progress-bar" />
        </div>
      </div>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role="status" aria-live="polite">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </span>
  );
}
