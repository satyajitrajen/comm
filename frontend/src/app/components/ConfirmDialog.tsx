'use client';

import { ReactNode, useEffect } from 'react';
import Portal from './Portal';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  confirmDisabled?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  confirmDisabled = false,
  loading = false,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700 disabled:opacity-50'
      : 'bg-blue-700 text-white hover:bg-blue-800 disabled:opacity-50';

  return (
    <Portal>
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/40 p-4">
        <div
          className="absolute inset-0"
          onClick={loading ? undefined : onCancel}
          aria-hidden
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-dialog-title"
          className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl"
        >
          <h3 id="confirm-dialog-title" className="text-lg font-bold text-slate-950">{title}</h3>
          {description && (
            <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
          )}
          {children && <div className="mt-4">{children}</div>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              disabled={loading}
              onClick={onCancel}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={loading || confirmDisabled}
              onClick={onConfirm}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${confirmClass}`}
            >
              {loading ? 'Please wait…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
