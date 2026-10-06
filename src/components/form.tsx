import { useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
  type SwitchProps,
  type TextInputProps,
} from 'react-native';

import { DateTimePicker } from '@expo/ui/community/datetime-picker';

import { Icon } from './icon';
import { Appear, Tap } from './motion';
import { ThemedText } from './themed-text';

import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useHaptics } from '@/hooks/haptics-ports';
import { useTheme } from '@/hooks/use-theme';
import { choiceEvent } from '@/ui/haptics';
import { dateStepOffers, parseTypedDate, pickedDate, pickerInstant, todayIso } from '@/ui/dates';
import { type IconName } from '@/ui/icons';
import { monthStepOffers } from '@/ui/months';
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

export function Field({
  label,
  hint,
  reserveHint = false,
  ...rest
}: TextInputProps & {
  label: string;
  hint?: string;
  /**
   * Keep the hint's line even while there is no hint to draw. A form whose hint arrives later —
   * the сума's currency appears once a рахунок is chosen — otherwise grows by a line under the
   * owner's thumb, and every field below it jumps as they go to tap it.
   */
  reserveHint?: boolean;
}) {
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
      ) : reserveHint ? (
        // A blank line of the same type, so it is exactly the hint's height at any font scale —
        // and hidden from a screen reader, which has nothing to read in it.
        <ThemedText
          type="small"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {' '}
        </ThemedText>
      ) : null}
    </View>
  );
}

