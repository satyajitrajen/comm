/**
 * Presence is two separate things. Mirrors
 * `backend/src/config/status-availability.ts`.
 *
 *   presence      - derived from a live socket. ONLINE or OFFLINE.
 *                   Nobody can set this, not even an admin; it is a fact about
 *                   the connection, not a preference.
 *
 *   availability  - an override the user declares for themselves
 *                   (AWAY / DND / OUT_OF_OFFICE), or null for none.
 *
 * `resolveStatus` combines them into the single value the UI renders.
 */

export type Presence = 'ONLINE' | 'OFFLINE';
export type Availability = 'AWAY' | 'DND' | 'OUT_OF_OFFICE';

type StatusDisplay = { label: string; dotClass: string; hex: string };

/** Overrides a user may pick. Online/Offline are deliberately absent. */
export const AVAILABILITY_OPTIONS: ReadonlyArray<
  { value: Availability } & StatusDisplay
> = [
  { value: 'AWAY', label: 'Away', dotClass: 'status-dot-amber bg-amber-400', hex: '#fbbf24' },
  { value: 'DND', label: 'Do not disturb', dotClass: 'status-dot-red bg-red-500', hex: '#ef4444' },
  { value: 'OUT_OF_OFFICE', label: 'Out of office', dotClass: 'status-dot-purple bg-purple-500', hex: '#a855f7' },
];

const ONLINE: StatusDisplay = { label: 'Online', dotClass: 'status-dot-emerald bg-emerald-500', hex: '#10b981' };
const OFFLINE: StatusDisplay = { label: 'Offline', dotClass: 'bg-slate-300', hex: '#cbd5e1' };

const byAvailability = new Map<string, StatusDisplay>(
  AVAILABILITY_OPTIONS.map((o) => [o.value, o]),
);

export type HasStatus = {
  presence?: Presence | string | null;
  availability?: Availability | string | null;
};

/**
 * A declared override always wins - someone on Do-not-disturb reads as DND
 * whether or not a tab happens to be open. Otherwise the live connection
 * decides.
 */
export function resolveStatus(subject?: HasStatus | null): StatusDisplay {
  if (!subject) return OFFLINE;
  const availability = subject.availability;
  if (availability) {
    const match = byAvailability.get(availability);
    if (match) return match;
  }
  const p = typeof subject.presence === 'string' ? subject.presence.toUpperCase() : '';
  if (p === 'OFFLINE' || (subject as any).isOnline === false || (subject as any).status === 'OFFLINE' || (subject as any).status === 'offline') {
    return OFFLINE;
  }
  return ONLINE;
}

export function statusLabel(subject?: HasStatus | null): string {
  return resolveStatus(subject).label;
}

export function statusDotClass(subject?: HasStatus | null): string {
  return resolveStatus(subject).dotClass;
}

export function isOnline(subject?: HasStatus | null): boolean {
  return subject?.presence === 'ONLINE';
}

/**
 * Picker options. The first entry clears the override and hands the dot back
 * to live presence - it is not a way to force yourself Online.
 */
export const AVAILABILITY_PICKER_OPTIONS: ReadonlyArray<{
  value: '' | Availability;
  label: string;
  dotClass: string;
  hex: string;
}> = [
  { value: '', label: 'Available', dotClass: 'status-dot-emerald bg-emerald-500', hex: '#10b981' },
  { value: 'AWAY', label: 'Away', dotClass: 'status-dot-amber bg-amber-400', hex: '#fbbf24' },
  { value: 'DND', label: 'Do not disturb', dotClass: 'status-dot-red bg-red-500', hex: '#ef4444' },
  { value: 'OUT_OF_OFFICE', label: 'Out of office', dotClass: 'status-dot-purple bg-purple-500', hex: '#a855f7' },
];
