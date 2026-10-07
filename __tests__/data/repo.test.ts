import { memoryPersist } from '../../src/data/persist';
import { useDataStore, useSyncQueue } from '../../src/data/store';
import {
  addEmployee,
  createOrganization,
  giveDebt,
  markAttendance,
  ensurePayroll,
  finalizePayroll,
  recordDebtPayment,
  deleteDebtIfUnpaid,
  ensureHolidays,
} from '../../src/data/repo';
import { mergeRowsById } from '../../src/data/supabase';
import { validateEkCalismaDate, DayPlan } from '../../src/domain/schedule';

/**
 * Veri katmanı testleri (PLAN Bölüm 9): offline yazma kuyruğu, idempotent
 * tekrar gönderim, bordro kesinleştirme aynası.
 * Bellek içi kalıcılıkla çalışır — Supabase gerekmez.
 */

beforeEach(async () => {
  const persist = memoryPersist();
  await useDataStore.getState().init(persist, 'user-1', null);
  useSyncQueue.getState().setPending([]);
});

test('createOrganization (cihaz modu): firma + takvim + tatiller + sahiplik', async () => {
  const orgId = await createOrganization('Test Atölye', null);
  const db = useDataStore.getState().db;
  expect(db.organizations).toHaveLength(1);
  expect(db.org_members[0].role).toBe('owner');
  expect(db.schedule_days.filter((s) => s.org_id === orgId)).toHaveLength(7);
  // gömülü tatiller yüklendi
  expect(db.calendar_events.length).toBeGreaterThan(10);
  expect(useDataStore.getState().orgId).toBe(orgId);
});

test('Yazma işlemleri kuyruğa idempotent eklenir; markAttendance tekrarı satır çoğaltmaz', async () => {
  await createOrganization('A', null);
  const emp = await addEmployee({ full_name: 'Ayşe Yılmaz', salary: 30000, start_date: '2026-01-01' });

  await markAttendance('2026-11-12', [{ employee_id: emp.id, status: 'gelmedi' }]);
  const afterFirst = useDataStore.getState().db.attendance.filter((a) => a.employee_id === emp.id);
  expect(afterFirst).toHaveLength(1);

  // aynı kayıt tekrar gönderilirse (id deterministik) → tek satır kalır
  await markAttendance('2026-11-12', [{ employee_id: emp.id, status: 'gelmedi' }]);
  const afterSecond = useDataStore.getState().db.attendance.filter((a) => a.employee_id === emp.id);
  expect(afterSecond).toHaveLength(1);
  expect(afterSecond[0].id).toBe(afterFirst[0].id);

  // kuyrukta upsert op'ları birikir ama hepsi aynı rowId'yi hedefler
  const ops = useSyncQueue.getState().pending.filter((o) => o.table === 'attendance');
  expect(ops.length).toBeGreaterThanOrEqual(2);
  expect(new Set(ops.map((o) => o.rowId)).size).toBe(1);
});

test('Avans + kesinleşmiş bordro: taksit düşümü ve "önce eski borç" kapanışı', async () => {
  await createOrganization('A', null);
  const emp = await addEmployee({ full_name: 'Mehmet Kaya', salary: 30000, start_date: '2026-01-01' });

  const dEski = giveDebt({ employee_id: emp.id, amount: 6000, type: 'avans', installments: 3, start_month: '2026-11' });
  const dYeni = giveDebt({ employee_id: emp.id, amount: 4000, type: 'avans', installments: 2, start_month: '2026-11' });

  const payroll = await ensurePayroll(2026, 11);
  await finalizePayroll(payroll.id, [
    {
      id: 'item-1',
      org_id: useDataStore.getState().orgId!,
      payroll_id: payroll.id,
      employee_id: emp.id,
      employee_name: 'Mehmet Kaya',
      department_name: null,
      bonus: 0,
      extra_cut: 0,
      extra_cut_note: null,
      skip_debt: false,
      debt_override: null,
      base_salary: 30000,
      hourly_rate: 153.85,
      absence_cut: 0,
      overtime_pay: 0,
      debt_cut: 4000, // 2000 (eski) + 2000 (yeni)
      net_payable: 26000,
      paid_amount: 0,
      breakdown: {
        hourlyRate: 153.85,
        monthlyHours: 195,
        baseSalary: 30000,
        isProRated: false,
        absenceCut: 0,
        overtimeHours: 0,
        overtimePay: 0,
        bonus: 0,
        extraCut: 0,
        suggestedDebtCut: 4000,
        debtAllocations: [
          { debt_id: dEski, amount: 2000 },
          { debt_id: dYeni, amount: 2000 },
        ],
        debtCut: 4000,
        uncoveredCut: 0,
        lines: [],
      },
      updated_at: new Date().toISOString(),
    },
  ]);

  const db = useDataStore.getState().db;
  expect(db.payrolls.find((p) => p.id === payroll.id)?.status).toBe('kesinlesti');
  const odemeler = db.debt_payments.filter((p) => p.payroll_item_id === 'item-1');
  expect(odemeler).toHaveLength(2);
  expect(odemeler.reduce((s, p) => s + p.amount, 0)).toBe(4000);
});

