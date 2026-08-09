/**
 * Short UI beep for alerts (Web Audio; no external asset).
 *
 * **Autoplay:** Many browsers block `AudioContext` until the user has interacted
 * with the page (click, keypress). After one gesture in the app, tones should work.
 * If this returns silently, that policy is in effect — there is no reliable programmatic
 * unlock without a user gesture.
 */
export function playNotificationTone(kind: 'message' | 'call' | 'event' = 'message') {
  if (typeof window === 'undefined') return;
  try {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    const freq =
      kind === 'call' ? 880 : kind === 'event' ? 520 : 660;
    osc.frequency.value = freq;
    osc.type = 'sine';
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    osc.start(now);
    osc.stop(now + 0.2);
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 300);
  } catch {
    /* ignore — autoplay or AudioContext unsupported */
  }
}
