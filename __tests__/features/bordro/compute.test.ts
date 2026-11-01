import { DEFAULT_SETTINGS, Employee, Organization } from '../../../src/types';
import { emptyDB } from '../../../src/data/store';
import { computePayrollForMonth, itemBadges, sumTotals } from '../../../src/features/bordro/compute';
import { defaultScheduleDays } from '../../../src/types';
import type { AttendanceRecord } from '../../../src/types';

/**
 * computePayrollForMonth sarma katmanı testleri (Faz 0 Önkoşul 5).
 * Domain motoru payroll.test.ts'de testlidir; burada filtreleme, sıralama
 * ve toplama davranışları güvence altına alınır.
 */

const ORG = 'org-1';

function makeOrg(): Organization {
  return {
    id: ORG,
    name: 'Test Atölye',
    settings: {},
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  } as Organization;
}

function makeEmployee(over: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    org_id: ORG,
    department_id: null,
    full_name: 'Ayşe Yılmaz',
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

function baseDB() {
  const db = emptyDB();
  db.organizations.push(makeOrg());
  db.schedule_days.push(...defaultScheduleDays(ORG));
  return db;
}

function att(day: string, status: AttendanceRecord['status']): AttendanceRecord {
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
    updated_at: '2026-11-01T00:00:00Z',
  };
}

function pushSalary(employeeId = 'emp-1') {
  const db = baseDB();
  db.employees.push(makeEmployee({ id: employeeId }));
  db.employee_salaries.push({
    id: `sal-${employeeId}`,
    org_id: ORG,
    employee_id: employeeId,
    amount: 30000,
    effective_from: '2020-01-01',
    note: null,
    created_at: '2026-01-01T00:00:00Z',
  });
  return db;
}

describe('computePayrollForMonth', () => {
  it('pasife alınmış çalışanı (active: false, end_date: null) bordroya almaz', async () => {
    const db = baseDB();
    db.employees.push(makeEmployee());
    db.employees.push(makeEmployee({ id: 'emp-2', full_name: 'Pasife Alınmış', active: false }));
    db.employee_salaries.push(
      {
        id: 'sal-1',
        org_id: ORG,
        employee_id: 'emp-1',
        amount: 30000,
        effective_from: '2020-01-01',
        note: null,
        created_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'sal-2',
        org_id: ORG,
        employee_id: 'emp-2',
        amount: 20000,
        effective_from: '2020-01-01',
        note: null,
        created_at: '2026-01-01T00:00:00Z',
      }
    );
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    expect(items.map((i) => i.employee_id)).toEqual(['emp-1']);
  });

  it('tarih penceresi dışındaki çalışanı almaz, ay ortası gireni kıst etiketiyle alır', async () => {
    const db = baseDB();
    db.employees.push(makeEmployee({ id: 'emp-cikis', full_name: 'Çıkan', end_date: '2026-10-31' }));
    db.employees.push(makeEmployee({ id: 'emp-giris', full_name: 'Yeni Giren', start_date: '2026-11-16' }));
    for (const id of ['emp-cikis', 'emp-giris']) {
      db.employee_salaries.push({
        id: `sal-${id}`,
        org_id: ORG,
        employee_id: id,
        amount: 30000,
        effective_from: id === 'emp-giris' ? '2026-11-16' : '2020-01-01',
        note: null,
        created_at: '2026-01-01T00:00:00Z',
      });
    }
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    expect(items).toHaveLength(1);
    expect(items[0].employee_id).toBe('emp-giris');
    expect(items[0].breakdown.isProRated).toBe(true);
  });

  it('maaş kaydı olmayan çalışanı uyarıyla listeler', async () => {
    const db = baseDB();
    db.employees.push(makeEmployee());
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    expect(items).toHaveLength(1);
    expect(items[0].breakdown.warning).toBe('Maaş kaydı bulunamadı');
  });

  it('örgü ayarlarını (yöntem B) uygular', async () => {
    const db = baseDB();
    db.organizations[0].settings = { ...DEFAULT_SETTINGS, hourlyWageMethod: 'gercek_ay' };
    db.employees.push(makeEmployee());
    db.employee_salaries.push({
      id: 'sal-1',
      org_id: ORG,
      employee_id: 'emp-1',
      amount: 30000,
      effective_from: '2020-01-01',
      note: null,
      created_at: '2026-01-01T00:00:00Z',
    });
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    // Kasım 2026: 21 iş günü × 9 saat = 189
    expect(items[0].breakdown.monthlyHours).toBe(189);
  });
});