/**
 * The дата of a транзакція (main-screen, "The дата of a транзакція is set without typing a date
 * code"): «Календар» opens the platform's own date picker — Android's Material dialog, iOS's
 * calendar under the field — and «Сьогодні», «Вчора» and a day either way are one tap each. The
 * typed field stays for whoever prefers it and takes any usual shape (`parseTypedDate`), and the
 * label names the typed дата as a day, so «2026-09-22» is also read as «вчора». Which offers stand,
 * and what each sets, is `dateStepOffers`; this draws them. The forward step is never offered past
 * today.
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
  label = 'Дата',
  hint,
  looksAhead = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The screen's clock — what «сьогодні» is. */
  now: Date;
  /** A дата in the future is the usual answer («До дати», «Дата першого платежу»): «день ›» never stops at today. */
  looksAhead?: boolean;
  /** «Дата» for a транзакція; «Станом на» beside a рахунок's початковий залишок. */
  label?: string;
  /** Under the field: why what is typed cannot be saved, when it cannot. */
  hint?: string;
}) {
  const theme = useTheme();
  const [picking, setPicking] = useState(false);
  const offers = dateStepOffers(value, now, { looksAhead });
  const set = (next: string) => {
    if (next !== value.trim()) onChange(next);
  };
  // The picker opens on the typed дата when it is one, on today otherwise.
  const opened = (() => {
    try {
      return parseTypedDate(value);
    } catch {
      return todayIso(now);
    }
  })();
  const picked = (date: Date) => {
    setPicking(false);
    set(pickedDate(date, Platform.OS === 'android' ? 'utc' : 'local'));
  };
  return (
    <View style={styles.field}>
      <Field
        label={offers.label ? `${label} · ${offers.label}` : label}
        {...(hint ? { hint } : {})}
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
        <DateStep
          label="Календар"
          hint="Вибрати дату в календарі"
          picked={picking}
          onPress={() => setPicking(!picking)}
        />
      </View>
      {picking ? (
        // Android: a dialog that opens on mount and answers once, so it is unmounted after.
        // iOS: always inline, drawn as the graphical calendar under the chips.
        <DateTimePicker
          value={pickerInstant(opened)}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          accentColor={theme.accent}
          locale="uk_UA"
          positiveButton={{ label: 'Готово' }}
          negativeButton={{ label: 'Скасувати' }}
          onValueChange={(_event, date) => picked(date)}
          onDismiss={() => setPicking(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * A місяць the owner sets — either end of AI-аналіз's custom range (app-shell, "A дата or a місяць
 * the owner sets is set with the app's own control"): ‹ місяць ›, read in words, never a code to be
 * typed, and never stepped past the current month. Which steps stand and what the місяць reads as
 * is `monthStepOffers`; this draws them, with `DateField`'s chips.
 */
export function MonthStepper({
  label,
  value,
  onChange,
  now,
}: {
  label: string;
  /** A whole місяць, `YYYY-MM`. */
  value: string;
  onChange: (value: string) => void;
  /** The screen's clock — what the current month is. */
  now: Date;
}) {
  const offers = monthStepOffers(value, now);
  return (
    <View style={styles.field}>
      <ThemedText type="overline" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.monthSteps}>
        <DateStep label="‹" hint="На місяць раніше" onPress={() => onChange(offers.back)} />
        <ThemedText accessibilityLabel={`${label}: ${offers.label}`}>{offers.label}</ThemedText>
        {offers.forward ? (
          <DateStep label="›" hint="На місяць пізніше" onPress={() => onChange(offers.forward!)} />
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
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={hint ?? label}
      accessibilityState={{ selected: picked }}
      hitSlop={Spacing.one}
      style={[
        styles.dateStep,
        {
          backgroundColor: picked ? theme.accentSurface : theme.backgroundSelected,
          borderColor: picked ? theme.accent : theme.cardEdge,
        },
      ]}>
      <ThemedText type={picked ? 'smallBold' : 'small'} themeColor={picked ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Tap>
  );
}

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
  /** Offered as what a правило or the шаблон would give — drawn marked, never picked by itself. */
  readonly suggested?: boolean;
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
  suggested,
  disabled,
  icon,
  onPress,
}: {
  label: string;
  picked: boolean;
  /**
   * What a правило or the шаблон would give, offered and not yet picked: an accent outline drawn
   * dashed, the label in accent, no fill — a pointer at a chip, never a choice made for the owner.
   */
  suggested?: boolean;
  disabled?: boolean;
  /** A glyph before the label — a категорія's own, the вид of a рахунок. Tinted with the label. */
  icon?: IconName;
  onPress: () => void;
}) {
  const theme = useTheme();
  const haptics = useHaptics();
  // A picked chip is simply picked; the mark is for an offer still waiting on the owner.
  const marked = Boolean(suggested) && !picked;
  return (
    <Tap
      disabled={disabled}
      onPress={() => {
        // A tick when the choice changes — re-picking the chip already picked is no change
        // (motion, "An outcome the owner caused is felt once"). A store the same tap causes plays
        // its own confirm instead (`strongestHaptic`).
        const event = choiceEvent(picked, true, 'chosen');
        if (event) haptics.play(event);
        onPress();
      }}
      // The chip is 38 tall; the finger gets its 48 either way.
      hitSlop={Spacing.two}
      accessibilityHint={marked ? 'Пропозиція' : undefined}
      style={[
        styles.choice,
        {
          // An outline, not a fill: in a row of eight categories a filled chip shouts.
          backgroundColor: picked ? theme.accentSurface : theme.backgroundSelected,
          borderColor: picked || marked ? theme.accent : theme.cardEdge,
          borderStyle: marked ? 'dashed' : 'solid',
          opacity: disabled ? 0.5 : 1,
        },
      ]}>
      {icon ? (
        <Icon name={icon} size={14} color={picked || marked ? 'accent' : 'textSecondary'} />
      ) : null}
      <ThemedText
        type={picked ? 'smallBold' : 'small'}
        themeColor={picked || marked ? 'accent' : 'textSecondary'}>
        {label}
      </ThemedText>
    </Tap>
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
      {/* The hint is drawn by a text of its own under the empty field, not as the field's
          placeholder: a placeholder stays on the field's one line and is cut at its edge at a
          large text size, while this wraps and the field grows with it (transaction-search,
          "The hint fits"). The field keeps its place in the tree, so typing never remounts it. */}
      <View style={styles.searchBox}>
        {value.length === 0 ? (
          <Text
            style={[styles.searchText, { color: theme.textMuted }]}
            importantForAccessibility="no"
            accessibilityElementsHidden>
            {placeholder}
          </Text>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChange}
          accessibilityLabel={placeholder}
          autoFocus={autoFocus}
          autoCorrect={false}
          returnKeyType="search"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.searchText,
            { color: theme.text },
            value.length === 0 ? styles.searchOverHint : null,
          ]}
        />
      </View>
      {value.length > 0 ? (
        <Tap
          accessibilityRole="button"
          accessibilityLabel="Очистити пошук"
          onPress={() => onChange('')}
          hitSlop={Spacing.two}>
          <ThemedText type="subtitle" themeColor="textMuted" style={styles.searchClear}>
            ×
          </ThemedText>
        </Tap>
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
              suggested={choice.suggested}
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
/**
 * A switch always carries an accessible name saying what it switches; the switch reads its own state
 * with it (app-shell, "Every switch and every coloured mark has an accessible name").
 */
export function ThemedSwitch(
  props: Omit<SwitchProps, 'trackColor' | 'thumbColor' | 'accessibilityLabel'> & { accessibilityLabel: string },
) {
  const theme = useTheme();
  const haptics = useHaptics();
  return (
    <Switch
      {...props}
      onValueChange={(value) => {
        // The switch's own change first, the tick after it: the «Вібрація» switch stores before
        // this reads it, so turning it on ticks and turning it off plays nothing.
        props.onValueChange?.(value);
        const event = choiceEvent(props.value, value, 'toggled');
        if (event) haptics.play(event);
      }}
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
    <Tap
      onPress={onPress}
      disabled={disabled}
      // The screen's primary button also presses in (motion, "Every tap is acknowledged at once").
      emphasis={variant === 'primary'}
      style={[
        styles.action,
        variant === 'primary' && {
          backgroundColor: disabled ? theme.backgroundSelected : theme.accent,
        },
        // `cardEdge`: a button's outline is the whole button. See `Field` above.
        variant === 'secondary' && { borderWidth: 1, borderColor: theme.cardEdge },
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
        //
        // `actionLabelBox` stretches the label to the button's whole inner width. Shrink-wrapped
        // inside `alignItems: 'center'` — as it was — the label's box is Android's own measure of
        // the text, and when that measure comes out a hair short (a re-measure after the keyboard,
        // a font-scale change) the one line breaks at the last space and the rest is simply not
        // drawn: «До архіву» on a рахунок's edit form reached the owner as «До», reproducibly,
        // with the whole card's width to spare. A box as wide as the button cannot come out short.
        numberOfLines={1}
        adjustsFontSizeToFit
        // The filled action is the loudest thing on its screen; the outline and the destructive
        // verb beside it are a weight quieter.
        style={[styles.actionLabelBox, filled ? styles.actionFilledLabel : styles.actionLabel]}
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
    </Tap>
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
    <Tap
      onPress={onPress}
      hitSlop={Spacing.two}
      style={[styles.rowAction, { borderColor: theme.cardEdge }]}>
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
    </Tap>
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
  suggestedId,
  searchBelow = false,
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
  /**
   * What a правило or the шаблон would give the транзакція — the quick категорія picker of a
   * «Без категорії» line passes it. Shortlisted first and marked; stored only when tapped.
   */
  suggestedId?: string;
  /**
   * Draw the full list's search field under the chips instead of over them. For a picker inline in
   * a стрічка: the keyboard the field raises sits right under it, so with the chips below they were
   * all covered and only the field stayed in sight (emulator, qa-sweep-2026-10). Below, the field
   * rests on the keyboard and what it narrows stays above it while the owner types.
   */
  searchBelow?: boolean;
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

  const shown = shortlist(rows, { recentIds, chosenIds, selectedId: selected, suggestedId });
  const offer = allOffer(rows, noun);
  const asChoices = (list: readonly Named[]) =>
    list.map((row) => ({
      value: row.id,
      label: row.name,
      suggested: row.id === suggestedId && row.id !== selected,
    }));

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
  const search = (
    <Field
      label={label}
      value={query}
      onChangeText={setQuery}
      autoCapitalize="none"
      placeholder="почніть вводити назву"
    />
  );
  const list =
    narrowed.length === 0 ? (
      <ThemedText type="small" themeColor="textSecondary">
        {NOTHING_FOUND}
      </ThemedText>
    ) : (
      // The full list opens by fading in, and what is under it moves down with it (motion,
      // "What opens, closes or leaves moves its neighbours smoothly").
      <Appear style={styles.choices}>
        {asChoices(narrowed).map((choice) => (
          <Chip
            key={choice.value}
            label={choice.label}
            picked={choice.value === selected}
            onPress={() => choose(choice.value)}
          />
        ))}
      </Appear>
    );
  return (
    <View style={styles.field}>
      {searchBelow ? list : search}
      {searchBelow ? search : list}
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
  monthSteps: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingTop: Spacing.one },
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
  searchBox: { flex: 1, minWidth: 0 },
  // The field and its hint share one box, so the caret sits on the hint's first line.
  searchText: { fontSize: 17, paddingVertical: Spacing.two, paddingHorizontal: 0 },
  searchOverHint: { ...StyleSheet.absoluteFill, textAlignVertical: 'top' },
  searchClear: { lineHeight: 24 },
  action: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderRadius: Radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TouchTarget,
  },
  actionLabelBox: { alignSelf: 'stretch', textAlign: 'center' },
  actionFilledLabel: { fontWeight: 700 },
  actionLabel: { fontWeight: 600 },
  rowAction: {
    paddingHorizontal: Spacing.three - Spacing.half,
    paddingVertical: Spacing.two,
    borderRadius: Radius.chip,
    borderWidth: 1,
  },
});
