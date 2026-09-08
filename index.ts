/**
 * The bundle's entry, and the one reason it exists: a chance the phone gives can arrive on a
 * process with no Activity, and a task the JS never defined is a task the task manager reports as
 * undefined and unregisters.
 *
 * `expo-router/entry` registers the root component and nothing more; `src/app/_layout.tsx` — where
 * the registrations live — runs only when that component renders, which a WorkManager wake-up with
 * no Activity never does. The two task modules therefore have to be reached before it, and this is
 * the only place in the bundle that is before it (design D4).
 *
 * Nothing else belongs here. Both modules call `TaskManager.defineTask` at module scope and do no
 * work of their own until a chance is delivered.
 */
import './src/platform/monobank-sync-task';
import './src/platform/drive-backup-task';

import 'expo-router/entry';
