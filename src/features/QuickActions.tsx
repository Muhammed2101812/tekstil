import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HandCoins, Clock4, CalendarOff, UserPlus, CalendarPlus } from 'lucide-react-native';
import { BottomSheet, TextField, STATUS_META , useToast } from '../ui';
import { useTheme } from '../theme/ThemeProvider';
import { useEmployees, useDayAttendance, useSchedule, useEvents } from '../data/hooks';
import { markAttendance, addOvertime } from '../data/repo';
import { getDayPlan, todayISO } from '../domain/schedule';
import { hapticSuccess } from '../utils/haptics';

/**
 * ➕ Hızlı işlem sayfası (PLAN 6.1): en sık işler her ekrandan 2 dokunuşla.
 * Avans Ver · Mesai Ekle · İzin/Rapor Gir · Çalışan Ekle · Ek Çalışma Günü
 */
export function QuickActionsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { c, spacing, radius, type } = useTheme();
  const { showToast } = useToast();
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const employees = useEmployees({ active: true });
  const schedule = useSchedule();
  const events = useEvents();
  const { byEmployee } = useDayAttendance(todayISO());
  const day = todayISO();

  // Hızlı mesainin çarpanı günün türüne göre belirlenir (resmî tatil ×2, hafta sonu ×1,5)
  const dayPlan = getDayPlan(day, schedule, events);
  const overtimeKind = dayPlan.kind === 'resmi_tatil' ? 'resmi_tatil' : dayPlan.isWorkday ? 'hafta_ici' : 'hafta_sonu';

  const actions = [
    {
      label: 'Avans Ver',
      desc: 'Taksitli veya tek seferde',
      icon: <HandCoins size={24} color={c.primary} />,
      bg: c.primarySoft,
      onPress: () => router.push('/avans-ver'),
    },
    {
      label: 'Mesai Ekle',
      desc: 'Bugün için',
      icon: <Clock4 size={24} color={c.warning} />,
      bg: c.warningSoft,
      onPress: () => setOvertimeOpen(true),
    },
    {
      label: 'İzin / Rapor Gir',
      desc: 'Bugün için',
      icon: <CalendarOff size={24} color={c.primary} />,
      bg: c.primarySoft,
      onPress: () => setLeaveOpen(true),
    },
    {
      label: 'Çalışan Ekle',
      desc: 'Yeni personel',
      icon: <UserPlus size={24} color={c.success} />,
      bg: c.successSoft,
      onPress: () => router.push('/personel/duzenle'),
    },
    {
      label: 'Ek Çalışma Günü',
      desc: 'Hafta sonu / tatil planla',
      icon: <CalendarPlus size={24} color={c.accent} />,
      bg: c.accentSoft,
      onPress: () => router.push('/ek-calisma'),
    },
  ];

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Hızlı İşlem">
        <View style={{ gap: 12, paddingBottom: spacing.lg }}>
          {actions.map((a) => (
            <Pressable
              key={a.label}
              onPress={a.onPress}
              style={({ pressed }) => [
                styles.action,
                { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.card, opacity: pressed ? 0.85 : 1 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={a.label}
            >
              <View style={[styles.icon, { backgroundColor: a.bg, borderRadius: 14 }]}>{a.icon}</View>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { color: c.text }]}>{a.label}</Text>
                <Text style={[type.small, { color: c.textMuted }]}>{a.desc}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </BottomSheet>

      <EmployeePickSheet
        visible={leaveOpen}
        onClose={() => {
          setLeaveOpen(false);
          onClose();
        }}
        title="İzin / Rapor — bugün"
        employees={employees}
        renderStatus={(emp) => {
          const rec = byEmployee.get(emp.id);
          return rec ? (STATUS_META[rec.status as keyof typeof STATUS_META]?.label ?? rec.status) : null;
        }}
        onPick={async (emp, status) => {
          try {
            await markAttendance(day, [{ employee_id: emp.id, status: status as never }]);
            hapticSuccess();
            showToast({ message: `${emp.full_name}: izin kaydedildi`, tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'İzin kaydedilemedi', tone: 'warning' });
          }
        }}
        statusOptions={['yillik_izin', 'mazeret_izni', 'ucretsiz_izin', 'rapor']}
      />

      <EmployeePickSheet
        visible={overtimeOpen}
        onClose={() => {
          setOvertimeOpen(false);
          onClose();
        }}
        title="Mesai — bugün"
        employees={employees}
        onPick={async (emp, hours) => {
          try {
            await addOvertime({ employee_id: emp.id, day, hours: Number(hours), kind: overtimeKind });
            hapticSuccess();
            showToast({ message: `${emp.full_name}: ${hours} saat mesai`, tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Mesai kaydedilemedi', tone: 'warning' });
          }
        }}
        hourOptions={[1, 2, 3]}
      />
    </>
  );
}

/** Çalışan seç → uygula alt sayfası (izin ve mesai hızlı akışları) */
export function EmployeePickSheet({
  visible,
  onClose,
  title,
  employees,
  onPick,
  statusOptions,
  hourOptions,
  renderStatus,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  employees: { id: string; full_name: string }[];
  onPick: (emp: { id: string; full_name: string }, value: string | number) => void | Promise<void>;
  statusOptions?: string[];
  hourOptions?: number[];
  renderStatus?: (emp: { id: string }) => string | null;
  /** Verildiyse satıra dokunmak doğrudan seçer (ikinci adım açılmaz) */
  onSelect?: (emp: { id: string; full_name: string }) => void;
}) {
  const { c, spacing, radius, type } = useTheme();
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; full_name: string } | null>(null);

  const filtered = employees.filter((e) => e.full_name.toLocaleLowerCase('tr').includes(query.toLocaleLowerCase('tr')));

  const close = () => {
    setPicked(null);
    setQuery('');
    onClose();
  };

  return (
    <BottomSheet visible={visible} onClose={close} title={picked ? picked.full_name : title}>
      {!picked ? (
        <>
          <TextField label="Ara" value={query} onChangeText={setQuery} placeholder="İsim yazın…" />
          <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
            {filtered.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => {
                  if (onSelect) {
                    onSelect(e);
                    close();
                    return;
                  }
                  setPicked(e);
                }}
                style={({ pressed }) => [
                  styles.row,
                  { borderRadius: radius.md, backgroundColor: pressed ? c.surfaceSubtle : 'transparent' },
                ]}
              >
                <Text style={[type.body, { color: c.text }]}>{e.full_name}</Text>
                {renderStatus?.(e) ? (
                  <Text style={[type.label, { color: c.textMuted }]}>{renderStatus(e)}</Text>
                ) : null}
              </Pressable>
            ))}
          </ScrollView>
        </>
      ) : statusOptions ? (
        <View style={{ gap: 10, paddingBottom: spacing.lg }}>
          {statusOptions.map((s) => (
            <Pressable
              key={s}
              onPress={async () => {
                try {
                  await onPick(picked, s);
                } finally {
                  close();
                }
              }}
              style={({ pressed }) => [
                styles.row,
                { borderRadius: radius.md, backgroundColor: pressed ? c.surfaceSubtle : c.surface, borderColor: c.border },
              ]}
            >
              <Text style={[type.body, { color: c.text }]}>
                {STATUS_META[s as keyof typeof STATUS_META]?.label ?? s}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={{ gap: 10, paddingBottom: spacing.lg }}>
          {hourOptions?.map((h) => (
            <Pressable
              key={h}
              onPress={async () => {
                try {
                  await onPick(picked, h);
                } finally {
                  close();
                }
              }}
              style={({ pressed }) => [
                styles.row,
                { borderRadius: radius.md, backgroundColor: pressed ? c.surfaceSubtle : c.surface, borderColor: c.border },
              ]}
            >
              <Text style={[type.body, { color: c.text }]}>+{h} saat mesai</Text>
            </Pressable>
          ))}
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  action: { flexDirection: 'row', alignItems: 'center', gap: 14, borderWidth: 1, padding: 14 },
  icon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  row: { paddingHorizontal: 12, paddingVertical: 14, borderWidth: 1, borderColor: 'transparent' },
});
