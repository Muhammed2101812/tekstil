import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { CalendarPlus, Trash2 } from 'lucide-react-native';
import {
  ActionSheet,
  Badge,
  BottomSheet,
  Button,
  Card,
  Chip,
  ConfirmSheet,
  DateField,
  Header,
  Screen,
  SectionHeader,
  SegmentedControl,
  TextField,
  TimeSheet,
  useToast,
} from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useEvents, useSchedule } from '../../data/hooks';
import { removeCalendarEvent, saveCalendarEvent } from '../../data/repo';
import { CalendarEvent, CalendarEventType } from '../../types';
import { uuid } from '../../data/id';
import { useDataStore } from '../../data/store';
import { formatTarih } from '../../utils/format';
import { getDayPlan, validateEkCalismaDate } from '../../domain/schedule';

const TYPE_META: Record<CalendarEventType, { label: string; tone: 'danger' | 'warning' | 'primary' | 'accent' }> = {
  resmi_tatil: { label: 'Resmî Tatil', tone: 'danger' },
  yarim_gun: { label: 'Yarım Gün', tone: 'warning' },
  firma_tatili: { label: 'Firma Tatili', tone: 'primary' },
  ek_calisma: { label: 'Ek Çalışma', tone: 'accent' },
};

/** Tatiller & Özel Günler (PLAN 4.2): gömülü tatiller + özel tanımlar */
export default function AyarTakvim() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const events = useEvents();
  const orgId = useDataStore((s) => s.orgId);
  const [addOpen, setAddOpen] = useState(false);
  const [menuEvent, setMenuEvent] = useState<CalendarEvent | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const upcoming = events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const buYil = upcoming.filter((e) => e.date.startsWith(String(now.getFullYear())));

  return (
    <Screen>
      <Header
        title="Tatiller & Özel Günler"
        back
        compact
        right={
          <Button label="" variant="accent" size="md" full={false} icon={<CalendarPlus size={20} color={c.onAccent} />} onPress={() => setAddOpen(true)} />
        }
      />
      <View style={{ marginTop: 12 }}>
        <Card>
          <Text style={[type.small, { color: c.textSecondary, textAlign: 'center' }]}>
            2026–2030 resmî tatilleri önceden yüklü ve düzenlenebilir. Arife yarım günleri otomatik kısaltır; ücretsiz
            firma tatilinde herkesten o gün kesilir.
          </Text>
        </Card>

        <SectionHeader title={`YAKLAŞAN (${buYil.length} kayıt)`} />
        <View style={{ gap: 8 }}>
          {upcoming.slice(0, 40).map((e) => (
            <Card key={e.id} onPress={() => setMenuEvent(e)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { color: c.text }]}>{e.title}</Text>
                  <Text style={[type.small, { color: c.textMuted }]}>{formatTarih(e.date, { gunAdi: true, yil: true })}</Text>
                </View>
                <Badge label={TYPE_META[e.type].label} tone={TYPE_META[e.type].tone} />
              </View>
            </Card>
          ))}
        </View>
        <View style={{ height: 30 }} />
      </View>

      <AddEventSheet visible={addOpen} onClose={() => setAddOpen(false)} orgId={orgId!} />

      <ActionSheet
        visible={!!menuEvent}
        onClose={() => setMenuEvent(null)}
        title={menuEvent?.title}
        actions={[
          {
            label: 'Sil',
            icon: <Trash2 size={20} color={c.danger} />,
            destructive: true,
            onPress: () => setDeleteConfirmOpen(true),
          },
        ]}
      />

      <ConfirmSheet
        visible={deleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        title="Özel Günü Sil"
        message={`${menuEvent?.title ?? ''} (${menuEvent ? formatTarih(menuEvent.date, { gunAdi: true }) : ''}) silinecek. Devam edilsin mi?`}
        confirmLabel="Sil"
        destructive
        onConfirm={async () => {
          if (!menuEvent) return;
          try {
            await removeCalendarEvent(menuEvent.id);
            showToast({ message: 'Özel gün silindi', tone: 'success' });
          } catch (e) {
            showToast({ message: e instanceof Error ? e.message : 'Silinemedi', tone: 'warning' });
          }
        }}
      />
    </Screen>
  );
}

