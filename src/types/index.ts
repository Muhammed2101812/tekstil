/**
 * Uygulamanın tüm veri tipleri — PLAN.md Bölüm 5 (Veri Modeli) ile birebir.
 *
 * Kurallar:
 * - Tarihler her katmanda ISO dizgidir (YYYY-MM-DD / YYYY-MM / ISO timestamp),
 *   asla JS Date nesnesine çevrilip geri çevrilmez (Bölüm 5 "Tarih kuralı").
 * - Saatler 'HH:mm' dizgisidir.
 * - Tutarlar number'dır (kuruş hassasiyeti domain katmanında yuvarlanır);
 *   veritabanında numeric(12,2) olarak saklanır.
 * - Tüm tabloların `id`'si istemcide üretilmiş UUID'dir; bu sayede offline
 *   kuyruğun tekrar gönderimleri upsert ile idempotent olur (Bölüm 9).
 */

// ─── Ortak ────────────────────────────────────────────────────────────────────

export type Role = 'owner' | 'admin';
export type DebtType = 'avans' | 'borc' | 'diger';
export type PaymentMethod = 'maas_kesinti' | 'elden';
export type SalaryPaymentMethod = 'nakit' | 'banka';
export type PayrollStatus = 'taslak' | 'kesinlesti' | 'odendi';
export type HourlyWageMethod = 'ortalama_takvim' | 'gercek_ay';

export const ATTENDANCE_STATUSES = [
  'geldi',
  'gelmedi',
  'gec_geldi',
  'erken_cikti',
  'yarim_gun',
  'yillik_izin',
  'mazeret_izni',
  'ucretsiz_izin',
  'rapor',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const CALENDAR_EVENT_TYPES = [
  'resmi_tatil',
  'yarim_gun',
  'firma_tatili',
  'ek_calisma',
] as const;

export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];

export type OvertimeKind = 'hafta_ici' | 'hafta_sonu' | 'resmi_tatil';

// ─── Çalışma takvimi ─────────────────────────────────────────────────────────

export interface BreakTime {
  name: string;
  start: string; // '12:30'
  end: string; // '13:30'
  paid: boolean; // false = ücretsiz mola, planlı saatten düşülür
}

/** Haftalık takvimin tek bir günü (schedule_days tablosu) */
export interface ScheduleDay {
  id: string;
  org_id: string;
  weekday: number; // 1 = Pazartesi … 7 = Pazar
  is_workday: boolean;
  start_time: string; // '08:00'
  end_time: string; // '18:00'
  breaks: BreakTime[];
  department_id: string | null; // null = genel takvim
  updated_at: string;
}

export type EventScope = 'tumu' | 'departman' | 'kisiler';

/** Özel gün / tatil / ek çalışma (calendar_events tablosu) */
export interface CalendarEvent {
  id: string;
  org_id: string;
  date: string; // YYYY-MM-DD
  type: CalendarEventType;
  title: string;
  /** yarım_gun: saat arası (örn. arife 08:00–13:00); ek_calisma: çalışma saatleri */
  start_time: string | null;
  end_time: string | null;
  /** firma_tatili: ücretli mi? resmi_tatil/yarım_gun: her zaman true */
  paid: boolean;
  /** ek_calisma ve resmi_tatil çalışması için mesai çarpanı */
  multiplier: number | null;
  /** ek_calisma kapsamı */
  scope: EventScope;
  department_id: string | null;
  employee_ids: string[];
  updated_at: string;
}

// ─── Organizasyon ─────────────────────────────────────────────────────────────

export interface OrgSettings {
  /** Saatlik ücret yöntemi (Bölüm 4.3): A = takvimin yıllık ortalaması, B = o ayın gerçek saati */
  hourlyWageMethod: HourlyWageMethod;
  /** Hafta içi / hafta sonu fazla çalışma çarpanı */
  overtimeMultiplier: number;
  /** Resmî tatil çalışması çarpanı */
  holidayOvertimeMultiplier: number;
  /** Geç kalma kesintisi (varsayılan false: sadece kayıt) */
  deductLate: boolean;
  /** Erken çıkış / saatlik izin kesintisi (varsayılan true) */
  deductEarlyLeave: boolean;
  /** Raporlu gün kesintisi (varsayılan true: raporu SGK öder) */
  deductSickLeave: boolean;
  /** Raporun ilk 2 günü işveren tarafından ödensin (varsayılan false) */
  sickLeaveFirstTwoDaysEmployer: boolean;
  /** Hafta tatili kesintisi: hafta içi mazeretsiz devamsızlıkta o haftanın tatil ücreti de kesilir (varsayılan false) */
  weekRestPenalty: boolean;
  /** Maaş günü (1..31, hatırlatma için) */
  paydayOfMonth: number;
  /** Günlük yoklama hatırlatma saati ('HH:mm'); null = kapalı */
  attendanceReminderTime: string | null;
}

