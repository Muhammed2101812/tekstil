import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, EmptyState, Header, MoneyField, Screen, SectionHeader, TextField, useToast , SegmentedControl } from '../../../ui';
import { FileText } from 'lucide-react-native';
import { useTheme } from '../../../theme/ThemeProvider';
import { useDataStore } from '../../../data/store';
import { computePayrollForMonth } from '../../../features/bordro/compute';
import { savePayrollItems } from '../../../data/repo';
import { formatMoney } from '../../../utils/format';

/**
 * Bordro kalem detayı (PLAN 6.7): "Nasıl hesaplandı?" satır satır, sade dille.
 * Düzenlenebilir: prim, ek kesinti, taksit atla/tutar.
 */
export default function BordroKalem() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const { id, yil, ay } = useLocalSearchParams<{ id: string; yil: string; ay: string }>();
  const year = Number(yil);
  const month = Number(ay);

  const db = useDataStore((s) => s.db);
  const orgId = useDataStore((s) => s.orgId);
  const payroll = useMemo(() => db.payrolls.find((p) => p.year === year && p.month === month) ?? null, [db.payrolls, year, month]);
  const finalized = payroll?.status === 'kesinlesti' || payroll?.status === 'odendi';

  const [items, setItems] = useState<Awaited<ReturnType<typeof computePayrollForMonth>>>([]);
  const [loaded, setLoaded] = useState(false);

  // Kayıtlı ayarlamaları canlı hesaba uygula
  const adjustments = useMemo(() => {
    const map: Record<string, unknown> = {};
    if (!payroll) return map as never;
    for (const it of db.payroll_items.filter((i) => i.payroll_id === payroll.id)) {
      map[it.employee_id] = {
        bonus: it.bonus,
        extraCut: it.extra_cut,
        extraCutNote: it.extra_cut_note,
        skipDebt: it.skip_debt,
        debtOverride: it.debt_override,
      };
    }
    return map as never;
  }, [db.payroll_items, payroll]);

  React.useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        if (finalized && payroll) {
          const saved = db.payroll_items.filter((i) => i.payroll_id === payroll.id);
          if (!cancel) {
            setItems(saved);
            setLoaded(true);
          }
          return;
        }
        const computed = await computePayrollForMonth({ db, orgId: orgId!, year, month }, adjustments);
        if (!cancel) {
          setItems(computed);
          setLoaded(true);
        }
      } catch (e) {
        if (!cancel) {
          setLoaded(true);
          showToast({ message: e instanceof Error ? e.message : 'Bordro kalemi hesaplanamadı', tone: 'warning' });
        }
      }
    })();
    return () => {
      cancel = true;
    };
  }, [db, orgId, year, month, finalized, payroll, adjustments, showToast]);

  const item = items.find((i) => i.id === id);
  const [bonus, setBonus] = useState<number | null>(null);
  const [extraCut, setExtraCut] = useState<number | null>(null);
  const [extraNote, setExtraNote] = useState<string | null>(null);
  const [debtMode, setDebtMode] = useState<'oneri' | 'atla' | 'ozel' | null>(null);
  const [debtOverride, setDebtOverride] = useState<number | null>(null);

  const effective = item
    ? {
        bonus: bonus ?? item.bonus,
        extraCut: extraCut ?? item.extra_cut,
        skipDebt: (debtMode ?? (item.skip_debt ? 'atla' : 'oneri')) === 'atla',
        debtOverride: debtMode === 'ozel' ? (debtOverride ?? item.debt_override ?? 0) : null,
      }
    : null;

  const saveAdjustments = async () => {
    if (!item || !payroll || finalized) return;
    try {
      const updated = items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              bonus: effective!.bonus,
              extra_cut: effective!.extraCut,
              extra_cut_note: extraNote ?? i.extra_cut_note,
              skip_debt: effective!.skipDebt,
              debt_override: effective!.debtOverride,
            }
          : i
      );
      await savePayrollItems(payroll.id, updated);
      showToast({ message: 'Ayarlamalar kaydedildi', tone: 'success' });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Ayarlamalar kaydedilemedi', tone: 'warning' });
    }
  };

  if (loaded && !item) {
    return (
      <Screen>
        <Header title="Kalem" back compact />
        <EmptyState
          icon={<FileText size={32} color={c.primary} strokeWidth={2.0} />}
          title="Kalem bulunamadı"
          subtitle="Bu bordro kalesi silinmiş olabilir."
        />
      </Screen>
    );
  }

  return (
    <Screen scroll={false} padded={false}>
      <Header title={item?.employee_name ?? 'Kalem'} subtitle="Nasıl hesaplandı?" back compact />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
        {item ? (
          <>
            <Card>
              <Text style={[type.label, { color: c.textMuted }]}>ÖDENECEK NET</Text>
              <Text style={[type.money, { color: c.text, marginTop: 4 }]}>{formatMoney(item.net_payable, { kurus: true })}</Text>
              <Text style={[type.small, { color: c.textMuted, marginTop: 4 }]}>
                Saatlik {formatMoney(item.hourly_rate)} · Aylık plan {item.breakdown.monthlyHours} saat
                {item.breakdown.isProRated ? ' · kıst' : ''}
              </Text>
            </Card>

            <SectionHeader title="HESAP DETAYI" />
            <Card padded={false}>
              {item.breakdown.lines.map((line, idx) => (
                <View
                  key={`${line.label}-${idx}`}
                  style={[styles.line, { borderBottomWidth: idx < item.breakdown.lines.length - 1 ? 1 : 0, borderBottomColor: c.border }]}
                >
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[type.small, { color: c.text, fontWeight: '600' }]}>{line.label}</Text>
                    <Text style={[type.small, { color: c.textMuted, marginTop: 1, fontSize: 12 }]}>{line.detail}</Text>
                  </View>
                  <Text
                    style={[
                      type.body,
                      { color: line.amount >= 0 ? c.success : c.danger, fontWeight: '800', fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {line.amount >= 0 ? '+' : '−'}
                    {formatMoney(Math.abs(line.amount), { kurus: true })}
                  </Text>
                </View>
              ))}
            </Card>

            {item.breakdown.uncoveredCut > 0 ? (
              <Card style={{ marginTop: 12 }}>
                <Text style={[type.small, { color: c.danger }]}>
                  Kesintiler maaşı {formatMoney(item.breakdown.uncoveredCut)} aşıyor. Bordro ekranından farkı borca çevirebilirsiniz.
                </Text>
              </Card>
            ) : null}

            {!finalized ? (
              <>
                <SectionHeader title="AYARLAMALAR" />
                <Card>
                  <MoneyField label="Prim / İkramiye" value={bonus ?? item.bonus} onChange={(v) => setBonus(v)} quickAmounts={[500, 1000, 2500]} />
                  <MoneyField label="Ek Kesinti" value={extraCut ?? item.extra_cut} onChange={(v) => setExtraCut(v)} />
                  <TextField label="Kesinti Açıklaması" value={extraNote ?? item.extra_cut_note ?? ''} onChangeText={setExtraNote} placeholder="Örn. telefon taksidi" />
                  <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Avans / Borç Taksiti</Text>
                  <SegmentedControl
                    options={[
                      { value: 'oneri', label: `Öneri (${formatMoney(item.breakdown.suggestedDebtCut)})` },
                      { value: 'atla', label: 'Bu ay atla' },
                      { value: 'ozel', label: 'Özel' },
                    ]}
                    value={debtMode ?? (item.skip_debt ? 'atla' : item.debt_override != null ? 'ozel' : 'oneri')}
                    onChange={(v) => setDebtMode(v as 'oneri' | 'atla' | 'ozel')}
                  />
                  {debtMode === 'ozel' ? (
                    <View style={{ marginTop: 12 }}>
                      <MoneyField
                        label="Bu ay kesilecek tutar"
                        value={debtOverride ?? item.debt_override ?? 0}
                        onChange={setDebtOverride}
                        quickAmounts={[Math.round(item.breakdown.suggestedDebtCut)]}
                      />
                    </View>
                  ) : null}
                </Card>
                <View style={{ marginTop: 16 }}>
                  <Button label="Ayarlamaları Kaydet" onPress={saveAdjustments} />
                </View>
              </>
            ) : (
              <Card style={{ marginTop: 16 }}>
                <Text style={[type.small, { color: c.textMuted, textAlign: 'center' }]}>
                  Bu bordro kesinleşti; değiştirmek için bordroyu geri alın.
                </Text>
              </Card>
            )}
            <View style={{ height: 20 }} />
          </>
        ) : (
          <Text style={[type.body, { color: c.textMuted, textAlign: 'center', marginTop: 40 }]}>Hesaplanıyor…</Text>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
});
