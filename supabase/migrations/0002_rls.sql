-- ==============================================================================
-- 0002 — Row Level Security: kullanıcı yalnızca üyesi olduğu firmanın
-- satırlarını görür ve değiştirir (PLAN.md Bölüm 5 ve 8).
-- ==============================================================================

-- Kullanıcının üyesi olduğu firmalar (SECURITY DEFINER: üyelik sorgusu RLS
-- döngüsüne takılmasın)
CREATE OR REPLACE FUNCTION current_user_org_ids()
RETURNS SETOF UUID AS $$
  SELECT org_id FROM org_members WHERE user_id = auth.uid()
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- ─── Politikalar ─────────────────────────────────────────────────────────────

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY orgs_select ON organizations FOR SELECT USING (id IN (SELECT current_user_org_ids()));
CREATE POLICY orgs_write ON organizations FOR UPDATE USING (id IN (SELECT current_user_org_ids())) WITH CHECK (id IN (SELECT current_user_org_ids()));
-- INSERT/DELETE yalnızca create_organization / hesap silme RPC'leriyle.

ALTER TABLE org_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_members_select ON org_members FOR SELECT USING (user_id = auth.uid() OR org_id IN (SELECT current_user_org_ids()));
CREATE POLICY org_members_delete ON org_members FOR DELETE USING (org_id IN (SELECT current_user_org_ids()));
-- INSERT yalnızca create_organization / join_organization üzerinden (RPC).

ALTER TABLE org_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_invites_select ON org_invites FOR SELECT USING (org_id IN (SELECT current_user_org_ids()));
CREATE POLICY org_invites_delete ON org_invites FOR DELETE USING (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_all ON departments FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE schedule_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY schedule_days_all ON schedule_days FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_events_all ON calendar_events FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_all ON employees FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE employee_salaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY employee_salaries_all ON employee_salaries FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_all ON attendance FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE attendance_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY attendance_days_all ON attendance_days FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE overtime ENABLE ROW LEVEL SECURITY;
CREATE POLICY overtime_all ON overtime FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE debts ENABLE ROW LEVEL SECURITY;
CREATE POLICY debts_all ON debts FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE debt_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY debt_payments_all ON debt_payments FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE leave_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY leave_adjustments_all ON leave_adjustments FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE payrolls ENABLE ROW LEVEL SECURITY;
CREATE POLICY payrolls_all ON payrolls FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE payroll_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY payroll_items_all ON payroll_items FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

ALTER TABLE salary_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY salary_payments_all ON salary_payments FOR ALL
  USING (org_id IN (SELECT current_user_org_ids()))
  WITH CHECK (org_id IN (SELECT current_user_org_ids()));

-- audit_log: tetikleyici (definer) yazar; üyeler sadece okur.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_log_select ON audit_log FOR SELECT USING (org_id IN (SELECT current_user_org_ids()));
