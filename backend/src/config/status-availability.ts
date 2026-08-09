/**
 * Presence is modelled as two independent concerns. Collapsing them into one
 * column is what caused users to be stranded "Online" after a restart and had
 * manual AWAY / DND choices wiped on every reconnect.
 *
 *   presence      - derived. Does the user hold a live socket right now?
 *                   Owned by PresenceService, in memory, never persisted.
 *
 *   availability  - declared. An override the user chose for themselves.
 *                   Durable, stored in `UserProfile.statusAvailability`,
 *                   and never written by the realtime layer.
 *
 * The two combine at the edge (see `resolveStatus`) into the single value the
 * UI renders. Keep this file in sync with the frontend's
 * `frontend/src/lib/statusAvailability.ts`, which owns labels and dot colours.
 */

/** Overrides a user may declare. `null` means "no override". */
export const AVAILABILITY_VALUES = ['AWAY', 'DND', 'OUT_OF_OFFICE'] as const;

export type Availability = (typeof AVAILABILITY_VALUES)[number];

export type Presence = 'ONLINE' | 'OFFLINE';

const AVAILABILITY_SET: ReadonlySet<string> = new Set(AVAILABILITY_VALUES);

/**
 * Values that older builds persisted into the availability column. Neither is
 * a declared override: 'ACTIVE' was connection state and 'OFFLINE' was the
 * absence of it. Both are migrated to null and rejected on write.
 */
export const LEGACY_PRESENCE_VALUES = ['ACTIVE', 'OFFLINE'] as const;

export function isValidAvailability(value: string): value is Availability {
  return AVAILABILITY_SET.has(value);
}

/**
 * The single value the UI shows. A declared override always wins - someone on
 * Do-not-disturb reads as DND whether or not a tab happens to be open - and
 * otherwise presence decides between ONLINE and OFFLINE.
 */
export function resolveStatus(
  presence: Presence,
  availability: Availability | null,
): Availability | Presence {
  return availability ?? presence;
}
