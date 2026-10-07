import { CalendarEvent } from '../types';

/**
 * Türkiye resmî tatilleri 2026–2030 (PLAN.md Bölüm 4.2).
 * Dini bayram tarihleri astronomik hesaba göre yaklaşık değerlerdir;
 * uygulamada düzenlenebilir (Diyanet takvimiyle küçük farklar olabilir).
 */

export type HolidaySeed = Omit<CalendarEvent, 'id' | 'org_id' | 'updated_at'>;

const T = (date: string, title: string): HolidaySeed => ({
  date,
  title,
  type: 'resmi_tatil',
  start_time: null,
  end_time: null,
  paid: true,
  multiplier: 2.0,
  scope: 'tumu',
  department_id: null,
  employee_ids: [],
});

const A = (date: string, title: string): HolidaySeed => ({
  date,
  title,
  type: 'yarim_gun',
  start_time: '08:00',
  end_time: '13:00',
  paid: true,
  multiplier: null,
  scope: 'tumu',
  department_id: null,
  employee_ids: [],
});

const SABIT_YILLIK: (y: number) => HolidaySeed[] = (y) => [
  T(`${y}-01-01`, 'Yılbaşı'),
  T(`${y}-04-23`, 'Ulusal Egemenlik ve Çocuk Bayramı'),
  T(`${y}-05-01`, 'Emek ve Dayanışma Günü'),
  T(`${y}-05-19`, 'Atatürk’ü Anma, Gençlik ve Spor Bayramı'),
  T(`${y}-07-15`, 'Demokrasi ve Millî Birlik Günü'),
  T(`${y}-08-30`, 'Zafer Bayramı'),
  A(`${y}-10-28`, 'Cumhuriyet Bayramı Arifesi'),
  T(`${y}-10-29`, 'Cumhuriyet Bayramı'),
];

export const TURKISH_HOLIDAYS: HolidaySeed[] = [
  ...SABIT_YILLIK(2026),
  A('2026-03-19', 'Ramazan Bayramı Arifesi'),
  T('2026-03-20', 'Ramazan Bayramı 1. Gün'),
  T('2026-03-21', 'Ramazan Bayramı 2. Gün'),
  T('2026-03-22', 'Ramazan Bayramı 3. Gün'),
  A('2026-05-26', 'Kurban Bayramı Arifesi'),
  T('2026-05-27', 'Kurban Bayramı 1. Gün'),
  T('2026-05-28', 'Kurban Bayramı 2. Gün'),
  T('2026-05-29', 'Kurban Bayramı 3. Gün'),
  T('2026-05-30', 'Kurban Bayramı 4. Gün'),

  ...SABIT_YILLIK(2027),
  A('2027-03-09', 'Ramazan Bayramı Arifesi'),
  T('2027-03-10', 'Ramazan Bayramı 1. Gün'),
  T('2027-03-11', 'Ramazan Bayramı 2. Gün'),
  T('2027-03-12', 'Ramazan Bayramı 3. Gün'),
  A('2027-05-16', 'Kurban Bayramı Arifesi'),
  T('2027-05-17', 'Kurban Bayramı 1. Gün'),
  T('2027-05-18', 'Kurban Bayramı 2. Gün'),
  T('2027-05-19', 'Kurban Bayramı 3. Gün'),
  T('2027-05-20', 'Kurban Bayramı 4. Gün'),

  ...SABIT_YILLIK(2028),
  A('2028-02-25', 'Ramazan Bayramı Arifesi'),
  T('2028-02-26', 'Ramazan Bayramı 1. Gün'),
  T('2028-02-27', 'Ramazan Bayramı 2. Gün'),
  T('2028-02-28', 'Ramazan Bayramı 3. Gün'),
  A('2028-05-04', 'Kurban Bayramı Arifesi'),
  T('2028-05-05', 'Kurban Bayramı 1. Gün'),
  T('2028-05-06', 'Kurban Bayramı 2. Gün'),
  T('2028-05-07', 'Kurban Bayramı 3. Gün'),
  T('2028-05-08', 'Kurban Bayramı 4. Gün'),

  ...SABIT_YILLIK(2029),
  A('2029-02-13', 'Ramazan Bayramı Arifesi'),
  T('2029-02-14', 'Ramazan Bayramı 1. Gün'),
  T('2029-02-15', 'Ramazan Bayramı 2. Gün'),
  T('2029-02-16', 'Ramazan Bayramı 3. Gün'),
  A('2029-04-22', 'Kurban Bayramı Arifesi'),
  T('2029-04-23', 'Kurban Bayramı 1. Gün'),
  T('2029-04-24', 'Kurban Bayramı 2. Gün'),
  T('2029-04-25', 'Kurban Bayramı 3. Gün'),
  T('2029-04-26', 'Kurban Bayramı 4. Gün'),

  ...SABIT_YILLIK(2030),
  A('2030-02-02', 'Ramazan Bayramı Arifesi'),
  T('2030-02-03', 'Ramazan Bayramı 1. Gün'),
  T('2030-02-04', 'Ramazan Bayramı 2. Gün'),
  T('2030-02-05', 'Ramazan Bayramı 3. Gün'),
  A('2030-04-11', 'Kurban Bayramı Arifesi'),
  T('2030-04-12', 'Kurban Bayramı 1. Gün'),
  T('2030-04-13', 'Kurban Bayramı 2. Gün'),
  T('2030-04-14', 'Kurban Bayramı 3. Gün'),
  T('2030-04-15', 'Kurban Bayramı 4. Gün'),
];

/** Belirtilen yıl aralığındaki tatilleri CalendarEvent'e dönüştürür */
export function holidayEventsForOrg(orgId: string, fromYear: number, toYear: number): CalendarEvent[] {
  const now = new Date().toISOString();
  return TURKISH_HOLIDAYS.filter((h) => {
    const y = Number(h.date.slice(0, 4));
    return y >= fromYear && y <= toYear;
  }).map((h, i) => ({ ...h, id: `holiday-${orgId}-${i}`, org_id: orgId, updated_at: now }));
}
