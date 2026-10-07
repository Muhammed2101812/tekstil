import {
  AttendanceRecord,
  CalendarEvent,
  Debt,
  DebtPayment,
  DEFAULT_SETTINGS,
  Employee,
  EmployeeSalary,
  OvertimeRecord,
  defaultScheduleDays,
} from '../../src/types';
import { calculateEmployeePayroll, PayrollCalcInput } from '../../src/domain/payroll';
import { allocateDebtCut, calculateDebtBalance } from '../../src/domain/debts';
import { leaveStatus, leaveDaysForYear } from '../../src/domain/leave';
import { getMonthPlans, getDayPlan } from '../../src/domain/schedule';
import { yearlyOvertimeStatus } from '../../src/domain/overtime';
import { TURKISH_HOLIDAYS } from '../../src/domain/holidays-tr';

/**
 * PLAN.md Bölüm 14.1'deki 17 hesaplama senaryosu + destekleyici testler.
 * Referans takvim: Pzt–Cum 08:00–18:00 (öğle 1 sa ücretsiz) = 9 sa/gün,
 * 45 sa/hafta → Yöntem A aylık 195 saat. Test ayı: Kasım 2026 (21 iş günü,
 * resmî tatil yok; 1 Kasım Pazar).
 */

const ORG = 'org-1';
const YIL = 2026;
const AY = 11;
const YM = '2026-11';
const SCHEDULE = defaultScheduleDays(ORG);

