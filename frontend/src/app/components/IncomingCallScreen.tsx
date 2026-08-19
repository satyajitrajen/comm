'use client';

import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import Portal from './Portal';
import {
  isDocumentPipSupported,
  moveToDocumentPip,
  restoreFromDocumentPip,
} from '../../lib/documentPip';

type IncomingCallProps = {
  callerName: string;
  conversationName: string;
  callerAvatarUrl?: string | null;
  onAccept: () => void;
  onDecline: () => void;
};

export function IncomingCallScreen({
  callerName,
  conversationName,
  callerAvatarUrl,
  onAccept,
  onDecline,
}: IncomingCallProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const portalHostRef = useRef<HTMLDivElement>(null);

  // Tab Title Flashing Alert for another browser tab
  useEffect(() => {
    const originalTitle = document.title;
    let flash = false;
    const interval = setInterval(() => {
      flash = !flash;
      document.title = flash
        ? `📞 Incoming Call - ${callerName}`
        : `🔔 (${callerName} is calling...)`;
    }, 1000);

    return () => {
      clearInterval(interval);
      document.title = originalTitle;
    };
  }, [callerName]);

  // Keyboard shortcut (Escape to decline)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDecline();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onDecline]);

  // Audio ringtone with autoplay policy fallback & interaction unlock
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

  // Pop out Document Picture-in-Picture window so notification floats over other tabs/windows
  useEffect(() => {
    const card = cardRef.current;
    const host = portalHostRef.current;
    if (!card || !host) return;

    if (isDocumentPipSupported()) {
      void moveToDocumentPip(card, host, {
        width: 360,
        height: 280,
      });
    }

    return () => {
      restoreFromDocumentPip();
    };
  }, []);

  const handleAccept = () => {
    restoreFromDocumentPip();
    onAccept();
  };

  const handleDecline = () => {
    restoreFromDocumentPip();
    onDecline();
  };

  const formattedChannel = conversationName.startsWith('#')
    ? conversationName
    : `#${conversationName}`;

  return (
    <Portal>
      <div
        ref={portalHostRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Incoming call from ${callerName}`}
        className="fixed inset-0 z-[250] pointer-events-none flex items-center justify-center p-4"
      >
        {/* Subtle transparent backdrop overlay */}
        <div className="absolute inset-0 bg-black/40 backdrop-blur-md pointer-events-auto" onClick={handleDecline} />

        {/* Incoming Call Notification Card with vibrant glassmorphism */}
        <div
          ref={cardRef}
          className="pointer-events-auto relative z-10 w-full max-w-[340px] overflow-hidden rounded-3xl bg-slate-900/40 backdrop-blur-2xl p-7 text-white shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/25 transition-all select-none"
        >
          {/* Glass specular reflection layer */}
          <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />

          {/* Avatar with glass glow */}
          <div className="flex justify-center relative z-10">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30 max-w-[80px] mx-auto" />
            {callerAvatarUrl ? (
              <img
                src={callerAvatarUrl}
                alt={callerName}
                className="h-20 w-20 rounded-full object-cover border border-white/40 shadow-xl shadow-black/30"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur-md border border-white/35 text-2xl font-bold text-white shadow-xl shadow-black/20">
                {callerName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Caller & Channel Name */}
          <div className="mt-4 text-center relative z-10">
            <h2 className="text-xl font-bold tracking-tight text-white drop-shadow-md">{callerName}</h2>
            <p className="mt-1 text-sm font-medium text-white/80">
              is Calling <span className="text-emerald-300 font-semibold drop-shadow">{formattedChannel}</span>
            </p>
          </div>

          {/* Action Buttons: Decline & Accept with Glassmorphism */}
          <div className="mt-6 flex items-center gap-3 relative z-10">
            {/* Decline Button */}
            <button
              type="button"
              onClick={handleDecline}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-red-500/25 hover:bg-red-500/40 backdrop-blur-lg px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-red-950/40 transition active:scale-95 cursor-pointer border border-red-400/40"
            >
              <PhoneOff className="h-4 w-4 text-red-200" />
              <span>Decline</span>
            </button>

            {/* Accept Button */}
            <button
              type="button"
              onClick={handleAccept}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500/25 hover:bg-emerald-500/40 backdrop-blur-lg px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-950/40 transition active:scale-95 cursor-pointer border border-emerald-400/40"
            >
              <Phone className="h-4 w-4 text-emerald-200" />
              <span>Accept</span>
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

