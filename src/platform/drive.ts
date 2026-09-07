/**
 * The seam between the app and the owner's Google Drive. The port, its double, and the **pure**
 * parsing and error mapping the adapter uses — the adapter itself is `drive-device.ts`, and it is
 * not imported from here.
 *
 * Four calls and nothing more (design D4): list what is in the app's own folder, put one file
 * there, fetch one back (whole, or just enough of it to read an envelope's head), and delete one.
 * There is no abstraction over "cloud providers": there is one provider, the spec names it, and a
 * second is not a foreseeable requirement.
 *
 * The shape of what Google answers is parsed by `parseFileList` and mapped by `outcomeOfStatus`,
 * both pure and both tested against recorded response shapes — the `src/monobank/api.ts`
 * arrangement exactly, and for the same reason: the HTTP call cannot be tested under `verify`, but
 * every decision made about what comes back can be. A 401, a 403 that means the Drive is full, a
 * network failure and a body the parser cannot read are four different answers, never one throw.
 */

/** The folder every file goes to and comes from: the app's own, invisible in the Drive UI (D3). */
export const APP_DATA_FOLDER = 'appDataFolder';

/** What one версія бекапу looks like from the outside, before anything of it has been read. */
export interface DriveFile {
  readonly id: string;
  /** `cap1tal-YYYYMMDDTHHmmssZ.c1b` — sortable by name, which is why listing needs no metadata. */
  readonly name: string;
  /** What Drive says it holds. Used to confirm an upload arrived whole, never to date it. */
  readonly size: number;
}

/**
 * What any Drive call can come to.
 *
 * `withdrawn` and `full` are the two the owner can act on, and they are the two the spec names.
 * `unavailable` is everything else — no network, a 500, a body that will not parse — deliberately
 * one answer, because the owner's next step is the same for all of them: it will be tried again
 * when a backup is next due.
 */
export type DriveOutcome<T> =
  | { readonly kind: 'ok'; readonly value: T }
  | { readonly kind: 'withdrawn' }
  | { readonly kind: 'full' }
  | { readonly kind: 'no-network' }
  | { readonly kind: 'unavailable' };

export interface DrivePort {
  /** Every file in the app's own folder, oldest name first. */
  list(): Promise<DriveOutcome<readonly DriveFile[]>>;
  /** One file into the app's own folder, whole; the answer is the file as Drive now holds it. */
  upload(name: string, bytes: Uint8Array): Promise<DriveOutcome<DriveFile>>;
  /**
   * One file back.
   *
   * `byteLimit` asks for only the first N bytes — a `Range` request, which is what listing the
   * версії бекапу uses to read each envelope's head without fetching whole бекапи (design D6). A
   * server that ignores the range answers with more, which is harmless: the head is a prefix.
   */
  download(id: string, byteLimit?: number): Promise<DriveOutcome<Uint8Array>>;
  /** One file gone. Called only by rotation, and only for a версія this phone can open (D14). */
  delete(id: string): Promise<DriveOutcome<'deleted'>>;
}

/**
 * What an HTTP status and a body mean, as a pure function — the one place a Drive failure becomes
 * one of the four answers, so the adapter has no judgement of its own to get wrong.
 *
 * The 403 is the interesting one. Drive returns 403 for three different things — "you are not
 * allowed to do this", "this account has no room left" and "you are asking too often" — and they
 * are three different answers for the owner: connect again, free some space, or simply wait. They
 * are told apart by the reason Google puts in the body, never by the status alone.
 */
export function outcomeOfStatus(status: number, body: unknown): Exclude<DriveOutcome<never>, { kind: 'ok' }> | undefined {
  if (status === 401) {
    return { kind: 'withdrawn' };
  }
  if (status === 403) {
    const reasons = errorReasonsOf(body);
    if (reasons.includes('storageQuotaExceeded')) {
      return { kind: 'full' };
    }
    // Drive throttles with a 403 too, and a throttle is emphatically not a revoked authorisation:
    // telling the owner Google took their access away, and sending them back through the consent
    // screen, would be wrong every time the app is merely asked to wait.
    if (reasons.some((reason) => reason.toLowerCase().includes('ratelimit'))) {
      return { kind: 'unavailable' };
    }
    return { kind: 'withdrawn' };
  }
  if (status === 429) {
    return { kind: 'unavailable' };
  }
  if (status >= 200 && status < 300) {
    return undefined;
  }
  return { kind: 'unavailable' };
}

/**
 * The `reason` strings inside a Drive error body, or none. Written defensively because this is
 * parsing someone else's JSON: a body that is a string, an array, or missing entirely must produce
 * an empty list rather than a throw, or a full Drive would surface as a crash.
 */
