import { describe, expect, it } from 'vitest';

import { inMemoryBugReportFiles } from './bug-report-files';

const PICKED = { uri: 'file:///picked.png', mime: 'image/png' } as const;

describe('the files a репорт про помилку keeps and hands over', () => {
  it('Scenario: A picked image is kept with the репорт', async () => {
    const files = inMemoryBugReportFiles();

    const picked = await files.pickScreenshot();
    expect(picked.kind).toBe('picked');
    const kept = await files.keep('r1', PICKED);

    expect(kept).toEqual({ kind: 'kept', name: 'shot-1.png' });
    expect(files.kept('r1')).toEqual(['shot-1.png']);
    expect(await files.read('r1', 'shot-1.png')).toEqual({
      kind: 'read',
      mime: 'image/png',
      base64: 'BASE64-shot-1.png',
    });
  });

  it('Scenario: Backing out of the picker attaches nothing', async () => {
    const files = inMemoryBugReportFiles({ pick: { kind: 'cancelled' } });

    const picked = await files.pickScreenshot();

    // A dismissed picker is the owner changing their mind — a `cancelled`, never a `failed`.
    expect(picked).toEqual({ kind: 'cancelled' });
    expect(files.kept('r1')).toEqual([]);
  });

  it('Scenario: Handing over gives the system one file', async () => {
    const files = inMemoryBugReportFiles();

    const outcome = await files.share({ name: 'cap1tal-report.md', text: '# репорт' });

    expect(outcome).toEqual({ kind: 'handed-over' });
    expect(files.handed()).toEqual([{ name: 'cap1tal-report.md', text: '# репорт' }]);
  });

  it('Scenario: A phone without a chooser is told so', async () => {
    const files = inMemoryBugReportFiles({ outcome: { kind: 'unavailable' } });

    expect(await files.share({ name: 'r.md', text: '# репорт' })).toEqual({ kind: 'unavailable' });
    // Nothing left the phone, which is the whole of what `unavailable` has to mean.
    expect(files.handed()).toEqual([]);
  });

  it('Scenario: Nothing leaves without the owner', async () => {
    const files = inMemoryBugReportFiles();

    // A репорт saved and given a screenshot has still handed nothing to anyone.
    await files.keep('r1', PICKED);
    await files.read('r1', 'shot-1.png');

    expect(files.handed()).toEqual([]);
  });

  it('Scenario: Removing the репорт removes its screenshots', async () => {
    const files = inMemoryBugReportFiles();
    await files.keep('r1', PICKED);
    await files.keep('r1', { uri: 'file:///two.jpg', mime: 'image/jpeg' });
    await files.keep('r2', PICKED);

    await files.removeAll('r1');

    // The file half of the removal; the row half is the cascade in `reporting-repo.test.ts`.
    expect(files.kept('r1')).toEqual([]);
    expect(await files.read('r1', 'shot-1.png')).toEqual({
      kind: 'failed',
      reason: 'Файл не знайдено',
    });
    // And no other репорт lost anything.
    expect(files.kept('r2')).toEqual(['shot-3.png']);
  });

  it('says why an image could not be kept, rather than throwing', async () => {
    const files = inMemoryBugReportFiles({ keepFails: 'Немає місця на пристрої' });

    expect(await files.keep('r1', PICKED)).toEqual({
      kind: 'failed',
      reason: 'Немає місця на пристрої',
    });
    expect(files.kept('r1')).toEqual([]);
  });

  it('says why a file could not be prepared, and hands nothing over', async () => {
    const files = inMemoryBugReportFiles({
      outcome: { kind: 'failed', reason: 'Немає місця на пристрої' },
    });

    expect(await files.share({ name: 'r.md', text: '# репорт' })).toEqual({
      kind: 'failed',
      reason: 'Немає місця на пристрої',
    });
    expect(files.handed()).toEqual([]);
  });
});
