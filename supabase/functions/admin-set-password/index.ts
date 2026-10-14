// Supabase Edge Function: Firma sahibi, şirketindeki bir kullanıcının şifresini
// sıfırlar ve kullanıcının tüm cihazlardaki oturumlarını düşürür.
// Deploy: npx supabase functions deploy admin-set-password
import { createClient } from 'jsr:@supabase/supabase-js@2';

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

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Yetkisiz erişim' }, 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    if (!serviceRoleKey) return json({ error: 'Sunucu yapılandırması eksik' }, 500);
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: 'Geçersiz oturum' }, 401);

    const { userId, newPassword } = await req.json();
    if (!userId || !newPassword || String(newPassword).length < 6) {
      return json({ error: 'Geçersiz kullanıcı veya şifre (en az 6 karakter)' }, 400);
    }

    // Caller'ın owner olduğu firma ile hedef kullanıcının firması aynı mı?
    const { data: callerMember } = await admin
      .from('org_members')
      .select('org_id')
      .eq('user_id', caller.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!callerMember) return json({ error: 'Yetkiniz yok' }, 403);

    const { data: targetMember } = await admin
      .from('org_members')
      .select('id')
      .eq('user_id', userId)
      .eq('org_id', callerMember.org_id)
      .maybeSingle();

    if (!targetMember) return json({ error: 'Kullanıcı şirketinizde bulunamadı' }, 404);

    const { error: updateErr } = await admin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (updateErr) return json({ error: updateErr.message }, 500);

    // Hedef kullanıcının tüm cihazlardaki oturumlarını düşür
    await admin.auth.admin.signOut(userId, 'global').catch(() => undefined);

    return json({ ok: true }, 200);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Sunucu hatası';
    return json({ error: msg }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
