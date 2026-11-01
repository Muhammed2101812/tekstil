import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

/**
 * Yerel zamanlanmış bildirimler (PLAN 6.9 Bildirimler) — sunucu gerekmez.
 * Günlük yoklama hatırlatması + haftalık JSON yedek hatırlatması + mola saatleri.
 * (Maaş günü hatırlatması yoktur.)
 *
 * Not: Expo Go Android'de SDK 53+ itibarıyla expo-notifications doğrudan yüklenemez
 * (hata fırlatır). Bu nedenle Expo Go Android'de güvenli fallback kullanılır,
 * Development Build ve iOS'ta normal çalışır.
 */

import { ScheduleDay } from '../types';

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
        shouldPlaySound: true,
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
      await Notifications.setNotificationChannelAsync('mola-bildirimleri', {
        name: 'Mola Saatleri',
        importance: Notifications.AndroidImportance.HIGH,
        enableVibrate: true,
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

/**
 * Haftalık mola saatleri bildirimleri (başlangıç ve opsiyonel iş başı).
 * ScheduleDay.weekday: 1=Pzt..7=Paz -> expo-notifications weekly: 1=Pazar, 2=Pzt..7=Cmt
 */
export async function syncBreakReminders(
  scheduleDays: ScheduleDay[],
  enabled = true,
  endEnabled = true
): Promise<boolean> {
  if (!Notifications || Platform.OS === 'web') return false;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync().catch(() => []);
    const breakNotifs = scheduled.filter((n) => n.identifier.startsWith('break-reminder-'));
    for (const n of breakNotifs) {
      await Notifications.cancelScheduledNotificationAsync(n.identifier).catch(() => undefined);
    }

    if (!enabled) return true;

    const granted = await requestNotificationPermission();
    if (!granted) return false;

    const workdays = scheduleDays.filter(
      (d) => d.is_workday && Array.isArray(d.breaks) && d.breaks.length > 0
    );

    let count = 0;
    const MAX_BREAK_NOTIFICATIONS = 50; // iOS 64 yerel bildirim sınırı güvenliği

    for (const day of workdays) {
      // 1 (Pzt) -> 2, ..., 6 (Cmt) -> 7, 7 (Paz) -> 1
      const expoWeekday = (day.weekday % 7) + 1;

      for (let i = 0; i < day.breaks.length; i++) {
        const brk = day.breaks[i];
        if (!brk.start || !brk.start.includes(':')) continue;
        if (count >= MAX_BREAK_NOTIFICATIONS) break;

        const [startH, startM] = brk.start.split(':').map(Number);
        const name = brk.name?.trim() || 'Mola';

        await Notifications.scheduleNotificationAsync({
          identifier: `break-reminder-${day.weekday}-${i}-start`,
          content: {
            title: `☕ Mola Vakti: ${name}`,
            body: `${brk.start}${brk.end ? '–' + brk.end : ''} molası başladı.`,
            sound: true,
            data: { type: 'break_start', weekday: day.weekday, breakIndex: i },
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: expoWeekday,
            hour: startH,
            minute: startM,
            channelId: 'mola-bildirimleri',
          },
        }).catch(() => undefined);
        count++;

        if (endEnabled && brk.end && brk.end.includes(':') && count < MAX_BREAK_NOTIFICATIONS) {
          const [endH, endM] = brk.end.split(':').map(Number);
          await Notifications.scheduleNotificationAsync({
            identifier: `break-reminder-${day.weekday}-${i}-end`,
            content: {
              title: `🔔 Mola Bitti: ${name}`,
              body: `${name} molası sona erdi, iş başı vakti.`,
              sound: true,
              data: { type: 'break_end', weekday: day.weekday, breakIndex: i },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
              weekday: expoWeekday,
              hour: endH,
              minute: endM,
              channelId: 'mola-bildirimleri',
            },
          }).catch(() => undefined);
          count++;
        }
      }
    }
    return true;
  } catch {
    return false;
  }
}
