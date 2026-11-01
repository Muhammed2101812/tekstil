import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Coffee, Plus, Trash2 } from 'lucide-react-native';
import { BottomSheet, Button, Card, Chip, Header, Screen, SectionHeader, TimeSheet, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useSchedule, useSettings } from '../../data/hooks';
import { saveSchedule, saveScheduleDay } from '../../data/repo';
import { averageMonthlyHours, dayNetHours, weeklyPlannedHours } from '../../domain/schedule';
import { BreakTime, ScheduleDay } from '../../types';
import { formatMoney } from '../../utils/format';
import { syncBreakReminders } from '../../utils/notifications';

/** Çalışma saatleri (PLAN 4.1): gün gün düzenleme + mola yönetimi + canlı örnek */
export default function AyarCalismaSaatleri() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const schedule = useSchedule();
  const settings = useSettings();
  const [editDay, setEditDay] = useState<ScheduleDay | null>(null);

  const gunler = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const weekly = useMemo(() => weeklyPlannedHours(schedule), [schedule]);
  const monthly = useMemo(() => averageMonthlyHours(schedule), [schedule]);

  /** Canlı örnek (PLAN 4.3): mola değişince "1 gün gelmezse X kesilir" güncellenir */
  const ornekSaatlik = 30000 / (monthly > 0 ? monthly : 195);
  const stdGun = schedule.find((d) => d.is_workday);
  const gunSaat = stdGun ? dayNetHours(stdGun) : 9;
  const birGunKesinti = formatMoney(Math.round(ornekSaatlik * gunSaat * 100) / 100);

  const handleSaved = async (d: ScheduleDay, applyToAll: boolean) => {
    setEditDay(null);
    try {
      if (applyToAll) {
        const nextSchedule = schedule.map((item) =>
          item.is_workday
            ? { ...item, start_time: d.start_time, end_time: d.end_time, breaks: d.breaks }
            : item
        );
        await saveSchedule(nextSchedule);
        showToast({ message: 'Tüm iş günlerinin saat ve molaları güncellendi', tone: 'success' });
        await syncBreakReminders(
          nextSchedule,
          settings.breakReminderEnabled !== false,
          settings.breakEndReminderEnabled !== false
        );
      } else {
        await saveScheduleDay(d);
        showToast({ message: `${gunler[d.weekday - 1]} güncellendi`, tone: 'success' });
        const nextSchedule = schedule.map((item) => (item.id === d.id ? d : item));
        await syncBreakReminders(
          nextSchedule,
          settings.breakReminderEnabled !== false,
          settings.breakEndReminderEnabled !== false
        );
      }
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <Screen>
      <Header title="Çalışma Saatleri" back compact />
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={[type.body, { color: c.text, textAlign: 'center' }]}>
            Haftada <Text style={{ fontWeight: '800' }}>{weekly} saat</Text> · Günde {gunSaat} saat · Aylık ~
            {Math.round(monthly)} saat
            {weekly > 45 ? '\n45 saat yasal sınırı aşılıyor' : ''}
          </Text>
        </Card>

        <SectionHeader title="HAFTANIN GÜNLERİ" />
        <View style={{ gap: 10 }}>
          {schedule
            .slice()
            .sort((a, b) => a.weekday - b.weekday)
            .map((d) => {
              const breakCount = d.breaks.length;
              const breakListStr =
                breakCount > 0
                  ? d.breaks.map((b) => `${b.start} (${b.name || 'Mola'})`).join(', ')
                  : 'mola yok';
              return (
                <Card key={d.id} onPress={() => setEditDay(d)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: c.text }]}>
                        {gunler[d.weekday - 1]}{' '}
                        {!d.is_workday ? <Text style={{ color: c.textMuted }}>(tatil)</Text> : null}
                      </Text>
                      {d.is_workday ? (
                        <Text style={[type.small, { color: c.textMuted }]} numberOfLines={1}>
                          {d.start_time}–{d.end_time} · {breakCount} mola: {breakListStr} · net {dayNetHours(d)} sa
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Card>
              );
            })}
        </View>

        <SectionHeader title="CANLI ÖRNEK" />
        <Card>
          <Text style={[type.body, { color: c.textSecondary, textAlign: 'center' }]}>
            30.000 ₺ maaşlı bir çalışan 1 gün gelmezse{'\n'}
            <Text style={{ fontWeight: '800', color: c.danger }}>{birGunKesinti}</Text> kesilir{'\n'}
            <Text style={[type.small, { color: c.textMuted }]}>
              (saatlik {formatMoney(ornekSaatlik)} × {gunSaat} saat · yöntem{' '}
              {settings.hourlyWageMethod === 'ortalama_takvim' ? 'A: yıllık ortalama' : 'B: o ayın saati'})
            </Text>
          </Text>
        </Card>
        <View style={{ height: 30 }} />
      </View>

      <BottomSheet
        visible={Boolean(editDay)}
        onClose={() => setEditDay(null)}
        title={editDay ? `${gunler[editDay.weekday - 1]} Düzenle` : undefined}
      >
        {editDay ? (
          <ScrollView style={{ maxHeight: 520 }} showsVerticalScrollIndicator={false}>
            <DayEditor
              day={editDay}
              onClose={() => setEditDay(null)}
              onSaved={handleSaved}
            />
          </ScrollView>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

function DayEditor({
  day,
  onClose,
  onSaved,
}: {
  day: ScheduleDay;
  onClose: () => void;
  onSaved: (d: ScheduleDay, applyToAll: boolean) => void;
}) {
  const { c, type, radius } = useTheme();
  const gunler = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const [draft, setDraft] = useState<ScheduleDay>(() => ({
    ...day,
    breaks: Array.isArray(day.breaks) ? [...day.breaks] : [],
  }));
  const [applyToAll, setApplyToAll] = useState(false);
  const [activePicker, setActivePicker] = useState<
    | { type: 'start' }
    | { type: 'end' }
    | { type: 'breakStart'; index: number }
    | { type: 'breakEnd'; index: number }
    | null
  >(null);

  const addBreak = (name = 'Çay Molası', start = '10:00', end = '10:15', paid = false) => {
    setDraft({
      ...draft,
      breaks: [...draft.breaks, { name, start, end, paid }],
    });
  };

  const removeBreak = (index: number) => {
    setDraft({
      ...draft,
      breaks: draft.breaks.filter((_, idx) => idx !== index),
    });
  };

  const updateBreak = (index: number, patch: Partial<BreakTime>) => {
    setDraft({
      ...draft,
      breaks: draft.breaks.map((b, idx) => (idx === index ? { ...b, ...patch } : b)),
    });
  };

  const currentValue =
    activePicker?.type === 'start'
      ? draft.start_time
      : activePicker?.type === 'end'
      ? draft.end_time
      : activePicker?.type === 'breakStart'
      ? draft.breaks[activePicker.index]?.start ?? '12:00'
      : activePicker?.type === 'breakEnd'
      ? draft.breaks[activePicker.index]?.end ?? '13:00'
      : '08:00';

  const breakPresets = ['Sabah Çayı', 'Öğle', 'İkindi', 'Çay Molası'];

  return (
    <>
      <View style={[styles.editor, { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.card }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <Text style={[type.subtitle, { color: c.text }]}>{gunler[draft.weekday - 1]}</Text>
          <Chip
            label={draft.is_workday ? 'İş Günü' : 'Tatil'}
            selected={draft.is_workday}
            onPress={() => setDraft({ ...draft, is_workday: !draft.is_workday })}
          />
        </View>

        {draft.is_workday ? (
          <>
            <View style={[styles.timeRow, { gap: 10, marginTop: 8 }]}>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setActivePicker({ type: 'start' })}>
                  <Text style={[type.label, { color: c.textMuted }]}>BAŞLANGIÇ</Text>
                  <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{draft.start_time}</Text>
                </Card>
              </View>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setActivePicker({ type: 'end' })}>
                  <Text style={[type.label, { color: c.textMuted }]}>BİTİŞ</Text>
                  <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>{draft.end_time}</Text>
                </Card>
              </View>
            </View>

            {/* Molalar Başlığı ve Ekleme */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, marginBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Coffee size={18} color={c.primary} />
                <Text style={[type.label, { color: c.text, fontWeight: '700' }]}>
                  MOLALAR ({draft.breaks.length})
                </Text>
              </View>
              <Pressable
                onPress={() =>
                  addBreak(
                    draft.breaks.length === 0 ? 'Öğle' : 'Çay Molası',
                    draft.breaks.length === 0 ? '12:30' : '15:30',
                    draft.breaks.length === 0 ? '13:30' : '15:45',
                    draft.breaks.length === 0 ? false : false
                  )
                }
                hitSlop={8}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: c.primarySoft }}
              >
                <Plus size={16} color={c.primary} strokeWidth={2.4} />
                <Text style={[type.labelSm, { color: c.primary, fontWeight: '700' }]}>Mola Ekle</Text>
              </Pressable>
            </View>

            {draft.breaks.length === 0 ? (
              <Card style={{ paddingVertical: 12, alignItems: 'center' }}>
                <Text style={[type.small, { color: c.textMuted }]}>Kayıtlı mola yok (kesinti yapılmaz, bildirim gelmez)</Text>
              </Card>
            ) : (
              <View style={{ gap: 8 }}>
                {draft.breaks.map((b, idx) => (
                  <View
                    key={`break-${idx}`}
                    style={[styles.breakCard, { backgroundColor: c.surfaceContainerLow, borderColor: c.border, borderRadius: radius.md }]}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={[type.bodySm, { color: c.text, fontWeight: '700' }]}>
                        {idx + 1}. {b.name || 'Mola'}
                      </Text>
                      <Pressable
                        onPress={() => removeBreak(idx)}
                        hitSlop={8}
                        style={{ padding: 4 }}
                        accessibilityLabel={`${b.name || 'Mola'} sil`}
                      >
                        <Trash2 size={16} color={c.danger} />
                      </Pressable>
                    </View>

                    {/* Hızlı İsim Seçimi */}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                      {breakPresets.map((preset) => (
                        <Chip
                          key={preset}
                          label={preset}
                          selected={b.name === preset}
                          onPress={() => updateBreak(idx, { name: preset })}
                        />
                      ))}
                    </View>

                    {/* Saat Seçimleri */}
                    <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                      <Pressable
                        onPress={() => setActivePicker({ type: 'breakStart', index: idx })}
                        style={[styles.miniTimeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
                      >
                        <Text style={[type.labelSm, { color: c.textMuted }]}>Başlangıç</Text>
                        <Text style={[type.bodySm, { color: c.text, fontWeight: '700' }]}>{b.start}</Text>
                      </Pressable>

                      <Text style={[type.bodySm, { color: c.textMuted }]}>–</Text>

                      <Pressable
                        onPress={() => setActivePicker({ type: 'breakEnd', index: idx })}
                        style={[styles.miniTimeBtn, { backgroundColor: c.surface, borderColor: c.border }]}
                      >
                        <Text style={[type.labelSm, { color: c.textMuted }]}>Bitiş</Text>
                        <Text style={[type.bodySm, { color: c.text, fontWeight: '700' }]}>{b.end}</Text>
                      </Pressable>

                      {/* Ücretsiz / Ücretli Durumu */}
                      <Chip
                        label={b.paid ? 'Ücretli' : 'Ücretsiz'}
                        selected={!b.paid}
                        onPress={() => updateBreak(idx, { paid: !b.paid })}
                      />
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Tüm iş günlerine kopyalama seçeneği */}
            <Pressable
              onPress={() => setApplyToAll(!applyToAll)}
              style={[styles.toggleRow, { marginTop: 12, paddingVertical: 6 }]}
            >
              <Text style={[type.bodySm, { color: c.text, flex: 1 }]}>
                Bu saat ve molaları tüm iş günlerine uygula
              </Text>
              <Chip
                label={applyToAll ? 'Evet' : 'Hayır'}
                selected={applyToAll}
                onPress={() => setApplyToAll(!applyToAll)}
              />
            </Pressable>
          </>
        ) : null}

        <Text style={[type.small, { color: c.textMuted, marginTop: 12, textAlign: 'center' }]}>
          Net günlük çalışma: <Text style={{ fontWeight: '700', color: c.text }}>{dayNetHours(draft)} saat</Text>
        </Text>

        <View style={{ gap: 10, marginTop: 14 }}>
          <Button label="Kaydet" onPress={() => onSaved(draft, applyToAll)} />
          <Button label="Vazgeç" variant="secondary" onPress={onClose} />
        </View>
      </View>

      <TimeSheet
        visible={activePicker !== null}
        onClose={() => setActivePicker(null)}
        title="Saat Seç"
        value={currentValue}
        onDone={(t) => {
          if (!activePicker) return;
          if (activePicker.type === 'start') setDraft({ ...draft, start_time: t });
          else if (activePicker.type === 'end') setDraft({ ...draft, end_time: t });
          else if (activePicker.type === 'breakStart') updateBreak(activePicker.index, { start: t });
          else if (activePicker.type === 'breakEnd') updateBreak(activePicker.index, { end: t });
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  editor: { paddingVertical: 8 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  timeRow: { flexDirection: 'row' },
  breakCard: { borderWidth: 1, padding: 10 },
  miniTimeBtn: { flex: 1, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
});