function errorReasonsOf(body: unknown): readonly string[] {
  if (typeof body !== 'object' || body === null) {
    return [];
  }
  const error = (body as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) {
    return [];
  }
  const errors = (error as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) {
    return [];
  }
  return errors.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) {
      return [];
    }
    const reason = (entry as { reason?: unknown }).reason;
    return typeof reason === 'string' ? [reason] : [];
  });
}

/**
 * A `files.list` body into the files it names, or `undefined` when it is not one.
 *
 * `undefined` and an empty array are different answers and must stay so: an empty folder is a
 * phone that has connected and not yet uploaded, and a body the parser cannot read is a failure.
 * A folder holding one unreadable entry is the second, not the first — a partial listing would let
 * rotation delete a версія it never saw.
 */
export function parseFileList(body: unknown): readonly DriveFile[] | undefined {
  if (typeof body !== 'object' || body === null) {
    return undefined;
  }
  const files = (body as { files?: unknown }).files;
  if (!Array.isArray(files)) {
    return undefined;
  }

  const parsed: DriveFile[] = [];
  for (const entry of files) {
    if (typeof entry !== 'object' || entry === null) {
      return undefined;
    }
    const { id, name, size } = entry as { id?: unknown; name?: unknown; size?: unknown };
    if (typeof id !== 'string' || id === '' || typeof name !== 'string' || name === '') {
      return undefined;
    }
    // Drive sends `size` as a *string* of digits, and omits it for some kinds of file. An absent
    // or unreadable size is 0 rather than a failed listing: it is only used to confirm an upload
    // arrived, and a версія бекапу that cannot be sized is still one that must not be lost.
    parsed.push({ id, name, size: sizeOf(size) });
  }
  return parsed;
}

function sizeOf(value: unknown): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : 0;
  }
  return 0;
}

/**
 * The Drive the tests use, and the only implementation `verify` ever loads.
 *
 * It holds real bytes, so the runs above it can be proven end to end: a бекап sealed, uploaded,
 * listed, fetched back and opened, without a network. `failWith` makes every call answer as a
 * refusing Drive would; `failUploadWith` fails only the upload, which is how "a failed upload
 * leaves the folder untouched" is proven while listing still works.
 */
export function inMemoryDrive(
  options: {
    readonly files?: readonly { readonly name: string; readonly bytes: Uint8Array }[];
    readonly failWith?: Exclude<DriveOutcome<never>, { kind: 'ok' }>;
    readonly failUploadWith?: Exclude<DriveOutcome<never>, { kind: 'ok' }>;
  } = {},
): DrivePort & {
  /** What is actually in the folder, by name — what a rotation assertion reads. */
  readonly contents: () => readonly { readonly name: string; readonly bytes: Uint8Array }[];
  /** How many times each call was made, so «no request is made to Google» is provable. */
  readonly calls: () => { list: number; upload: number; download: number; delete: number };
} {
  const held = new Map<string, { name: string; bytes: Uint8Array }>();
  let nextId = 1;
  const calls = { list: 0, upload: 0, download: 0, delete: 0 };

  for (const file of options.files ?? []) {
    held.set(`file-${nextId}`, { name: file.name, bytes: Uint8Array.from(file.bytes) });
    nextId += 1;
  }

  const fileOf = (id: string, entry: { name: string; bytes: Uint8Array }): DriveFile => ({
    id,
    name: entry.name,
    size: entry.bytes.length,
  });

  return {
    list: async () => {
      calls.list += 1;
      if (options.failWith) return options.failWith;
      // By name, which is by instant: the file names carry the moment they were made (design D10).
      const files = [...held.entries()]
        .map(([id, entry]) => fileOf(id, entry))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
      return { kind: 'ok', value: files };
    },

    upload: async (name: string, bytes: Uint8Array) => {
      calls.upload += 1;
      const failure = options.failUploadWith ?? options.failWith;
      // A failed upload writes nothing: the folder is exactly as it was.
      if (failure) return failure;
      const id = `file-${nextId}`;
      nextId += 1;
      held.set(id, { name, bytes: Uint8Array.from(bytes) });
      return { kind: 'ok', value: fileOf(id, held.get(id)!) };
    },

    download: async (id: string, byteLimit?: number) => {
      calls.download += 1;
      if (options.failWith) return options.failWith;
      const entry = held.get(id);
      if (!entry) {
        return { kind: 'unavailable' };
      }
      return {
        kind: 'ok',
        value:
          byteLimit === undefined
            ? Uint8Array.from(entry.bytes)
            : Uint8Array.from(entry.bytes.subarray(0, byteLimit)),
      };
    },

    delete: async (id: string) => {
      calls.delete += 1;
      if (options.failWith) return options.failWith;
      held.delete(id);
      return { kind: 'ok', value: 'deleted' };
    },

    contents: () =>
      [...held.values()]
        .map((entry) => ({ name: entry.name, bytes: entry.bytes }))
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),

    calls: () => ({ ...calls }),
  };
}
