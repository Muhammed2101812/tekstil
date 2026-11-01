import { unpaidBreakMinutesWithin, netHoursBetween, dayNetHours, getDayPlan } from '../../src/domain/schedule';
import { BreakTime, CalendarEvent, ScheduleDay } from '../../src/types';

describe('schedule breaks calculations', () => {
  it('correctly calculates unpaid minutes when multiple breaks exist (some paid, some unpaid)', () => {
    const breaks: BreakTime[] = [
      { name: 'Sabah Çayı', start: '10:00', end: '10:15', paid: true }, // paid: not subtracted
      { name: 'Öğle Yemeği', start: '12:30', end: '13:30', paid: false }, // unpaid: 60 mins
      { name: 'İkindi Çayı', start: '15:30', end: '15:45', paid: false }, // unpaid: 15 mins
    ];

    // Across entire day: 08:00 to 18:00
    const unpaid = unpaidBreakMinutesWithin('08:00', '18:00', breaks);
    expect(unpaid).toBe(75); // 60 + 15
  });

  it('correctly calculates net hours with multiple breaks', () => {
    const breaks: BreakTime[] = [
      { name: 'Sabah Çayı', start: '10:00', end: '10:15', paid: true },
      { name: 'Öğle Yemeği', start: '12:30', end: '13:30', paid: false },
      { name: 'İkindi Çayı', start: '15:30', end: '15:45', paid: false },
    ];

    // 08:00 - 18:00 is 10 hours gross (600 mins). Unpaid breaks = 75 mins -> 525 mins = 8.75 hours net.
    const net = netHoursBetween('08:00', '18:00', breaks);
    expect(net).toBe(8.75);
  });

  it('calculates dayNetHours for a workday scheduleDay', () => {
    const day: ScheduleDay = {
      id: 'day-1',
      org_id: 'org-1',
      weekday: 1,
      is_workday: true,
      start_time: '08:00',
      end_time: '18:00',
      breaks: [
        { name: 'Sabah', start: '10:00', end: '10:15', paid: false },
        { name: 'Öğle', start: '12:30', end: '13:30', paid: false },
      ],
      department_id: null,
      updated_at: '2026-10-22T00:00:00Z',
    };

    // 600 mins gross - 75 mins unpaid breaks = 525 mins = 8.75 hours
    expect(dayNetHours(day)).toBe(8.75);

    // If day is holiday (is_workday: false)
    expect(dayNetHours({ ...day, is_workday: false })).toBe(0);
  });
});

describe('overnight shifts (gece vardiyası)', () => {
  it('calculates hours across midnight (22:00–06:00 = 8h, was 0 before the fix)', () => {
    expect(netHoursBetween('22:00', '06:00', [])).toBe(8);
  });

  it('subtracts an unpaid break inside a midnight-crossing shift', () => {
    const breaks: BreakTime[] = [{ name: 'Gece Yemeği', start: '02:00', end: '02:30', paid: false }];
    expect(netHoursBetween('22:00', '06:00', breaks)).toBe(7.5);
  });

  it('subtracts an unpaid break that itself crosses midnight', () => {
    const breaks: BreakTime[] = [{ name: 'Gece Yemeği', start: '23:30', end: '00:15', paid: false }];
    expect(netHoursBetween('22:00', '06:00', breaks)).toBe(7.25);
  });

  it('ignores unpaid breaks outside the shift window', () => {
    const breaks: BreakTime[] = [{ name: 'Akşam', start: '19:00', end: '20:00', paid: false }];
    expect(netHoursBetween('22:00', '06:00', breaks)).toBe(8);
  });

  it('keeps normal daytime shifts unchanged', () => {
    expect(netHoursBetween('08:00', '18:00', [])).toBe(10);
    expect(netHoursBetween('12:00', '12:00', [])).toBe(0);
  });

  it('resolves a night-shift schedule day to a full DayPlan', () => {
    const night: ScheduleDay = {
      id: 'night-1',
      org_id: 'org-1',
      weekday: 2,
      is_workday: true,
      start_time: '22:00',
      end_time: '06:00',
      breaks: [],
      department_id: null,
      updated_at: '2026-10-22T00:00:00Z',
    };
    const plan = getDayPlan('2026-11-03', [night], []);
    expect(plan.plannedHours).toBe(8);
    expect(plan.isWorkday).toBe(true);
  });

  it('does not turn a weekend yarım_gun event into a chargeable workday', () => {
    const weekdayOnly: ScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      id: `wd-${weekday}`,
      org_id: 'org-1',
      weekday,
      is_workday: weekday <= 5,
      start_time: '08:00',
      end_time: '18:00',
      breaks: [],
      department_id: null,
      updated_at: '2026-10-22T00:00:00Z',
    }));
    const event: CalendarEvent = {
      id: 'ev-1',
      org_id: 'org-1',
      date: '2026-11-01', // Pazar
      type: 'yarim_gun',
      start_time: '08:00',
      end_time: '13:00',
      paid: true,
      multiplier: null,
      title: 'Yanlışlıkla eklenen arife',
      scope: 'tumu',
      department_id: null,
      employee_ids: [],
      updated_at: '2026-10-22T00:00:00Z',
    };
    const plan = getDayPlan('2026-11-01', weekdayOnly, [event]);
    expect(plan.kind).toBe('yarim_gun');
    expect(plan.isWorkday).toBe(false);
  });
});
