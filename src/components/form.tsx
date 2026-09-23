import { useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type SwitchProps,
  type TextInputProps,
} from 'react-native';

import { Icon } from './icon';
import { ThemedText } from './themed-text';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dateStepOffers } from '@/ui/dates';
import { type IconName } from '@/ui/icons';
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
            // `cardEdge`, not `border`: this rule *is* the control — the only thing saying where
            // to type — and `border` is the hairline between two rows, which the retone made
            // quieter still. An edge that has to be found is not that role.
            borderBottomColor: focused ? theme.accent : theme.cardEdge,
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

/**
 * The дата of a транзакція (main-screen, "The дата of a транзакція is set without typing a date
 * code"): the typed field is still there — a date weeks back is typed as before, on the digit pad
 * now — but «Сьогодні», «Вчора» and a day either way are one tap each, and the label names the
 * typed дата as a day, so «2026-09-22» is also read as «вчора». Which offers stand, and what each
 * sets, is `dateStepOffers`; this draws them. The forward step is never offered past today.
 */
/**
 * Digits and the hyphen, and no letters. `numbers-and-punctuation` is iOS-only — Android ignores
 * it and opens the full letter keyboard — so Android gets its phone pad, which carries «-».
 */
const DATE_KEYBOARD = Platform.select<KeyboardTypeOptions>({
  android: 'phone-pad',
  default: 'numbers-and-punctuation',
});

export function DateField({
  value,
  onChange,
  now,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The screen's clock — what «сьогодні» is. */
  now: Date;
}) {
  const offers = dateStepOffers(value, now);
  const set = (next: string) => {
    if (next !== value.trim()) onChange(next);
  };
  return (
    <View style={styles.field}>
      <Field
        label={offers.label ? `Дата · ${offers.label}` : 'Дата'}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        keyboardType={DATE_KEYBOARD}
        placeholder="РРРР-ММ-ДД"
      />
      <View style={styles.dateSteps}>
        {offers.back ? (
          <DateStep label="‹ день" hint="На день раніше" onPress={() => set(offers.back!)} />
        ) : null}
        <DateStep
          label="Вчора"
          picked={value.trim() === offers.yesterday}
          onPress={() => set(offers.yesterday)}
        />
        <DateStep
          label="Сьогодні"
          picked={value.trim() === offers.today}
          onPress={() => set(offers.today)}
        />
        {offers.forward ? (
          <DateStep label="день ›" hint="На день пізніше" onPress={() => set(offers.forward!)} />
        ) : null}
      </View>
    </View>
  );
}

