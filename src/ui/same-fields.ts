/**
 * Whether a form still holds exactly what it opened on — app-shell, "A form with unsaved edits asks
 * before «назад» discards it". A form passes `!sameFields(current, opened)` to `useCloseOnBack` as
 * its `isDirty`, comparing its own field object: the strings as typed, the choices as picked.
 *
 * A field typed and erased again is no change: what matters is what the form would discard, not
 * the keystrokes. A key absent on one side and `undefined` on the other is the same empty field.
 * A list (the рахунки ticked into a склад) is compared as a set — ticking and unticking is no
 * change whatever order the ids end up in. Nothing nests deeper than that in any form.
 *
 * A form whose field object also carries bookkeeping the owner never sees (the розстрочка form's
 * "typed by hand" flags) leaves it out before asking: see `sameInstallmentFields`.
 */
export function sameFields<T extends object>(current: T, opened: T): boolean {
  const a = current as Readonly<Record<string, unknown>>;
  const b = opened as Readonly<Record<string, unknown>>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (!sameValue(a[key], b[key])) return false;
  }
  return true;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const opened = new Set<unknown>(b);
    return a.every((item) => opened.has(item));
  }
  return Object.is(a, b);
}
