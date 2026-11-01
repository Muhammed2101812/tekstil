import { EmployeeSalary } from '../../src/types';
import { salaryForDay } from '../../src/domain/wage';

const ORG = 'org-1';

function salary(from: string, amount = 30000, i = 0): EmployeeSalary {
  return {
    id: `sal-${i}`,
    org_id: ORG,
    employee_id: 'emp-1',
    amount,
    effective_from: from,
    note: null,
    created_at: '2026-01-01T00:00:00Z',
  };
}

describe('salaryForDay — gelecek tarihli maaş önceki aylara sızmaz', () => {
  test('boş liste → null', () => {
    expect(salaryForDay([], '2026-11-01')).toBeNull();
  });

  test('en eski kayıt bile tarihten sonraysa → null (fallback yok)', () => {
    const salaries = [salary('2026-12-01', 33000, 0)];
    expect(salaryForDay(salaries, '2026-11-15')).toBeNull();
  });

  test('uygun kayıt varsa en yakın önceki döner; gelecek kayıt yok sayılır', () => {
    const salaries = [salary('2020-01-01', 30000, 0), salary('2026-12-01', 33000, 1)];
    const chosen = salaryForDay(salaries, '2026-11-15');
    expect(chosen?.amount).toBe(30000);
    expect(salaryForDay(salaries, '2026-12-01')?.amount).toBe(33000);
  });
});
