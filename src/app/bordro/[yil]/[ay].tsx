import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { FileDown, Share2, Lock, Undo2, CheckCheck, Calculator, ChevronRight } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Header,
  Screen,
  SectionHeader,
  Skeleton,
  StatCard,
  StatGrid,
  useToast,
 TextField } from '../../../ui';
import { useTheme } from '../../../theme/ThemeProvider';
import { useAuth } from '../../../data/auth';
import { useDataStore } from '../../../data/store';
import { computePayrollForMonth, itemBadges, sumTotals } from '../../../features/bordro/compute';
import { PayrollItem } from '../../../types';
import { PayrollAdjustments } from '../../../domain/payroll';
import { finalizePayroll, revertPayroll, ensurePayroll, recordSalaryPayment, giveDebt } from '../../../data/repo';
import { ayAdi, formatMoney, formatMoneyShort } from '../../../utils/format';
import { hapticSuccess } from '../../../utils/haptics';
import { isSupabaseConfigured } from '../../../data/supabase';

/** Maaş / Bordro ay ekranı (PLAN 6.7): taslak canlı hesap, kesinleştir, ödeme */
export default function BordroAy() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const auth = useAuth();
  const { yil, ay } = useLocalSearchParams<{ yil: string; ay: string }>();
  const year = Number(yil);
  const month = Number(ay);

  const db = useDataStore((s) => s.db);
  const orgId = useDataStore((s) => s.orgId);
  const payroll = useMemo(
    () => db.payrolls.find((p) => p.year === year && p.month === month) ?? null,
    [db.payrolls, year, month]
  );
  const finalized = payroll?.status === 'kesinlesti' || payroll?.status === 'odendi';
  const isOwner = useMemo(() => {
    if (!auth.userId || !orgId) return false;
    const m = db.org_members.find((x) => x.user_id === auth.userId && x.org_id === orgId);
    return m?.role === 'owner';
  }, [auth.userId, orgId, db.org_members]);

  // Kayıtlı ayarlamalar (prim, taksit atla…) → canlı hesaba girdi
  const savedAdjustments = useMemo(() => {
    const map: Record<string, PayrollAdjustments> = {};
    const pid = payroll?.id;
    if (!pid) return map;
    for (const item of db.payroll_items.filter((i) => i.payroll_id === pid)) {
      map[item.employee_id] = {
        bonus: item.bonus,
        extraCut: item.extra_cut,
        extraCutNote: item.extra_cut_note,
        skipDebt: item.skip_debt,
        debtOverride: item.debt_override,
      };
    }
    return map;
  }, [db.payroll_items, payroll?.id]);

  const [liveItems, setLiveItems] = useState<PayrollItem[] | null>(null);
  const [finalConfirm, setFinalConfirm] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const ensured = await ensurePayroll(year, month);
        if (!finalized) {
          const items = await computePayrollForMonth({ db, orgId: ensured.org_id, year, month }, savedAdjustments);
          if (!cancel) setLiveItems(items);
        } else {
          const items = db.payroll_items.filter((i) => i.payroll_id === ensured.id);
          if (!cancel) setLiveItems(items);
        }
      } catch (e) {
        if (!cancel) {
          setLiveItems([]);
          showToast({ message: e instanceof Error ? e.message : 'Bordro hesaplanamadı', tone: 'warning' });
        }
      }
    })();
    return () => {
      cancel = true;
    };
    // db değişince yeniden hesapla (canlı taslak)
  }, [db, orgId, year, month, finalized, savedAdjustments, showToast]);

  const items = useMemo(() => liveItems ?? [], [liveItems]);
  const totals = useMemo(() => sumTotals(items), [items]);

  const doFinalize = async () => {
    if (!payroll || items.length === 0) return;
    setBusy(true);
    try {
      await finalizePayroll(payroll.id, items);
      hapticSuccess();
      showToast({ message: `${ayAdi(month)} ${year} bordrosu kesinleşti`, tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kesinleştirme başarısız', tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  const doRevert = async () => {
    if (!payroll) return;
    setBusy(true);
    try {
      await revertPayroll(payroll.id, revertReason || 'Geri alındı');
      showToast({ message: 'Bordro taslağa döndü, borç düşümleri geri alındı', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Geri alma başarısız', tone: 'warning' });
    } finally {
      setBusy(false);
      setRevertOpen(false);
    }
  };

  const markPaidAll = async () => {
    if (busy) return;
    setBusy(true);
    try {
      for (const item of items) {
        const kalan = item.net_payable - item.paid_amount;
        if (kalan > 0.005) {
          await recordSalaryPayment({
            payroll_item_id: item.id,
            employee_id: item.employee_id,
            amount: kalan,
            method: 'nakit',
          });
        }
      }
      hapticSuccess();
      showToast({ message: 'Tüm ödemeler nakit olarak işaretlendi', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Ödeme işaretlenemedi', tone: 'warning' });
    } finally {
      setBusy(false);
    }
  };

  /** Kesintiler maaşı aştıysa farkı borca çevir (PLAN 4.6) */
  const convertUncovered = async (item: PayrollItem) => {
    try {
      await giveDebt({
        employee_id: item.employee_id,
        amount: item.breakdown.uncoveredCut,
        type: 'borc',
        installments: 1,
        start_month: `${month === 12 ? year + 1 : year}-${String(month + 1 > 12 ? 1 : month + 1).padStart(2, '0')}`,
        description: `${ayAdi(month)} ${year} kesinti farkı`,
      });
      showToast({ message: `${item.employee_name}: fark borç olarak kaydedildi`, tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Borç kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <Screen scroll={false} padded={false}>
      <Header
        title={`${ayAdi(month)} ${year}`}
        subtitle={finalized ? (payroll?.status === 'odendi' ? 'Ödendi' : 'Kesinleşti') : 'Taslak — canlı hesap'}
        back
        compact
        right={finalized ? <Lock size={20} color={c.warning} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        <StatGrid>
          <StatCard label="Toplam ödenecek" value={formatMoneyShort(totals.net)} tone="primary" />
          <StatCard label="Kesinti" value={formatMoneyShort(totals.absence)} tone="danger" />
          <StatCard label="Mesai" value={formatMoneyShort(totals.overtime)} tone="success" />
          <StatCard label="Borç tahsilatı" value={formatMoneyShort(totals.debt)} tone="warning" />
        </StatGrid>

        <SectionHeader
          title={`ÇALIŞANLAR (${items.length})`}
          action={
            finalized && payroll?.status === 'kesinlesti' ? (
              <Button
                label="Hepsini Ödendi"
                size="sm"
                full={false}
                variant="secondary"
                icon={<CheckCheck size={16} color={c.success} />}
                onPress={markPaidAll}
              />
            ) : undefined
          }
        />

        {liveItems === null ? (
          <View style={{ gap: 12, marginTop: 8 }}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </View>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Calculator size={32} color={c.primary} strokeWidth={2.0} />}
            title="Bu ayda çalışan yok"
            subtitle="Puantaj ve personel kayıtlarını kontrol edin."
          />
        ) : (
          <View style={{ gap: 10 }}>
            {items.map((item) => {
              const badges = itemBadges(item);
              const paid = item.paid_amount >= item.net_payable - 0.005;
              return (
                <Card
                  key={item.id}
                  onPress={() => router.push(`/bordro/kalem/${item.id}?yil=${year}&ay=${month}`)}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: c.text, fontWeight: '600' }]}>{item.employee_name}</Text>
                      <Text style={[type.small, { color: c.textMuted }]}>
                        {item.department_name ?? '—'} · {formatMoney(item.net_payable)}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {finalized ? (
                        paid ? (
                          <Badge label="Ödendi" tone="success" />
                        ) : item.paid_amount > 0 ? (
                          <Badge label={`Kalan ${formatMoney(item.net_payable - item.paid_amount)}`} tone="warning" />
                        ) : (
                          <Badge label="Ödenmedi" tone="neutral" />
                        )
                      ) : null}
                      <ChevronRight size={18} color={c.textMuted} />
                    </View>
                  </View>
                  {badges.length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      {badges.map((b) => (
                        <Badge key={b} label={b} tone="neutral" />
                      ))}
                    </View>
                  ) : null}
                    {item.breakdown.uncoveredCut > 0 && !finalized ? (
                      <Pressable
                        onPress={() => convertUncovered(item)}
                        style={{ marginTop: 8 }}
                        accessibilityRole="button"
                        accessibilityLabel="Farkı borca çevir"
                      >
                        <Text style={[type.small, { color: c.danger, fontWeight: '700' }]}>
                          Kesintiler maaşı aşıyor ({formatMoney(item.breakdown.uncoveredCut)}) — farkı borç olarak kaydet
                        </Text>
                      </Pressable>
                    ) : null}
                    {finalized && !paid ? (
                      <View style={{ marginTop: 10 }}>
                        <Button
                          label={item.paid_amount > 0 ? 'Kalanı Ödendi İşaretle' : 'Ödendi İşaretle'}
                          size="md"
                          variant="secondary"
                          onPress={async () => {
                            try {
                              await recordSalaryPayment({
                                payroll_item_id: item.id,
                                employee_id: item.employee_id,
                                amount: item.net_payable - item.paid_amount,
                                method: 'nakit',
                              });
                              hapticSuccess();
                            } catch (e) {
                              showToast({ message: e instanceof Error ? e.message : 'Ödeme kaydedilemedi', tone: 'warning' });
                            }
                          }}
                        />
                      </View>
                    ) : null}
                  </Card>
              );
            })}
          </View>
        )}

        {/* Alt eylemler */}
        <View style={{ gap: 10, marginTop: 24 }}>
          {!finalized ? (
            <>
              <Button
                label="Kontrol ettim, Kesinleştir"
                disabled={busy || items.length === 0}
                onPress={() => setFinalConfirm(true)}
              />
              {isSupabaseConfigured ? (
                <Text style={[type.small, { color: c.textMuted, textAlign: 'center' }]}>
                  Kesinleştirme internet ister; taksitler anında borçlardan düşer.
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <Button
                label="Maaş Pusulası PDF (tümü)"
                variant="secondary"
                icon={<Share2 size={18} color={c.text} />}
                onPress={async () => {
                  try {
                    const { sharePayrollPdf } = await import('../../../export/pdf');
                    await sharePayrollPdf(items, `${ayAdi(month)} ${year}`);
                  } catch (e) {
                    showToast({ message: e instanceof Error ? e.message : 'PDF paylaşılamadı', tone: 'warning' });
                  }
                }}
              />
              <Button
                label="Bordro Özeti Excel"
                variant="secondary"
                icon={<FileDown size={18} color={c.text} />}
                onPress={async () => {
                  try {
                    const { shareBordroExcel } = await import('../../../export/excel');
                    await shareBordroExcel(items, year, month);
                  } catch (e) {
                    showToast({ message: e instanceof Error ? e.message : 'Excel paylaşılamadı', tone: 'warning' });
                  }
                }}
              />
              {isOwner ? (
                <Button
                  label="Bordroyu Geri Al"
                  variant="ghost"
                  icon={<Undo2 size={18} color={c.danger} />}
                  onPress={() => setRevertOpen(true)}
                />
              ) : (
                <Text style={[type.small, { color: c.textMuted, textAlign: 'center' }]}>
                  Geri alma yalnızca firma sahibine açıktır.
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={finalConfirm}
        onClose={() => setFinalConfirm(false)}
        title="Bordroyu Kesinleştir"
        message={`${items.length} çalışanın ödemesi dondurulacak, taksitler borçlardan düşülecek ve bu ayın puantajı kilitlenecek.`}
        confirmLabel="Kesinleştir"
        onConfirm={doFinalize}
      />

      <ConfirmSheet
        visible={revertOpen}
        onClose={() => setRevertOpen(false)}
        title="Bordroyu Geri Al"
        message="Taslak yeniden açılır; yapılan ödemeler ve taksit düşümleri geri döner."
        confirmLabel="Geri Al"
        destructive
        onConfirm={doRevert}
      >
        <TextField label="Gerekçe" value={revertReason} onChangeText={setRevertReason} placeholder="Örn: puantaj yanlış girilmiş" />
      </ConfirmSheet>
    </Screen>
  );
}
