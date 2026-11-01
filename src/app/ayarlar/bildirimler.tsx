import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Coffee, DatabaseBackup } from 'lucide-react-native';
import { Button, Card, Chip, Header, Screen, SectionHeader, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useSchedule, useSettings } from '../../data/hooks';
import { updateOrgSettings } from '../../data/repo';
import {
  requestNotificationPermission,
  scheduleAttendanceReminder,
  scheduleWeeklyBackupReminder,
  syncBreakReminders,
} from '../../utils/notifications';

/** Bildirimler (PLAN 6.9): günlük yoklama + mola saatleri + yedekleme */
export default function AyarBildirimler() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const settings = useSettings();
  const schedule = useSchedule();
  const [permission, setPermission] = useState<boolean | null>(null);
  const [weeklyBackupEnabled, setWeeklyBackupEnabled] = useState(false);

  useEffect(() => {
    requestNotificationPermission()
      .then(setPermission)
      .catch(() => setPermission(false));
    AsyncStorage.getItem('tekstil:settings:weekly-backup-reminder')
      .then((val) => {
        setWeeklyBackupEnabled(val === 'true');
      })
      .catch(() => undefined);
  }, []);

  const saatler = ['17:30', '18:00', '18:30', '19:00', '21:00'];

  const breakStartEnabled = settings.breakReminderEnabled !== false;
  const breakEndEnabled = settings.breakEndReminderEnabled !== false;

  const totalBreaksConfigured = schedule
    .filter((d) => d.is_workday)
    .reduce((sum, d) => sum + (d.breaks?.length ?? 0), 0);

  const toggleBreakStart = async () => {
    const next = !breakStartEnabled;
    try {
      await updateOrgSettings({ breakReminderEnabled: next });
      await syncBreakReminders(schedule, next, breakEndEnabled);
      showToast({
        message: next ? 'Mola başlangıç bildirimleri açıldı' : 'Mola başlangıç bildirimleri kapatıldı',
        tone: 'success',
      });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' });
    }
  };

  const toggleBreakEnd = async () => {
    const next = !breakEndEnabled;
    try {
      await updateOrgSettings({ breakEndReminderEnabled: next });
      await syncBreakReminders(schedule, breakStartEnabled, next);
      showToast({
        message: next ? 'Mola bitiş (iş başı) bildirimleri açıldı' : 'Mola bitiş bildirimleri kapatıldı',
        tone: 'success',
      });
    } catch (e) {
      showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' });
    }
  };

  return (
    <Screen>
      <Header title="Bildirimler" back compact />
      <View style={{ marginTop: 12 }}>
        {permission === false ? (
          <Card style={{ marginBottom: 16 }}>
            <Text style={[type.small, { color: c.warning }]}>
              Bildirim izni kapalı. Telefon ayarlarından bu uygulamaya bildirim izni verin.
            </Text>
          </Card>
        ) : null}

        <Card>
          <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>Günlük Yoklama Hatırlatması</Text>
          <Text style={[type.small, { color: c.textMuted, marginVertical: 10 }]}>
            Her gün seçtiğiniz saatte “bugünün yoklamasını gir” hatırlatılır.
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {saatler.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={settings.attendanceReminderTime === s}
                onPress={() => {
                  updateOrgSettings({ attendanceReminderTime: s }).catch((e) =>
                    showToast({ message: e instanceof Error ? e.message : 'Kaydedilemedi', tone: 'warning' })
                  );
                  scheduleAttendanceReminder(s)
                    .then((ok) => {
                      if (ok === false) showToast({ message: 'Bildirim izni gerekli', tone: 'warning' });
                      else showToast({ message: `Hatırlatma ${s} olarak ayarlandı`, tone: 'success' });
                    })
                    .catch((e) => {
                      showToast({ message: e instanceof Error ? e.message : 'Hatırlatma ayarlanamadı', tone: 'warning' });
                    });
                }}
              />
            ))}
          </View>
          {settings.attendanceReminderTime ? (
            <View style={{ marginTop: 12 }}>
              <Button
                label="Hatırlatmayı Kapat"
                variant="ghost"
                onPress={() => {
                  updateOrgSettings({ attendanceReminderTime: null }).catch(() => undefined);
                  scheduleAttendanceReminder(null);
                  showToast({ message: 'Hatırlatma kapatıldı', tone: 'info' });
                }}
              />
            </View>
          ) : null}
        </Card>

        <SectionHeader title="MOLA SAATLERİ BİLDİRİMİ" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <Coffee size={22} color={c.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>
                Mola ve İş Başı Hatırlatması
              </Text>
              <Text style={[type.small, { color: c.textMuted, marginVertical: 8 }]}>
                Çalışma saatlerinde tanımladığınız molalar (çay, öğle yemeği vb.) başladığında ve bittiğinde sesli bildirim gönderir.
              </Text>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, marginBottom: 12 }}>
                <Chip
                  label={breakStartEnabled ? 'Mola Başlangıç: Açık' : 'Mola Başlangıç: Kapalı'}
                  selected={breakStartEnabled}
                  onPress={toggleBreakStart}
                />
                <Chip
                  label={breakEndEnabled ? 'Mola Bitiş (İş Başı): Açık' : 'Mola Bitiş: Kapalı'}
                  selected={breakEndEnabled}
                  onPress={toggleBreakEnd}
                />
              </View>

              <Text style={[type.small, { color: c.textMuted, marginBottom: 10 }]}>
                Tanımlı toplam mola sayısı: <Text style={{ fontWeight: '700', color: c.text }}>{totalBreaksConfigured}</Text>
              </Text>

              <Button
                label="Çalışma Saatlerini ve Molaları Düzenle"
                variant="secondary"
                size="sm"
                onPress={() => router.push('/ayarlar/calisma-saatleri')}
              />
            </View>
          </View>
        </Card>

        <SectionHeader title="HAFTALIK YEDEKLEME (JSON)" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <DatabaseBackup size={22} color={c.primary} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { color: c.text, fontWeight: '700' }]}>
                Haftalık JSON Yedek Hatırlatması
              </Text>
              <Text style={[type.small, { color: c.textMuted, marginVertical: 8 }]}>
                {
                  "Her Cuma 17:00'de telefon kaybı veya hasara karşı JSON yedeğini indirip harici saklama (Google Drive, e-posta, bilgisayar) tavsiyesi gönderir. Yerel anlık görüntüler cihazla birlikte kaybolur; harici JSON yedeği şarttır."
                }
              </Text>
              <View style={{ marginTop: 8 }}>
                <Button
                  label={weeklyBackupEnabled ? 'Hatırlatmayı Kapat' : 'Haftalık Hatırlatmayı Aç'}
                  variant={weeklyBackupEnabled ? 'ghost' : 'secondary'}
                  onPress={async () => {
                    const next = !weeklyBackupEnabled;
                    setWeeklyBackupEnabled(next);
                    await AsyncStorage.setItem('tekstil:settings:weekly-backup-reminder', next ? 'true' : 'false');
                    const ok = await scheduleWeeklyBackupReminder(next);
                    if (next && !ok) {
                      showToast({ message: 'Bildirim izni kapalı veya verilemedi', tone: 'warning' });
                    } else if (next) {
                      showToast({ message: 'Haftalık yedek hatırlatması açıldı (Cuma 17:00)', tone: 'success' });
                    } else {
                      showToast({ message: 'Haftalık yedek hatırlatması kapatıldı', tone: 'info' });
                    }
                  }}
                />
              </View>
            </View>
          </View>
        </Card>

        <View style={{ height: 30 }} />
      </View>
    </Screen>
  );
}
