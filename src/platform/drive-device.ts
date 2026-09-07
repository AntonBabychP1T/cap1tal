import {
  APP_DATA_FOLDER,
  outcomeOfStatus,
  parseFileList,
  type DriveFile,
  type DriveOutcome,
  type DrivePort,
} from './drive';
import { googleAuth } from './google-auth-device';

/**
 * The owner's Drive, over `fetch` and four endpoints (design D4). Never imported by a test:
 * `verify` makes no network call, and every decision about what comes back is made by the pure
 * `outcomeOfStatus` and `parseFileList` in `drive.ts`, which is where the tests are.
 *
 * There is no SDK. `googleapis` is Node-shaped and enormous, and what this app does with Drive is
 * four requests — list, put, get, delete — all against one hidden folder the app owns.
 *
 * Every call goes through `ask`, so the access token is fetched per request and appears in one
 * header and nowhere else: not in a URL (where it would land in any log of one), not in a thrown
 * error, and not in any answer.
 */

const FILES = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

/** What the app writes. `.c1b` is nothing but a marker: the bytes are an envelope, not a format. */
const CONTENT_TYPE = 'application/octet-stream';

/**
 * One request, with a fresh access token — or the reason there was none.
 *
 * The token failures are passed through as themselves: an account that revoked the app and a phone
 * with no network are different answers, and this is the seam where losing that distinction would
 * be easiest.
 */
async function ask<T>(
  run: (token: string) => Promise<DriveOutcome<T>>,
): Promise<DriveOutcome<T>> {
  const token = await googleAuth.accessToken();
  switch (token.kind) {
    case 'withdrawn':
      return { kind: 'withdrawn' };
    case 'no-network':
      return { kind: 'no-network' };
    case 'not-configured':
      return { kind: 'unavailable' };
    case 'ok':
      break;
  }

  try {
    return await run(token.token);
  } catch {
    // A thrown fetch is the network. The error is deliberately not read, so nothing it carries —
    // a URL with a query string, a header echo — can reach a log.
    return { kind: 'no-network' };
  }
}

/** A response's body as JSON, or `undefined` when there is none or it will not parse. */
async function bodyOf(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/** One file's metadata as Drive returns it from an upload, through the same parser a list uses. */
function fileOf(body: unknown): DriveFile | undefined {
  const parsed = parseFileList({ files: [body] });
  return parsed?.[0];
}

export const drive: DrivePort = {
  async list(): Promise<DriveOutcome<readonly DriveFile[]>> {
    return ask(async (token) => {
      const url = new URL(FILES);
      url.searchParams.set('spaces', APP_DATA_FOLDER);
      url.searchParams.set('fields', 'files(id,name,size)');
      // By name, which is by the moment each бекап was made (design D10) — so a listing needs no
      // per-file metadata read and the order is decided by the server.
      url.searchParams.set('orderBy', 'name');
      url.searchParams.set('pageSize', '100');

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const body = await bodyOf(response);
      const refusal = outcomeOfStatus(response.status, body);
      if (refusal) return refusal;

      const files = parseFileList(body);
      return files ? { kind: 'ok', value: files } : { kind: 'unavailable' };
    });
  },

  async upload(name: string, bytes: Uint8Array): Promise<DriveOutcome<DriveFile>> {
    return ask(async (token) => {
      // A multipart body built by hand, because the metadata and the bytes go in one request and
      // `FormData` gives no control over the part headers Drive requires.
      const boundary = `cap1tal-${Math.random().toString(36).slice(2)}`;
      const metadata = JSON.stringify({ name, parents: [APP_DATA_FOLDER] });
      const head = new TextEncoder().encode(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
          `--${boundary}\r\nContent-Type: ${CONTENT_TYPE}\r\n\r\n`,
      );
      const tail = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
      const body = new Uint8Array(head.length + bytes.length + tail.length);
      body.set(head, 0);
      body.set(bytes, head.length);
      body.set(tail, head.length + bytes.length);

      const response = await fetch(`${UPLOAD}&fields=id,name,size`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: body as unknown as BodyInit,
      });
      const answer = await bodyOf(response);
      const refusal = outcomeOfStatus(response.status, answer);
      if (refusal) return refusal;

      // The created file as Drive now holds it — read back rather than assumed, because rotation
      // may delete an older версія only once a newer one is confirmed there (design D10).
      const file = fileOf(answer);
      return file ? { kind: 'ok', value: file } : { kind: 'unavailable' };
    });
  },

  async download(id: string, byteLimit?: number): Promise<DriveOutcome<Uint8Array>> {
    return ask(async (token) => {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (byteLimit !== undefined) {
        // The range read that fetches an envelope's head and not a whole бекап (design D6). A
        // server that ignores it answers with more, which is harmless: the head is a prefix.
        headers.Range = `bytes=0-${byteLimit - 1}`;
      }

      const response = await fetch(`${FILES}/${encodeURIComponent(id)}?alt=media`, { headers });
      if (!response.ok) {
        // Only an error body is JSON here; a success is the бекап's own bytes.
        return outcomeOfStatus(response.status, await bodyOf(response)) ?? { kind: 'unavailable' };
      }
      return { kind: 'ok', value: new Uint8Array(await response.arrayBuffer()) };
    });
  },

  async delete(id: string): Promise<DriveOutcome<'deleted'>> {
    return ask(async (token) => {
      const response = await fetch(`${FILES}/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) {
        // Already gone is the state the caller wanted. Reporting a failure would make rotation
        // retry for ever over a версія бекапу that no longer exists.
        return { kind: 'ok', value: 'deleted' };
      }
      const refusal = outcomeOfStatus(response.status, await bodyOf(response));
      return refusal ?? { kind: 'ok', value: 'deleted' };
    });
  },
};
