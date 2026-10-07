-- ==============================================================================
-- 0004 — Audit log tetikleyicileri (PLAN.md Bölüm 5, 8)
-- "kim, neyi, ne zaman değiştirdi" — maaş, borç ve puantaj tablolarında.
-- ==============================================================================

CREATE OR REPLACE FUNCTION audit_row_change() RETURNS trigger AS $$
DECLARE
  v_org UUID;
  v_row_id TEXT;
  v_diff JSONB := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_org := OLD.org_id;
    v_row_id := OLD.id::text;
    v_diff := jsonb_build_object('deleted', to_jsonb(OLD));
  ELSE
    v_org := NEW.org_id;
    v_row_id := NEW.id::text;
    IF TG_OP = 'UPDATE' THEN
      v_diff := jsonb_strip_nulls(jsonb_build_object(
        'old', (SELECT to_jsonb(OLD) - 'updated_at' - 'breakdown' - 'diff'),
        'new', (SELECT to_jsonb(NEW) - 'updated_at' - 'breakdown' - 'diff')
      ));
    END IF;
  END IF;

  INSERT INTO audit_log (org_id, user_id, table_name, row_id, action, diff)
  VALUES (v_org, auth.uid(), TG_TABLE_NAME, v_row_id, TG_OP, v_diff);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'employees', 'employee_salaries', 'attendance', 'attendance_days', 'overtime',
    'debts', 'debt_payments', 'payrolls', 'payroll_items', 'salary_payments',
    'calendar_events', 'schedule_days', 'departments', 'leave_adjustments'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON %1$s
         FOR EACH ROW EXECUTE FUNCTION audit_row_change();', t);
  END LOOP;
END $$;
