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
    await Notifications.cancelAllScheduledNotificationsAsync();
    if (!timeHHmm) return false;
    const granted = await requestNotificationPermission();
    if (!granted) return false;
    const [h, m] = timeHHmm.split(':').map(Number);
    await Notifications.scheduleNotificationAsync({
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
