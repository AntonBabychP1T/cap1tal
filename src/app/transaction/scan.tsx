import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { Action } from '@/components/form';
import { Card, Screen, ScreenHeader } from '@/components/surfaces';
import { ThemedText } from '@/components/themed-text';
import { receipts as receiptsRepo, transactions as transactionsRepo } from '@/db/repos';
import { receiptIdentity } from '@/domain/fiscal-receipt';
import { chkAllWebProvider } from '@/fiscal/chk-all-web';
import { newId } from '@/ui/id';
import { failureAlert } from '@/ui/failure-alert';
import {
  askedFor,
  cancelled,
  cancelPreview,
  decoded,
  IDLE,
  lookedUp,
  previewView,
  refusalView,
  retry,
  scanAgain,
  startScan,
  storeRefused,
  stored,
  type FlowState,
} from '@/ui/receipt-screen';
import { qrScan } from '@/platform/qr-scan-device';

import { Spacing } from '@/constants/theme';

/**
 * Scanning a чек QR, looking it up and attaching it — the whole flow of `fiscal-receipts-screen`.
 *
 * This file is wiring and nothing else: every state, every sentence and every decision is
 * `src/ui/receipt-screen.ts`, which is pure and under `verify`. What lives here and can live
 * nowhere else is the camera view, the router and the repository calls.
 *
 * The camera is mounted only while the flow is `scanning`, and no frame is stored or sent
 * anywhere — `CameraView` decodes on the device and hands back text.
 */

/** The one provider, over the platform's own `fetch`. The only thing here that leaves the phone. */
const provider = chkAllWebProvider((url) => fetch(url));

