import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { BackHandler } from 'react-native';

import { backGesture } from '@/ui/back-gesture';

/**
 * Answers the phone's own back press for a screen that can have an editor open over its list:
 * closes the editor and keeps the screen, or lets the press through so the screen is left. The
 * decision itself is `backGesture` in `src/ui/`, where `verify` can reach it — this is the four
 * lines of subscription around it.
 *
 * `useFocusEffect`, not `useEffect`: a screen pushed over this one must own the back press while
 * it is up. Nothing is pushed over «Ліміти» or «Цілі» today, and this hook should not be the
 * reason that has to stay true. Returning `true` is how React Native is told the press was
 * handled; returning `false` lets the navigator pop the screen.
 *
 * `close` must be stable — wrap it in `useCallback`, as the effect depends on its identity.
 */
export function useCloseOnBack(editorOpen: boolean, close: () => void): void {
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (backGesture(editorOpen) === 'leave-screen') {
          return false;
        }
        close();
        return true;
      });
      return () => subscription.remove();
    }, [close, editorOpen]),
  );
}
