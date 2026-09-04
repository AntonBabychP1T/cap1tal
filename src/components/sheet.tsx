import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The bottom sheet: something asked over the screen the owner is on, rather than a screen pushed
 * over it. A picker with more rows than a chip row can hold, a month to choose, a confirmation
 * with more to say than an `Alert` can carry.
 *
 * **The аркуш репорту is deliberately not moved onto this.** `bug-report-here.tsx:364` draws its
 * own sheet at the same `Radius.sheet`, and it is the only thing in the app that already does.
 * Folding it in here would be a cosmetic gain paid for by putting a working flow — the one the
 * owner reports a bug *with* — at risk inside a change whose whole claim is that no behaviour
 * moves. It stays where it is until a change owns `bug-report-screen` and can smoke it properly.
 *
 * Nothing opens this yet either: the screens that do arrive in the later waves. It is written
 * against the artboards that draw it, not against a guess at what they might want.
 */
export function Sheet({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  /** Every sheet names itself. A panel that slid up unlabelled is a panel that has to be guessed. */
  title: string;
  /** The backdrop, the grabber and the phone's back gesture all reach this. */
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned under the body — «Зберегти», «Обрати». Outside the scroll, so it is always reachable. */
  footer?: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      {/* The backdrop dismisses. It is a `Pressable` rather than a tap on the sheet's parent so
          a tap that lands on the sheet itself never closes it by falling through. */}
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Закрити" />
      <View style={styles.dock} pointerEvents="box-none">
        <ThemedView
          type="backgroundElement"
          style={[styles.sheet, { borderColor: theme.cardEdge }]}>
          <SafeAreaView edges={['bottom']}>
            {/* The grabber says which edge the panel came from and which way it goes back. It is
                drawn, not tappable: the backdrop and the back gesture are what close this, and a
                4pt bar is not a target. */}
            <View style={[styles.grabber, { backgroundColor: theme.textFaint }]} />
            <ThemedText type="screenTitle" style={styles.title}>
              {title}
            </ThemedText>
            <ScrollView
              contentContainerStyle={styles.body}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </SafeAreaView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Hex rather than a role on purpose, against `theme.ts`'s "nothing outside this file writes a
  // hex": a scrim is not a surface of the theme, it is the screen behind being pushed back. It is
  // the same in light and dark — a dimmed light screen is still dimmed with black — so a role
  // would hold one value twice, and it needs an alpha channel that `theme.test.ts`'s 6-digit rule
  // does not allow. `bug-report-here.tsx:269` writes the same literal for the same thing; a third
  // caller is when a `scrim` role earns itself. Recorded in tasks.md 8.3.
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#0008' },
  dock: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    // Enough of the screen behind stays visible that the sheet reads as being over it.
    maxHeight: '85%',
    borderTopLeftRadius: Radius.sheet,
    borderTopRightRadius: Radius.sheet,
    // Only the top edge: the sides and bottom run off the screen, so an outline round all four
    // would draw a line along the bottom of the phone.
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three + Spacing.one,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: Radius.pill,
    alignSelf: 'center',
    marginTop: Spacing.twoHalf,
  },
  title: { marginTop: Spacing.three, marginBottom: Spacing.three },
  body: { gap: Spacing.three, paddingBottom: Spacing.three },
  footer: { paddingBottom: Spacing.three, gap: Spacing.two },
});
