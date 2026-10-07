// Supabase Edge Function: Hesap ve tüm firma verisini siler (Google Play zorunluluğu).
// Yalnızca geçerli JWT sahibi kendi hesabını silebilir; service_role anahtarı
// sadece sunucu tarafında (bu fonksiyonda) tutulur.
// Deploy: supabase functions deploy delete-account
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Yalnızca POST' }, 405);
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace('Bearer ', '');
  const url = Deno.env.get('SUPABASE_URL')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  // 1) Kullanıcıyı JWT ile doğrula
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userData.user) {
    return json({ error: 'Oturum bulunamadı' }, 401);
  }
  const userId = userData.user.id;

  // 2) service_role ile firma verilerini ve auth kullanıcısını sil
  const adminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!adminKey) {
    return json({ error: 'Sunucu yapılandırması eksik' }, 500);
  }
  const admin = createClient(url, adminKey);

  // Üyesi olduğu firmaların tamamı: kullanıcı tek kişilik atölyelerde tek sahiptir.
  // Çok üyeli firmada yalnızca üyelik ve kişisel verisi silinir.
  const { data: memberships } = await admin
    .from('org_members')
    .select('org_id, role, organizations(id:name)')
    .eq('user_id', userId);

  const ownedAlone: string[] = [];
  const shared: string[] = [];
  for (const m of memberships ?? []) {
    const { count } = await admin
      .from('org_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', m.org_id);
    if ((count ?? 0) <= 1) ownedAlone.push(m.org_id);
    else shared.push(m.org_id);
  }

  for (const orgId of ownedAlone) {
    await admin.from('organizations').delete().eq('id', orgId); // cascade tüm veri
  }
  for (const orgId of shared) {
    await admin.from('org_members').delete().eq('org_id', orgId).eq('user_id', userId);
  }

  await admin.auth.admin.deleteUser(userId);
  return json({ deleted: true, orgsRemoved: ownedAlone.length });

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
