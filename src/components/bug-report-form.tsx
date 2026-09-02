import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Action, Field } from './form';
import { Card } from './surfaces';
import { ThemedText } from './themed-text';

import { Spacing } from '@/constants/theme';
import type { JournalEntry } from '@/reporting/journal';
import {
  EMPTY_FORM,
  FIELD_HINTS,
  FIELD_LABELS,
  formState,
  PROMPTING_HEADING,
  SAVE_LABEL,
  type FormFields,
} from '@/ui/bug-report-screen';

/**
 * The three lines the owner writes, and the failure that prompted them.
 *
 * One component for two hosts: the ordinary form screen, and the crash fallback, which renders it
 * with no router and no theme provider anywhere beneath it. That is why it owns **no navigation
 * hook of its own** — no `useCloseOnBack`, whose `useFocusEffect` needs a navigator that the
 * fallback does not have (design D4). The host answers the back gesture: `new.tsx` with the hook
 * every other pushed screen uses, the fallback with `BackHandler` directly.
 *
 * Every word and every rule is `src/ui/bug-report-screen.ts`'s. This draws them.
 */
export function BugReportForm({
  prompting,
  refusal,
  onSave,
}: {
  prompting: JournalEntry | null;
  /** What the last refused save said, held by the host so it survives this component's state. */
  refusal: string | null;
  onSave: (fields: FormFields) => void;
}) {
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM);
  const model = formState({ fields, prompting, refusal });

  return (
    <View style={styles.form}>
      {model.promptingLine ? (
        <Card>
          <ThemedText type="overline" themeColor="textSecondary">
            {PROMPTING_HEADING}
          </ThemedText>
          <ThemedText type="small" themeColor="textDanger">
            {model.promptingLine}
          </ThemedText>
        </Card>
      ) : null}

      <Field
        label={FIELD_LABELS.did}
        hint={FIELD_HINTS.did}
        value={fields.did}
        onChangeText={(did) => setFields((current) => ({ ...current, did }))}
        multiline
      />
      <Field
        label={FIELD_LABELS.happened}
        hint={FIELD_HINTS.happened}
        value={fields.happened}
        onChangeText={(happened) => setFields((current) => ({ ...current, happened }))}
        multiline
      />
      <Field
        label={FIELD_LABELS.expected}
        hint={FIELD_HINTS.expected}
        value={fields.expected}
        onChangeText={(expected) => setFields((current) => ({ ...current, expected }))}
        multiline
      />

      {model.refusal ? (
        <ThemedText type="small" themeColor="textDanger">
          {model.refusal}
        </ThemedText>
      ) : null}

      <Action title={SAVE_LABEL} onPress={() => onSave(fields)} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
});