export default function ScanReceiptScreen() {
  const router = useRouter();

  /** Every refusal on this screen offers «Повідомити про помилку» with that failure attached. */
  const reportBug = useCallback(
    (entryId: string) =>
      router.push({ pathname: '/manage/bug-reports/new', params: { prompt: entryId } }),
    [router],
  );

  const { id } = useLocalSearchParams<{ id: string }>();
  const [state, setState] = useState<FlowState>(IDLE);

  /**
   * The first decode wins. `decoded` already ignores anything that is not a `scanning` state, but
   * `onBarcodeScanned` can fire several times within one React commit — before the state that
   * would stop it has been applied — so the latch is a ref as well (design D11).
   */
  const latched = useRef(false);

  /**
   * What the device says about the camera, and the ask that follows when it can be asked.
   *
   * The permission is requested here and only here — because the owner opened the scanner, never
   * on launch and never on opening a транзакція. `alive` is the same guard `onboarding.tsx` keeps:
   * a screen left before the system dialog is answered must not set state on the way out.
   */
  const begin = useCallback(() => {
    latched.current = false;
    let alive = true;
    void (async () => {
      const first = startScan(await qrScan.state());
      if (!alive) return;
      if (first.kind !== 'permission') {
        setState(first);
        return;
      }
      // `askedFor`, not `startScan`: a refusal the system will accept again is a reason with a
      // button, not a state that renders nothing.
      const answered = askedFor(await qrScan.request());
      if (alive) setState(answered);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(begin, [begin]);

  /** One lookup per tap, and the parse and comparison that follow it. */
  const look = useCallback(
    async (flow: FlowState) => {
      if (flow.kind !== 'looking-up') return;
      setState(flow);
      const transaction = transactionsRepo.get(id);
      if (!transaction) {
        setState({ kind: 'refused', refusal: { kind: 'transaction-gone' } });
        return;
      }
      setState(lookedUp(flow, await provider.lookup(flow.lookup), transaction));
    },
    [id],
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      if (latched.current) return;
      latched.current = true;
      setState((current) => {
        const next = decoded(current, data);
        if (next.kind === 'looking-up') void look(next);
        return next;
      });
    },
    [look],
  );

  /**
   * Attaching. The транзакція is re-read first, so one deleted while the scanner was open ends the
   * flow with the typed reason rather than a foreign-key error the owner cannot act on.
   */
  const attach = useCallback(() => {
    if (state.kind !== 'preview') return;
    const transaction = transactionsRepo.get(id);
    if (!transaction) {
      setState(storeRefused(state, { kind: 'transaction-gone' }));
      return;
    }
    if (receiptsRepo.forTransaction(id)) {
      setState(storeRefused(state, { kind: 'already-has-receipt' }));
      return;
    }
    // The identity is the реквізити's, stamped through the domain's own constructor rather than
    // built by hand here (design D2a).
    const identity = receiptIdentity({
      registrarNumber: state.lookup.registrarNumber,
      fiscalNumber: state.lookup.fiscalNumber,
      issuedDate: state.parsed.issuedDate,
    });
    const elsewhere = receiptsRepo.byIdentity(identity);
    if (elsewhere) {
      const where = transactionsRepo.get(elsewhere.receipt.transactionId)?.description ?? elsewhere.receipt.transactionId;
      setState(storeRefused(state, { kind: 'attached-elsewhere', where }));
      return;
    }

    const receiptId = newId();
    try {
      receiptsRepo.attach(
        {
          id: receiptId,
          transactionId: id,
          ...identity,
          issuedTime: state.parsed.issuedTime,
          dialect: state.parsed.dialect,
          kind: state.parsed.kind,
          total: state.parsed.total,
          ...(state.parsed.sellerName === undefined ? {} : { sellerName: state.parsed.sellerName }),
          ...(state.parsed.pointName === undefined ? {} : { pointName: state.parsed.pointName }),
          acquisition: 'qr_scan',
          fetchedAt: Date.now(),
          snapshot: state.document,
        },
        state.parsed.items.map((item) => ({ ...item, id: newId(), receiptId })),
      );
      setState(stored(state, receiptId));
      router.back();
    } catch {
      // Storage refused the whole unit; nothing was written, and the owner is told so — in the
      // screen's own words, which go into the журнал as this failure's text.
      Alert.alert(
        ...failureAlert({ title: 'Не прикріплено', where: 'receipt-attach', error: 'Чек не вдалося зберегти. Спробуйте ще раз.', report: reportBug }),
      );
    }
  }, [id, reportBug, router, state]);

  /**
   * Looking the same чек up again, with the реквізити already decoded — the owner's tap and
   * nothing else. No timer, no background attempt, and nothing after this screen is left.
   */
  const again = useCallback(() => {
    setState((current) => {
      const next = retry(current);
      if (next.kind === 'looking-up') void look(next);
      return next;
    });
  }, [look]);

  /** Leaving the scanner without a code — the qr-scan spec's «cancelled». */
  const leave = useCallback(() => {
    setState((current) => cancelled(current));
    router.back();
  }, [router]);

  /** «Скасувати» at the preview: the чек is dropped and nothing was ever stored. */
  const discard = useCallback(() => {
    setState((current) => cancelPreview(current));
    router.back();
  }, [router]);

  return (
    <Screen>
      <ScreenHeader title="Чек" back={leave} />
      {state.kind === 'scanning' ? (
        <View style={styles.camera}>
          <CameraView
            style={styles.viewfinder}
            facing="back"
            // QR only: the spec says other barcode kinds are ignored, and a чек carries a QR.
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onScanned}
          />
        </View>
      ) : null}

      {state.kind === 'looking-up' ? (
        <Card>
          <ThemedText>Шукаємо чек…</ThemedText>
        </Card>
      ) : null}

      {state.kind === 'preview' ? (
        <Preview state={state} onAttach={attach} onCancel={discard} />
      ) : null}

      {state.kind === 'refused' ? (
        <Refused
          state={state}
          onScanAgain={() => {
            latched.current = false;
            setState((current) => scanAgain(current));
          }}
          onRetry={again}
          onSettings={() => void qrScan.openSettings()}
          onAsk={() => void begin()}
        />
      ) : null}
    </Screen>
  );
}

/** What is about to be attached, and what does not match. Nothing is stored until «Прикріпити». */
function Preview({
  state,
  onAttach,
  onCancel,
}: {
  state: Extract<FlowState, { kind: 'preview' }>;
  onAttach: () => void;
  onCancel: () => void;
}) {
  const view = previewView(state);
  return (
    <>
      <Card style={styles.list}>
        <ThemedText type="subtitle">{view.total}</ThemedText>
        {view.seller ? (
          <ThemedText type="small" themeColor="textSecondary">
            {view.seller}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {view.issued}
        </ThemedText>
        {view.mismatch ? <ThemedText type="subtitle">{view.mismatch}</ThemedText> : null}
        {view.notes.map((note) => (
          <ThemedText key={note} type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        ))}
        {view.items.map((item) => (
          <View key={item.id} style={styles.item}>
            <ThemedText>{item.name}</ThemedText>
            {item.quantity ? (
              <ThemedText type="small" themeColor="textSecondary">
                {item.quantity}
              </ThemedText>
            ) : null}
            <ThemedText>{item.total}</ThemedText>
            {item.discount ? (
              <ThemedText type="small" themeColor="textSecondary">
                {item.discount}
              </ThemedText>
            ) : null}
          </View>
        ))}
      </Card>
      <Action title={view.confirmLabel} onPress={onAttach} />
      <Action variant="secondary" title="Скасувати" onPress={onCancel} />
    </>
  );
}

/** One named reason, and what can be done about it. Both come from `refusalView`. */
function Refused({
  state,
  onScanAgain,
  onRetry,
  onSettings,
  onAsk,
}: {
  state: Extract<FlowState, { kind: 'refused' }>;
  onScanAgain: () => void;
  onRetry: () => void;
  onSettings: () => void;
  onAsk: () => void;
}) {
  const view = refusalView(state.refusal);
  return (
    <>
      <Card>
        <ThemedText>{view.text}</ThemedText>
      </Card>
      {view.next === 'scan-again' ? (
        <Action title="Сканувати ще раз" onPress={onScanAgain} />
      ) : null}
      {view.next === 'retry' ? <Action title="Повторити" onPress={onRetry} /> : null}
      {view.next === 'open-settings' ? (
        <Action title="Відкрити налаштування" onPress={onSettings} />
      ) : null}
      {view.next === 'ask-permission' ? (
        <Action title="Дозволити камеру" onPress={onAsk} />
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  // A definite height, not `flex: 1`: `Screen` puts its children in a `ScrollView`, whose content
  // has no bounded height, so a flexing viewfinder collapses to nothing — which is exactly what
  // the emulator showed on 2026-09-02, a black screen with the camera permission already granted.
  camera: { height: 420, borderRadius: Spacing.two, overflow: 'hidden' },
  viewfinder: { flex: 1 },
  list: { gap: Spacing.one },
  item: { gap: 2, paddingVertical: Spacing.one },
});
