import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  APP_DATA_FOLDER,
  inMemoryDrive,
  outcomeOfStatus,
  parseFileList,
  type DrivePort,
} from './drive';

/**
 * The Drive port and — the part that matters — the pure parsing and error mapping beside it, over
 * response shapes Drive actually sends. No test here makes a network call: the four `fetch`
 * endpoints live in `drive-device.ts`, and what is decided about what comes back lives here, the
 * way `src/monobank/api.ts` splits the same problem.
 */

/** A `files.list` body as Drive sends it — note `size` arrives as a string of digits. */
const LISTING = {
  kind: 'drive#fileList',
  incompleteSearch: false,
  files: [
    { kind: 'drive#file', id: '1aBc', name: 'cap1tal-20260905T081500Z.c1b', size: '1048576' },
    { kind: 'drive#file', id: '2dEf', name: 'cap1tal-20260906T080000Z.c1b', size: '1048600' },
  ],
};

/** A 403 body from an account with no room left, and one from an account that is not allowed. */
const QUOTA_EXCEEDED = {
  error: {
    code: 403,
    message: "The user's Drive storage quota has been exceeded.",
    errors: [{ domain: 'global', reason: 'storageQuotaExceeded', message: 'quota exceeded' }],
  },
};
const RATE_LIMITED = {
  error: {
    code: 403,
    message: 'Rate Limit Exceeded',
    errors: [{ domain: 'usageLimits', reason: 'userRateLimitExceeded', message: 'slow down' }],
  },
};
const FORBIDDEN = {
  error: {
    code: 403,
    message: 'Insufficient permission',
    errors: [{ domain: 'global', reason: 'insufficientPermissions', message: 'no permission' }],
  },
};

describe('what Drive’s answer means', () => {
  it('Scenario: Withdrawn access stops the claim of being connected', () => {
    // A 401 is the account having revoked the app, or the authorisation having expired.
    expect(outcomeOfStatus(401, {})).toEqual({ kind: 'withdrawn' });
    // And a 403 that is *not* about room is the same answer for the owner: connect again.
    expect(outcomeOfStatus(403, FORBIDDEN)).toEqual({ kind: 'withdrawn' });
  });

  it('Scenario: A full Drive is reported as a full Drive', () => {
    // The one case that must not be read as "connect again": the owner's Drive has no room, and
    // reconnecting would not add any. Told apart by the reason Google puts in the body, never
    // guessed from the status, because 403 means both things.
    expect(outcomeOfStatus(403, QUOTA_EXCEEDED)).toEqual({ kind: 'full' });
  });

  it('A throttle is not a revoked authorisation', () => {
    // Drive answers 403 for "too often" as well. Reading that as «Google забрав доступ» would send
    // the owner through the consent screen every time the app is merely asked to wait.
    expect(outcomeOfStatus(403, RATE_LIMITED)).toEqual({ kind: 'unavailable' });
    expect(outcomeOfStatus(429, {})).toEqual({ kind: 'unavailable' });
  });

  it('A success is not an outcome at all, and everything else is unavailable', () => {
    expect(outcomeOfStatus(200, {})).toBeUndefined();
    expect(outcomeOfStatus(204, undefined)).toBeUndefined();
    expect(outcomeOfStatus(206, {})).toBeUndefined();

    // A 500, a 429, a 404: one answer, because the owner's next step is the same for all three —
    // it is tried again when a backup is next due.
    for (const status of [400, 404, 500, 503]) {
      expect(outcomeOfStatus(status, {})).toEqual({ kind: 'unavailable' });
    }
  });

  it('never throws on a body of the wrong shape', () => {
    // Parsing someone else's JSON: a 403 whose body is a string, an array, or missing must produce
    // an answer, because a full Drive surfacing as a crash is the failure this file exists to stop.
    for (const body of [undefined, null, 'nope', [], 42, { error: 'nope' }, { error: { errors: 'x' } }]) {
      expect(outcomeOfStatus(403, body)).toEqual({ kind: 'withdrawn' });
    }
  });
});

