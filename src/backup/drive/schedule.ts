/**
 * Whether a бекап is due — the whole schedule, as one pure function of injected values (design D9).
 *
 * This is what lets the spec promise "at least once every 24 hours, best-effort" honestly. Android
 * decides *when* the app is asked; this decides *whether* it acts. The background task asks it and
 * the app's foreground entry asks the same function, so the daily run and the catch-up are one
 * rule and cannot drift apart — and neither needs a clock, a timer or a device to be tested.
 */

/** How long a бекап stays current: one day, best-effort, and never stated as a clock time. */
export const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** What the schedule is asked about. Everything injected, nothing read from the world. */
export interface BackupDueInput {
  /** As `isConnected` defines it: an account and the код відновлення dealt with. */
  readonly connected: boolean;
  /** The last upload that completed, or absent when none ever has. */
  readonly lastSuccessAt?: Date;
  readonly now: Date;
  /** Overridable so a test can name a different window; the app always passes the default. */
  readonly interval?: number;
}

/**
 * Whether the app should try to upload now.
 *
 * A phone that has never uploaded is due immediately: the first бекап is the one whose absence
 * costs the most, and waiting a day after connecting would leave the owner unprotected through
 * exactly the window they just asked to be protected in.
 *
 * A clock that has gone backwards — a device whose time was corrected, or a timezone change read
 * wrongly — makes `now` earlier than the last success. That is not "due in 24 hours' time"; it is
 * a phone whose last known good бекап is in its own future, and the safe reading is that a бекап
 * is due, because uploading one costs a request and being wrong the other way costs a day.
 */
export function isBackupDue(input: BackupDueInput): boolean {
  if (!input.connected) {
    // The spec's "a disconnected app never uploads", decided here rather than at four call sites.
    return false;
  }
  if (!input.lastSuccessAt) {
    return true;
  }
  const since = input.now.getTime() - input.lastSuccessAt.getTime();
  if (since < 0) {
    return true;
  }
  return since >= (input.interval ?? BACKUP_INTERVAL_MS);
}

/**
 * Whether a бекап that is due should actually be uploaded, given what it turned out to hold.
 *
 * Asked *after* the бекап is made and before it is sealed: making one is cheap and local, and
 * sending one is neither. Sameness is the бекап's own integrity value over its contents — the only
 * sameness a бекап can have, since every one records the moment it was made, so two бекапи of an
 * unchanged phone are never byte-for-byte equal but always carry the same checksum.
 */
export function shouldUpload(input: {
  readonly checksum: string;
  readonly lastUploadedChecksum?: string;
}): boolean {
  return input.checksum !== input.lastUploadedChecksum;
}