function makeEmployee(over: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    org_id: ORG,
    department_id: null,
    full_name: 'Test Çalışan',
    phone: null,
    tc_no: null,
    iban: null,
    birth_date: '1990-01-01',
    address: null,
    photo_url: null,
    start_date: '2020-01-01',
    end_date: null,
    active: true,
    notes: null,
    emergency_contact: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function makeSalaries(employeeId: string, entries: { amount: number; from: string }[]): EmployeeSalary[] {
  return entries.map((e, i) => ({
    id: `sal-${i}`,
    org_id: ORG,
    employee_id: employeeId,
    amount: e.amount,
    effective_from: e.from,
    note: null,
    created_at: '2026-01-01T00:00:00Z',
  }));
}

function att(day: string, status: AttendanceRecord['status'], over: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: `att-${day}-${status}`,
    org_id: ORG,
    employee_id: 'emp-1',
    day,
    status,
    arrival_time: null,
    leave_time: null,
    late_minutes: 0,
    early_leave_minutes: 0,
    note: null,
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function ot(day: string, hours: number, over: Partial<OvertimeRecord> = {}): OvertimeRecord {
  return {
    id: `ot-${day}-${hours}`,
    org_id: ORG,
    employee_id: 'emp-1',
    day,
    hours,
    kind: 'hafta_sonu',
    multiplier: 1.5,
    calendar_event_id: null,
    note: null,
    client_ref: `ref-${day}-${hours}`,
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function debt(over: Partial<Debt> = {}): Debt {
  return {
    id: 'debt-1',
    org_id: ORG,
    employee_id: 'emp-1',
    type: 'avans',
    amount: 6000,
    given_at: '2026-10-15',
    installments: 3,
    start_month: '2026-11',
    description: null,
    client_ref: 'ref-debt-1',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  };
}

function baseInput(over: Partial<PayrollCalcInput> = {}): PayrollCalcInput {
  return {
    employee: makeEmployee(),
    salaries: makeSalaries('emp-1', [{ amount: 30000, from: '2020-01-01' }]),
    year: YIL,
    month: AY,
    settings: { ...DEFAULT_SETTINGS },
    schedule: SCHEDULE,
    events: [],
    attendance: [],
    overtime: [],
    debts: [],
    debtPayments: [],
    ...over,
  };
}

const H = 30000 / 195; // 153,8461… ₺/saat (yuvarlanmamış)
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

describe('Bordro hesaplama motoru — PLAN 14.1 senaryoları', () => {
  test('1. Tam ay devamsızlık yok → net = maaş', () => {
    const r = calculateEmployeePayroll(baseInput());
    expect(r.baseSalary).toBe(30000);
    expect(r.absenceCut).toBe(0);
    expect(r.debtCut).toBe(0);
    expect(r.netPayable).toBe(30000);
    expect(r.breakdown.lines.length).toBe(1);
  });

  test('2. 1 gün gelmedi (Yöntem A) → −1.384,62 (30.000 ₺ / 195 sa / 9 sa)', () => {
    const r = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-12', 'gelmedi')] }));
    expect(r.absenceCut).toBe(1384.62);
    expect(r.netPayable).toBe(30000 - 1384.62);
    // Plan örnek tablosu: saatlik 153,85
    expect(r.hourlyRate).toBe(153.85);
  });

  test('3. Aynı durum Yöntem B, 21 iş günlü ay → 30.000/189 üzerinden', () => {
    const r = calculateEmployeePayroll(
      baseInput({
        settings: { ...DEFAULT_SETTINGS, hourlyWageMethod: 'gercek_ay' },
        attendance: [att('2026-11-12', 'gelmedi')],
      })
    );
    const hourlyB = 30000 / 189; // 21 iş günü × 9 saat
    expect(r.absenceCut).toBe(r2(9 * hourlyB));
    expect(r.breakdown.monthlyHours).toBe(189);
  });

  test('4. 2 saat erken çıkış — kesinti açık ve kapalı', () => {
    const acik = calculateEmployeePayroll(
      baseInput({ attendance: [att('2026-11-12', 'erken_cikti', { early_leave_minutes: 120 })] })
    );
    expect(acik.absenceCut).toBe(r2(2 * H));
    const kapali = calculateEmployeePayroll(
      baseInput({
        settings: { ...DEFAULT_SETTINGS, deductEarlyLeave: false },
        attendance: [att('2026-11-12', 'erken_cikti', { early_leave_minutes: 120 })],
      })
    );
    expect(kapali.absenceCut).toBe(0);
  });

  test('5. Geç gelme → kesinti 0, kayıt korunur (deductLate varsayılan kapalı)', () => {
    const r = calculateEmployeePayroll(
      baseInput({ attendance: [att('2026-11-12', 'gec_geldi', { late_minutes: 40 })] })
    );
    expect(r.absenceCut).toBe(0);
    expect(r.netPayable).toBe(30000);
  });

  test('5b. Geç gelme kesintisi açıksa dakika bazlı kesilir', () => {
    const r = calculateEmployeePayroll(
      baseInput({
        settings: { ...DEFAULT_SETTINGS, deductLate: true },
        attendance: [att('2026-11-12', 'gec_geldi', { late_minutes: 90 })],
      })
    );
    expect(r.absenceCut).toBe(r2(1.5 * H));
  });

  test('6. Yarım gün / ücretsiz izin / yıllık izin / mazeret izin', () => {
    const yarim = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-02', 'yarim_gun')] }));
    expect(yarim.absenceCut).toBe(r2(4.5 * H));

    const ucretsiz = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-03', 'ucretsiz_izin')] }));
    expect(ucretsiz.absenceCut).toBe(1384.62);

    const yillik = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-04', 'yillik_izin')] }));
    expect(yillik.absenceCut).toBe(0);

    const mazeret = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-05', 'mazeret_izni')] }));
    expect(mazeret.absenceCut).toBe(0);
  });

  test('7. Rapor: kesilir / ilk 2 gün işveren öder', () => {
    const kesilen = calculateEmployeePayroll(baseInput({ attendance: [att('2026-11-02', 'rapor')] }));
    expect(kesilen.absenceCut).toBe(1384.62);

    const employerPays = calculateEmployeePayroll(
      baseInput({
        settings: { ...DEFAULT_SETTINGS, sickLeaveFirstTwoDaysEmployer: true },
        attendance: [att('2026-11-02', 'rapor'), att('2026-11-03', 'rapor'), att('2026-11-04', 'rapor')],
      })
    );
    // İlk 2 gün işveren öder, 3. gün kesilir
    expect(employerPays.absenceCut).toBe(1384.62);
  });

  test('8. Arife (yarım planlı gün) devamsızlığı → sadece planlı yarım gün kesilir', () => {
    const arife: CalendarEvent = {
      id: 'ev-1',
      org_id: ORG,
      date: '2026-11-13', // Cuma
      type: 'yarim_gun',
      title: 'Arife',
      start_time: '08:00',
      end_time: '13:00',
      paid: true,
      multiplier: null,
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: '2026-01-01T00:00:00Z',
    };
    const plan = getDayPlan('2026-11-13', SCHEDULE, [arife]);
    // 08:00–13:00, öğle molası 12:30–13:00 kesişir → net 4,5 saat
    expect(plan.plannedHours).toBe(4.5);
    const r = calculateEmployeePayroll(baseInput({ events: [arife], attendance: [att('2026-11-13', 'gelmedi')] }));
    expect(r.absenceCut).toBe(r2(4.5 * H));
  });

  test('9. Resmî tatil → kesinti yok; resmî tatil çalışması ×2', () => {
    const tatil: CalendarEvent = {
      id: 'ev-2',
      org_id: ORG,
      date: '2026-11-11', // Çarşamba
      type: 'resmi_tatil',
      title: 'Test Bayramı',
      start_time: null,
      end_time: null,
      paid: true,
      multiplier: 2.0,
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: '2026-01-01T00:00:00Z',
    };
    const r = calculateEmployeePayroll(baseInput({ events: [tatil], attendance: [att('2026-11-11', 'gelmedi')] }));
    expect(r.absenceCut).toBe(0);
    expect(r.baseSalary).toBe(30000);

    const calisan = calculateEmployeePayroll({
      ...baseInput({ events: [tatil] }),
      overtime: [ot('2026-11-11', 9, { kind: 'resmi_tatil', multiplier: 2.0 })],
    });
    expect(calisan.overtimePay).toBe(r2(9 * H * 2));
    expect(calisan.netPayable).toBe(30000 + calisan.overtimePay);
  });

  test('10. Cumartesi ek çalışma: gelen +mesai, gelmeyen kesinti yok', () => {
    const ek: CalendarEvent = {
      id: 'ev-3',
      org_id: ORG,
      date: '2026-11-14', // Cumartesi
      type: 'ek_calisma',
      title: 'Cumartesi yarım gün',
      start_time: '08:00',
      end_time: '13:00',
      paid: true,
      multiplier: 1.5,
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: '2026-01-01T00:00:00Z',
    };
    const plan = getDayPlan('2026-11-14', SCHEDULE, [ek]);
    expect(plan.isWorkday).toBe(false);
    expect(plan.plannedHours).toBe(5);

    const gelmeyen = calculateEmployeePayroll(baseInput({ events: [ek] }));
    expect(gelmeyen.absenceCut).toBe(0);
    expect(gelmeyen.netPayable).toBe(30000);

    const gelen = calculateEmployeePayroll(baseInput({ events: [ek], overtime: [ot('2026-11-14', 5)] }));
    expect(gelen.overtimePay).toBe(1153.85); // 5 × 153,8461 × 1,5
  });

  test('11. Ay ortası işe giriş (kıst) — /30 kuralı', () => {
    const r = calculateEmployeePayroll(
      baseInput({
        employee: makeEmployee({ start_date: '2026-11-16' }),
        salaries: makeSalaries('emp-1', [{ amount: 30000, from: '2026-11-16' }]),
      })
    );
    expect(r.baseSalary).toBe(15000); // 15 takvim günü / 30
    expect(r.breakdown.isProRated).toBe(true);

    // Devamsızlık sadece aktif dönemdeki günlerden sayılır
    const r2r = calculateEmployeePayroll(
      baseInput({
        employee: makeEmployee({ start_date: '2026-11-16' }),
        salaries: makeSalaries('emp-1', [{ amount: 30000, from: '2026-11-16' }]),
        attendance: [att('2026-11-10', 'gelmedi'), att('2026-11-17', 'gelmedi')],
      })
    );
    // 10 Kasım başlangıçtan önce → yok sayılır; 17 Kasım kesilir
    expect(r2r.absenceCut).toBe(1384.62);
  });

  test('11b. Ay ortası işten çıkış (kıst)', () => {
    const r = calculateEmployeePayroll(baseInput({ employee: makeEmployee({ end_date: '2026-11-15' }) }));
    expect(r.baseSalary).toBe(15000);
    expect(r.netPayable).toBe(15000);
  });

  test('12. Ay ortası zam → iki parçalı taban ve gün bazlı kesinti', () => {
    const salaries = makeSalaries('emp-1', [
      { amount: 30000, from: '2020-01-01' },
      { amount: 33000, from: '2026-11-16' },
    ]);
    const r = calculateEmployeePayroll(baseInput({ salaries }));
    expect(r.baseSalary).toBe(31500); // 15/30 × 30.000 + 15/30 × 33.000

    const r2r = calculateEmployeePayroll(
      baseInput({
        salaries,
        attendance: [att('2026-11-12', 'gelmedi'), att('2026-11-19', 'gelmedi')],
      })
    );
    const eskiGun = r2(9 * (30000 / 195));
    const yeniGun = r2(9 * (33000 / 195));
    expect(r2r.absenceCut).toBe(r2(eskiGun + yeniGun));
  });

  test('13. Ücretsiz firma tatili → herkesten o gün kesilir', () => {
    const firmaTatili: CalendarEvent = {
      id: 'ev-4',
      org_id: ORG,
      date: '2026-11-20', // Cuma
      type: 'firma_tatili',
      title: 'Siporiş yokluğu',
      start_time: null,
      end_time: null,
      paid: false,
      multiplier: null,
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: '2026-01-01T00:00:00Z',
    };
    const r = calculateEmployeePayroll(baseInput({ events: [firmaTatili] }));
    expect(r.absenceCut).toBe(1384.62);

    const ucretliTatil = calculateEmployeePayroll(
      baseInput({ events: [{ ...firmaTatili, paid: true } as CalendarEvent] })
    );
    expect(ucretliTatil.absenceCut).toBe(0);
    expect(ucretliTatil.netPayable).toBe(30000);
  });

  test('14. Taksitli avans: öneri, son taksit kalan kadar, başlangıç ayı bekler, atla', () => {
    const d = debt();
    expect(calculateDebtBalance(d, [], '2026-10').suggestedInstallment).toBe(0); // start_month Kasım
    expect(calculateDebtBalance(d, [], '2026-11').suggestedInstallment).toBe(2000);

    const odemeler: DebtPayment[] = [
      { id: 'p1', org_id: ORG, debt_id: 'debt-1', employee_id: 'emp-1', amount: 2000, paid_at: '2026-11-05', method: 'maas_kesinti', payroll_item_id: null, note: null },
      { id: 'p2', org_id: ORG, debt_id: 'debt-1', employee_id: 'emp-1', amount: 2000, paid_at: '2026-12-05', method: 'maas_kesinti', payroll_item_id: null, note: null },
    ];
    expect(calculateDebtBalance(d, odemeler, '2027-01').suggestedInstallment).toBe(2000);
    expect(calculateDebtBalance(d, odemeler, '2027-01').remaining).toBe(2000);

    const r = calculateEmployeePayroll(baseInput({ debts: [d] }));
    expect(r.debtCut).toBe(2000);
    expect(r.netPayable).toBe(28000);
    expect(r.debtAllocations).toEqual([{ debt_id: 'debt-1', amount: 2000 }]);

    const atla = calculateEmployeePayroll(baseInput({ debts: [d], adjustments: { skipDebt: true } }));
    expect(atla.debtCut).toBe(0);
  });

  test('15. Kesintiler > maaş → taksitler bütçeye göre kısıtlanır; net 0, uncovered bayrağı', () => {
    const atts = ['02', '03', '04', '05', '06'].map((d) => att(`2026-11-${d}`, 'gelmedi'));
    const buyukBorc = debt({ amount: 20000, installments: 2 });
    const r = calculateEmployeePayroll(baseInput({ attendance: atts, debts: [buyukBorc] }));
    expect(r.absenceCut).toBe(r2(5 * 1384.62));
    expect(r.debtCut).toBe(10000); // öneri 10.000 ≤ ara toplam 23.076,90
    expect(r.netPayable).toBe(r2(30000 - r2(5 * 1384.62) - 10000));

    // Ekstrem: devamsızlık + el kesintisi tabanı aşar → net 0, uncovered > 0, borç 0
    const tumGunler: AttendanceRecord[] = [];
    for (let d = 2; d <= 30; d++) {
      const day = `2026-11-${String(d).padStart(2, '0')}`;
      if (getDayPlan(day, SCHEDULE, []).isWorkday) tumGunler.push(att(day, 'gelmedi'));
    }
    const cokKesinti = calculateEmployeePayroll(
      baseInput({ attendance: tumGunler, debts: [buyukBorc], adjustments: { extraCut: 2000 } })
    );
    expect(cokKesinti.netPayable).toBe(0);
    expect(cokKesinti.uncoveredCut).toBe(r2(2000 - (30000 - r2(21 * 1384.62))));
    expect(cokKesinti.debtCut).toBe(0);
  });

  test('16. Kuruş yuvarlama tutarlılığı — net = satırların toplamı', () => {
    const r = calculateEmployeePayroll(
      baseInput({
        attendance: [
          att('2026-11-02', 'gelmedi'),
          att('2026-11-03', 'erken_cikti', { early_leave_minutes: 47 }),
          att('2026-11-04', 'yarim_gun'),
        ],
        overtime: [ot('2026-11-05', 2, { kind: 'hafta_ici' })],
        adjustments: { bonus: 1234.56, extraCut: 99.99 },
        debts: [debt()],
      })
    );
    const satirToplam = r.breakdown.lines.reduce((s, l) => r2(s + l.amount), 0);
    expect(r.netPayable).toBe(satirToplam);
  });

  test('17. Yıllık izin hakkı: kıdem eşikleri ve yaş istisnası', () => {
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 1)).toBe(14);
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 4)).toBe(14);
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 5)).toBe(20);
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 14)).toBe(20);
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 15)).toBe(26);
    expect(leaveDaysForYear('2020-01-01', '1990-01-01', 16)).toBe(26);
    // Yıldönümünde 50+ yaş → en az 20 gün; genç → 14
    expect(leaveDaysForYear('2026-01-01', '1974-06-01', 1)).toBe(20);
    expect(leaveDaysForYear('2026-01-01', '1980-01-01', 1)).toBe(14);

    const status = leaveStatus({ start_date: '2024-11-01', birth_date: '1990-01-01' }, [{ days: 3 }], 4, '2026-11-01');
    expect(status.earned).toBe(28); // 2 tam yıl × 14 gün (2025-11-01, 2026-11-01)
    expect(status.remaining).toBe(28 + 3 - 4);
  });
});

