// Supabase Edge Function: Firma sahibi (owner) doğrudan kullanıcı oluşturur.
// auth.admin.createUser service_role gerektirdiğinden bu işlem yalnızca burada
// yapılır; istemci anon anahtarla çağırır, JWT ile owner yetkisi doğrulanır.
// Güvenlik kuralı: Sahibi olduğu doğrulanmamış bir hesabın şifresi ASLA
// değiştirilmez. E-posta auth.users'ta varsa (firmasız "yetim" hesap) yalnızca
// üyelik satırı eklenir; kişi kendi mevcut şifresiyle giriş yapar. 1:1 kuralı:
// bir kullanıcı aynı anda tek firmada üye olabilir (org_members.user_id UNIQUE).
// Deploy: npx supabase functions deploy admin-create-user
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

    // 1. Caller doğrulaması (JWT)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
    if (authErr || !caller) return json({ error: 'Geçersiz oturum' }, 401);

    // 2. Payload doğrulaması
    const { name, email, password, role } = await req.json();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    const cleanName = String(name ?? '').trim();
    const cleanPassword = typeof password === 'string' ? password : '';

    // RFC 5321 pratik sınırı: yerel kısım ≤64, toplam ≤254 karakter
    const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
    if (cleanName.length < 2) return json({ error: 'Ad en az 2 karakter olmalıdır' }, 400);
    if (cleanName.length > 100) return json({ error: 'Ad en fazla 100 karakter olmalıdır' }, 400);
    if (cleanEmail.length > 254 || !EMAIL_RE.test(cleanEmail)) {
      return json({ error: 'Geçerli bir e-posta giriniz' }, 400);
    }
    if (cleanPassword.length < 6) {
      return json({ error: 'Şifre en az 6 karakter olmalıdır' }, 400);
    }
    if (cleanPassword.length > 128) {
      return json({ error: 'Şifre en fazla 128 karakter olmalıdır' }, 400);
    }
    if (role !== 'owner' && role !== 'admin') return json({ error: 'Geçersiz rol' }, 400);

    // 3. Caller'ın owner olduğu firmayı bul (1:1 kuralı → en fazla bir üyelik)
    const { data: callerMember } = await admin
      .from('org_members')
      .select('org_id, name, email')
      .eq('user_id', caller.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!callerMember) return json({ error: 'Bu işlem için Firma Sahibi yetkisi gerekiyor' }, 403);

    // Caller'ın kendi satırında name/email eksikse tamamla (liste görünürlüğü)
    if (!callerMember.name || !callerMember.email) {
      await admin.from('org_members').update({
        name: callerMember.name || (caller.user_metadata?.name as string | undefined) || caller.email?.split('@')[0],
        email: callerMember.email || caller.email,
      }).eq('user_id', caller.id).eq('org_id', callerMember.org_id);
    }

    // 4. E-posta auth.users'ta var mı?
    const { data: existingUserId } = await admin.rpc('get_user_id_by_email', { p_email: cleanEmail });

    let targetUserId: string;
    let isNewlyCreated = false;
    let existingAccount = false;

    if (existingUserId) {
      // 1:1 kontrolü: başka bir firmaya üyeyse reddet
      const { data: existingMember } = await admin
        .from('org_members')
        .select('org_id')
        .eq('user_id', existingUserId)
        .maybeSingle();

      if (existingMember) {
        return json({ error: 'Bu e-posta adresi zaten aktif bir şirkete kayıtlı' }, 422);
      }

      // Mevcut hesap: SAHİPLİĞİ DOĞRULANMADIĞI için şifre/ad ASLA değiştirilmez;
      // yalnızca üyelik satırı eklenir. Kişi kendi şifresiyle giriş yapar.
      targetUserId = existingUserId;
      existingAccount = true;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: cleanEmail,
        password: cleanPassword,
        email_confirm: true,
        user_metadata: { name: cleanName },
      });
      if (createErr || !created.user) {
        // Ham upstream hatası istemciye sızmaz — nötr Türkçe mesaj döner
        return json({ error: 'Kullanıcı hesabı açılamadı; e-posta veya şifre geçersiz olabilir.' }, 422);
      }
      targetUserId = created.user.id;
      isNewlyCreated = true;
    }

    // 5. Üyelik satırı ekle (id istemciden gelmez; şemada default yok)
    const memberId = crypto.randomUUID();
    const { error: insertErr } = await admin.from('org_members').insert({
      id: memberId,
      org_id: callerMember.org_id,
      user_id: targetUserId,
      role,
      name: cleanName,
      email: cleanEmail,
    });

    if (insertErr) {
      // Yeni açılan auth hesabını geri al (rollback); mevcut hesaba dokunulmadı
      if (isNewlyCreated) {
        await admin.auth.admin.deleteUser(targetUserId).catch(() => undefined);
      }
      return json({ error: 'Şirket üyeliği oluşturulamadı; tekrar deneyin.' }, 500);
    }

    // İstemci anında listede görsün diye satırı olduğu gibi döndür
    const { data: member } = await admin.from('org_members').select('*').eq('id', memberId).maybeSingle();
    return json({ userId: targetUserId, member, existing: existingAccount }, 200);
  } catch (_err) {
    // Beklenmeyen hata ayrıntıları (upstream mesajı, yığın izi) sızamaz
    return json({ error: 'Sunucu hatası; tekrar deneyin.' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
