-- ==============================================================================
-- 0013 — updated_at INSERT'te de sunucu saatiyle set edilsin
-- 0001'deki trg_*_updated tetikleyicileri yalnız BEFORE UPDATE'tü; INSERT'te
-- updated_at istemci saatine kalıyordu. İstemci saati ilerideyse satır,
-- diğer cihazların gt(updated_at) artımlı çekimine KALICI olarak görünmaz
-- oluyordu. Tetikleyiciler BEFORE INSERT OR UPDATE yapılır — sunucu saati
-- tekil kaynak olur (idempotent: yeniden çalıştırılabilir).
-- ==============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT event_object_table AS tbl, trigger_name AS trg
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE 'trg_%_updated'
      AND action_timing = 'BEFORE'
      AND event_manipulation = 'UPDATE'
  LOOP
    EXECUTE format('DROP TRIGGER %I ON %I;', r.trg, r.tbl);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      r.trg, r.tbl);
  END LOOP;
END $$;