describe('Borç dağıtımı ve takvim yardımcıları', () => {
  test('Önce eski borç kapanır; bütçe yetmezse yenisi az alınır', () => {
    const eskisi = debt({ id: 'd-eski', given_at: '2026-09-01' });
    const yenisi = debt({ id: 'd-yeni', given_at: '2026-10-01', amount: 4000, installments: 2 });
    const dist = allocateDebtCut([yenisi, eskisi], [], '2026-11', 2500);
    expect(dist.allocations[0]).toEqual({ debt_id: 'd-eski', amount: 2000 });
    expect(dist.allocations[1]).toEqual({ debt_id: 'd-yeni', amount: 500 });
    expect(dist.allocatedTotal).toBe(2500);
  });

  test('Tek seferde kesilecek avansın tamamı önerilir', () => {
    const tek = debt({ amount: 2500, installments: 1 });
    expect(calculateDebtBalance(tek, [], '2026-11').suggestedInstallment).toBe(2500);
  });

  test('Ay planı toplamları doğru (Kasım 2026: 21 iş günü × 9 = 189 saat)', () => {
    const plans = getMonthPlans(YIL, AY, SCHEDULE, []);
    expect(plans.totalWorkdays).toBe(21);
    expect(plans.totalPlannedHours).toBe(189);
  });

  test('Yıllık mesai uyarı eşiği (270 saat)', () => {
    const recs = [ot('2026-01-10', 8), ot('2026-02-10', 8)];
    expect(yearlyOvertimeStatus(recs, 2026).hours).toBe(16);
    expect(yearlyOvertimeStatus(recs, 2026).nearLimit).toBe(false);
    const many = Array.from({ length: 30 }, (_, i) => ot(`2026-03-${String(i + 1).padStart(2, '0')}`, 8));
    expect(yearlyOvertimeStatus(many, 2026).nearLimit).toBe(true);
  });

  test('Hafta tatili kesintisi (varsayılan kapalı, açılınca çalışır)', () => {
    const hafta = [att('2026-11-02', 'gelmedi')];
    const kapali = calculateEmployeePayroll(baseInput({ attendance: hafta }));
    expect(kapali.absenceCut).toBe(1384.62);
    const acik = calculateEmployeePayroll(
      baseInput({ settings: { ...DEFAULT_SETTINGS, weekRestPenalty: true }, attendance: hafta })
    );
    expect(acik.absenceCut).toBe(r2(1384.62 + 9 * H));
  });
});

