import { describe, expect, it } from 'vitest';

import { queuedIdle } from '../platform/idle';
import { startLaunchChores } from './launch-chores';

describe('the launch chores', () => {
  it('Scenario: Launch chores run after the first screen is drawn', async () => {
    const idle = queuedIdle();
    const log: string[] = [];
    let finishSync: () => void = () => {};
    let finishBackup: () => void = () => {};

    startLaunchChores({
      schedule: idle.afterScreenSettles,
      report: (name) => log.push(`failed ${name}`),
      chores: [
        { name: 'seed', run: () => void log.push('seed') },
        { name: 'progress-evaluate', run: () => void log.push('judge') },
        { name: 'drain', run: () => void log.push('drain') },
        {
          name: 'monobank-sync',
          run: () => {
            log.push('sync started');
            return new Promise<void>((resolve) => {
              finishSync = () => {
                log.push('sync finished');
                resolve();
              };
            });
          },
        },
        {
          name: 'backup',
          run: () => {
            log.push('backup started');
            return new Promise<void>((resolve) => {
              finishBackup = () => {
                log.push('backup finished');
                resolve();
              };
            });
          },
        },
      ],
    });

    // The first screen is drawn with nothing started.
    expect(log).toEqual([]);

    idle.flush();
    // In order, each exactly once — and the бекап started without waiting for the sync to finish.
    expect(log).toEqual(['seed', 'judge', 'drain', 'sync started', 'backup started']);
    finishBackup();
    finishSync();
    await Promise.resolve();
    expect(log).toEqual([
      'seed',
      'judge',
      'drain',
      'sync started',
      'backup started',
      'backup finished',
      'sync finished',
    ]);
    idle.flush();
    expect(log.filter((line) => line === 'seed')).toHaveLength(1);
  });

  it('a chore that fails is reported and the others still start', async () => {
    const idle = queuedIdle();
    const log: string[] = [];
    startLaunchChores({
      schedule: idle.afterScreenSettles,
      report: (name, error) => log.push(`failed ${name}: ${(error as Error).message}`),
      chores: [
        {
          name: 'seed',
          run: () => {
            throw new Error('locked');
          },
        },
        { name: 'drain', run: () => Promise.reject(new Error('no access')) },
        { name: 'backup', run: () => void log.push('backup') },
      ],
    });
    idle.flush();
    await Promise.resolve();
    expect(log).toEqual(['failed seed: locked', 'backup', 'failed drain: no access']);
  });
});
