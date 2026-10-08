import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BellRing, DatabaseBackup } from 'lucide-react-native';
import { Button, Card, Chip, Header, Screen, SectionHeader, useToast } from '../../ui';
import { useTheme } from '../../theme/ThemeProvider';
import { useSettings } from '../../data/hooks';
import { updateOrgSettings } from '../../data/repo';
import {
  requestNotificationPermission,
  scheduleAttendanceReminder,
  scheduleWeeklyBackupReminder,
} from '../../utils/notifications';

/** Bildirimler (PLAN 6.9): günlük yoklama + maaş günü hatırlatması */
export default function AyarBildirimler() {
  const { c, type } = useTheme();
  const { showToast } = useToast();
  const settings = useSettings();
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
                  updateOrgSettings({ attendanceReminderTime: s });
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
                  updateOrgSettings({ attendanceReminderTime: null });
                  scheduleAttendanceReminder(null);
                  showToast({ message: 'Hatırlatma kapatıldı', tone: 'info' });
                }}
              />
            </View>
          ) : null}
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

        <SectionHeader title="MAAŞ GÜNÜ" />
        <Card>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <BellRing size={20} color={c.primary} />
            <Text style={[type.small, { color: c.textSecondary, flex: 1 }]}>
              Maaş günü hatırlatması, Ayarlar → Hesaplama Kuralları’ndaki maaş gününe göre ana sayfada gösterilir.
            </Text>
          </View>
        </Card>
        <View style={{ height: 30 }} />
      </View>
    </Screen>
  );
}