describe('itemBadges / sumTotals', () => {
  it('devamsızlık, mesai, taksit ve kıst rozetlerini üretir', () => {
    const badges = itemBadges({
      id: 'pi-1',
      org_id: ORG,
      payroll_id: 'pay-1',
      employee_id: 'emp-1',
      employee_name: 'Ayşe',
      department_name: null,
      bonus: 0,
      extra_cut: 0,
      extra_cut_note: null,
      skip_debt: false,
      debt_override: null,
      base_salary: 30000,
      hourly_rate: 153.85,
      absence_cut: 1384.62,
      overtime_pay: 461.54,
      debt_cut: 1000,
      net_payable: 28076.92,
      paid_amount: 0,
      breakdown: {
        hourlyRate: 153.85,
        monthlyHours: 195,
        baseSalary: 30000,
        isProRated: true,
        absenceCut: 1384.62,
        overtimeHours: 3,
        overtimePay: 461.54,
        bonus: 0,
        extraCut: 0,
        suggestedDebtCut: 1000,
        debtAllocations: [],
        debtCut: 1000,
        uncoveredCut: 0,
        lines: [{ label: 'Gelmedi (12.11)', amount: -1384.62, detail: '' }],
        warning: null,
      },
      updated_at: '2026-11-01T00:00:00Z',
    });
    expect(badges).toContain('−1 gün');
    expect(badges).toContain('+3 sa mesai');
    expect(badges).toContain('kıst');
    expect(badges.some((b) => b.includes('taksit'))).toBe(true);
  });

  it('sumTotals alanları satırların toplamıdır', () => {
    const totals = sumTotals([]);
    expect(totals.net).toBe(0);
    expect(totals.uncovered).toHaveLength(0);
  });
});

describe('İşsiz Günü kalemi (issiz_gunu)', () => {
  it('işsiz günler bordroda tek "İşsiz Günü Kesintisi (N gün)" kalemi olarak kesilir', async () => {
    const db = pushSalary();
    db.attendance.push(att('2026-11-03', 'issiz_gunu'), att('2026-11-04', 'issiz_gunu'));
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    expect(items).toHaveLength(1);
    // Günlük kesinti ücretsiz izinle aynı: 9 sa × 153,85 ₺ = 1.384,62 (Yöntem A)
    expect(items[0].absence_cut).toBe(2769.24);
    const line = items[0].breakdown.lines.find((l) => l.label.startsWith('İşsiz Günü Kesintisi'));
    expect(line?.label).toBe('İşsiz Günü Kesintisi (2 gün)');
    expect(line?.amount).toBe(-2769.24);
  });

  it('işsiz gün yoksa kalem oluşmaz', async () => {
    const db = pushSalary();
    db.attendance.push(att('2026-11-03', 'ucretsiz_izin'));
    const items = await computePayrollForMonth({ db, orgId: ORG, year: 2026, month: 11 });
    expect(items[0].absence_cut).toBe(1384.62);
    expect(items[0].breakdown.lines.some((l) => l.label.includes('İşsiz Günü'))).toBe(false);
  });

  it('itemBadges: işsiz gün satırı −N gün rozetine gün sayısıyla yansır', () => {
    const mk = (lines: { label: string; amount: number; detail: string }[]) =>
      itemBadges({
        id: 'pi-1',
        org_id: ORG,
        payroll_id: 'pay-1',
        employee_id: 'emp-1',
        employee_name: 'Ayşe',
        department_name: null,
        bonus: 0,
        extra_cut: 0,
        extra_cut_note: null,
        skip_debt: false,
        debt_override: null,
        base_salary: 30000,
        hourly_rate: 153.85,
        absence_cut: 4153.86,
        overtime_pay: 0,
        debt_cut: 0,
        net_payable: 25846.14,
        paid_amount: 0,
        breakdown: {
          hourlyRate: 153.85,
          monthlyHours: 195,
          baseSalary: 30000,
          isProRated: false,
          absenceCut: 4153.86,
          overtimeHours: 0,
          overtimePay: 0,
          bonus: 0,
          extraCut: 0,
          suggestedDebtCut: 0,
          debtAllocations: [],
          debtCut: 0,
          uncoveredCut: 0,
          lines,
          warning: null,
        },
        updated_at: '2026-11-01T00:00:00Z',
      });
    // Yalnız işsiz günler (3 gün tek satırda)
    expect(mk([{ label: 'İşsiz Günü Kesintisi (3 gün)', amount: -4153.86, detail: '' }])).toContain('−3 gün');
    // Gelmedi (1 satır) + işsiz (2 gün tek satırda) → toplam 3 gün
    expect(
      mk([
        { label: 'Gelmedi (12.11)', amount: -1384.62, detail: '' },
        { label: 'İşsiz Günü Kesintisi (2 gün)', amount: -2769.24, detail: '' },
      ])
    ).toContain('−3 gün');
  });
});