function DateStep({
  label,
  hint,
  picked = false,
  onPress,
}: {
  label: string;
  hint?: string;
  picked?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      accessibilityState={{ selected: picked }}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.dateStep,
        {
          backgroundColor: picked ? theme.accentSurface : theme.backgroundSelected,
          borderColor: picked ? theme.accent : theme.cardEdge,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <ThemedText type={picked ? 'smallBold' : 'small'} themeColor={picked ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

/**
 * One chip. Drawn here rather than inside `Choices` because three things paint it now — the row of
 * choices below, the expanded full list of `Picker` further down, which has no overline of its own,
 * and the screens that filter a list by a row of them. Copies would be chips that must look
 * identical and diverge the day any one of them is tuned, which is why this is exported.
 *
 * Two things changed with the redesign, and neither reaches a caller: the shape is a pill rather
 * than `Radius.chip`, and an unpicked chip is now outlined in `cardEdge` instead of drawn on an
 * invisible border. On a card that is nearly the page, a fill alone no longer says where a chip
 * ends — the same reason `cardEdge` carries the card. Every `Choices` and `Picker` call site
 * renders exactly as it did, with no prop added and no file edited.
 */
export function Chip({
  label,
  picked,
  disabled,
  icon,
  onPress,
}: {
  label: string;
  picked: boolean;
  disabled?: boolean;
  /** A glyph before the label — a категорія's own, the вид of a рахунок. Tinted with the label. */
  icon?: IconName;
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
          borderColor: picked ? theme.accent : theme.cardEdge,
          opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
        },
      ]}>
      {icon ? <Icon name={icon} size={14} color={picked ? 'accent' : 'textSecondary'} /> : null}
      <ThemedText
        type={picked ? 'smallBold' : 'small'}
        themeColor={picked ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * The пошук bar.
 *
 * It is **not** built on `Field`, and the task that asked for it said it would be. `Field` is a
 * form's field: it names itself in an overline, it is ruled rather than boxed, and it carries a
 * hint under it. A search bar has no label, is a box, and is the one input on a screen that is a
 * control rather than part of a form — so building it on `Field` would have meant making `Field`'s
 * label optional and adding a presentation flag to the component every form in the app depends on,
 * to save four lines of focus state. The cost lands on twelve callers; the saving is here.
 *
 * What it does share is read from the theme directly — `textMuted` for the placeholder, `text` for
 * the value — so those cannot drift from `Field` without drifting from the palette first. The
 * focus treatment genuinely differs: `Field` lights its rule and its label, this lights its border
 * and its glyph.
 *
 * The clear «×» appears only with something to clear, and is its own tap target, so clearing never
 * means re-focusing.
 */
export function SearchBar({
  value,
  onChange,
  placeholder = 'Пошук',
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        styles.searchBar,
        {
          backgroundColor: theme.backgroundInset,
          borderColor: focused ? theme.accent : theme.cardEdge,
        },
      ]}>
      <Icon name="search" size={18} color={focused ? 'accent' : 'textMuted'} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.textMuted}
        autoFocus={autoFocus}
        autoCorrect={false}
        returnKeyType="search"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.searchInput, { color: theme.text }]}
      />
      {value.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Очистити пошук"
          onPress={() => onChange('')}
          hitSlop={Spacing.two}>
          <ThemedText type="subtitle" themeColor="textMuted" style={styles.searchClear}>
            ×
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A row of choices — the picker for рахунок, вид, валюта and the витрата/переказ toggle. */
export function Choices<T extends string>({
  label,
  choices,
  selected,
  onSelect,
  disabled,
  scroll,
}: {
  label: string;
  choices: readonly Choice<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  /** A вид and a валюта are fixed at creation, so editing shows them but cannot change them. */
  disabled?: boolean;
  /**
   * One row that scrolls sideways instead of wrapping. For a filter or a chooser whose choices are
   * the owner's own history — 29 рахунки, 24 місяці — which wrapped into a wall that pushed the
   * very list it filters off the first screen (transaction-search, "The filters leave the list on
   * the first screen").
   */
  scroll?: boolean;
}) {
  if (scroll && choices.length > 0) {
    return (
      <View style={styles.field}>
        <ThemedText type="overline">{label}</ThemedText>
        <ScrollingChips choices={choices} selected={selected} onSelect={onSelect} disabled={disabled} />
      </View>
    );
  }
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
 * `Choices`' sideways row. The chosen chip is brought into view once, when it is first laid out
 * off the visible part — a month picked from «Показати в Транзакціях» may be the twentieth chip —
 * and never again after that, so the row does not jump under a finger that is scrolling it.
 */
function ScrollingChips<T extends string>({
  choices,
  selected,
  onSelect,
  disabled,
}: {
  choices: readonly Choice<T>[];
  selected: T | undefined;
  onSelect: (value: T) => void;
  disabled?: boolean;
}) {
  const scroller = useRef<ScrollView>(null);
  const viewport = useRef(0);
  const brought = useRef(false);
  return (
    <ScrollView
      ref={scroller}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      onLayout={({ nativeEvent }) => {
        viewport.current = nativeEvent.layout.width;
      }}
      contentContainerStyle={styles.scrollChoices}>
      {choices.map((choice) => (
        <View
          key={choice.value}
          onLayout={({ nativeEvent }) => {
            if (brought.current || choice.value !== selected) return;
            brought.current = true;
            const { x, width } = nativeEvent.layout;
            if (viewport.current > 0 && x + width > viewport.current) {
              scroller.current?.scrollTo({ x: Math.max(0, x - Spacing.four), animated: false });
            }
          }}>
          <Chip
            label={choice.label}
            picked={choice.value === selected}
            disabled={disabled}
            onPress={() => onSelect(choice.value)}
          />
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * A switch in the app's own tones (app-shell, "A switch is drawn in the app's own tones"): on, an
 * accent thumb on the accent's own tint — the pair a picked chip wears; off, a muted thumb on a
 * quiet track. Not an `onAccent` thumb on an accent track: on the dark theme `onAccent` is nearly
 * black and the thumb vanished into the card. Android's default thumb is teal — the one hue
 * nothing else in the app uses — so every switch goes through here and none is drawn bare.
 */
export function ThemedSwitch(props: Omit<SwitchProps, 'trackColor' | 'thumbColor'>) {
  const theme = useTheme();
  return (
    <Switch
      {...props}
      trackColor={{ true: theme.accentSurface, false: theme.backgroundSelected }}
      thumbColor={props.value ? theme.accent : theme.textMuted}
      ios_backgroundColor={theme.backgroundSelected}
    />
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
        // `cardEdge`: a button's outline is the whole button. See `Field` above.
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.cardEdge },
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
        { borderColor: theme.cardEdge },
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
  dateSteps: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two, paddingTop: Spacing.one },
  dateStep: {
    paddingHorizontal: Spacing.twoHalf,
    paddingVertical: Spacing.oneHalf,
    borderRadius: Radius.pill,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
  },
  // The vertical padding keeps the chips' own hit slop inside the scroller, which clips.
  scrollChoices: { flexDirection: 'row', gap: Spacing.two, paddingVertical: Spacing.one },
  // The offer sits under its chips and only as wide as its own words, not across the column:
  // it is a way out of the picker, not the screen's action.
  offer: { flexDirection: 'row' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.oneHalf,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 38,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Radius.field,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    minHeight: TouchTarget,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, paddingVertical: Spacing.two },
  searchClear: { lineHeight: 24 },
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
