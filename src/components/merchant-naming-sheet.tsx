import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action, Field, Picker } from './form';
import { Sheet } from './sheet';
import { ThemedText } from './themed-text';

import { merchants as merchantsRepo } from '@/db/repos';
import type { Merchant } from '@/domain/merchants';
import { failureAlert } from '@/ui/failure-alert';
import { newId } from '@/ui/id';
import {
  namingHoldsEdits,
  submitNaming,
  type NamingErrors,
  type NamingForm,
  type NamingTarget,
} from '@/ui/merchants-screen';
import { Spacing } from '@/constants/theme';

/**
 * The one naming form (merchants-screen, "One naming form names a продавець from an опис"): opened
 * by «Назвати» on a «Без продавця» row and by «Назвати продавця» on a транзакція alike. It shows
 * the опис it names from and the proposed назва and написання, both editable. «Зберегти» stores a
 * new продавець; «Додати до наявного» picks one that exists and adds the написання to it. Every
 * refusal is said beside its field and stores nothing; `submitNaming` decides all of it.
 */
export function MerchantNamingSheet({
  form,
  merchants,
  onClose,
  onStored,
  reportBug,
}: {
  /** The form to show; `undefined` keeps the sheet closed. */
  form: NamingForm | undefined;
  /** The продавці as stored — what a назва or a написання may already belong to, and the picker. */
  merchants: readonly Merchant[];
  onClose: () => void;
  /** Once stored: what the розбір moved, said by the caller where the owner is looking. */
  onStored: (said: string | undefined) => void;
  reportBug: (entryId: string) => void;
}) {
  /** The fields as the owner edits them, seeded fresh from each form that arrives. */
  const [seededFor, setSeededFor] = useState(form);
  const [name, setName] = useState(form?.name ?? '');
  const [spelling, setSpelling] = useState(form?.spelling ?? '');
  const [errors, setErrors] = useState<NamingErrors>({});
  const [picking, setPicking] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (form !== seededFor) {
    setSeededFor(form);
    setName(form?.name ?? '');
    setSpelling(form?.spelling ?? '');
    setErrors({});
    setPicking(false);
    setPickerOpen(false);
  }

  const store = async (target: NamingTarget) => {
    if (!form) return;
    try {
      const outcome = await submitNaming({ description: form.description, name, spelling }, target, merchants, {
        name: merchantsRepo.name,
        newId,
        now: () => new Date(),
      });
      if (outcome.kind === 'refused') {
        setErrors(outcome.errors);
        return;
      }
      onStored(outcome.said);
    } catch (error) {
      Alert.alert(...failureAlert({ title: 'Не збережено', where: 'merchant-name', error, report: reportBug }));
    }
  };

  return (
    <Sheet
      open={form !== undefined}
      title="Назвати продавця"
      onClose={onClose}
      // A назва or a написання changed from the proposal: «назад» asks «Відкинути зміни?» (app-shell).
      isDirty={namingHoldsEdits(form, { name, spelling })}>
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          Опис: {form?.description}
        </ThemedText>
        {picking ? null : (
          <>
            <Field label="Назва" value={name} onChangeText={setName} />
            {errors.name ? (
              <ThemedText type="small" themeColor="textDanger">
                {errors.name}
              </ThemedText>
            ) : null}
            {errors.takenBy ? (
              <Action
                variant="secondary"
                title={`Додати написання до «${errors.takenBy.name}»`}
                onPress={() => void store({ kind: 'existing', merchantId: errors.takenBy!.id })}
              />
            ) : null}
          </>
        )}
        <Field
          label="Написання"
          value={spelling}
          onChangeText={setSpelling}
          autoCapitalize="none"
          hint="Частина опису, за якою продавця впізнаватимуть"
        />
        {errors.spelling ? (
          <ThemedText type="small" themeColor="textDanger">
            {errors.spelling}
          </ThemedText>
        ) : null}
        {picking ? (
          <Picker
            label="Додати до продавця"
            rows={merchants}
            recentIds={[]}
            selected={undefined}
            onSelect={(merchantId: string) => void store({ kind: 'existing', merchantId })}
            noun="merchants"
            expanded={pickerOpen}
            onExpandedChange={setPickerOpen}
          />
        ) : null}
      </View>
      <View style={styles.actions}>
        {picking ? (
          <Action variant="secondary" title="Назад до нового продавця" onPress={() => setPicking(false)} />
        ) : (
          <>
            <Action title="Зберегти" onPress={() => void store({ kind: 'new' })} />
            {merchants.length > 0 ? (
              <Action variant="secondary" title="Додати до наявного" onPress={() => setPicking(true)} />
            ) : null}
          </>
        )}
        <Action variant="secondary" title="Скасувати" onPress={onClose} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.two },
  actions: { gap: Spacing.two, marginTop: Spacing.three },
});
