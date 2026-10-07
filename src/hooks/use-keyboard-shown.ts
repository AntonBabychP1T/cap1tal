import { useEffect, useState } from "react";
import { Keyboard } from "react-native";

/**
 * Whether the device's keyboard is up. A block pinned above the keyboard keeps clear of the
 * navigation bar only while the keyboard is down: once it is up the keys cover that bar, and the
 * same padding becomes a bar-high gap between the block and the keys.
 */
export function useKeyboardShown(): boolean {
  const [shown, setShown] = useState(() => Keyboard.isVisible());
  useEffect(() => {
    const up = Keyboard.addListener("keyboardDidShow", () => setShown(true));
    const down = Keyboard.addListener("keyboardDidHide", () => setShown(false));
    return () => {
      up.remove();
      down.remove();
    };
  }, []);
  return shown;
}
