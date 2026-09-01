/**
 * The time of day the owner sets the нагадування for, and the parse of what they typed.
 *
 * Pure and injected-nothing: no clock, no zone, no `Date`. A `TimeOfDay` is a wall-clock hour and
 * minute — the hour the owner chose, in whatever zone the phone is in — and it is deliberately not
 * an instant, for the same reason a транзакція's дата is a calendar date and not one: an instant
 * would carry a zone, and the нагадування must arrive at 21:00 wherever the phone is (design D12).
 *
 * The parse is `amount-input.ts`'s discipline applied to a second field: what the owner typed is
 * refused in their own words, and the value that was already set stands. It answers a value rather
 * than throwing (design D11) because the section shows the refusal beside the field instead of in
 * an Alert — nothing here is exceptional, a half-typed time is the normal state of a text field.
 */

/** An hour and a minute of the day, 00:00–23:59. Built only by `parseTimeOfDay` and the default. */
export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/**
 * What the section starts from before the owner has chosen: the evening, when a day's витрати are
 * behind them and the чернетки are waiting. A suggestion and nothing more — storage holds no time
 * until the owner sets one, so nothing on the phone claims 21:00 was their answer (design D3).
 */
export const DEFAULT_REMINDER_TIME: TimeOfDay = { hour: 21, minute: 0 };

/** A time, or the reason what was typed is not one — in the owner's words, for the field. */
export type TimeParse =
  | { readonly kind: 'time'; readonly time: TimeOfDay }
  | { readonly kind: 'refused'; readonly message: string };

/** «9:30» and «09:30» are the same time; anything else about the shape is refused below. */
const TYPED_TIME = /^(\d{1,2}):(\d{2})$/;

/**
 * What the owner typed as a time of day, or a refusal naming what a time looks like.
 *
 * The three refusals are separate on purpose: an empty field is not a malformed one, and an hour
 * of 25 is not the same mistake as a minute of 60. Each says what is expected rather than merely
 * that something is wrong — the rule `parseAmount` keeps for суми.
 */
export function parseTimeOfDay(typed: string): TimeParse {
  const trimmed = typed.trim();
  if (trimmed === '') {
    return { kind: 'refused', message: 'Впишіть час, напр. 21:00 — порожнє поле нічого не змінює' };
  }
  const match = TYPED_TIME.exec(trimmed);
  if (!match) {
    return { kind: 'refused', message: `«${typed}» — це не час; напишіть години й хвилини, напр. 21:00` };
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23) {
    return { kind: 'refused', message: `у добі 24 години, а «${typed}» називає ${hour}-ту` };
  }
  if (minute > 59) {
    return { kind: 'refused', message: `у годині 60 хвилин, а «${typed}» називає ${minute}` };
  }
  return { kind: 'time', time: { hour, minute } };
}

/** A time as the field and the section show it: always «HH:MM», so 9:30 reads as 09:30. */
export function formatTimeOfDay(time: TimeOfDay): string {
  return `${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`;
}

/** Whether two times are the same one — the only comparison anything needs of them. */
export function sameTimeOfDay(a: TimeOfDay, b: TimeOfDay): boolean {
  return a.hour === b.hour && a.minute === b.minute;
}
