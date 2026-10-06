import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import { BugReportForm } from '@/components/bug-report-form';
import { Screen, ScreenHeader } from '@/components/surfaces';
import { useCloseOnBack } from '@/hooks/use-close-on-back';
import { reporting as reportingRepo } from '@/db/repos';
import { buildInfo, deviceInfo } from '@/platform/app-build-device';
import {
  FORM_TITLE,
  submitForm,
  type FormFields,
  type ReportContext,
} from '@/ui/bug-report-screen';
import { newId } from '@/ui/id';
import { journal } from '@/ui/journal';

/**
 * «Повідомити про помилку» — the form, reached from a failure dialog with `?prompt=<journal id>`
 * or from the section with nothing.
 *
 * The route the репорт names is not passed here and is not this screen's to know: `submitForm`
 * derives it from the журнал, which already holds every screen change and, after a crash, the
 * crashed route itself (design D9).
 */
export default function NewBugReportScreen() {
  const router = useRouter();
  const { prompt } = useLocalSearchParams<{ prompt?: string }>();
  const [refusal, setRefusal] = useState<string | null>(null);

  // Read once, here: after the репорт is created it carries a copy, and the live журнал is free to
  // roll past the entry.
  const prompting = prompt ? journal.byId(prompt) : null;

  /**
   * Leaving the form stores nothing, and the hook is not what makes that true: the fields were only
   * ever component state, and the one write in this file is inside `save`.
   *
   * What the hook adds is the question. While the form holds anything typed (`edited`, reported by
   * the form itself), the back gesture asks «Відкинути зміни?» first and «Відкинути» leaves through
   * `leave`, exactly as the header's «←» does; untouched, the hook hands the press straight back to
   * the navigator (app-shell; bug-report-screen, "The back gesture discards the form").
   */
  const leave = useCallback(() => router.back(), [router]);
  const [edited, setEdited] = useState(false);
  useCloseOnBack(false, leave, edited);

  const save = (fields: FormFields) => {
    const id = newId();
    const context: ReportContext = {
      build: buildInfo(),
      device: deviceInfo(),
      migrationsApplied: reportingRepo.migrationsApplied(),
      counts: reportingRepo.counts(),
      journal: journal.tail(),
      prompting,
      now: new Date(),
      // The one thing this screen knows that the репорт cannot derive: whether a failure sent the
      // owner here or they came looking. `prompt` is set only when a dialog offered «Повідомити
      // про помилку», so it *is* the distinction — no second flag to keep in step.
      origin: prompting === null ? 'section' : 'dialog',
    };
    const outcome = submitForm({
      id,
      fields,
      context,
      save: (report) => reportingRepo.create(report),
    });
    if (outcome.kind === 'refused') {
      setRefusal(outcome.message);
      return;
    }
    // `replace`, not `push`: the saved репорт takes the form's place, so «назад» from it lands on
    // the section rather than on a form the owner has already submitted.
    router.replace(`/manage/bug-reports/${id}`);
  };

  return (
    <Screen>
      <ScreenHeader title={FORM_TITLE} back={leave} />
      <BugReportForm prompting={prompting} refusal={refusal} onSave={save} onEdited={setEdited} />
    </Screen>
  );
}
