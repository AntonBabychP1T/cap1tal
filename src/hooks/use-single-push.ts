import { useFocusEffect, useNavigation, useRouter, type Href } from 'expo-router';
import { useCallback, useRef } from 'react';

/** After this long a push that left the screen still focused is taken as not having happened. */
const STUCK_AFTER_MS = 1500;

/**
 * `router.push` that opens one screen per visit. Taps that land while the first push is still
 * opening — a finger tapping again because the next screen did not appear at once, or a second row
 * tapped meanwhile — are dropped instead of stacking a screen each: the owner tapped three рахунки
 * in two seconds and had three рухи screens to back out of (bug report 2026-09-29).
 *
 * Coming back to the screen allows the next push. So does a push that has left the screen still
 * focused for a while, so a navigation that never happened cannot lock the screen.
 */
export function useSinglePush(): (href: Href) => void {
  const router = useRouter();
  const navigation = useNavigation();
  const pushedAt = useRef<number | undefined>(undefined);
  useFocusEffect(
    useCallback(() => {
      pushedAt.current = undefined;
    }, []),
  );
  return useCallback(
    (href: Href) => {
      const now = Date.now();
      const last = pushedAt.current;
      if (last !== undefined && (!navigation.isFocused() || now - last < STUCK_AFTER_MS)) {
        return;
      }
      pushedAt.current = now;
      router.push(href);
    },
    [navigation, router],
  );
}
