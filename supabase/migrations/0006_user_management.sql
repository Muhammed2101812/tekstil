-- ==============================================================================
-- 0006 — Owner kullanıcı yönetimi: davet kodları kaldırıldı; firma sahibi
-- kullanıcıları doğrudan oluşturur (edge function admin-create-user).
-- 1:1 kuralı: bir kullanıcı aynı anda tek firmada üye olabilir.
-- ==============================================================================

-- 1. Üye satırında görünen ad/e-posta (auth.users istemciden okunamaz)
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE org_members ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. 1:1 kuralı (idempotent: constraint varsa atla)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'org_members'::regclass
      AND conname = 'org_members_user_id_key'
  ) THEN
    ALTER TABLE org_members ADD CONSTRAINT org_members_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- 3. Davet kodu altyapısını kaldır
DROP FUNCTION IF EXISTS create_invite(TEXT);
DROP FUNCTION IF EXISTS join_organization(TEXT);
DROP TABLE IF EXISTS org_invites;

-- 4. Owner yetki kontrolü (SECURITY DEFINER: RLS döngüsünü önler;
--    current_user_org_ids ile aynı pattern)
CREATE OR REPLACE FUNCTION is_org_owner(UUID) RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM org_members
    WHERE org_id = $1 AND user_id = auth.uid() AND role = 'owner'
  )
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- 5. E-posta ile auth kullanıcı bulma (yetim hesap kurtarma; yalnız service_role)
CREATE OR REPLACE FUNCTION get_user_id_by_email(p_email TEXT) RETURNS UUID AS $$
  SELECT id FROM auth.users WHERE lower(email) = lower(p_email) LIMIT 1
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_user_id_by_email(TEXT) TO service_role;

-- 6. Üye silme/güncelleme yalnızca firma sahibinde
--    (öncesinde her üye her üyeyi silebiliyordu)
DROP POLICY IF EXISTS org_members_delete ON org_members;
CREATE POLICY org_members_delete ON org_members
  FOR DELETE USING (is_org_owner(org_id));

DROP POLICY IF EXISTS org_members_update ON org_members;
CREATE POLICY org_members_update ON org_members
  FOR UPDATE USING (is_org_owner(org_id)) WITH CHECK (is_org_owner(org_id));
