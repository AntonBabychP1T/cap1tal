import { describe, expect, it } from 'vitest';

import { inMemoryNotificationAccess, type NotificationAccess } from './notification-access';

/**
 * The port only — the device adapter is never loaded here, and must never be: `verify` runs no
 * native module and no React Native.
 */

describe('the notification access double', () => {
  it('Answers every state the device can give', async () => {
    const answers: NotificationAccess[] = ['granted', 'denied', 'unsupported'];
    for (const answer of answers) {
      await expect(inMemoryNotificationAccess(answer).state()).resolves.toBe(answer);
    }
  });

  it('Records that the settings screen was opened, so silence can be proven', async () => {
    const port = inMemoryNotificationAccess('denied');
    expect(port.opened()).toBe(0);
    await port.openSettings();
    expect(port.opened()).toBe(1);
  });
});
