import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Button, Card, Chip, DateField, Header, Screen, TextField, TimeSheet, useToast , SegmentedControl } from '../ui';
import { useTheme } from '../theme/ThemeProvider';
import { useDepartments, useEmployees, useEvents, useSchedule } from '../data/hooks';
import { saveCalendarEvent } from '../data/repo';
import { getDayPlan, netHoursBetween, todayISO, validateEkCalismaDate } from '../domain/schedule';
import { CalendarEvent, EventScope } from '../types';
import { uuid } from '../data/id';
import { formatTarih } from '../utils/format';
import { hapticSuccess } from '../utils/haptics';

import { useDataStore } from '../data/store';

/** Ek Çalışma Günü Planla (PLAN 4.2): tatil gününde planlı çalışma */
export default function EkCalisma() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const params = useLocalSearchParams<{ day?: string }>();
  const employees = useEmployees({ active: true });
  const departments = useDepartments();
  const schedule = useSchedule();
  const events = useEvents(Number((params.day ?? todayISO()).slice(0, 4)));

  const [date, setDate] = useState(params.day ?? todayISO());
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('13:00');
  const [scope, setScope] = useState<EventScope>('tumu');
  const [departmentId, setDepartmentId] = useState<string | null>(null);
  const [pickedEmployees, setPickedEmployees] = useState<string[]>([]);
  const [title, setTitle] = useState('Cumartesi yarım gün');
  const [timeSheet, setTimeSheet] = useState<null | 'start' | 'end'>(null);

  const dayPlan = useMemo(() => getDayPlan(date, schedule, events), [date, schedule, events]);
  const isResmiTatil = useMemo(() => events.some((e) => e.date === date && e.type === 'resmi_tatil'), [events, date]);
  const multiplier = isResmiTatil ? 2.0 : 1.5;
  // Net süreyi seçilen günün haftalık planındaki molalardan hesapla
  const weekday = useMemo(() => {
    const [y, m, d] = date.split('-').map(Number);
    return (new Date(y, m - 1, d).getDay() + 6) % 7;
  }, [date]);
  const hours = netHoursBetween(start, end, schedule.find((s) => s.weekday === weekday)?.breaks ?? []);
  const calledCount = scope === 'tumu' ? employees.length : scope === 'departman' ? employees.filter((e) => e.department_id === departmentId).length : pickedEmployees.length;

  const save = () => {
    const check = validateEkCalismaDate(dayPlan);
    if (!check.valid) {
      showToast({ message: check.error!, tone: 'warning' });
      return;
    }
    if (hours <= 0) {
      showToast({ message: 'Bitiş saati başlangıçtan sonra olmalı', tone: 'warning' });
      return;
    }
    if (scope === 'departman' && !departmentId) {
      showToast({ message: 'Departman seçin', tone: 'warning' });
      return;
    }
    if (scope === 'kisiler' && pickedEmployees.length === 0) {
      showToast({ message: 'En az bir çalışan seçin', tone: 'warning' });
      return;
    }
    const event: CalendarEvent = {
      id: uuid(),
      org_id: useDataStore.getState().orgId!,
      date,
      type: 'ek_calisma',
      title: title.trim() || 'Ek çalışma',
      start_time: start,
      end_time: end,
      paid: true,
      multiplier,
      scope,
      department_id: scope === 'departman' ? departmentId : null,
      employee_ids: scope === 'kisiler' ? pickedEmployees : [],
      updated_at: new Date().toISOString(),
    };
    saveCalendarEvent(event);
    hapticSuccess();
    showToast({
      message: `${formatTarih(date)} için ek çalışma tanımlandı (×${multiplier.toString().replace('.', ',')} mesai)`,
      tone: 'success',
    });
  };

  return (
    <Screen keyboard>
      <Header title="Ek Çalışma Günü" back compact subtitle="Tatil gününde planlı çalışma" />
      <View style={{ marginTop: 12 }}>
        <DateField
          label="Tarih"
          value={date}
          onPick={setDate}
          hint={
            isResmiTatil
              ? 'Resmî tatil günü — çarpan ×2'
              : dayPlan.isWorkday && dayPlan.kind === 'normal'
                ? 'Dikkat: Bu tarih normal iş günü olarak tanımlı'
                : undefined
          }
        />

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Card onPress={() => setTimeSheet('start')}>
              <Text style={[type.label, { color: c.textMuted }]}>BAŞLANGIÇ</Text>
              <Text style={[type.subtitle, { color: c.text }]}>{start}</Text>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card onPress={() => setTimeSheet('end')}>
              <Text style={[type.label, { color: c.textMuted }]}>BİTİŞ</Text>
              <Text style={[type.subtitle, { color: c.text }]}>{end}</Text>
            </Card>
          </View>
        </View>

        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder="Cumartesi yarım gün" />

        <Text style={[type.small, { color: c.textSecondary, fontWeight: '600', marginBottom: 8 }]}>Kapsam</Text>
        <SegmentedControl
          options={[
            { value: 'tumu', label: 'Tümü' },
            { value: 'departman', label: 'Departman' },
            { value: 'kisiler', label: 'Kişiler' },
          ]}
          value={scope}
          onChange={(v) => setScope(v as EventScope)}
        />

        {scope === 'departman' ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, marginBottom: 12 }}>
            {departments.map((d) => (
              <Chip key={d.id} label={d.name} selected={departmentId === d.id} onPress={() => setDepartmentId(d.id)} />
            ))}
          </View>
        ) : null}

        {scope === 'kisiler' ? (
          <ScrollView style={{ maxHeight: 220, marginTop: 8 }} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
            {employees.map((e) => (
              <Chip
                key={e.id}
                label={e.full_name}
                selected={pickedEmployees.includes(e.id)}
                onPress={() =>
                  setPickedEmployees((prev) => (prev.includes(e.id) ? prev.filter((x) => x !== e.id) : [...prev, e.id]))
                }
              />
            ))}
          </ScrollView>
        ) : null}

        <Card style={{ marginBottom: 16 }}>
          <Text style={[type.body, { color: c.text, textAlign: 'center' }]}>
            {calledCount} kişi çağrılacak · {hours} saat × {multiplier.toString().replace('.', ',')} mesai ücreti{'\n'}
            Gelmeyenden kesinti yapılmaz.
          </Text>
        </Card>

        <Button label="Ek Çalışmayı Tanımla" onPress={save} disabled={calledCount === 0} />
        <View style={{ height: 20 }} />
      </View>

      <TimeSheet
        visible={timeSheet !== null}
        onClose={() => setTimeSheet(null)}
        title={timeSheet === 'start' ? 'Başlangıç Saati' : 'Bitiş Saati'}
        value={timeSheet === 'start' ? start : end}
        onDone={(t) => (timeSheet === 'start' ? setStart(t) : setEnd(t))}
      />
    </Screen>
  );
}
