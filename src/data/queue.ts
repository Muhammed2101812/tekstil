export type SyncTable =
  | 'organizations'
  | 'org_members'
  | 'org_invites'
  | 'departments'
  | 'schedule_days'
  | 'calendar_events'
  | 'employees'
  | 'employee_salaries'
  | 'attendance'
  | 'attendance_days'
  | 'overtime'
  | 'debts'
  | 'debt_payments'
  | 'leave_adjustments'
  | 'payrolls'
  | 'payroll_items'
  | 'salary_payments';

export interface QueuedOp {
  id: string;
  table: SyncTable;
  op: 'upsert' | 'delete';
  rowId: string;
  at: string;
}
