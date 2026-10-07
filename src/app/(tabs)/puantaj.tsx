import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import { CalendarOff, CheckCheck, Lock, Users } from 'lucide-react-native';
import { Avatar, Button, Chip, Header, Screen, StatusPill, TextField, DateStepper, EmptyState, useToast } from '../../ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import {
  useDayAttendance,
  useDepartments,
  useEmployees,
  useEvents,
  usePayroll,
  useSchedule,
} from '../../data/hooks';
import { getDayPlan, todayISO } from '../../domain/schedule';
import { AttendanceRecord } from '../../types';
import { StatusSheet, BulkStatusSheet } from '../../features/puantaj/StatusSheet';
import { confirmAttendanceDay } from '../../data/repo';
import { hapticSuccess } from '../../utils/haptics';

/** Puantaj (PLAN 6.4) — en sık kullanılacak ekran */
export default function Puantaj() {
  const { c, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [day, setDay] = useState(todayISO());
  const [query, setQuery] = useState('');
  const [deptFilter, setDeptFilter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [activeEmp, setActiveEmp] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);

  const employees = useEmployees({ active: true });
  const departments = useDepartments();
  const schedule = useSchedule();
  const events = useEvents(Number(day.slice(0, 4)));
  const { byEmployee, confirmed } = useDayAttendance(day);
  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const payroll = usePayroll(year, month);
  const locked = payroll?.status === 'kesinlesti' || payroll?.status === 'odendi';
  const { showToast } = useToast();

  const plan = useMemo(() => getDayPlan(day, schedule, events), [day, schedule, events]);

  const roster = useMemo(() => {
    // Tatil günlerinde yalnız ek çalışmaya çağrılanlar listelenir (PLAN 4.4)
    const ekEvent = plan.event?.type === 'ek_calisma' ? plan.event : null;
    return employees.filter((e) => {
      if (plan.isWorkday) {
        return (!e.end_date || e.end_date >= day) && e.start_date <= day;
      }
      if (ekEvent) {
        if (ekEvent.scope === 'tumu') return (!e.end_date || e.end_date >= day) && e.start_date <= day;
        if (ekEvent.scope === 'departman') return e.department_id === ekEvent.department_id;
        return ekEvent.employee_ids.includes(e.id);
      }
      return false;
    });
  }, [employees, plan, day]);

  const filtered = useMemo(() => {
    let list = roster;
    if (deptFilter) list = list.filter((e) => e.department_id === deptFilter);
    if (query.trim()) {
      const q = query.trim().toLocaleLowerCase('tr');
      list = list.filter((e) => e.full_name.toLocaleLowerCase('tr').includes(q));
    }
    return list;
  }, [roster, deptFilter, query]);

  const counts = useMemo(() => {
    let present = 0, absent = 0, leave = 0, late = 0;
    for (const e of roster) {
      const rec = byEmployee.get(e.id);
      if (!rec || rec.status === 'geldi') present++;
      else if (rec.status === 'gelmedi' || rec.status === 'ucretsiz_izin') absent++;
      else if (rec.status === 'gec_geldi') { late++; present++; }
      else if (rec.status === 'erken_cikti' || rec.status === 'yarim_gun') present++;
      else leave++;
    }
    return { present, absent, leave, late };
  }, [roster, byEmployee]);

  const deptName = (id: string | null) => departments.find((d) => d.id === id)?.name;

  const toggleSelect = (id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  if (!plan.isWorkday && plan.kind !== 'ek_calisma') {
    return (
      <Screen>
        <Header title="Puantaj" />
        <DateStepper date={day} onChange={setDay} />
        <View style={{ marginTop: 60 }}>
          <EmptyState
            icon={<CalendarOff size={32} color={c.textMuted} strokeWidth={2.0} />}
            title={plan.title ? plan.title : 'Bugün hafta sonu'}
            subtitle="Tatil gününde yoklama girilmez."
            action={
              <Button
                label="Ek Çalışma Günü Planla"
                variant="accent"
                size="md"
                onPress={() => router.push({ pathname: '/ek-calisma', params: { day } })}
              />
            }
          />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Header title="Puantaj" right={locked ? <Lock size={20} color={c.warning} /> : undefined} />
      <View style={{ paddingHorizontal: spacing.xl }}>
        <DateStepper date={day} onChange={setDay} />
        <Text style={[type.small, { color: c.textMuted, marginTop: 8 }]}>
          {plan.kind === 'ek_calisma'
            ? `Ek çalışma · ${plan.title ?? ''} · mesai çarpanı ×${plan.overtimeMultiplier?.toString().replace('.', ',')}`
            : plan.kind === 'firma_tatili_ucretsiz'
              ? `${plan.title} (ücretsiz firma tatili — herkesten kesilir)`
              : plan.kind === 'yarim_gun'
                ? `${plan.title} · yarım gün (${plan.plannedHours} sa)`
                : `İş günü · ${plan.plannedHours} saat planlı`}
        </Text>
        <Text style={[type.bodySm, { color: c.textMuted, marginTop: 6 }]}>
          İşaretlemedikleriniz Gelmiş sayılır — yalnızca gelmeyenleri ve istisnaları işaretleyin.
        </Text>
        <View style={[styles.countRow, { marginTop: spacing.md }]}>
          <StatusPill status="geldi" detail={`${counts.present}`} size="sm" />
          <StatusPill status="gelmedi" detail={`${counts.absent}`} size="sm" />
          {counts.late > 0 ? <StatusPill status="gec_geldi" detail={`${counts.late}`} size="sm" /> : null}
          <StatusPill status="yillik_izin" detail={`${counts.leave}`} size="sm" />
          {selected.length > 0 ? (
            <Pressable
              onPress={() => setBulkOpen(true)}
              hitSlop={8}
              style={styles.bulkBtn}
              accessibilityLabel="Toplu işlem"
              accessibilityRole="button"
            >
              <Text style={[type.label, { color: c.accent, fontWeight: '800' }]}>
                {selected.length} kişi seçildi →
              </Text>
            </Pressable>
          ) : null}
        </View>
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
        contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: Math.max(insets.bottom, 12) + 140 }}
        renderItem={({ item }) => {
          const rec = byEmployee.get(item.id);
          const isSel = selected.includes(item.id);
          return (
            <Pressable
              onPress={() => (selected.length > 0 ? toggleSelect(item.id) : setActiveEmp(item.id))}
              onLongPress={() => {
                toggleSelect(item.id);
              }}
              style={({ pressed }) => [styles.row, { backgroundColor: isSel ? c.primarySoft : pressed ? c.surfaceSubtle : c.surface, borderColor: isSel ? c.primary : c.border }]}
              accessibilityRole="button"
              accessibilityLabel={`${item.full_name}${rec ? ': ' + rec.status : ''}`}
            >
              <Avatar name={item.full_name} photoUrl={item.photo_url} />
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]} numberOfLines={1}>
                  {item.full_name}
                </Text>
                <Text style={[type.small, { color: c.textMuted }]} numberOfLines={1}>
                  {deptName(item.department_id) ?? 'Departman yok'}
                </Text>
              </View>
              {rec ? (
                <StatusPill
                  status={rec.status}
                  detail={
                    rec.status === 'gec_geldi' && rec.late_minutes
                      ? `${rec.arrival_time ?? ''} ${rec.late_minutes} dk`
                      : rec.status === 'erken_cikti' && rec.leave_time
                        ? rec.leave_time
                        : undefined
                  }
                />
              ) : (
                <View style={[styles.defaultPill, { backgroundColor: c.surfaceSubtle, borderColor: c.border }]}>
                  <Text style={[type.labelSm, { color: c.textMuted, fontWeight: '600' }]}>Geldi</Text>
                </View>
              )}
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <EmptyState
            icon={<Users size={32} color={c.primary} strokeWidth={2.0} />}
            title="Listelenecek çalışan yok"
            subtitle="Filtreleri kontrol edin veya personel ekleyin."
          />
        }
      />

      {/* Sabit alt buton */}
      {!confirmed ? (
        <View style={[styles.bottom, { bottom: Math.max(insets.bottom, 12) + 68, borderColor: c.border, backgroundColor: c.tabBar }]}>
          <Button
            label="Yoklamayı Tamamla"
            onPress={async () => {
              try {
                await confirmAttendanceDay(day);
                hapticSuccess();
                showToast({ message: 'Günün yoklaması tamamlandı', tone: 'success' });
              } catch (e) {
                showToast({ message: e instanceof Error ? e.message : 'Yoklama onaylanamadı', tone: 'warning' });
              }
            }}
          />
        </View>
      ) : (
        <View style={[styles.bottomDone, { bottom: Math.max(insets.bottom, 12) + 68, borderColor: c.border, backgroundColor: c.tabBar }]}>
          <CheckCheck size={20} color={c.success} />
          <Text style={[type.small, { color: c.success, fontWeight: '700' }]}>Yoklama tamamlandı</Text>
        </View>
      )}

      {activeEmp ? (
        <StatusSheet
          visible={!!activeEmp}
          onClose={() => setActiveEmp(null)}
          employee={employees.find((e) => e.id === activeEmp)!}
          day={day}
          record={byEmployee.get(activeEmp) as AttendanceRecord | undefined}
          planStartMinutes={plan.startMinutes}
          planEndMinutes={plan.endMinutes}
          payrollLocked={locked}
          autoOvertime={
            plan.kind === 'ek_calisma' && plan.event
              ? {
                  eventId: plan.event.id,
                  hours: plan.plannedHours,
                  multiplier: plan.overtimeMultiplier ?? 1.5,
                  kind: events.some((e) => e.date === day && e.type === 'resmi_tatil') ? 'resmi_tatil' : 'hafta_sonu',
                }
              : null
          }
        />
      ) : null}

      <BulkStatusSheet visible={bulkOpen} onClose={() => { setBulkOpen(false); setSelected([]); }} employeeIds={selected} day={day} />
    </View>
  );
}

const styles = StyleSheet.create({
  countRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  bulkBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  defaultPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
  },
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
  bottom: { position: 'absolute', left: 20, right: 20, borderWidth: 0 },
  bottomDone: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 96,
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
