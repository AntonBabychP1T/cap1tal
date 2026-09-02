import { reportFailureEntry } from './journal';

/**
 * The dialog every refused action shows, as values.
 *
 * A screen's catch block used to read `Alert.alert('Не записано', failureMessage(error))`. It now
 * reads `Alert.alert(...failureAlert({ title: 'Не записано', where: 'local-save', error, report }))`
 * — the same one line, still saying the same words, and now also journaling the failure and
 * offering to report it.
 *
 * **The buttons are values, which is the whole point.** `src/ui/` never imports React Native, so
 * `verify` can read what the dialog would say and what its second button would do without a
 * device: that the offer is there, that its `onPress` carries the id of the entry just written,
 * and that closing the dialog does nothing at all. On a device the tuple is spread straight into
 * `Alert.alert`, so what the tests read is what the owner taps.
 *
 * `where` is the action's kind — `local-save`, `account-rename`, `monobank-link` — never a route
 * and never anything the owner typed. The route a репорт names is derived from the журнал itself
 * (design D9), so no call site has to know its own path.
 */

/** Structurally React Native's `AlertButton`, declared here so `src/ui/` imports nothing native. */
export interface AlertButtonSpec {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

/** Exactly `Alert.alert`'s first three arguments, in order, ready to be spread. */
export type FailureDialog = [title: string, message: string, buttons: AlertButtonSpec[]];

export const CLOSE_LABEL = 'Закрити';
export const REPORT_LABEL = 'Повідомити про помилку';

export function failureAlert(options: {
  readonly title: string;
  /** The action's kind, as the журнал names it. */
  readonly where: string;
  readonly error: unknown;
  /** Opens the репорт form with this failure attached. The id is all it is given. */
  readonly report: (entryId: string) => void;
}): FailureDialog {
  // Journaled before anything is shown: a dialog the owner dismissed in half a second is still a
  // failure that happened, and the entry is what the next репорт will carry.
  const { id, message } = reportFailureEntry(options.where, options.error);

  return [
    options.title,
    message,
    [
      // «Закрити» first, and with `cancel` style, so the back gesture and a tap outside land on
      // the harmless one — reporting is the deliberate act.
      { text: CLOSE_LABEL, style: 'cancel' },
      { text: REPORT_LABEL, onPress: () => options.report(id) },
    ],
  ];
}
