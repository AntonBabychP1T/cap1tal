// Committed stand-in for the generated (gitignored) expo-env.d.ts, so `tsc --noEmit` passes on a
// fresh clone and in CI without running Expo. Duplicate references are harmless once expo-env.d.ts
// exists locally.
/// <reference types="expo/types" />

// The one React Native global the crash handler reaches for that the shipped types do not declare
// as a global: `ErrorUtils` is exported from `react-native` as an *interface*
// (`Libraries/vendor/core/ErrorUtils`) with no `declare const` beside it. `HermesInternal` is not
// here — it exists only on Hermes, so `_layout.tsx` reads it off `globalThis` behind a narrowing
// cast rather than promising the type-checker a global that may not be there.
declare global {
  const ErrorUtils: import('react-native').ErrorUtils;
}

export {};
