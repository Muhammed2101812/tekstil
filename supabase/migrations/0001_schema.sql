-- ==============================================================================
-- 0001 — Şema (PLAN.md Bölüm 5)
-- Tüm id'ler istemciden UUID olarak gelir (offline idempotency).
-- Tarih alanları DATE/TEXT (ISO), tutarlar numeric(12,2), saatler 'HH:mm' metni.
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- updated_at otomatik güncelleme (pull-senkron için)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Firmalar ────────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  logo_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE TRIGGER trg_organizations_updated BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE org_members (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (user_id, org_id)
);

CREATE TABLE org_invites (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT NOT NULL CHECK (char_length(code) = 6),
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_by UUID REFERENCES auth.users(id),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_org_invites_code ON org_invites(code);

CREATE TABLE departments (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#3B5BDB',
  sort_order INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Çalışma takvimi ─────────────────────────────────────────────────────────

CREATE TABLE schedule_days (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  weekday INT NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  is_workday BOOLEAN NOT NULL DEFAULT true,
  start_time TEXT NOT NULL DEFAULT '08:00',
  end_time TEXT NOT NULL DEFAULT '18:00',
  breaks JSONB NOT NULL DEFAULT '[]'::jsonb,
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, weekday)
);
CREATE TRIGGER trg_schedule_days_updated BEFORE UPDATE ON schedule_days
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE calendar_events (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('resmi_tatil', 'yarim_gun', 'firma_tatili', 'ek_calisma')),
  title TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  paid BOOLEAN NOT NULL DEFAULT true,
  multiplier NUMERIC(3,1),
  scope TEXT NOT NULL DEFAULT 'tuma' CHECK (scope IN ('tuma', 'departman', 'kisiler')),
  department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
  employee_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_calendar_events_org_date ON calendar_events(org_id, date);
CREATE TRIGGER trg_calendar_events_updated BEFORE UPDATE ON calendar_events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Personel ────────────────────────────────────────────────────────────────

CREATE TABLE employees (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  tc_no TEXT,
  iban TEXT,
  birth_date DATE,
  address TEXT,
  photo_url TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  emergency_contact TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_employees_org_active ON employees(org_id, active);
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE employee_salaries (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  effective_from DATE NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_employee_salaries_emp ON employee_salaries(employee_id, effective_from);

-- ─── Puantaj ve mesai ────────────────────────────────────────────────────────

CREATE TABLE attendance (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN (
    'geldi', 'gelmedi', 'gec_geldi', 'erken_cikti', 'yarim_gun',
    'yillik_izin', 'mazeret_izni', 'ucretsiz_izin', 'rapor'
  )),
  arrival_time TEXT,
  leave_time TEXT,
  late_minutes INT NOT NULL DEFAULT 0,
  early_leave_minutes INT NOT NULL DEFAULT 0,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (employee_id, day)
);
CREATE INDEX idx_attendance_org_day ON attendance(org_id, day);
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON attendance
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE attendance_days (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  confirmed_by UUID REFERENCES auth.users(id),
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, day)
);

CREATE TABLE overtime (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  day DATE NOT NULL,
  hours NUMERIC(4,2) NOT NULL,
  kind TEXT NOT NULL DEFAULT 'hafta_ici' CHECK (kind IN ('hafta_ici', 'hafta_sonu', 'resmi_tatil')),
  multiplier NUMERIC(3,1),
  calendar_event_id UUID REFERENCES calendar_events(id) ON DELETE SET NULL,
  note TEXT,
  client_ref UUID NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_overtime_org_day ON overtime(org_id, day);
CREATE INDEX idx_overtime_emp ON overtime(employee_id, day);
CREATE TRIGGER trg_overtime_updated BEFORE UPDATE ON overtime
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Avans & borç ────────────────────────────────────────────────────────────

CREATE TABLE debts (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('avans', 'borc', 'diger')),
  amount NUMERIC(12,2) NOT NULL,
  given_at DATE NOT NULL,
  installments INT NOT NULL DEFAULT 0,
  start_month TEXT NOT NULL,
  description TEXT,
  client_ref UUID NOT NULL UNIQUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_debts_emp ON debts(employee_id);
CREATE TRIGGER trg_debts_updated BEFORE UPDATE ON debts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE debt_payments (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  debt_id UUID NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_at DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('maas_kesinti', 'elden')),
  payroll_item_id UUID,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_debt_payments_debt ON debt_payments(debt_id);
CREATE INDEX idx_debt_payments_payroll_item ON debt_payments(payroll_item_id);

-- ─── Yıllık izin ─────────────────────────────────────────────────────────────

CREATE TABLE leave_adjustments (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  days NUMERIC(4,1) NOT NULL,
  reason TEXT NOT NULL,
  date DATE NOT NULL
);

-- ─── Bordro ──────────────────────────────────────────────────────────────────

CREATE TABLE payrolls (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year INT NOT NULL,
  month INT NOT NULL CHECK (month BETWEEN 1 AND 12),
  status TEXT NOT NULL DEFAULT 'taslak' CHECK (status IN ('taslak', 'kesinlesti', 'odendi')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  revert_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (org_id, year, month)
);

CREATE TABLE payroll_items (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payroll_id UUID NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  employee_name TEXT NOT NULL,
  department_name TEXT,
  bonus NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_cut NUMERIC(12,2) NOT NULL DEFAULT 0,
  extra_cut_note TEXT,
  skip_debt BOOLEAN NOT NULL DEFAULT false,
  debt_override NUMERIC(12,2),
  base_salary NUMERIC(12,2) NOT NULL DEFAULT 0,
  hourly_rate NUMERIC(8,2) NOT NULL DEFAULT 0,
  absence_cut NUMERIC(12,2) NOT NULL DEFAULT 0,
  overtime_pay NUMERIC(12,2) NOT NULL DEFAULT 0,
  debt_cut NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_payable NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE (payroll_id, employee_id)
);
CREATE INDEX idx_payroll_items_payroll ON payroll_items(payroll_id);
CREATE TRIGGER trg_payroll_items_updated BEFORE UPDATE ON payroll_items
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE salary_payments (
  id UUID PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  payroll_item_id UUID NOT NULL REFERENCES payroll_items(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL,
  paid_at DATE NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('nakit', 'banka')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_salary_payments_item ON salary_payments(payroll_item_id);

-- ─── Denetim kaydı (tetikleyici doldurur, 0004) ──────────────────────────────

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID,
  user_id UUID,
  table_name TEXT NOT NULL,
  row_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  diff JSONB,
  at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX idx_audit_log_org ON audit_log(org_id, at DESC);
