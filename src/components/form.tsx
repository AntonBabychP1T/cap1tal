import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from './themed-text';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  allOffer,
  COLLAPSE_LABEL,
  narrow,
  NOTHING_FOUND,
  shortlist,
  type Named,
  type PickerNoun,
} from '@/ui/shortlist';

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

/**
 * One chip. Drawn here rather than inside `Choices` because two things paint it — the row of
 * choices below, and the expanded full list of `Picker` further down, which has no overline of its
 * own. Two copies would be two chips that must look identical and diverge the day either is tuned.
 */
function Chip({
  label,
  picked,
  disabled,
  onPress,
}: {
  label: string;
  picked: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
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
        {label}
      </ThemedText>
    </Pressable>
  );
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
  return (
    <View style={styles.field}>
      <ThemedText type="overline">{label}</ThemedText>
      {choices.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          —
        </ThemedText>
      ) : (
        <View style={styles.choices}>
          {choices.map((choice) => (
            <Chip
              key={choice.value}
              label={choice.label}
              picked={choice.value === selected}
              disabled={disabled}
              onPress={() => onSelect(choice.value)}
            />
          ))}
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

/**
 * The picker for a list too long to draw: the few choices worth a thumb, and the rest one tap
 * away. The рахунок, категорія and джерело of a транзакція all use it — twenty-eight рахунки and
 * twenty-seven категорії were sixty-odd chips on one form before it existed.
 *
 * Every decision here is `src/ui/shortlist.ts`: which rows are drawn (`shortlist`), whether the
 * offer appears and what it says (`allOffer`), and what a typed search leaves standing (`narrow`).
 * `verify` never runs JSX, so this file is wiring and nothing else — if a rule looks like it lives
 * here, it is in the wrong place.
 *
 * Expansion is *controlled*: the screen holds which picker is open, because the phone's «назад»
 * has to close an open list before it leaves the screen and only the screen can answer that.
 */
export function Picker({
  label,
  rows,
  recentIds,
  selected,
  onSelect,
  noun,
  expanded,
  onExpandedChange,
}: {
  label: string;
  /** The whole offered list, in the order it already has. What may be picked is decided upstream. */
  rows: readonly Named[];
  recentIds: readonly string[];
  selected: string | undefined;
  onSelect: (id: string) => void;
  noun: PickerNoun;
  expanded: boolean;
  onExpandedChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState('');
  /**
   * Every row this picker has had chosen: the one it opened on, and each one picked since. The
   * chips only ever grow, so a рахунок found through «Всі рахунки» is still there afterwards and
   * going back to the one the form opened on is a tap rather than a second trip through the list.
   */
  const [chosenIds, setChosenIds] = useState<readonly string[]>(() =>
    selected === undefined ? [] : [selected],
  );

  const shown = shortlist(rows, { recentIds, chosenIds });
  const offer = allOffer(rows, noun);
  const asChoices = (list: readonly Named[]) =>
    list.map((row) => ({ value: row.id, label: row.name }));

  const choose = (id: string) => {
    setChosenIds((already) => (already.includes(id) ? already : [...already, id]));
    setQuery('');
    onExpandedChange(false);
    onSelect(id);
  };

  const collapse = () => {
    setQuery('');
    onExpandedChange(false);
  };

  if (!expanded) {
    return (
      <View style={styles.field}>
        <Choices label={label} choices={asChoices(shown)} selected={selected} onSelect={choose} />
        {offer ? (
          <View style={styles.offer}>
            <RowAction title={offer} onPress={() => onExpandedChange(true)} tone="quiet" />
          </View>
        ) : null}
      </View>
    );
  }

  const narrowed = narrow(rows, query);
  return (
    <View style={styles.field}>
      <Field
        label={label}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        placeholder="почніть вводити назву"
        autoFocus
      />
      {narrowed.length === 0 ? (
        <ThemedText type="small" themeColor="textSecondary">
          {NOTHING_FOUND}
        </ThemedText>
      ) : (
        <View style={styles.choices}>
          {asChoices(narrowed).map((choice) => (
            <Chip
              key={choice.value}
              label={choice.label}
              picked={choice.value === selected}
              onPress={() => choose(choice.value)}
            />
          ))}
        </View>
      )}
      <View style={styles.offer}>
        <RowAction title={COLLAPSE_LABEL} onPress={collapse} tone="quiet" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: Spacing.one },
  input: {
    paddingVertical: Spacing.two,
    fontSize: 17,
  },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  // The offer sits under its chips and only as wide as its own words, not across the column:
  // it is a way out of the picker, not the screen's action.
  offer: { flexDirection: 'row' },
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
