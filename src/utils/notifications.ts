import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

/**
 * Yerel zamanlanmış bildirimler (PLAN 6.9 Bildirimler) — sunucu gerekmez.
 * Günlük yoklama hatırlatması + maaş günü hatırlatması.
 *
 * Not: Expo Go Android'de SDK 53+ itibarıyla expo-notifications doğrudan yüklenemez
 * (hata fırlatır). Bu nedenle Expo Go Android'de güvenli fallback kullanılır,
 * Development Build ve iOS'ta normal çalışır.
 */

type NotificationsModule = typeof import('expo-notifications');
let Notifications: NotificationsModule | null = null;

const canUseNotifications = Platform.OS !== 'web' && (!isRunningInExpoGo() || Platform.OS !== 'android');

if (canUseNotifications) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Notifications = require('expo-notifications');
    Notifications?.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    console.warn('[notifications] expo-notifications yüklenemedi:', e);
  }
}

export async function setupNotifications() {
  if (Platform.OS === 'android' && Notifications) {
    try {
      await Notifications.setNotificationChannelAsync('hatirlatmalar', {
        name: 'Hatırlatmalar',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch {
      // ignore
    }
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') return false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch {
    return false;
  }
}

/** Her gün belirli saatte yoklama hatırlatması ('18:30'; null/boş = iptal) */
export async function scheduleAttendanceReminder(timeHHmm: string | null) {
  if (!Notifications || Platform.OS === 'web') return false;
  try {
    await Notifications.cancelScheduledNotificationAsync('attendance-reminder').catch(() => undefined);
    if (!timeHHmm) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    const [h, m] = timeHHmm.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
      identifier: 'attendance-reminder',
      content: {
        title: 'Günün yoklaması hazır 📋',
        body: 'Bugün kim gelmedi? Birkaç dokunuşla puantajı tamamlayın.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: h,
        minute: m,
      },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Haftalık JSON yedeği alma hatırlatması (PLAN 6.9, Görev B3).
 * Her Cuma 17:00'de kullanıcıyı JSON yedeğini indirip cihaz dışına saklamaya teşvik eder.
 * Yerel snapshot'lar cihaz kaybında yok olacağı için harici yedekleme esastır.
 */
export async function scheduleWeeklyBackupReminder(enabled: boolean) {
  if (!Notifications || Platform.OS === 'web') return false;
  try {
    await Notifications.cancelScheduledNotificationAsync('weekly-backup-reminder').catch(() => undefined);
    if (!enabled) return true;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    await Notifications.scheduleNotificationAsync({
      identifier: 'weekly-backup-reminder',
      content: {
        title: 'Haftalık Veri Yedeği Hatırlatması 💾',
        body: 'Telefon kaybı veya arızasına karşı Ayarlar > Hesap üzerinden JSON yedeği alıp cihaz dışına kaydedin.',
        data: { type: 'weekly_backup' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
        weekday: 6, // Cuma
        hour: 17,
        minute: 0,
      },
    });
    return true;
  } catch {
    return false;
  }
}
