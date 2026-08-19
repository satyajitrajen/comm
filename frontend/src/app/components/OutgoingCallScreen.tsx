'use client';

import { useEffect } from 'react';
import { PhoneOff } from 'lucide-react';
import Portal from './Portal';

type OutgoingCallScreenProps = {
  conversationName: string;
  onCancel: () => void;
};

export function OutgoingCallScreen({
  conversationName,
  onCancel,
}: OutgoingCallScreenProps) {
  // Ringback audio for caller with autoplay fallback & interaction unlock
  useEffect(() => {
    const audio = new Audio('/ringtone.mp3');
    audio.loop = true;

    const tryPlay = () => {
      audio.play().catch(() => {
        // Autoplay policy prevented playback until user interaction
      });
    };

    tryPlay();

    const handleUnlock = () => {
      if (audio.paused) {
        void audio.play().catch(() => {});
      }
    };

    window.addEventListener('pointerdown', handleUnlock, { once: true });
    window.addEventListener('keydown', handleUnlock, { once: true });

    return () => {
      window.removeEventListener('pointerdown', handleUnlock);
      window.removeEventListener('keydown', handleUnlock);
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Calling ${conversationName}`}
        className="fixed inset-0 z-[250] flex items-center justify-center p-4"
      >
        {/* Subtle transparent backdrop overlay */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md" />

        {/* Ringing card with vibrant glassmorphism */}
        <div className="relative z-10 w-full max-w-[340px] overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-2xl p-7 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/25 select-none">
          {/* Glass specular reflection layer */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />

          {/* Animated Avatar Ringing Glow */}
          <div className="relative mx-auto mb-5 flex h-20 w-20 items-center justify-center z-10">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-400/30" />
            <span className="absolute inset-2 animate-ping rounded-full bg-blue-400/20 [animation-delay:0.3s]" />
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md text-2xl font-bold text-white shadow-xl shadow-black/20 border border-white/35">
              {conversationName.slice(0, 2).toUpperCase()}
            </div>
          </div>

          <div className="mt-2 text-center relative z-10">
            <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-md">{conversationName}</h2>
            <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 backdrop-blur-md border border-blue-400/30 px-3.5 py-1 text-xs font-semibold text-blue-200 animate-pulse shadow-inner">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
              <span>Ringing...</span>
            </div>
          </div>

          {/* Cancel button */}
          <div className="mt-6 flex justify-center relative z-10">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/25 hover:bg-red-500/40 backdrop-blur-lg px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition active:scale-95 cursor-pointer border border-red-400/40"
            >
              <PhoneOff className="h-4 w-4 text-red-200" />
              <span>Cancel Call</span>
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
