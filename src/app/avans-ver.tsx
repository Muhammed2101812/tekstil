import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Button, Card, Chip, Header, MoneyField, Screen, TextField, useToast } from '../ui';
import { EmployeePickSheet } from '../features/QuickActions';
import { useTheme } from '../theme/ThemeProvider';
import { useEmployees } from '../data/hooks';
import { giveDebt, deleteDebtIfUnpaid } from '../data/repo';
import { todayISO } from '../domain/schedule';
import { formatMoney, formatAy } from '../utils/format';
import { hapticLight, hapticSuccess } from '../utils/haptics';

/** Avans Ver akışı (PLAN 6.6): çalışan → tutar → taksit çipleri → açıklama */
export default function AvansVer() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ employeeId?: string }>();
  const employees = useEmployees({ active: true });

  const [employeeId, setEmployeeId] = useState<string | null>(params.employeeId ?? null);
  const [amount, setAmount] = useState(0);
  const [installments, setInstallments] = useState<number>(1);
  const [description, setDescription] = useState('');
  const [startMonth, setStartMonth] = useState<string>(todayISO().slice(0, 7));
  const [pickOpen, setPickOpen] = useState(false);

  const employee = employees.find((e) => e.id === employeeId);

  const shiftMonth = (delta: number) => {
    hapticLight();
    const y = Number(startMonth.slice(0, 4));
    const m = Number(startMonth.slice(5, 7)) + delta;
    const ny = y + Math.floor((m - 1) / 12);
    const nm = ((m - 1 + 12) % 12) + 1;
    setStartMonth(`${ny}-${String(nm).padStart(2, '0')}`);
  };

  /** "Kasım–Ocak arası aylık 1.000 ₺ kesilecek" önizlemesi (PLAN 6.6) */
  const preview = useMemo(() => {
    if (!employee || amount <= 0) return null;
    const n = Math.max(1, installments);
    const monthly = n === 1 ? amount : Math.round((amount / n) * 100) / 100;
    const startIdx = Number(startMonth.slice(5)) - 1 + (Number(startMonth.slice(0, 4)) - 2020) * 12;
    const monthNames = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    const idxToYM = (i: number) => `${2020 + Math.floor(i / 12)}-${monthNames[i % 12]}`;
    const from = idxToYM(startIdx);
    const to = idxToYM(startIdx + n - 1);
    return {
      monthly,
      range: n === 1 ? `${from} ayında tek seferde` : `${from}–${to} arası aylık`,
    };
  }, [employee, amount, installments, startMonth]);

  const save = async () => {
    if (!employeeId) {
      showToast({ message: 'Önce çalışan seçin', tone: 'warning' });
      return;
    }
    if (amount <= 0) {
      showToast({ message: 'Tutar sıfırdan büyük olmalı', tone: 'warning' });
      return;
    }
    const n = Math.max(1, installments);
    try {
      const debtId = await giveDebt({
        employee_id: employeeId,
        amount,
        type: 'avans',
        installments: n,
        start_month: startMonth,
        description: description.trim() || null,
      });
      hapticSuccess();
      showToast({
        message: `${employee?.full_name}: ${formatMoney(amount)} avans kaydedildi`,
        tone: 'success',
        undo: async () => {
          const res = await deleteDebtIfUnpaid(debtId);
          showToast({
            message: res.ok ? 'Avans geri alındı' : res.reason ?? 'Geri alınamadı',
            tone: res.ok ? 'info' : 'warning',
          });
        },
      });
      router.back();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Avans kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <Screen keyboard>
      <Header title="Avans Ver" back compact />
      <View style={{ marginTop: 12 }}>
        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Çalışan</Text>
        {employees.length === 0 ? (
          <Card>
            <Text style={[type.body, { color: c.text }]}>Çalışan yok — önce personel ekleyin.</Text>
          </Card>
        ) : (
          <Card onPress={() => setPickOpen(true)}>
            <Text style={[type.body, { color: employee ? c.text : c.textMuted }]}>
              {employee ? employee.full_name : 'Çalışan seçmek için dokunun'}
            </Text>
          </Card>
        )}

        <MoneyField label="Tutar" value={amount} onChange={setAmount} quickAmounts={[1000, 2000, 5000, 10000]} />

        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Kesinti Şekli</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {[
            { n: 1, label: 'Tek seferde' },
            { n: 2, label: '2 ay' },
            { n: 3, label: '3 ay' },
            { n: 4, label: '4 ay' },
            { n: 6, label: '6 ay' },
          ].map((o) => (
            <Chip
              key={o.n}
              label={o.label}
              tone="accent"
              selected={installments === o.n}
              onPress={() => {
                setInstallments(o.n);
              }}
            />
          ))}
        </View>

        <View style={{ height: 16 }} />
        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Kesime Başlama Ayı</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            hitSlop={10}
            onPress={() => shiftMonth(-1)}
            accessibilityLabel="Önceki ay"
            accessibilityRole="button"
          >
            <ChevronLeft size={26} color={c.text} />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Chip label={formatAy(startMonth)} selected />
          </View>
          <Pressable
            hitSlop={10}
            onPress={() => shiftMonth(1)}
            accessibilityLabel="Sonraki ay"
            accessibilityRole="button"
          >
            <ChevronRight size={26} color={c.text} />
          </Pressable>
        </View>
        <Text style={[type.small, { color: c.textMuted, marginTop: 6, marginBottom: 12 }]}>
          Genelde avans verildiği ayın bordrosunda kesilir.
        </Text>

        <TextField label="Açıklama (isteğe bağlı)" value={description} onChangeText={setDescription} placeholder="Örn. bayram avansı" />

        {preview ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={[type.body, { color: c.text, textAlign: 'center' }]}>
              {preview.range} <Text style={{ fontWeight: '800' }}>{formatMoney(preview.monthly)}</Text> kesilecek
            </Text>
          </Card>
        ) : null}

        <Button label="Avansı Ver" onPress={save} disabled={!employeeId || amount <= 0} />
        <View style={{ height: 20 }} />
      </View>

      <EmployeePickSheet
        visible={pickOpen}
        onClose={() => setPickOpen(false)}
        title="Çalışan Seç"
        employees={employees}
        onPick={() => undefined}
        onSelect={(emp) => setEmployeeId(emp.id)}
      />
    </Screen>
  );
}