export const DEFAULT_SETTINGS: OrgSettings = {
  hourlyWageMethod: 'ortalama_takvim',
  overtimeMultiplier: 1.5,
  holidayOvertimeMultiplier: 2.0,
  deductLate: false,
  deductEarlyLeave: true,
  deductSickLeave: true,
  sickLeaveFirstTwoDaysEmployer: false,
  weekRestPenalty: false,
  paydayOfMonth: 5,
  attendanceReminderTime: '18:30',
};

export interface Organization {
  id: string;
  name: string;
  logo_url: string | null;
  settings: OrgSettings;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: string;
}

/** E-posta gerektirmeyen 6 haneli davet kodu */
export interface OrgInvite {
  id: string;
  org_id: string;
  code: string; // 6 hane
  role: Role;
  expires_at: string;
  used_by: string | null; // user_id
  created_by: string;
  created_at: string;
}

export interface Department {
  id: string;
  org_id: string;
  name: string;
  color: string;
  sort_order: number;
  updated_at: string;
}

// ─── Personel ─────────────────────────────────────────────────────────────────

export interface Employee {
  id: string;
  org_id: string;
  department_id: string | null;
  full_name: string;
  phone: string | null;
  tc_no: string | null;
  iban: string | null;
  birth_date: string | null; // YYYY-MM-DD (yıllık izin yaş istisnası için)
  address: string | null;
  photo_url: string | null;
  start_date: string; // YYYY-MM-DD
  end_date: string | null; // işten çıkış
  active: boolean;
  notes: string | null;
  emergency_contact: string | null;
  created_at: string;
  updated_at: string;
}

/** Maaş geçmişi ve zamlar (employee_salaries) */
export interface EmployeeSalary {
  id: string;
  org_id: string;
  employee_id: string;
  amount: number; // net aylık
  effective_from: string; // YYYY-MM-DD
  note: string | null;
  created_at: string;
}

// ─── Puantaj ve mesai ─────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id: string;
  org_id: string;
  employee_id: string;
  day: string; // YYYY-MM-DD
  status: AttendanceStatus;
  arrival_time: string | null; // '08:40'
  leave_time: string | null; // '16:00'
  late_minutes: number;
  early_leave_minutes: number;
  note: string | null;
  updated_at: string;
}

/** "Bugünün yoklaması tamamlandı" bilgisi */
export interface AttendanceDay {
  id: string;
  org_id: string;
  day: string;
  confirmed_by: string;
  confirmed_at: string;
}

export interface OvertimeRecord {
  id: string;
  org_id: string;
  employee_id: string;
  day: string;
  hours: number;
  kind: OvertimeKind;
  multiplier: number | null;
  calendar_event_id: string | null;
  note: string | null;
  client_ref: string; // idempotency anahtarı (upsert)
  updated_at: string;
}

// ─── Avans & borç ─────────────────────────────────────────────────────────────

export interface Debt {
  id: string;
  org_id: string;
  employee_id: string;
  type: DebtType;
  amount: number;
  given_at: string; // YYYY-MM-DD
  installments: number; // 0/1 = tek seferde
  start_month: string; // YYYY-MM
  description: string | null;
  client_ref: string; // idempotency anahtarı (upsert)
  updated_at: string;
}

export interface DebtPayment {
  id: string;
  org_id: string;
  debt_id: string;
  employee_id: string;
  amount: number;
  paid_at: string;
  method: PaymentMethod;
  payroll_item_id: string | null;
  note: string | null;
}

// ─── Yıllık izin ──────────────────────────────────────────────────────────────

/** Devreden / elle düzeltme (+ gün ekler, − düşer) */
export interface LeaveAdjustment {
  id: string;
  org_id: string;
  employee_id: string;
  days: number; // +/-
  reason: string;
  date: string;
}

// ─── Bordro ───────────────────────────────────────────────────────────────────

export interface DebtAllocation {
  debt_id: string;
  amount: number;
}

