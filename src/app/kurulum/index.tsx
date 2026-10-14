import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Check, ChevronLeft, Clock, FileSpreadsheet, Plus } from 'lucide-react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as XLSX from 'xlsx';
import { File } from 'expo-file-system';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, Chip, MoneyField, SegmentedControl, TextField, TimeField } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useAuth } from '../../data/auth';
import { addDepartment, addEmployee, createOrganization, saveSchedule } from '../../data/repo';
import { useDataStore } from '../../data/store';
import {
  DEPARTMENT_PRESETS,
  defaultScheduleDays,
  SCHEDULE_TEMPLATES,
  type BreakTime,
} from '../../types';
import { todayISO } from '../../domain/schedule';
import { hapticLight, hapticSuccess } from '../../utils/haptics';

const STEPS = ['Firma', 'Çalışma Saatleri', 'Departmanlar', 'Çalışanlar'] as const;
const BREAK_OPTIONS = [0, 30, 45, 60, 90];

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN;
  return h * 60 + m;
}

function minToTime(m: number): string {
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * Kurulum sihirbazı: firma adı → çalışma saatleri → departmanlar → ilk çalışanlar.
 * İçerik kayar, birincil eylem her zaman ekranın altında sabittir.
 */
export default function Kurulum() {
  const { c, spacing, type, radius } = useTheme();
  const auth = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const orgId = useDataStore((s) => s.orgId);

  const [step, setStep] = useState(0);
  const [orgName, setOrgName] = useState('');
  const [scheduleMode, setScheduleMode] = useState<'sablon' | 'ozel'>('sablon');
  const [templateIdx, setTemplateIdx] = useState(1);
  const [startTime, setStartTime] = useState('08:30');
  const [endTime, setEndTime] = useState('18:30');
  const [breakStart, setBreakStart] = useState('12:30');
  const [breakEnd, setBreakEnd] = useState('13:30');
  const [hasBreak, setHasBreak] = useState(true);
  const [selectedDeps, setSelectedDeps] = useState<string[]>(['Kesim', 'Dikim']);
  const [people, setPeople] = useState<{ name: string; salary: string }[]>([{ name: '', salary: '' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importInfo, setImportInfo] = useState<string | null>(null);

  const breakMinutes = useMemo(() => {
    if (!hasBreak) return 0;
    const s = timeToMin(breakStart);
    const e = timeToMin(breakEnd);
    if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
    return e - s;
  }, [hasBreak, breakStart, breakEnd]);

  const timesValid = useMemo(() => {
    const s = timeToMin(startTime);
    const e = timeToMin(endTime);
    return !Number.isNaN(s) && !Number.isNaN(e) && e > s;
  }, [startTime, endTime]);

  const dailyHours = useMemo(() => {
    if (!timesValid) return 0;
    const net = timeToMin(endTime) - timeToMin(startTime) - breakMinutes;
    return Math.round((Math.max(0, net) / 60) * 10) / 10;
  }, [timesValid, startTime, endTime, breakMinutes]);

  const weeklyHours = useMemo(() => Math.round(dailyHours * 5 * 10) / 10, [dailyHours]);

  const pickTemplate = (i: number) => {
    setTemplateIdx(i);
    const t = SCHEDULE_TEMPLATES[i];
    setStartTime(t.start);
    setEndTime(t.end);
    setBreakStart(t.breakStart);
    setBreakEnd(t.breakEnd);
    setHasBreak(true);
  };

  const onPickBreakStart = (newStart: string) => {
    setBreakStart(newStart);
    setHasBreak(true);
    const s = timeToMin(newStart);
    const curDur = breakMinutes > 0 ? breakMinutes : 60;
    if (!Number.isNaN(s)) {
      setBreakEnd(minToTime(s + curDur));
    }
  };

  const onPickBreakEnd = (newEnd: string) => {
    setBreakEnd(newEnd);
    const s = timeToMin(breakStart);
    const e = timeToMin(newEnd);
    if (!Number.isNaN(s) && !Number.isNaN(e) && e > s) {
      setHasBreak(true);
    }
  };

  const setBreakDuration = (m: number) => {
    if (m === 0) {
      setHasBreak(false);
      return;
    }
    setHasBreak(true);
    const s = Number.isNaN(timeToMin(breakStart)) ? 12 * 60 + 30 : timeToMin(breakStart);
    setBreakStart(minToTime(s));
    setBreakEnd(minToTime(s + m));
  };

  /** Excel şablonundan içe aktarma: Ad Soyad | Net Maaş | İşe Giriş */
  const importFromExcel = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const file = new File(res.assets[0].uri);
      const b64 = file.base64();
      const wb = XLSX.read(b64, { type: 'base64' });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
      const imported: { name: string; salary: string }[] = [];
      for (const row of rows) {
        const name = String(row['Ad Soyad'] ?? row['Ad'] ?? row['ad'] ?? '').trim();
        const salaryRaw = row['Net Maaş'] ?? row['Maaş'] ?? row['maas'] ?? 0;
        const salary = Number(String(salaryRaw).replace(/[^\d,.-]/g, '').replace(',', '.'));
        if (name.length >= 3 && salary > 0) imported.push({ name, salary: String(salary) });
      }
      if (imported.length === 0) {
        setImportInfo('Okunacak satır bulunamadı. Sütunlar "Ad Soyad" ve "Net Maaş" olmalı.');
        return;
      }
      setPeople(imported);
      setImportInfo(`${imported.length} çalışan okundu.`);
    } catch (e) {
      setImportInfo(e instanceof Error ? `Okunamadı: ${e.message}` : 'Dosya okunamadı');
    }
  };

  const finish = async (skipPeople = false) => {
    setBusy(true);
    setError(null);
    try {
      let org = orgId;
      if (!org) {
        org = await createOrganization(orgName.trim() || 'Atölyem', null);
      }
      const brk: BreakTime = {
        name: 'Öğle',
        start: breakStart || '12:30',
        end: breakEnd || '13:30',
        paid: false,
      };
      const existingSchedule = useDataStore.getState().db.schedule_days.filter((d) => d.org_id === org);
      const baseDays = existingSchedule.length === 7 ? existingSchedule : defaultScheduleDays(org);
      const schedule = baseDays.map((d) => {
        if (!d.is_workday) return d;
        return {
          ...d,
          start_time: startTime || '08:30',
          end_time: endTime || '18:30',
          breaks: breakMinutes > 0 ? [brk] : [],
        };
      });
      await saveSchedule(schedule);
      for (const name of selectedDeps) {
        const preset = DEPARTMENT_PRESETS.find((p) => p.name === name);
        await addDepartment(name, preset?.color ?? '#3B5BDB');
      }
      if (!skipPeople) {
        for (const p of people) {
          if (p.name.trim().length > 1 && Number(p.salary.replace(',', '.')) > 0) {
            await addEmployee({
              full_name: p.name.trim(),
              salary: Number(p.salary.replace(',', '.')),
              start_date: todayISO(),
              department_id: null,
            });
          }
        }
      }
      hapticSuccess();
      router.replace('/(tabs)');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kurulum tamamlanamadı');
      setBusy(false);
    }
  };

  const next = () => {
    setError(null);
    if (step === 0) {
      if (!orgName.trim()) {
        setError('Devam etmek için firma adını girin.');
        return;
      }
    }
    if (step === 1 && !timesValid) {
      setError('Bitiş saati başlangıçtan sonra olmalı.');
      return;
    }
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const primaryLabel = step === STEPS.length - 1
    ? (busy ? 'Hazırlanıyor…' : 'Bitir ve Başla')
    : 'Devam';

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        {/* Üst bilgi ve adım göstergesi */}
        <View
          style={[
            styles.header,
            {
              paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 44) + 8,
              paddingHorizontal: spacing.xl,
            },
          ]}
        >
          <View style={styles.headerRow}>
            {step > 0 ? (
              <Pressable
                hitSlop={12}
                onPress={() => {
                  hapticLight();
                  setError(null);
                  setStep((s) => s - 1);
                }}
                style={({ pressed }) => [
                  styles.backBtn,
                  pressed && { backgroundColor: c.surfaceSubtle },
                ]}
                accessibilityLabel="Geri"
                accessibilityRole="button"
              >
                <ChevronLeft size={24} color={c.text} strokeWidth={2.2} />
              </Pressable>
            ) : null}
            <View style={styles.headerTitleCol}>
              <Text style={[type.titleMd, { color: c.text }]}>Kurulum</Text>
              <Text style={[type.bodySm, { color: c.textMuted }]}>
                Adım {step + 1}/{STEPS.length} · {STEPS[step]}
              </Text>
            </View>
          </View>
          <View style={[styles.progress, { gap: 6, marginTop: spacing.md }]}>
            {STEPS.map((s, i) => (
              <View
                key={s}
                style={{
                  flex: 1,
                  height: 4,
                  borderRadius: radius.pill,
                  backgroundColor: i <= step ? c.primary : c.surfaceSubtle,
                }}
              />
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 0 ? (
            <View>
              <Text style={[type.headlineSm, { color: c.text }]}>Firmanızın adı ne?</Text>
              <Text style={[type.bodyMd, { color: c.textSecondary, marginTop: 6, marginBottom: spacing.xl }]}>
                Bu ad bordroda ve raporlarda görünür.
              </Text>
              <TextField
                label="Firma Adı"
                value={orgName}
                onChangeText={(t) => {
                  setOrgName(t);
                  if (error) setError(null);
                }}
                placeholder="Yılmaz Tekstil"
                error={step === 0 ? error : null}
              />
            </View>
          ) : null}

          {step === 1 ? (
            <View>
              <Text style={[type.headlineSm, { color: c.text }]}>Çalışma saatleri</Text>
              <Text style={[type.bodyMd, { color: c.textSecondary, marginTop: 6, marginBottom: spacing.lg }]}>
                Hazır bir şablon seçin veya kendi saatlerinizi girin.
              </Text>

              <SegmentedControl<'sablon' | 'ozel'>
                options={[
                  { value: 'sablon', label: 'Hazır Şablonlar' },
                  { value: 'ozel', label: 'Özel Saatler' },
                ]}
                value={scheduleMode}
                onChange={setScheduleMode}
              />

              {scheduleMode === 'sablon' ? (
                <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
                  {SCHEDULE_TEMPLATES.map((t, i) => {
                    const selected = i === templateIdx;
                    return (
                      <Card
                        key={t.label}
                        onPress={() => pickTemplate(i)}
                        style={{ borderColor: selected ? c.primary : c.border }}
                        contentStyle={{ paddingVertical: 14 }}
                      >
                        <View style={styles.templRow}>
                          <Text style={[type.bodyMd, { color: c.text, fontWeight: selected ? '600' : '400' }]}>
                            {t.label}
                          </Text>
                          {selected ? <Check size={20} color={c.primary} strokeWidth={2.4} /> : null}
                        </View>
                      </Card>
                    );
                  })}
                </View>
              ) : (
                <View style={{ marginTop: spacing.md }}>
                  <View style={{ flexDirection: 'row', gap: spacing.md }}>
                    <View style={{ flex: 1 }}>
                      <TimeField
                        label="Mesai Başlangıç"
                        value={startTime}
                        onPick={setStartTime}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <TimeField
                        label="Mesai Bitiş"
                        value={endTime}
                        onPick={setEndTime}
                      />
                    </View>
                  </View>
                  {hasBreak ? (
                    <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <TimeField
                          label="Mola Başlangıç"
                          value={breakStart}
                          onPick={onPickBreakStart}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <TimeField
                          label="Mola Bitiş"
                          value={breakEnd}
                          onPick={onPickBreakEnd}
                        />
                      </View>
                    </View>
                  ) : null}
                </View>
              )}

              <Text style={[type.labelMd, { color: c.textSecondary, marginTop: spacing.md, marginBottom: 8 }]}>
                Öğle Molası Süresi (ücretsiz)
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {BREAK_OPTIONS.map((m) => (
                  <Chip
                    key={m}
                    label={m === 0 ? 'Mola yok' : `${m} dk`}
                    selected={m === 0 ? !hasBreak : hasBreak && breakMinutes === m}
                    onPress={() => setBreakDuration(m)}
                  />
                ))}
              </View>

              <Card
                style={{ marginTop: spacing.lg, backgroundColor: c.surfaceSubtle, borderWidth: 0 }}
                contentStyle={{ paddingVertical: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Clock size={18} color={c.primary} />
                  <Text style={[type.bodyMd, { color: c.text, fontWeight: '600' }]}>
                    {timesValid
                      ? `Günlük ${String(dailyHours).replace('.', ',')} sa · Haftalık ${String(weeklyHours).replace('.', ',')} sa`
                      : 'Saatleri kontrol edin'}
                  </Text>
                </View>
                {timesValid && weeklyHours > 45 ? (
                  <Text style={[type.bodySm, { color: c.danger, marginTop: 6, fontWeight: '600' }]}>
                    Haftalık süre 45 saati aşıyor — yasal sınır üzeri.
                  </Text>
                ) : null}
              </Card>
              {error ? (
                <Text style={[type.small, { color: c.danger, marginTop: spacing.md }]}>{error}</Text>
              ) : null}
            </View>
          ) : null}

          {step === 2 ? (
            <View>
              <Text style={[type.headlineSm, { color: c.text }]}>Hangi bölümler var?</Text>
              <Text style={[type.bodyMd, { color: c.textSecondary, marginTop: 6, marginBottom: spacing.lg }]}>
                {"Seçtikleriniz departman olarak eklenir. Sonradan Ayarlar'dan değiştirebilirsiniz."}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                {DEPARTMENT_PRESETS.map((d) => (
                  <Chip
                    key={d.name}
                    label={d.name}
                    selected={selectedDeps.includes(d.name)}
                    onPress={() =>
                      setSelectedDeps((prev) =>
                        prev.includes(d.name) ? prev.filter((x) => x !== d.name) : [...prev, d.name]
                      )
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View>
              <Text style={[type.headlineSm, { color: c.text }]}>İlk çalışanları ekleyin</Text>
              <Text style={[type.bodyMd, { color: c.textSecondary, marginTop: 6, marginBottom: spacing.lg }]}>
                Ad ve net maaş yeterli — detayları sonradan tamamlayabilirsiniz.
              </Text>
              {people.map((p, i) => (
                <View key={i} style={styles.personRow}>
                  <View style={{ flex: 1.4 }}>
                    <TextField
                      label={i === 0 ? 'Ad Soyad' : ' '}
                      value={p.name}
                      onChangeText={(t) => setPerson(i, 'name', t)}
                      placeholder="Ayşe Yılmaz"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <MoneyField
                      label={i === 0 ? 'Net Maaş' : ' '}
                      value={Number(p.salary.replace(',', '.')) || 0}
                      onChange={(v) => setPerson(i, 'salary', String(v))}
                      quickAmounts={[30000, 35000, 40000]}
                    />
                  </View>
                </View>
              ))}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                <Button
                  label="Çalışan Ekle"
                  variant="secondary"
                  size="sm"
                  icon={<Plus size={16} color={c.primary} />}
                  onPress={() => setPeople((p) => [...p, { name: '', salary: '' }])}
                  full={false}
                />
                <Button
                  label="Excel'den İçe Aktar"
                  variant="secondary"
                  size="sm"
                  icon={<FileSpreadsheet size={16} color={c.primary} />}
                  onPress={importFromExcel}
                  full={false}
                />
              </View>
              {importInfo ? (
                <Text style={[type.bodySm, { color: c.textSecondary, marginTop: spacing.md }]}>
                  {importInfo}
                </Text>
              ) : null}
              {error ? (
                <Text style={[type.small, { color: c.danger, marginTop: spacing.md }]}>{error}</Text>
              ) : null}
            </View>
          ) : null}

          {auth.email && step === STEPS.length - 1 ? (
            <Text style={[type.bodySm, { color: c.textMuted, textAlign: 'center', marginTop: spacing.xl }]}>
              {auth.email}
            </Text>
          ) : null}
        </ScrollView>

        {/* Alt eylem çubuğu */}
        <View
          style={[
            styles.bottomBar,
            {
              backgroundColor: c.surface,
              borderTopColor: c.border,
              paddingBottom: Math.max(insets.bottom, 16),
            },
          ]}
        >
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            {step > 0 ? (
              <Button
                label="Geri"
                variant="secondary"
                onPress={() => {
                  setError(null);
                  setStep((s) => s - 1);
                }}
                disabled={busy}
                full={false}
                style={{ flex: 1 }}
              />
            ) : null}
            {step === STEPS.length - 1 ? (
              <>
                <Button
                  label="Sonra"
                  variant="ghost"
                  onPress={() => finish(true)}
                  disabled={busy}
                  full={false}
                  style={{ flex: 1 }}
                />
                <Button
                  label={primaryLabel}
                  onPress={() => finish(false)}
                  disabled={busy}
                  loading={busy}
                  full={false}
                  style={{ flex: 2 }}
                />
              </>
            ) : (
              <Button
                label={primaryLabel}
                onPress={next}
                full={false}
                style={{ flex: step > 0 ? 2 : 1 }}
              />
            )}
          </View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );

  function setPerson(i: number, field: 'name' | 'salary', value: string) {
    setPeople((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)));
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: {
    paddingBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
  },
  headerTitleCol: {
    flex: 1,
    justifyContent: 'center',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -10,
  },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  templRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  bottomBar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingTop: 12,
  },
});