function AddEventSheet({ visible, onClose, orgId }: { visible: boolean; onClose: () => void; orgId: string }) {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const schedule = useSchedule();
  const events = useEvents();
  const [eventType, setEventType] = useState<CalendarEventType>('firma_tatili');
  const [date, setDate] = useState('');
  const [title, setTitle] = useState('');
  const [paid, setPaid] = useState(true);
  const [start, setStart] = useState('08:00');
  const [end, setEnd] = useState('13:00');
  const [timeSheet, setTimeSheet] = useState<null | 'start' | 'end'>(null);

  const save = async () => {
    if (!date) {
      showToast({ message: 'Tarih seçin', tone: 'warning' });
      return;
    }
    if (eventType === 'ek_calisma') {
      const dayPlan = getDayPlan(date, schedule, events);
      const check = validateEkCalismaDate(dayPlan);
      if (!check.valid) {
        showToast({ message: check.error!, tone: 'warning' });
        return;
      }
    }
    const event: CalendarEvent = {
      id: uuid(),
      org_id: orgId,
      date,
      type: eventType,
      title: title.trim() || TYPE_META[eventType].label,
      start_time: eventType === 'yarim_gun' || eventType === 'ek_calisma' ? start : null,
      end_time: eventType === 'yarim_gun' || eventType === 'ek_calisma' ? end : null,
      paid: eventType === 'firma_tatili' ? paid : true,
      multiplier: eventType === 'resmi_tatil' ? 2.0 : eventType === 'ek_calisma' ? 1.5 : null,
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: new Date().toISOString(),
    };
    try {
      await saveCalendarEvent(event);
      showToast({ message: `${formatTarih(date)} — ${event.title} eklendi`, tone: 'success' });
      // Sonraki açılış için formu temizle
      setDate('');
      setTitle('');
      setPaid(true);
      onClose();
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <>
      <BottomSheet visible={visible} onClose={onClose} title="Özel Gün Ekle">
        <SegmentedControl
          options={[
            { value: 'firma_tatili', label: 'Firma Tatili' },
            { value: 'resmi_tatil', label: 'Resmî Tatil' },
            { value: 'yarim_gun', label: 'Yarım Gün' },
            { value: 'ek_calisma', label: 'Ek Çalışma' },
          ]}
          value={eventType}
          onChange={(v) => setEventType(v as CalendarEventType)}
        />
        <View style={{ height: 16 }} />
        <DateField
          label="Tarih"
          value={date || null}
          onPick={setDate}
          hint={
            date && eventType === 'ek_calisma' && !validateEkCalismaDate(getDayPlan(date, schedule, events)).valid
              ? 'Dikkat: Bu tarih normal iş günü (ek çalışma tatil günleri içindir)'
              : undefined
          }
        />
        <TextField label="Başlık" value={title} onChangeText={setTitle} placeholder={TYPE_META[eventType].label} />

        {eventType === 'firma_tatili' ? (
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>
            <Chip label="Ücretli (kesinti yok)" selected={paid} onPress={() => setPaid(true)} />
            <Chip label="Ücretsiz (herkesten kesilir)" selected={!paid} onPress={() => setPaid(false)} />
          </View>
        ) : null}

        {eventType === 'yarim_gun' || eventType === 'ek_calisma' ? (
          <View style={{ flexDirection: 'row', gap: 10, marginVertical: 12 }}>
            <View style={{ flex: 1 }}>
              <Card onPress={() => setTimeSheet('start')}>
                <Text style={[type.label, { color: c.textMuted }]}>BAŞLANGIÇ</Text>
                <Text style={[type.body, { color: c.text }]}>{start}</Text>
              </Card>
            </View>
            <View style={{ flex: 1 }}>
              <Card onPress={() => setTimeSheet('end')}>
                <Text style={[type.label, { color: c.textMuted }]}>BİTİŞ</Text>
                <Text style={[type.body, { color: c.text }]}>{end}</Text>
              </Card>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 10, marginTop: 8, marginBottom: 20 }}>
          <Button label="Kaydet" onPress={save} />
        </View>
      </BottomSheet>

      <TimeSheet
        visible={timeSheet !== null}
        onClose={() => setTimeSheet(null)}
        title="Saat Seç"
        value={timeSheet === 'start' ? start : end}
        onDone={(t) => (timeSheet === 'start' ? setStart(t) : setEnd(t))}
      />
    </>
  );
}