/** Bordro kalem anlık görüntüsü (payroll_items) */
export interface PayrollItem {
  id: string;
  org_id: string;
  payroll_id: string;
  employee_id: string;
  employee_name: string;
  department_name: string | null;
  /** Ayarlamalar (taslakta düzenlenebilir) */
  bonus: number;
  extra_cut: number;
  extra_cut_note: string | null;
  skip_debt: boolean;
  debt_override: number | null; // elle taksit tutarı
  /** Anlık görüntü */
  base_salary: number;
  hourly_rate: number;
  absence_cut: number;
  overtime_pay: number;
  debt_cut: number;
  net_payable: number;
  paid_amount: number; // yapılan ödemeler toplamı
  breakdown: PayrollBreakdown;
  updated_at: string;
}

export interface PayrollBreakdownLine {
  label: string;
  amount: number; // + ekleme / − kesinti
  detail: string;
}

export interface PayrollBreakdown {
  hourlyRate: number;
  monthlyHours: number;
  baseSalary: number;
  isProRated: boolean;
  absenceCut: number;
  overtimeHours: number;
  overtimePay: number;
  bonus: number;
  extraCut: number;
  suggestedDebtCut: number;
  debtAllocations: DebtAllocation[];
  debtCut: number;
  uncoveredCut: number; // kesintilerin maaşı aştığı kısım (borca çevrilebilir)
  lines: PayrollBreakdownLine[];
  warning?: string | null;
}

export interface Payroll {
  id: string;
  org_id: string;
  year: number;
  month: number;
  status: PayrollStatus;
  finalized_at: string | null;
  finalized_by: string | null;
  revert_reason: string | null;
  created_at: string;
}

export interface SalaryPayment {
  id: string;
  org_id: string;
  payroll_item_id: string;
  employee_id: string;
  amount: number;
  paid_at: string;
  method: SalaryPaymentMethod;
  note: string | null;
}

// ─── Denetim ──────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id: string;
  org_id: string;
  user_id: string | null;
  table_name: string;
  row_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE';
  diff: Record<string, { old: unknown; new: unknown }> | null;
  at: string;
}

// ─── Varsayılan haftalık takvim ───────────────────────────────────────────────

export const OGLEN_MOLASI: BreakTime = {
  name: 'Öğle',
  start: '12:30',
  end: '13:30',
  paid: false,
};

/** Plan 4.1 varsayılanı: Pzt–Cum 08:00–18:00 (öğle 1 saat ücretsiz), hafta sonu tatil */
export function defaultScheduleDays(orgId: string): ScheduleDay[] {
  const now = new Date().toISOString();
  const gun = (weekday: number, isWorkday: boolean, start: string, end: string, breaks: BreakTime[]): ScheduleDay => ({
    id: `sched-${orgId}-${weekday}`,
    org_id: orgId,
    weekday,
    is_workday: isWorkday,
    start_time: start,
    end_time: end,
    breaks,
    department_id: null,
    updated_at: now,
  });
  const haftaIci = gun(1, true, '08:00', '18:00', [OGLEN_MOLASI]);
  return [
    haftaIci,
    { ...haftaIci, id: `sched-${orgId}-2`, weekday: 2 },
    { ...haftaIci, id: `sched-${orgId}-3`, weekday: 3 },
    { ...haftaIci, id: `sched-${orgId}-4`, weekday: 4 },
    { ...haftaIci, id: `sched-${orgId}-5`, weekday: 5 },
    gun(6, false, '08:00', '13:00', []),
    gun(7, false, '08:00', '18:00', []),
  ];
}

/** Hazır şablonlar (Ayarlar → Çalışma Saatleri) */
export const SCHEDULE_TEMPLATES: { label: string; start: string; end: string; breakStart: string; breakEnd: string }[] = [
  { label: '08:00–18:00, öğle 1 saat', start: '08:00', end: '18:00', breakStart: '12:30', breakEnd: '13:30' },
  { label: '08:30–18:30, öğle 1 saat', start: '08:30', end: '18:30', breakStart: '12:30', breakEnd: '13:30' },
  { label: '08:00–17:00, öğle 1 saat', start: '08:00', end: '17:00', breakStart: '12:00', breakEnd: '13:00' },
  { label: '09:00–18:00, öğle 1 saat', start: '09:00', end: '18:00', breakStart: '13:00', breakEnd: '14:00' },
];

export const DEPARTMENT_PRESETS = [
  { name: 'Kesim', color: '#3B5BDB' },
  { name: 'Dikim', color: '#12B76A' },
  { name: 'Ütü', color: '#F79009' },
  { name: 'Paket', color: '#15B79E' },
  { name: 'Kalite', color: '#7A5AF8' },
];
