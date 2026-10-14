import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Chip, Header, Screen, SectionHeader, TimeSheet, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useSchedule, useSettings } from '../../data/hooks';
import { saveScheduleDay } from '../../data/repo';
import { averageMonthlyHours, dayNetHours, weeklyPlannedHours } from '../../domain/schedule';
import { ScheduleDay } from '../../types';
import { formatMoney } from '../../utils/format';

/** Çalışma saatleri (PLAN 4.1): gün gün düzenleme + canlı örnek */
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
              const lunchBreak = d.breaks.find((b) => !b.paid);
              const mins = lunchBreak
                ? (Number(lunchBreak.end.slice(0, 2)) * 60 + Number(lunchBreak.end.slice(3)) - Number(lunchBreak.start.slice(0, 2)) * 60 - Number(lunchBreak.start.slice(3)))
                : 0;
              return (
                <Card key={d.id} onPress={() => setEditDay(d)}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={[type.body, { color: c.text }]}>
                        {gunler[d.weekday - 1]}{' '}
                        {!d.is_workday ? <Text style={{ color: c.textMuted }}>(tatil)</Text> : null}
                      </Text>
                      {d.is_workday ? (
                        <Text style={[type.small, { color: c.textMuted }]}>
                          {d.start_time}–{d.end_time}
                          {mins > 0 ? ` · öğle ${mins} dk ücretsiz` : ' · mola yok'} · net {dayNetHours(d)} sa
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

      {editDay ? (
        <DayEditor
          day={editDay}
          onClose={() => setEditDay(null)}
          onSaved={(d) => {
            setEditDay(null);
            saveScheduleDay(d)
              .then(() => showToast({ message: `${gunler[d.weekday - 1]} güncellendi`, tone: 'success' }))
              .catch((e) => showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' }));
          }}
        />
      ) : null}
    </Screen>
  );
}

function DayEditor({ day, onClose, onSaved }: { day: ScheduleDay; onClose: () => void; onSaved: (d: ScheduleDay) => void }) {
  const { c, type, radius } = useTheme();
  const gunler = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'];
  const [draft, setDraft] = useState<ScheduleDay>(() => {
    const lunch = day.breaks.find((b) => !b.paid);
    if (lunch) return day;
    // mola yoksa varsayılan öğle ekleyelim (silinebilir)
    return { ...day, breaks: day.is_workday ? [{ name: 'Öğle', start: '12:30', end: '13:30', paid: false }] : [] };
  });
  const [field, setField] = useState<'start' | 'end' | 'breakStart' | 'breakEnd' | null>(null);

  const lunch = draft.breaks.find((b) => !b.paid);
  const setBreak = (key: 'start' | 'end', value: string) => {
    const others = draft.breaks.filter((b) => b.paid);
    const newLunch = { name: 'Öğle', start: key === 'start' ? value : lunch?.start ?? '12:30', end: key === 'end' ? value : lunch?.end ?? '13:30', paid: false };
    setDraft({ ...draft, breaks: [...others, newLunch] });
  };

  const currentValue =
    field === 'start' ? draft.start_time : field === 'end' ? draft.end_time : field === 'breakStart' ? lunch?.start ?? '12:30' : lunch?.end ?? '13:30';

  return (
    <>
      {/* tam ekran alt sayfa yerine kart içi editör */}
      <View style={[styles.editor, { backgroundColor: c.surface, borderColor: c.border, borderRadius: radius.card }]}>
        <Text style={[type.subtitle, { color: c.text }]}>{gunler[draft.weekday - 1]}</Text>

        <Pressable onPress={() => setDraft({ ...draft, is_workday: !draft.is_workday })} style={styles.toggleRow}>
          <Text style={[type.body, { color: c.text }]}>İş günü</Text>
          <Chip label={draft.is_workday ? 'Evet' : 'Hayır'} selected={draft.is_workday} onPress={() => setDraft({ ...draft, is_workday: !draft.is_workday })} />
        </Pressable>

        {draft.is_workday ? (
          <>
            <View style={[styles.timeRow, { gap: 10 }]}>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setField('start')}>
                  <Text style={[type.label, { color: c.textMuted }]}>BAŞLANGIÇ</Text>
                  <Text style={[type.body, { color: c.text }]}>{draft.start_time}</Text>
                </Card>
              </View>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setField('end')}>
                  <Text style={[type.label, { color: c.textMuted }]}>BİTİŞ</Text>
                  <Text style={[type.body, { color: c.text }]}>{draft.end_time}</Text>
                </Card>
              </View>
            </View>
            <View style={[styles.timeRow, { gap: 10, marginTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setField('breakStart')}>
                  <Text style={[type.label, { color: c.textMuted }]}>ÖĞLE BAŞLANGIÇ</Text>
                  <Text style={[type.body, { color: c.text }]}>{lunch?.start ?? '—'}</Text>
                </Card>
              </View>
              <View style={{ flex: 1 }}>
                <Card onPress={() => setField('breakEnd')}>
                  <Text style={[type.label, { color: c.textMuted }]}>ÖĞLE BİTİŞ</Text>
                  <Text style={[type.body, { color: c.text }]}>{lunch?.end ?? '—'}</Text>
                </Card>
              </View>
            </View>
            <Pressable onPress={() => setDraft({ ...draft, breaks: [] })} style={{ marginTop: 10 }}>
              <Text style={[type.small, { color: c.textMuted, textAlign: 'center' }]}>Molayı kaldır (ücretli sayılır)</Text>
            </Pressable>
          </>
        ) : null}

        <Text style={[type.small, { color: c.textMuted, marginTop: 12, textAlign: 'center' }]}>
          Net günlük: {dayNetHours(draft)} saat
        </Text>

        <View style={{ gap: 10, marginTop: 14 }}>
          <Button label="Kaydet" onPress={() => onSaved(draft)} />
          <Button label="Vazgeç" variant="secondary" onPress={onClose} />
        </View>
      </View>

      <TimeSheet
        visible={field !== null}
        onClose={() => setField(null)}
        title="Saat Seç"
        value={currentValue}
        onDone={(t) => {
          if (field === 'start') setDraft({ ...draft, start_time: t });
          else if (field === 'end') setDraft({ ...draft, end_time: t });
          else if (field === 'breakStart') setBreak('start', t);
          else if (field === 'breakEnd') setBreak('end', t);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  editor: { borderWidth: 1, padding: 16 },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  timeRow: { flexDirection: 'row' },
});
