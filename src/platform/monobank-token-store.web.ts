import type { MonobankTokenStore } from './monobank-token';

/**
 * The web build's answer: there is no secure storage here, so there is no token here.
 *
 * Deliberately not `localStorage`. A bearer secret in ordinary browser storage is readable by any
 * script the page ever loads, and the whole point of the native adapter is that the token lives
 * where the operating system keeps secrets. An honest "unavailable" leaves the owner without
 * monobank on the web and with their money history intact; a fallback would trade that for a
 * secret in a place the vision never agreed to put one.
 *
 * Android is the delivery target and the native adapter also serves a future iOS build; the web
 * output exists so `expo start --web` runs, not so the app is used there.
 */
export const monobankTokenStore: MonobankTokenStore = {
  read: async () => ({ kind: 'unavailable' }),
  save: async () => ({ kind: 'unavailable' }),
  remove: async () => ({ kind: 'unavailable' }),
};
