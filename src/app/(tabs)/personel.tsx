import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { UserPlus, Users } from 'lucide-react-native';
import { Avatar, Badge, Button, Chip, EmptyState, Header, IconButton, SegmentedControl, TextField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useDebts, useDebtPayments, useDepartments, useEmployees } from '../../data/hooks';
import { calculateDebtBalance } from '../../domain/debts';
import { todayISO } from '../../domain/schedule';
import { formatMoney, formatTarih } from '../../utils/format';

/** Personel listesi (PLAN 6.5) */
export default function Personel() {
  const { c, spacing, type } = useTheme();
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [tab, setTab] = useState<'aktif' | 'ayrilan'>('aktif');

  const employees = useEmployees({ active: tab === 'aktif' });
  const departments = useDepartments();
  const debts = useDebts();
  const payments = useDebtPayments();
  const ym = todayISO().slice(0, 7);

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name;

  const filtered = useMemo(() => {
    let list = employees;
    if (deptFilter) list = list.filter((e) => e.department_id === deptFilter);
    if (query.trim()) {
      const q = query.trim().toLocaleLowerCase('tr');
      list = list.filter((e) => e.full_name.toLocaleLowerCase('tr').includes(q));
    }
    return list;
  }, [employees, deptFilter, query]);

  const openDebtOf = (employeeId: string) =>
    debts
      .filter((d) => d.employee_id === employeeId)
      .map((d) => calculateDebtBalance(d, payments, ym))
      .filter((b) => !b.isFullyPaid)
      .reduce((s, b) => s + b.remaining, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Header
        title="Personel"
        right={
          <IconButton
            icon={<UserPlus size={20} color={c.accent} strokeWidth={2.2} />}
            tone="accent"
            label="Çalışan Ekle"
            onPress={() => router.push('/personel/duzenle')}
          />
        }
      />
      <View style={{ paddingHorizontal: spacing.xl }}>
        <SegmentedControl
          options={[
            { value: 'aktif', label: 'Aktif' },
            { value: 'ayrilan', label: 'Ayrılanlar' },
          ]}
          value={tab}
          onChange={setTab}
        />
        <View style={{ height: spacing.md }} />
        <TextField label="" value={query} onChangeText={setQuery} placeholder="Ara…" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: spacing.md }}>
          <Chip label="Tümü" selected={deptFilter === null} onPress={() => setDeptFilter(null)} />
          {departments.map((d) => (
            <Chip key={d.id} label={d.name} selected={deptFilter === d.id} onPress={() => setDeptFilter(d.id)} />
          ))}
        </ScrollView>
      </View>

      <FlashList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 120 }}
        renderItem={({ item }) => {
          const debt = openDebtOf(item.id);
          return (
            <Pressable
              onPress={() => router.push(`/personel/${item.id}`)}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? c.surfaceSubtle : c.surface, borderColor: c.border }]}
              accessibilityRole="button"
              accessibilityLabel={item.full_name}
            >
              <Avatar name={item.full_name} photoUrl={item.photo_url} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
                  {item.full_name}
                </Text>
                <Text style={[type.small, { color: c.textMuted }]} numberOfLines={1}>
                  {deptName(item.department_id) ?? 'Departman yok'}
                  {item.end_date ? ` · ${formatTarih(item.end_date)} ayrıldı` : ''}
                </Text>
              </View>
              {debt > 0 ? <Badge label={formatMoney(debt)} tone="warning" /> : null}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={32} color={c.primary} strokeWidth={2.0} />}
            title={tab === 'aktif' ? 'Henüz çalışan yok' : 'Ayrılan çalışan yok'}
            subtitle={tab === 'aktif' ? 'İlk çalışanınızı ekleyin.' : undefined}
            action={tab === 'aktif' ? <Button label="Çalışan Ekle" size="md" onPress={() => router.push('/personel/duzenle')} /> : undefined}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 10,
    minHeight: 68,
  },
});