test('Ödemesi olan borç silinemez; elden ödeme kalanı düşürür', async () => {
  await createOrganization('A', null);
  const emp = await addEmployee({ full_name: 'Fatma Demir', salary: 28000, start_date: '2026-01-01' });
  const d = giveDebt({ employee_id: emp.id, amount: 3000, type: 'avans', installments: 1, start_month: '2026-12' });

  const sil = deleteDebtIfUnpaid(d);
  expect(sil.ok).toBe(true);

  const d2 = giveDebt({ employee_id: emp.id, amount: 3000, type: 'avans', installments: 1, start_month: '2026-12' });
  recordDebtPayment({ debt_id: d2, employee_id: emp.id, amount: 1000, method: 'elden' });
  const sil2 = deleteDebtIfUnpaid(d2);
  expect(sil2.ok).toBe(false);
  expect(useDataStore.getState().db.debt_payments.filter((p) => p.debt_id === d2).reduce((s, p) => s + p.amount, 0)).toBe(1000);
});

describe('M3: ensureHolidays — Yıl devrinde tatil tohumlama', () => {
  test('Eksik yıl tohumlanır, ikinci çağrı çoğaltmaz (idempotent)', async () => {
    const orgId = await createOrganization('Holidays Atölye', null);
    const dbBefore = useDataStore.getState().db;
    const initial2029 = dbBefore.calendar_events.filter((e) => e.org_id === orgId && e.date.startsWith('2029-'));
    expect(initial2029).toHaveLength(0);

    // 2029 tohumla
    const count = await ensureHolidays(orgId, 2029);
    expect(count).toBeGreaterThan(10);

    const dbAfter = useDataStore.getState().db;
    const seeded2029 = dbAfter.calendar_events.filter((e) => e.org_id === orgId && e.date.startsWith('2029-'));
    expect(seeded2029).toHaveLength(count);

    // İkinci çağrı: zaten mevcut, çoğaltmaz (0 döner)
    const secondCall = await ensureHolidays(orgId, 2029);
    expect(secondCall).toBe(0);
    const dbFinal = useDataStore.getState().db;
    const final2029 = dbFinal.calendar_events.filter((e) => e.org_id === orgId && e.date.startsWith('2029-'));
    expect(final2029).toHaveLength(count);

    // Kapsam dışı yıl (2035) sessiz geçer
    const outOfRange = await ensureHolidays(orgId, 2035);
    expect(outOfRange).toBe(0);
  });
});

describe('M1: mergeRowsById — Çevrimdışı yerel bekleyen satırları koruma', () => {
  test('Uzakta olmayan yerel satır silinmez, çakışan satır uzaktan güncellenir', () => {
    const local = [
      { id: 'offline-1', name: 'Çevrimdışı Satır' },
      { id: 'remote-1', name: 'Eski Değer' },
    ];
    const remote = [
      { id: 'remote-1', name: 'Uzak Güncel Değer' },
      { id: 'remote-2', name: 'Yeni Uzak Satır' },
    ];

    const merged = mergeRowsById(local, remote);
    expect(merged).toHaveLength(3);
    // Yerelde olup uzakta henüz olmayan satır KORUNDU
    expect(merged.find((r) => r.id === 'offline-1')?.name).toBe('Çevrimdışı Satır');
    // Çakışan satır uzaktan gelen ile güncellendi
    expect(merged.find((r) => r.id === 'remote-1')?.name).toBe('Uzak Güncel Değer');
    // Yeni uzak satır eklendi
    expect(merged.find((r) => r.id === 'remote-2')?.name).toBe('Yeni Uzak Satır');
  });
});

describe('M2: validateEkCalismaDate — Tekil kaynak iş günü kısıtı', () => {
  test('Normal iş gününde ek çalışma engellenir, tatil/hafta sonu kabul edilir', () => {
    const workdayPlan = {
      date: '2026-11-04',
      kind: 'normal' as const,
      plannedHours: 9,
      isWorkday: true,
      multiplier: null,
      overtimeMultiplier: null,
      title: null,
      event: null,
      startMinutes: 480,
      endMinutes: 1080,
    };
    const checkWorkday = validateEkCalismaDate(workdayPlan);
    expect(checkWorkday.valid).toBe(false);
    expect(checkWorkday.error).toMatch(/zaten iş günü/);

    const holidayPlan = {
      ...workdayPlan,
      isWorkday: false,
      kind: 'resmi_tatil' as const,
    };
    const checkHoliday = validateEkCalismaDate(holidayPlan);
    expect(checkHoliday.valid).toBe(true);
    expect(checkHoliday.error).toBeUndefined();
  });
});

