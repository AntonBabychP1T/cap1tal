import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * The few form pieces every screen needs. No design system, no dependency: a label above a field,
 * and a row of choices, themed like the rest of the app. Layout is deliberately unspecced — see
 * design.md "Non-Goals".
 */

export function Field({
  label,
  hint,
  ...rest
}: TextInputProps & { label: string; hint?: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        {...rest}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement },
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
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      {choices.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          —
        </ThemedText>
      ) : (
        <View style={styles.choices}>
          {choices.map((choice) => (
            <Pressable
              key={choice.value}
              disabled={disabled}
              onPress={() => onSelect(choice.value)}
              style={[
                styles.choice,
                {
                  backgroundColor:
                    choice.value === selected ? theme.backgroundSelected : theme.backgroundElement,
                  opacity: disabled ? 0.5 : 1,
                },
              ]}>
              <ThemedText
                type="small"
                themeColor={choice.value === selected ? 'text' : 'textSecondary'}>
                {choice.label}
              </ThemedText>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

/** The one button shape: a primary action at the bottom of a form. */
export function Action({ title, onPress }: { title: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.action, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    fontSize: 16,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  choice: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
  },
  action: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.two,
    alignItems: 'center',
  },
});
