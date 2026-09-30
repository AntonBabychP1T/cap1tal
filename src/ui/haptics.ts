import type { HapticEffect } from '../platform/haptics';
import type { SyncRun } from '../monobank/coordinator';
import { syncFailed } from './monobank-screen';

/**
 * When the phone plays a haptic, and which (motion, "An outcome the owner caused is felt once",
 * "The owner can turn vibration off"; app-motion-pass design D13). Pure: every decision is here,
 * under `verify`, and `src/hooks/haptics-ports.ts` only asks it and calls the adapter.
 */

/**
 * The system effect each meaning plays, as plain names so the mapping is tested in Node: the
 * Android constant of `performAndroidHapticsAsync`, the one retried where the phone's API level
 * rejects it, and the iOS call. `performAndroidHapticsAsync` goes through the view's own haptic
 * feedback, which needs no permission and plays nothing while the phone's touch feedback is off.
 */
export const HAPTIC_EFFECTS: Readonly<
  Record<
    HapticEffect,
    {
      /** A key of `AndroidHaptics`, API 30+ (`Segment_Tick` API 34+). */
      readonly android: 'Confirm' | 'Reject' | 'Segment_Tick';
      /** A key of `AndroidHaptics` every API level plays. */
      readonly androidFallback: 'Context_Click' | 'Long_Press' | 'Clock_Tick';
      readonly ios:
        | { readonly call: 'notificationAsync'; readonly type: 'Success' | 'Error' }
        | { readonly call: 'selectionAsync' };
    }
  >
> = {
  confirm: {
    android: 'Confirm',
    androidFallback: 'Context_Click',
    ios: { call: 'notificationAsync', type: 'Success' },
  },
  reject: {
    android: 'Reject',
    androidFallback: 'Long_Press',
    ios: { call: 'notificationAsync', type: 'Error' },
  },
  tick: {
    android: 'Segment_Tick',
    androidFallback: 'Clock_Tick',
    ios: { call: 'selectionAsync' },
  },
};

/**
 * What the owner's action came to:
 * - `stored`, `removed`: a транзакція stored (the entry form, the editor, a confirmed чернетка, a
 *   категорія picked on a feed line) or removed
 * - `merged`: рахунки merged
 * - `rule-accepted`: a правило offered in a sheet accepted
 * - `scanned`: the scanner found a чек
 * - `refused`: a store refused, or storing it failed
 * - `failed`: a прогін, a Drive бекап or a token check the owner started failed
 * - `stepped`, `chosen`, `toggled`: a місяць stepped, a chip or `Choices` option picked, a switch
 *   flipped — each only when it changed something
 */
export type HapticEvent =
  | 'stored'
  | 'removed'
  | 'merged'
  | 'rule-accepted'
  | 'scanned'
  | 'refused'
  | 'failed'
  | 'stepped'
  | 'chosen'
  | 'toggled';

const EFFECT_OF: Readonly<Record<HapticEvent, HapticEffect>> = {
  stored: 'confirm',
  removed: 'confirm',
  merged: 'confirm',
  'rule-accepted': 'confirm',
  scanned: 'confirm',
  refused: 'reject',
  failed: 'reject',
  stepped: 'tick',
  chosen: 'tick',
  toggled: 'tick',
};

/** The effect an event plays, or `null` while the owner's «Вібрація» is off. */
export function hapticFor(event: HapticEvent, preference: { readonly enabled: boolean }): HapticEffect | null {
  return preference.enabled ? EFFECT_OF[event] : null;
}

/**
 * What a finished прогін the owner started plays: `failed` when `syncFailed` — the same rule the
 * monobank screen shows its summary by — holds, nothing otherwise. A рахунок that is перенесено or
 * скасовано is not a failure, so a прогін stopped with «Зупинити» plays nothing.
 */
export function syncOutcomeEvent(run: SyncRun): HapticEvent | null {
  return syncFailed(run) ? 'failed' : null;
}

/** A choice plays only when it changed the value: re-picking the current one is not a change. */
export function choiceEvent<T>(prev: T, next: T, event: 'stepped' | 'chosen' | 'toggled'): HapticEvent | null {
  return Object.is(prev, next) ? null : event;
}

/**
 * The one effect an owner action plays, of everything it raised (motion, "One owner action SHALL
 * play at most one haptic"): an outcome over a tick, since a категорія picked on a feed line both
 * changes a choice and stores a транзакція, and only the store is the outcome.
 */
export function strongestHaptic(effects: readonly HapticEffect[]): HapticEffect | null {
  if (effects.includes('reject')) return 'reject';
  if (effects.includes('confirm')) return 'confirm';
  return effects.includes('tick') ? 'tick' : null;
}
