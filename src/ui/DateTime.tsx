import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { BottomSheet } from './BottomSheet';
import { ChipGroup } from './Chip';
import { Button } from './Button';
import { TextField } from './TextField';
import { useTheme } from '../theme/ThemeProvider';
import { hapticLight } from '../utils/haptics';
import { addDaysISO, todayISO } from '../domain/schedule';
import { formatTarih } from '../utils/format';

/** ‹ [Pazartesi, 5 Ekim] › + Bugün kısayolu */
export function DateStepper({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const { c, type } = useTheme();
  const isToday = date === todayISO();
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d, 12, 0, 0);

  const openPicker = () => {
    // DateTimePickerAndroid yalnız Android'de vardır; diğer platformlarda çağrılmamalı
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: dt,
      mode: 'date',
      onChange: (_e, picked) => {
        if (!picked) return;
        const p = picked as Date;
        onChange(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`);
      },
    });
  };

  return (
    <View style={styles.row}>
      <Pressable hitSlop={10} onPress={() => { hapticLight(); onChange(addDaysISO(date, -1)); }} accessibilityLabel="Önceki gün">
        <ChevronLeft size={28} color={c.text} />
      </Pressable>
      <Pressable onPress={openPicker} accessibilityLabel="Tarih seç" style={styles.mid}>
        <Text style={[type.subtitle, { color: c.text }]}>{formatTarih(date, { gunAdi: true })}</Text>
        {!isToday ? (
          <Text style={[type.label, { color: c.primary, marginTop: 2 }]} onPress={() => onChange(todayISO())}>
            Bugün’e dön
          </Text>
        ) : null}
      </Pressable>
      <Pressable hitSlop={10} onPress={() => { hapticLight(); onChange(addDaysISO(date, 1)); }} accessibilityLabel="Sonraki gün">
        <ChevronRight size={28} color={c.text} />
      </Pressable>
    </View>
  );
}

/** Saat seçici: hazır çipler + sistem saat diyalogu (PLAN 2.3) */
export function TimeSheet({
  visible,
  onClose,
  title,
  value,
  baseMinutes,
  quickOffsets = [10, 15, 30, 60],
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  value: string;
  /** Varsayılan: mesai başlangıcı + 15 dk gibi bir taban (dakika) */
  baseMinutes?: number;
  quickOffsets?: number[];
  onDone: (time: string) => void;
}) {
  const { c, type } = useTheme();
  const [picked, setPicked] = useState(value);

  const fmt = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
  const parse = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const openSystem = () => {
    if (Platform.OS !== 'android') return;
    const [h, m] = picked.split(':').map(Number);
    DateTimePickerAndroid.open({
      value: new Date(2026, 0, 1, h, m),
      mode: 'time',
      is24Hour: true,
      onChange: (_e, d) => {
        if (!d) return;
        setPicked(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      },
    });
  };

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title}>
      <Text style={[type.money, { color: c.text, textAlign: 'center', marginVertical: 16 }]}>{picked}</Text>
      <View style={{ gap: 10 }}>
        {baseMinutes !== undefined ? (
          <ChipGroup
            options={quickOffsets.map((o) => ({ value: baseMinutes + o, label: `+${o >= 60 ? o / 60 + ' sa' : o + ' dk'}` }))}
            value={parse(picked) >= baseMinutes && quickOffsets.includes(parse(picked) - baseMinutes) ? parse(picked) : null}
            onChange={(v) => setPicked(fmt(v))}
          />
        ) : null}
        <ChipGroup
          options={['08:00', '08:30', '09:00', '12:00', '13:00', '17:00', '18:00'].map((t) => ({ value: t, label: t }))}
          value={picked}
          onChange={setPicked}
        />
      </View>
      <View style={{ gap: 10, marginTop: 20 }}>
        <Button label="Saat Seç" variant="secondary" onPress={openSystem} />
        <Button label="Tamam" onPress={() => { onDone(picked); onClose(); }} />
      </View>
    </BottomSheet>
  );
}

/** Tarih alanı (TextField tabanlı, takvim açılır) */
export function DateField({
  label,
  value,
  onPick,
  error,
  hint,
}: {
  label: string;
  value: string | null;
  onPick: (iso: string) => void;
  error?: string | null;
  hint?: string | null;
}) {
  const [y, m, d] = (value ?? todayISO()).split('-').map(Number);
  const [iosOpen, setIosOpen] = useState(false);
  const [iosDate, setIosDate] = useState(() => (value ? new Date(y, m - 1, d, 12) : new Date()));

  return (
    <>
      <TextField
        label={label}
        value={value ? formatTarih(value, { yil: true }) : 'Seçilmedi'}
        onChangeText={() => undefined}
        placeholder="Seç"
        error={error}
        hint={hint}
        onPress={() => {
          if (Platform.OS === 'android') {
            DateTimePickerAndroid.open({
              value: value ? new Date(y, m - 1, d, 12) : new Date(),
              mode: 'date',
              onChange: (_e, picked) => {
                if (!picked) return;
                const p = picked as Date;
                onPick(`${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`);
              },
            });
          } else {
            setIosDate(value ? new Date(y, m - 1, d, 12) : new Date());
            setIosOpen(true);
          }
        }}
      />
      {Platform.OS !== 'android' ? (
        <BottomSheet visible={iosOpen} onClose={() => setIosOpen(false)} title={label}>
          <View style={{ alignItems: 'center', marginVertical: 12 }}>
            <DateTimePicker
              value={iosDate}
              mode="date"
              display="spinner"
              onChange={(_e, date) => {
                if (date) setIosDate(date);
              }}
            />
          </View>
          <View style={{ gap: 10, marginTop: 12 }}>
            <Button
              label="Tamam"
              onPress={() => {
                onPick(
                  `${iosDate.getFullYear()}-${String(iosDate.getMonth() + 1).padStart(2, '0')}-${String(iosDate.getDate()).padStart(2, '0')}`
                );
                setIosOpen(false);
              }}
            />
          </View>
        </BottomSheet>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mid: { alignItems: 'center', flex: 1 },
});
