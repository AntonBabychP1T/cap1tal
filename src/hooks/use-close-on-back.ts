import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { Alert, BackHandler } from 'react-native';

import { backGesture, discardConfirm } from '@/ui/back-gesture';

/**
 * Answers the phone's own back press for a screen that can have an editor open over its list:
 * closes the editor and keeps the screen, or lets the press through so the screen is left. The
 * decision itself is `backGesture` in `src/ui/`, where `verify` can reach it — this is the
 * subscription around it.
 *
 * `isDirty` — the form holds edits (`!sameFields(current, opened)`): the press asks «Відкинути
 * зміни?» first, and «Відкинути» calls `close`. A form that leaves by the screen's own back rather
 * than closing over a list registers `useCloseOnBack(false, leave, isDirty)`: untouched, the press
 * goes through to the navigator; edited, it asks and «Відкинути» calls `leave`. Where such a screen
 * also has a picker on the hook, it passes `pickerClosed && isDirty`, so the picker closes first.
 *
 * `useFocusEffect`, not `useEffect`: a screen pushed over this one must own the back press while
 * it is up. Nothing is pushed over «Ліміти» or «Цілі» today, and this hook should not be the
 * reason that has to stay true. Returning `true` is how React Native is told the press was
 * handled; returning `false` lets the navigator pop the screen.
 *
 * `close` must be stable — wrap it in `useCallback`, as the effect depends on its identity.
 */
export function useCloseOnBack(editorOpen: boolean, close: () => void, isDirty = false): void {
  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        switch (backGesture(editorOpen, isDirty)) {
          case 'leave-screen':
            return false;
          case 'close-editor':
            close();
            return true;
          case 'ask-first':
            Alert.alert(...discardConfirm(close));
            return true;
        }
      });
      return () => subscription.remove();
    }, [close, editorOpen, isDirty]),
  );
}
