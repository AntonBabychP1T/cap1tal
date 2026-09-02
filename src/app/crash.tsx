import { Redirect } from 'expo-router';

/**
 * The lever that shows the crash fallback on purpose.
 *
 * A fallback that can only be reached by introducing a real bug is a fallback nobody tests twice,
 * so this route throws while rendering — but only in a development build, and only when reached by
 * deep link (`adb shell am start -d cap1tal://crash`). Nothing in the app links here. A release
 * build redirects to Головний, so a stray link can never strand the owner (design D12).
 *
 * It ships rather than being added and removed around each smoke run, because a tree reviewed with
 * the lever and archived without it is two different trees.
 */
export default function CrashRoute() {
  if (__DEV__) {
    throw new Error('cap1tal://crash — навмисне падіння для перевірки запасного екрана');
  }
  return <Redirect href="/" />;
}