describe('Denetim Bulguları Ek Testleri (K/O düzeltmeleri)', () => {
  test('debtOverride yolu: override > öneri toplamı dahil taksit kesintisini belirler', () => {
    const d = debt({ amount: 6000, installments: 3 }); // öneri: 2000
    // Normal öneri
    const normal = calculateEmployeePayroll(baseInput({ debts: [d] }));
    expect(normal.suggestedDebtCut).toBe(2000);
    expect(normal.debtCut).toBe(2000);

    // Override ile öneriden yüksek kesinti
    const overrideYuksek = calculateEmployeePayroll(
      baseInput({
        debts: [d],
        adjustments: { debtOverride: 3500 },
      })
    );
    expect(overrideYuksek.suggestedDebtCut).toBe(2000);
    expect(overrideYuksek.debtCut).toBe(3500);

    // Override ile öneriden düşük kesinti
    const overrideDusuk = calculateEmployeePayroll(
      baseInput({
        debts: [d],
        adjustments: { debtOverride: 1000 },
      })
    );
    expect(overrideDusuk.suggestedDebtCut).toBe(2000);
    expect(overrideDusuk.debtCut).toBe(1000);

    // skipDebt seçeneği
    const skipped = calculateEmployeePayroll(
      baseInput({
        debts: [d],
        adjustments: { skipDebt: true },
      })
    );
    expect(skipped.debtCut).toBe(0);
  });

  test('Şubat ve artık yıl: 2028-02 tam ay maaş ve kıst (/30) hesaplaması', () => {
    // 2028 artık yıldır, Şubat 29 gündür
    // Tam ay çalışan: tam taban maaş alır
    const tamSubat = calculateEmployeePayroll(
      baseInput({
        year: 2028,
        month: 2,
        employee: makeEmployee({ start_date: '2020-01-01' }),
      })
    );
    expect(tamSubat.baseSalary).toBe(30000);
    expect(tamSubat.breakdown.isProRated).toBe(false);

    // Kıst çalışan: 15 Şubat 2028 işe giriş → 29 - 15 + 1 = 15 gün
    // Standart kıst formülü: 30.000 / 30 * 15 = 15.000 TL
    const kistSubat = calculateEmployeePayroll(
      baseInput({
        year: 2028,
        month: 2,
        employee: makeEmployee({ start_date: '2028-02-15' }),
      })
    );
    expect(kistSubat.baseSalary).toBe(15000);
    expect(kistSubat.breakdown.isProRated).toBe(true);
  });

  test('Boş employee_salaries: uyarı bayrağı üretir ve sıfır maaş döndürür', () => {
    const res = calculateEmployeePayroll(
      baseInput({
        salaries: [],
      })
    );
    expect(res.baseSalary).toBe(0);
    expect(res.warning).toBe('Maaş kaydı bulunamadı');
    expect(res.breakdown.warning).toBe('Maaş kaydı bulunamadı');
  });

  test('Mesai multiplier: null fallback dalı (resmi tatil 2.0, normal 1.5)', () => {
    const otNormal = ot('2026-11-10', 4, { kind: 'hafta_ici', multiplier: null });
    const otResmi = ot('2026-11-11', 4, { kind: 'resmi_tatil', multiplier: null });

    const res = calculateEmployeePayroll(
      baseInput({
        overtime: [otNormal, otResmi],
      })
    );
    expect(res.overtimeHours).toBe(8);
    // otNormal: round2(4 * (30000/195) * 1.5) = 923.08
    // otResmi: round2(4 * (30000/195) * 2.0) = 1230.77
    expect(res.overtimePay).toBe(2153.85);
  });

  test('O14: Hafta sonu araya girdiğinde rapor koşusu bölünür', () => {
    // Cuma (06.11) ve Pazartesi (09.11) raporlu
    // sickLeaveFirstTwoDaysEmployer varsayılan true: ilk iki gün işveren öder (kesinti 0).
    // Hafta sonu araya girince prevDayRapor sıfırlanır, Pazartesi tekrar 1. gün sayılır.
    const records = [att('2026-11-06', 'rapor'), att('2026-11-09', 'rapor')];
    const res = calculateEmployeePayroll(
      baseInput({
        settings: { ...DEFAULT_SETTINGS, sickLeaveFirstTwoDaysEmployer: true },
        attendance: records,
      })
    );
    // Her iki gün de serinin 1. günü gibi işveren tarafından karşılanır, kesinti 0 olur
    expect(res.absenceCut).toBe(0);
  });

  test('holidays-tr.ts: 2026-2030 resmî tatil ve arife günleri tanımlıdır', () => {
    const dates = TURKISH_HOLIDAYS.map((h) => h.date);

    // 2026 Ramazan ve Kurban
    expect(dates).toContain('2026-03-19'); // Arife (yarım gün)
    expect(dates).toContain('2026-03-20');
    expect(dates).toContain('2026-03-21');
    expect(dates).toContain('2026-03-22');
    expect(dates).toContain('2026-05-26'); // Arife (yarım gün)
    expect(dates).toContain('2026-05-27');
    expect(dates).toContain('2026-05-28');
    expect(dates).toContain('2026-05-29');
    expect(dates).toContain('2026-05-30');

    // 2027
    expect(dates).toContain('2027-01-01');
    expect(dates).toContain('2027-10-29');

    // 2029 ve 2030 (K2 kapsamı)
    expect(dates).toContain('2029-01-01');
    expect(dates).toContain('2029-10-29');
    expect(dates).toContain('2030-01-01');
    expect(dates).toContain('2030-10-29');
  });
});

