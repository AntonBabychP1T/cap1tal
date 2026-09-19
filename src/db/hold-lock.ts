import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const WORKER_PATH = join(dirname(fileURLToPath(import.meta.url)), 'concurrency-worker.mjs');

export type LockHolderJob = 'write' | 'migrate';

export interface LockHolderOptions {
  /** The database file both this thread and the worker open. */
  readonly file: string;
  readonly job: LockHolderJob;
  /** How long the worker holds the lock before committing. */
  readonly delayMs: number;
  /** Required for `job: 'migrate'` — the folder `readMigrationFiles` reads. */
  readonly migrationsFolder?: string;
}

export interface LockHolder {
  /** Resolves once the worker has committed and exited; rejects if its write failed. */
  readonly finished: Promise<void>;
}

/**
 * Spawns {@link concurrency-worker.mjs} on a real `worker_threads` thread and blocks until it
 * signals that it holds the lock, so the caller's own conflicting write genuinely overlaps the
 * worker's hold rather than racing to start one (design D6).
 */
export function holdLock(options: LockHolderOptions): LockHolder {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  const worker = new Worker(WORKER_PATH, {
    workerData: { ...options, signal: signal.buffer },
    // A worker inherits the parent's `execArgv` by default, which under `vitest` includes its own
    // loader hooks; a clean worker keeps this a plain Node module load.
    execArgv: [],
  });

  const finished = new Promise<void>((resolve, reject) => {
    worker.once('message', (message: { ok: boolean; message?: string }) => {
      void worker.terminate().finally(() => {
        if (message.ok) {
          resolve();
        } else {
          reject(new Error(`concurrency worker failed: ${message.message ?? 'unknown error'}`));
        }
      });
    });
    worker.once('error', (error: Error) => {
      void worker.terminate().finally(() => reject(error));
    });
  });

  const result = Atomics.wait(signal, 0, 0, 5000);
  if (result === 'timed-out') {
    throw new Error('concurrency worker did not signal it held the lock in time');
  }

  return { finished };
}
