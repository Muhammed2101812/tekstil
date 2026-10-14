import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Receipt, Search } from 'lucide-react-native';
import {
  Button,
  Card,
  ConfirmSheet,
  EmptyState,
  Header,
  MoneyField,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  useToast,
} from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDebtPayments, useEmployee } from '../../data/hooks';
import { useDataStore } from '../../data/store';
import { deleteDebtIfUnpaid, recordDebtPayment, updateDebtInstallments } from '../../data/repo';
import { formatMoney, formatTarihKisa } from '../../utils/format';

/** Borç detayı (PLAN 6.6): ödeme zaman çizelgesi, elden ödeme, taksit değiştir */
export default function BorcDetay() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const { id } = useLocalSearchParams<{ id: string }>();
  const debt = useDataStore((s) => s.db.debts.find((d) => d.id === id));
  const employee = useEmployee(debt?.employee_id);
  const payments = useDebtPayments(debt?.employee_id);
  const myPayments = payments.filter((p) => p.debt_id === id).sort((a, b) => b.paid_at.localeCompare(a.paid_at));

  const [eldenOpen, setEldenOpen] = useState(false);
  const [eldenAmount, setEldenAmount] = useState(0);
  const [taksitOpen, setTaksitOpen] = useState(false);
  const [taksitCount, setTaksitCount] = useState(debt?.installments ?? 1);
  const [silOpen, setSilOpen] = useState(false);

  if (!debt || !employee) {
    return (
      <Screen>
        <Header title="Borç" back compact />
        <EmptyState
          icon={<Search size={32} color={c.textMuted} strokeWidth={2.0} />}
          title="Borç kaydı bulunamadı"
        />
      </Screen>
    );
  }

  const totalPaid = myPayments.reduce((s, p) => s + p.amount, 0);
  const remaining = Math.max(0, debt.amount - totalPaid);
  const progress = debt.amount > 0 ? totalPaid / debt.amount : 0;

  return (
    <Screen>
      <Header
        title={employee.full_name}
        subtitle={`${debt.type === 'avans' ? 'Avans' : 'Borç'} · ${formatTarihKisa(debt.given_at)}`}
        back
        compact
      />

      <Card>
        <Text style={[type.label, { color: c.textMuted }]}>KALAN BORÇ</Text>
        <Text style={[type.money, { color: remaining > 0 ? c.warning : c.success, marginTop: 4 }]}>
          {formatMoney(remaining)}
        </Text>
        <View style={{ marginTop: 12 }}>
          <ProgressBar progress={progress} tone="success" />
        </View>
        <Text style={[type.small, { color: c.textMuted, marginTop: 6 }]}>
          {formatMoney(debt.amount)} toplam · {formatMoney(totalPaid)} ödendi ·{' '}
          {debt.installments > 1 ? `${debt.installments} taksit` : 'tek seferde'}
        </Text>
        {debt.description ? (
          <Text style={[type.small, { color: c.textSecondary, marginTop: 4 }]}>“{debt.description}”</Text>
        ) : null}
      </Card>

      <SectionHeader title="ÖDEME ZAMAN ÇİZELGESİ" />
      {myPayments.length === 0 ? (
        <EmptyState
          icon={<Receipt size={32} color={c.primary} strokeWidth={2.0} />}
          title="Henüz ödeme yok"
          subtitle="Maaştan kesimler ve elden ödemeler burada listelenir."
        />
      ) : (
        <Card padded={false}>
          {myPayments.map((p, i) => (
            <View
              key={p.id}
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: i < myPayments.length - 1 ? 1 : 0,
                borderBottomColor: c.border,
              }}
            >
              <Text style={[type.small, { color: c.textSecondary }]}>{formatTarihKisa(p.paid_at)}</Text>
              <Text style={[type.small, { color: p.method === 'elden' ? c.primary : c.textMuted }]}>
                {p.method === 'elden' ? 'Elden' : 'Maaş kesintisi'}
              </Text>
              <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>−{formatMoney(p.amount)}</Text>
            </View>
          ))}
        </Card>
      )}

      <View style={{ gap: 10, marginTop: 24 }}>
        <Button label="Elden Ödeme Al" onPress={() => { setEldenAmount(0); setEldenOpen(true); }} />
        <Button label="Taksiti Değiştir" variant="secondary" onPress={() => { setTaksitCount(debt.installments); setTaksitOpen(true); }} />
        {myPayments.length === 0 ? (
          <Button label="Borcu Sil" variant="ghost" onPress={() => setSilOpen(true)} />
        ) : null}
      </View>

      <ConfirmSheet
        visible={eldenOpen}
        onClose={() => setEldenOpen(false)}
        title="Elden Ödeme"
        message={`${employee.full_name} kişisinden alınan tutarı girin.`}
        confirmLabel="Ödemeyi Kaydet"
        onConfirm={async () => {
          if (eldenAmount <= 0) {
            showToast({ message: 'Önce bir tutar girin', tone: 'warning' });
            return;
          }
          if (eldenAmount > remaining) {
            showToast({ message: `Tutar kalan borcu aşıyor (${formatMoney(remaining)})`, tone: 'warning' });
            return;
          }
          try {
            await recordDebtPayment({
              debt_id: debt.id,
              employee_id: employee.id,
              amount: eldenAmount,
              method: 'elden',
            });
            showToast({ message: `${formatMoney(eldenAmount)} elden tahsil edildi`, tone: 'success' });
            setEldenAmount(0);
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Ödeme kaydedilemedi', tone: 'warning' });
          }
        }}
      >
        <MoneyField
          label="Tutar"
          value={eldenAmount}
          onChange={setEldenAmount}
          quickAmounts={[500, 1000, 2000, Math.round(remaining)]}
        />
      </ConfirmSheet>

      <ConfirmSheet
        visible={taksitOpen}
        onClose={() => setTaksitOpen(false)}
        title="Taksit Sayısını Değiştir"
        message="Yeni taksit planı kalan borca uygulanır."
        confirmLabel="Uygula"
        onConfirm={async () => {
          try {
            await updateDebtInstallments(debt.id, taksitCount);
            showToast({ message: `${taksitCount} taksit olarak güncellendi`, tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Güncellenemedi', tone: 'warning' });
          }
        }}
      >
        <SegmentedControl
          options={[1, 2, 3, 4, 6, 8].map((n) => ({ value: String(n), label: n === 1 ? 'Tek seferde' : `${n} ay` }))}
          value={String(taksitCount)}
          onChange={(v) => setTaksitCount(Number(v))}
        />
      </ConfirmSheet>

      <ConfirmSheet
        visible={silOpen}
        onClose={() => setSilOpen(false)}
        title="Borcu Sil"
        message="Bu borca ait ödeme yok. Silmek geri alınamaz."
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          const res = await deleteDebtIfUnpaid(debt.id);
          if (res.ok) showToast({ message: 'Borç silindi', tone: 'success' });
          else showToast({ message: res.reason ?? 'Silinemedi', tone: 'warning' });
        }}
      />
    </Screen>
  );
}
