# Supabase Kurulumu

Uygulama iki modda çalışır:

- **Cihaz modu:** `.env` yoksa tüm veri yalnızca telefonda (AsyncStorage) tutulur.
  Supabase kurulumu beklemeden uygulamayı denemek için idealdir.
- **Supabase modu:** `.env` doldurulunca veriler buluta yazılır; offline
  kuyruk + çift yönlü senkron devreye girer (PLAN.md Bölüm 9).

## Adımlar

1. **Projeler** — [supabase.com](https://supabase.com) üzerinde iki proje açın:
   `tekstil-dev` (geliştirme) ve `tekstil-prod` (gerçek veri).

2. **Migration'ları uygulayın** (Docker gerekmez):

   ```bash
   npx supabase login
   npx supabase link --project-ref <dev-proje-ref>
   npx supabase db push
   ```

3. **Tipleri üretin:**

   ```bash
   npx supabase gen types --lang typescript --project-ref <dev-proje-ref> \
     > src/data/supabase-types.ts
   ```

4. **Uygulama anahtarları** — kökte `.env` dosyası:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<proje-ref>.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
   ```

   Yalnızca `anon` anahtarı uygulamaya girer; `service_role` asla girmez.

5. **Auth ayarı** — dev projesinde testler için e-posta onayını kapatın
   (Authentication → Providers → Email → Confirm email = OFF).

6. **Edge Function (hesap silme):**

   ```bash
   npx supabase functions deploy delete-account
   ```

## Testler

```bash
SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… npx jest supabase/tests
```

İki ayrı kullanıcı açar; A firmasının verisini B'nin göremediğini,
`finalize_payroll` atomikliğini, geri almayı ve davet akışını doğrular.
Ortam değişkeni verilmezse bu testler otomatik atlanır.

## Notlar

- Migration sırası: `0001_schema` → `0002_rls` → `0003_functions` → `0004_audit`.
- Tüm satır `id`'leri istemcide UUID olarak üretilir; offline tekrar
  gönderimler `ON CONFLICT` ile idempotenttir (`debts.client_ref`,
  `overtime.client_ref` benzersizdir).
- Supabase `numeric` alanları dizgi döner; senkron katmanı `number`'a çevirir.
