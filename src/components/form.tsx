import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The few form pieces every screen needs: a labelled field, a row of choices, and the one button
 * shape in its three roles. Drawn to the design canvas — an overline label over a ruled field,
 * chips that mark the current choice with an accent outline rather than a fill, and exactly one
 * accent-filled action per screen. Layout beyond that stays unspecced — see design.md "Non-Goals".
 */

export function Field({ label, hint, ...rest }: TextInputProps & { label: string; hint?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.field}>
      <ThemedText type="overline" themeColor={focused ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textMuted}
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={[
          styles.input,
          {
            color: theme.text,
            // Ruled, not boxed: the line is the field, and it is the only thing that lights up.
            borderBottomColor: focused ? theme.accent : theme.border,
            borderBottomWidth: focused ? 1.5 : 1,
          },
          rest.style,
        ]}
      />
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/** A row of choices — the picker for рахунок, вид, валюта and the витрата/переказ toggle. */
export function Choices<T extends string>({
  label,
  choices,
  selected,
  onSelect,
  disabled,
}: {
  label: string;
  choices: readonly Choice<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  /** A вид and a валюта are fixed at creation, so editing shows them but cannot change them. */
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="overline">{label}</ThemedText>
      {choices.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          —
        </ThemedText>
      ) : (
        <View style={styles.choices}>
          {choices.map((choice) => {
            const picked = choice.value === selected;
            return (
              <Pressable
                key={choice.value}
                disabled={disabled}
                onPress={() => onSelect(choice.value)}
                // The chip is 38 tall; the finger gets its 48 either way.
                hitSlop={Spacing.two}
                style={({ pressed }) => [
                  styles.choice,
                  {
                    // An outline, not a fill: in a row of eight categories a filled chip shouts.
                    backgroundColor: picked ? theme.accentSurface : theme.backgroundSelected,
                    borderColor: picked ? theme.accent : 'transparent',
                    opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}>
                <ThemedText
                  type={picked ? 'smallBold' : 'small'}
                  themeColor={picked ? 'accent' : 'textSecondary'}>
                  {choice.label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

/**
 * The one button shape, in the three roles the canvas draws:
 * `primary` — the accent fill, at most one per screen;
 * `secondary` — an outline, for leaving and cancelling;
 * `destructive` — text alone, never a fill, so deleting is never the loudest thing on the screen.
 */
export type ActionVariant = 'primary' | 'secondary' | 'destructive';

export function Action({
  title,
  onPress,
  variant = 'primary',
  disabled,
}: {
  title: string;
  onPress: () => void;
  variant?: ActionVariant;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const filled = variant === 'primary' && !disabled;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.action,
        variant === 'primary' && {
          backgroundColor: disabled ? theme.backgroundSelected : theme.accent,
        },
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type="default"
        // One line, said so — the same guard, and the same defect, as `RowAction`'s below: without
        // it Android re-measures the label after the keyboard has resized the window and paints it
        // a word short. «Додати застосунок» on «Сповіщення банків» became «Додати» once the add
        // form had been opened and cancelled, and stayed «Додати» on every return to the screen.
        //
        // `adjustsFontSizeToFit` is what makes the one line non-lossy, and it is not optional
        // here: the button is as wide as its column, so no title of this app's length overflows
        // at the default text size — but nothing caps the system font scale, and at 130% the
        // longest verbs («Так, імпортувати ще раз», «Створити новий рахунок») would ellipsize
        // where they used to wrap. Shrinking the word beats losing it, and losing it is what the
        // line above exists to prevent. The same pair is on Місяць's leading сума.
        numberOfLines={1}
        adjustsFontSizeToFit
        // The filled action is the loudest thing on its screen; the outline and the destructive
        // verb beside it are a weight quieter.
        style={filled ? styles.actionFilledLabel : styles.actionLabel}
        themeColor={
          disabled
            ? 'textMuted'
            : variant === 'destructive'
              ? 'textDanger'
              : filled
                ? 'onAccent'
                : 'text'
        }>
        {title}
      </ThemedText>
    </Pressable>
  );
}

/**
 * A verb inside a row — «Перейменувати», «Звірити · −50,00». Smaller than an `Action` and outlined
 * rather than filled, so two fit side by side and neither competes with the screen's own action.
 */
export function RowAction({
  title,
  onPress,
  tone = 'accent',
}: {
  title: string;
  onPress: () => void;
  tone?: 'accent' | 'quiet' | 'danger';
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Spacing.two}
      style={({ pressed }) => [
        styles.rowAction,
        { borderColor: theme.border },
        pressed && styles.pressed,
      ]}>
      {/* One line, said so. The pill is sized to the whole title, so nothing here can ellipsize —
          but without it Android re-measures the label after the keyboard has resized the window
          and paints it a word short: «Усі транзакції та пошук» became «Усі транзакції та» on
          Головний, in a box still wide enough for both. An affordance that names half of where it
          goes is worse than none. */}
      <ThemedText
        numberOfLines={1}
        type="smallBold"
        themeColor={
          tone === 'accent' ? 'accent' : tone === 'danger' ? 'textDanger' : 'textSecondary'
        }>
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    paddingVertical: Spacing.two,
    fontSize: 17,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  action: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTarget,
  },
  actionFilledLabel: { fontWeight: 700 },
  actionLabel: { fontWeight: 600 },
  rowAction: {
    paddingHorizontal: Spacing.three - Spacing.half,
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
  pressed: { opacity: 0.75 },
});
