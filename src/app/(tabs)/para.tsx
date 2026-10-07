import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle2, ChevronRight, HandCoins, NotebookPen } from 'lucide-react-native';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Header,
  ProgressBar,
  Screen,
  SectionHeader,
  SegmentedControl,
  StatCard,
  StatGrid,
  useToast,
} from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDebts, useDebtPayments, useEmployees, usePayroll } from '../../data/hooks';
import { calculateDebtBalance } from '../../domain/debts';
import { todayISO } from '../../domain/schedule';
import { ayAdi, formatMoney, formatTarihKisa } from '../../utils/format';
import { ensurePayroll } from '../../data/repo';

/** Para (PLAN 6.6, 6.7): Avans & Borç | Maaş sekmeleri */
export default function Para() {
  const [tab, setTab] = useState<'avans' | 'maas'>('avans');
  return (
    <Screen scroll={false} padded={false}>
      <Header title="Para" />
      <View style={{ paddingHorizontal: 20 }}>
        <SegmentedControl
          options={[
            { value: 'avans', label: 'Avans & Borç' },
            { value: 'maas', label: 'Maaş / Bordro' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </View>
      {tab === 'avans' ? <AvansBorc /> : <MaasBordro />}
    </Screen>
  );
}

function AvansBorc() {
  const { c, type } = useTheme();
  const debts = useDebts();
  const payments = useDebtPayments();
  const employees = useEmployees({ active: true });
  const ym = todayISO().slice(0, 7);

  const byEmployee = useMemo(() => {
    const map = new Map<string, { name: string; total: number; items: { id: string; remaining: number; progress: number; nextInstallment: number; date: string }[] }>();
    for (const e of employees) {
      const balances = debts
        .filter((d) => d.employee_id === e.id)
        .map((d) => calculateDebtBalance(d, payments, ym))
        .filter((b) => !b.isFullyPaid);
      if (balances.length === 0) continue;
      map.set(e.id, {
        name: e.full_name,
        total: balances.reduce((s, b) => s + b.remaining, 0),
        items: balances.map((b) => ({
          id: b.debt.id,
          remaining: b.remaining,
          progress: b.debt.amount > 0 ? (b.debt.amount - b.remaining) / b.debt.amount : 0,
          nextInstallment: b.suggestedInstallment,
          date: b.debt.given_at,
        })),
      });
    }
    return [...map.entries()];
  }, [employees, debts, payments, ym]);

  const totalOpen = byEmployee.reduce((s, [, v]) => s + v.total, 0);

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
      <StatGrid>
        <StatCard label="Toplam açık borç" value={formatMoney(totalOpen)} tone={totalOpen > 0 ? 'warning' : 'success'} />
      </StatGrid>

      <SectionHeader
        title="BORÇLU ÇALIŞANLAR"
        action={
          <Button
            label="Avans Ver"
            size="sm"
            full={false}
            variant="accent"
            icon={<HandCoins size={16} color={c.onAccent} />}
            onPress={() => router.push('/avans-ver')}
          />
        }
      />

      {byEmployee.length === 0 ? (
        <EmptyState
          icon={<CheckCircle2 size={32} color={c.success} strokeWidth={2.0} />}
          title="Açık borç yok"
          subtitle="Verilen avanslar buradan takip edilir."
        />
      ) : (
        <View style={{ gap: 12 }}>
          {byEmployee.map(([empId, info]) => (
            <Card key={empId} onPress={() => router.push(`/personel/${empId}`)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[type.body, { color: c.text, fontWeight: '600' }]}>{info.name}</Text>
                <Text style={[type.subtitle, { color: c.warning }]}>{formatMoney(info.total)}</Text>
              </View>
              {info.items.length === 1 ? (
                <>
                  <View style={{ marginTop: 10 }}>
                    <ProgressBar progress={info.items[0].progress} tone="success" />
                  </View>
                  <Text style={[type.small, { color: c.textMuted, marginTop: 6 }]}>
                    Kalan {formatMoney(info.items[0].remaining)} · Sıradaki taksit {formatMoney(info.items[0].nextInstallment)} · {formatTarihKisa(info.items[0].date)}
                  </Text>
                </>
              ) : (
                <Text style={[type.small, { color: c.textMuted, marginTop: 8 }]}>
                  {info.items.length} açık borç · Aylık taksit toplamı{' '}
                  {formatMoney(info.items.reduce((s, i) => s + i.nextInstallment, 0))}
                </Text>
              )}
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

function MaasBordro() {
  const { c, type } = useTheme();
  const now = new Date();
  // Ay sonu hesabı: geçerli aydan başla
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() + 1 });

  const months = useMemo(() => {
    const list: { y: number; m: number }[] = [];
    let y = cursor.y;
    let m = cursor.m;
    for (let i = 0; i < 3; i++) {
      list.push({ y, m });
      m -= 1;
      if (m === 0) {
        m = 12;
        y -= 1;
      }
    }
    return list;
  }, [cursor]);

  const { showToast } = useToast();
  const openBordro = async (y: number, m: number) => {
    try {
      await ensurePayroll(y, m);
      router.push(`/bordro/${y}/${m}`);
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Bordro açılamadı', tone: 'warning' });
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
      <SectionHeader
        title="BORDRO AYLARI"
        action={
          <Button
            label="Bu Ay"
            size="sm"
            full={false}
            variant="secondary"
            icon={<NotebookPen size={15} color={c.text} />}
            onPress={() => setCursor({ y: new Date().getFullYear(), m: new Date().getMonth() + 1 })}
          />
        }
      />
      <View style={{ gap: 12 }}>
        {months.map(({ y, m }) => (
          <MonthRow key={`${y}-${m}`} y={y} m={m} onOpen={() => openBordro(y, m)} />
        ))}
      </View>
      <Text style={[type.small, { color: c.textMuted, marginTop: 20 }]}>
        Bir ayı seçip bordroyu hesaplatın, kontrol edin ve kesinleştirin.
      </Text>
    </ScrollView>
  );
}

function MonthRow({ y, m, onOpen }: { y: number; m: number; onOpen: () => void }) {
  const { c, type } = useTheme();
  const payroll = usePayroll(y, m);
  const statusLabel =
    payroll?.status === 'kesinlesti' ? 'Kesinleşti' : payroll?.status === 'odendi' ? 'Ödendi' : 'Taslak';
  const tone = payroll?.status === 'taslak' || !payroll ? 'neutral' : payroll?.status === 'kesinlesti' ? 'primary' : 'success';

  return (
    <Card onPress={onOpen}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[type.subtitle, { color: c.text }]}>
          {ayAdi(m)} {y}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Badge label={statusLabel} tone={tone} />
          <ChevronRight size={18} color={c.textMuted} />
        </View>
      </View>
    </Card>
  );
}