describe('reading what is in the folder', () => {
  it('reads the files Drive names, with sizes that arrive as strings', () => {
    expect(parseFileList(LISTING)).toEqual([
      { id: '1aBc', name: 'cap1tal-20260905T081500Z.c1b', size: 1_048_576 },
      { id: '2dEf', name: 'cap1tal-20260906T080000Z.c1b', size: 1_048_600 },
    ]);
  });

  it('An empty folder is not the same as an unreadable answer', () => {
    // A phone that has connected and not yet uploaded: the section says «ще не було», which needs
    // this to be an empty list and not a failure.
    expect(parseFileList({ files: [] })).toEqual([]);
    // And a body that is not a listing at all is `undefined`, so a caller cannot mistake it for
    // an empty folder and start deleting.
    expect(parseFileList({})).toBeUndefined();
    expect(parseFileList(null)).toBeUndefined();
    expect(parseFileList('nope')).toBeUndefined();
    expect(parseFileList({ files: 'nope' })).toBeUndefined();
  });

  it('One unreadable entry fails the whole listing', () => {
    // Deliberate: a partial listing would let rotation delete версії it never saw. Better to
    // report that the folder could not be read and change nothing.
    expect(parseFileList({ files: [{ id: '1', name: 'a' }, { id: 2, name: 'b' }] })).toBeUndefined();
    expect(parseFileList({ files: [{ name: 'no id' }] })).toBeUndefined();
    expect(parseFileList({ files: [{ id: '', name: 'empty id' }] })).toBeUndefined();
  });

  it('A file with no size is still a file', () => {
    // `size` is only used to confirm an upload arrived. A версія бекапу whose size Drive will not
    // state is still one that must not be lost.
    expect(parseFileList({ files: [{ id: '1', name: 'a.c1b' }] })).toEqual([
      { id: '1', name: 'a.c1b', size: 0 },
    ]);
    expect(parseFileList({ files: [{ id: '1', name: 'a.c1b', size: 'huge' }] })).toEqual([
      { id: '1', name: 'a.c1b', size: 0 },
    ]);
  });
});

describe('the folder the app writes to', () => {
  it('is the app’s own and never the owner’s documents', () => {
    expect(APP_DATA_FOLDER).toBe('appDataFolder');
  });
});

describe('the Drive double', () => {
  it('holds real bytes, so a бекап can be put up and fetched back', async () => {
    const drive: DrivePort = inMemoryDrive();
    const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

    const uploaded = await drive.upload('cap1tal-20260906T080000Z.c1b', bytes);
    expect(uploaded).toMatchObject({ kind: 'ok' });
    const id = uploaded.kind === 'ok' ? uploaded.value.id : '';

    expect(await drive.download(id)).toEqual({ kind: 'ok', value: bytes });
    // The range read a listing uses to fetch an envelope's head and not a whole бекап.
    expect(await drive.download(id, 4)).toEqual({ kind: 'ok', value: new Uint8Array([1, 2, 3, 4]) });
  });

  it('lists by name, which is by the moment each бекап was made', async () => {
    const drive = inMemoryDrive({
      files: [
        { name: 'cap1tal-20260906T080000Z.c1b', bytes: new Uint8Array([2]) },
        { name: 'cap1tal-20260904T080000Z.c1b', bytes: new Uint8Array([1]) },
      ],
    });

    const listed = await drive.list();
    expect(listed.kind === 'ok' && listed.value.map((file) => file.name)).toEqual([
      'cap1tal-20260904T080000Z.c1b',
      'cap1tal-20260906T080000Z.c1b',
    ]);
  });

  it('Scenario: A failed upload leaves the folder untouched', async () => {
    const drive = inMemoryDrive({
      files: [{ name: 'cap1tal-20260905T081500Z.c1b', bytes: new Uint8Array([1]) }],
      failUploadWith: { kind: 'full' },
    });

    expect(await drive.upload('cap1tal-20260906T080000Z.c1b', new Uint8Array([2]))).toEqual({
      kind: 'full',
    });
    // Every версія бекапу already there is exactly as it was.
    expect(drive.contents().map((file) => file.name)).toEqual(['cap1tal-20260905T081500Z.c1b']);
  });

  it('Scenario: No network is a reported state — and nothing is written', async () => {
    const drive = inMemoryDrive({ failWith: { kind: 'no-network' } });

    expect(await drive.list()).toEqual({ kind: 'no-network' });
    expect(await drive.upload('a.c1b', new Uint8Array([1]))).toEqual({ kind: 'no-network' });
    expect(await drive.download('file-1')).toEqual({ kind: 'no-network' });
    expect(await drive.delete('file-1')).toEqual({ kind: 'no-network' });
    expect(drive.contents()).toEqual([]);
  });

  it('counts its calls, so «no request is made to Google» is provable', async () => {
    const drive = inMemoryDrive();

    expect(drive.calls()).toEqual({ list: 0, upload: 0, download: 0, delete: 0 });
    await drive.list();
    expect(drive.calls().list).toBe(1);
  });
});

describe('what `verify` may load', () => {
  it('The port itself pulls in no React, no Expo and no database', () => {
    const source = readFileSync(new URL('./drive.ts', import.meta.url), 'utf8');
    const imported = [...source.matchAll(/^\s*import[^']*'([^']+)'/gm)].map(([, from]) => from);

    expect(imported).toEqual([]);
    for (const forbidden of ['react', 'react-native', 'expo', '@/db/', '../db/']) {
      expect(source).not.toContain(`'${forbidden}`);
    }
  });
});
