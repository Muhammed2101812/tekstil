# Kapsamlı Denetim Raporu — Atölye Defteri (Tekstil)

**Tarih:** 7 Ekim 2026 · **Kapsam:** Tüm kod tabanı (~14.000 satır kaynak + 727 satır SQL), yapılandırma, Supabase canlı projesi, test/derleme kontrolleri.

---

## 1. Genel Değerlendirme

Proje **büyük ölçüde bitmiş ve sağlam durumda**: tip kontrolü, lint, birim testler ve paketleme tamamen temiz; Supabase projesi canlı, bağlanmış, migration'lar ve Edge Function uygulanmış. Ancak "her şey bitti" denemez — senkron katmanında **yeni cihaza geçişi bozan 1 kritik hata**, canlıda **yanlış para gösteren 1 kritik hesap hatası** ve **uzakta sessiz veri kaybına yol açan 2 kritik tasarım hatası** bulundu. Play'e çıkmadan önce bunların ve aşağıdaki orta bulguların düzeltilmesi gerekir.

| Alan | Durum |
|---|---|
| Tip kontrolü (`tsc --noEmit`) | ✅ 0 hata |
| Lint (`expo lint`) | ✅ 0 hata |
| Birim testler (`jest`) | ✅ 40 geçti / 4 skip (skip = uzak Supabase RLS testleri, bilinçli) |
| Paketleme (`expo export --platform android`) | ✅ 9,7 MB Hermes bundle |
| `expo-doctor` | ⚠️ 6 paket sürüm farkı (bkz. §6) |
| Supabase projesi (`rocnibznifkudlsqtatj`) | ✅ Canlı, link edilmiş |
| Şema + RLS + RPC (0001–0003) | ✅ Uzakta doğrulandı (canlı REST/RPC testleriyle) |
| Audit trigger'ları (0004) | ⚠️ Uzakta REST ile doğrulanamadı; `supabase migration list` ile teyit edilmeli |
| Edge Function `delete-account` | ✅ Deploy edilmiş, canlı test edildi (401 + doğru hata mesajı) |
| EAS | ❌ `app.json` → `extra.eas.projectId` boş — `eas init` hiç çalıştırılmamış (Faz 7 başlamamış) |

---

## 2. KRİTİK Bulgular (4)

### K1. `pullAll` — 5 tablo yeni cihaza **asla çekilemiyor** (veri kaybı)

`src/data/supabase.ts:125` şu 5 tabloyu `.gt('updated_at', threshold)` ile sorguluyor: **`employee_salaries`, `attendance_days`, `debt_payments`, `leave_adjustments`, `salary_payments`**. Ancak `supabase/migrations/0001_schema.sql`'da bu tablolarda `updated_at` kolonu **yok** (çoğunda yalnızca `created_at` var; `leave_adjustments`'ta hiç zaman damgası yok).

Sonuç: PostgREST bu sorgulara "column does not exist" hatası döner; `if (error || !data) continue;` (satır 126) hatayı **sessizce yutar**. Bu tablolar push ile uzakda durur ama **pull ile asla geri gelmez**. Yeni telefona kurulum / hesap geri yükleme senaryosunda **maaş geçmişi, taksit tahsilatları, maaş ödemeleri, izin düzeltmeleri ve yoklama onayları kaybolur**.

**Çözüm önerisi:** Bu 5 tabloyu `organizations/org_members/org_invites` gibi "updated_at yok → tam çek" grubuna alma (satır 127-135'teki desen zaten var), ya da şemaya `updated_at + trigger` ekleyen 0005 migration'ı yazıp mevcut satırları backfill etme.

### K2. Supabase tatil tohumu 2028'de bitiyor — 2029+ kurulumlarında **sessiz sıfır tatil**

- `supabase/migrations/0003_functions.sql:42-79`: `create_organization` RPC'si tatil verisini **2026–2028'e kadar hardcoded** tutuyor ve `WHERE year BETWEEN v_year AND v_year+2` filtresi uyguluyor. 2029'da bu fonksiyonla kurulan her firmaya **hiç tatil eklenmez** — filtre boş küme döndürür, hata da vermez.
- İstemci tarafı gömülü tablo (`src/domain/holidays-tr.ts`) 2026–2030'u kapsıyor → **istemci (cihaz modu) ile sunucu (Supabase modu) verisi tutarsız**.
- Ek olarak tohum yalnızca kuruluş anında çalışır (`src/data/repo.ts:99`: kuruluş yılı .. +2); yıl devrinde yenilenmez → 2026'da kurulan firmanın 2029'u her iki modda da risk altında.

**Çözüm önerisi:** RPC'yi istemciden aldığı tatil listesiyle çalıştır ya da 2029–2031 satırlarını ekleyip `0003`'ü güncelle; ayrıca ay/year devrinde "eksik tatil yılı" kontrolü ekle.

### K3. Ana ekran "Tahmini Aylık Bordro" tüm zam geçmişini topluyor (yanlış para gösterimi — eski hatanın nüksü)

`src/app/(tabs)/index.tsx:113`:
```ts
const estimatedPayroll = allSalaries.reduce((sum, s) => sum + s.amount, 0);
```
`useAllSalaries()` (`src/data/hooks.ts:89-93`) `employee_salaries` tablosunun **tüm satırlarını** döndürür. Her zam yeni satır eklediği için (`addSalaryRaise`, `repo.ts:216`) 2 kez zam yapmış çalışan bordro toplamına **3 kez** yansır. 10 çalışanlı atölyede gösterilen "tahmini bordro" gerçeğin 2–3 katı olabilir.

**Çözüm önerisi:** Çalışan başına `effective_from`'u en geç ve o ay geçerli olan tek maaşı al (bordro motorundaki `salaryForDay` mantığının ay-ortası günü sürümü), sonra topla.

### K4. `finalizePayroll` — uzak tabloda **çift taksit kaydı** riski

`src/data/repo.ts:456-508` (Supabase modunda):
1. RPC `finalize_payroll` sunucuda `debt_payments` satırlarını `gen_random_uuid()` ile oluşturur (`0003_functions.sql:242-247`).
2. Aynı fonksiyon ardından istemcide **aynı ödemeleri** `deterministicUuid("dp:...")` id'leriyle oluşturup `upsert(..., enqueue=true)` ile **senkron kuyruğa** ekler.
3. Kuyruk boşalınca bu satırlar farklı id'lerle uzakda ikinci kez **insert** edilir (`onConflict: 'id'` farklı id'yi birleştiremez) → **uzakda her taksit tahsilatı 2 satır** olur.

Bugün bunu kimse görmüyor çünkü K1 yüzünden `debt_payments` pull ile geri gelmiyor — iki hata birbirini maskeliyor. K1 düzelince uzakdan gelen çift satırlar borç bakiyelerini **yanlış kapalı** gösterecek.

**Çözüm önerisi:** RPC'nin istemci ürettiği id'leri kullanması (`debt_allocations` içine `payment_id` ekle) **veya** istemcinin RPC sonrası `debt_payments` aynalamasını durdurup `pullAll`'a emanet etmesi (K1 ile birlikte).

---

## 3. ORTA Bulgular

### 3.1 Senkron / veri güvenliği

| # | Konum | Bulgu |
|---|---|---|
| O1 | `.gitignore` | `.env` ignore listesinde **değil** (yalnızca `.env*.local` var). Commit edilirse Supabase URL + anon key repoya girer. Anon key gizli değil ama yine de eklenmeli. |
| O2 | `src/data/supabase.ts:21-27` | Supabase oturumu **AsyncStorage**'da; PLAN §8 "telefonun güvenli deposunda saklanır" diyor → `expo-secure-store` (LargeSecureStore deseni) kullanılmalı ya da plan revize edilmeli. |
| O3 | `src/data/repo.ts:631` | `deleteAccountEverywhere` **yanlış anahtarları** siliyor: `'tekstil:local-auth'` diye anahtar yok; doğrusu `tekstil:local-session` + `tekstil:local-accounts` (`auth.tsx:34-35`). Ayrıca Supabase modunda `supabase.auth.signOut()` çağrılmıyor → hesap uzakda silinse de cihazdaki oturum açık kalır. |
| O4 | `0003_functions.sql:147, 92-93` | `upsert_attendance_bulk` ve `create_invite`, kullanıcının org'ünü `ORDER BY created_at LIMIT 1` ile seçiyor — çok firmalı kullanıcıda yanlış firmaya yazma riski. (Tek firmalı hedef kitlede bugün zararsız; `p_org_id` parametresi eklenebilir.) |
| O5 | `0003_functions.sql:96-99` | `create_invite` kod üretimi `EXISTS` kontrolüyle race'e açık, `code` kolonunda UNIQUE kısıt yok. Olasılık düşük (6 haneli kod, tek kullanıcılı çağrı). |
| O6 | `src/data/repo.ts` | `upsert_attendance_bulk` RPC'si **hiç kullanılmıyor** — yoklama doğrudan kuyruk upsert'iyle gidiyor (bu da idempotent, çalışıyor). Ölü yol ya kaldırılmalı ya da çevrimiçi toplu onaylamada kullanılmalı. |
| O7 | `0001_schema.sql:74` | `schedule_days.department_id` kolonu varken `UNIQUE (org_id, weekday)` kısıtı var → departman bazlı program **şemada engellenmiş**. PLAN "tek genel takvim" önerdiği için bilinçli olabilir ama kolon kafa karıştırıyor; yorumla belgelenmeli. |

### 3.2 Uygulama hataları / hata yönetimi

| # | Konum | Bulgu |
|---|---|---|
| O8 | `src/ui/DateTime.tsx:21, 84, 145` | `Platform.OS !== 'android'` guard'ları iOS/web'de tarih-saat seçiciyi **tamamen ölü** bırakıyor. En ağırı `DateField` (satır 145): iOS'ta işe giriş/doğum tarihi **hiç değiştirilemez**. (5 Ekim'de "bilinen sınır" demiştik; DateField'ın tamamen ölü olduğu netleşti — çiplerle telafi yok.) |
| O9 | `bordro/[yil]/[ay].tsx:75-91`, `bordro/kalem/[id].tsx:47-67` | compute/`ensurePayroll` çağrıları try/catch'siz → hata olursa ekran **sonsuza dek "Hesaplanıyor…"** kalır. Aynı dosyalarda `savePayrollItems`, `recordSalaryPayment`, PDF/Excel paylaş butonları da korumasız. |
| O10 | `QuickActions.tsx:106-127, 203-226`, `StatusSheet.tsx:41-60, 147-164, 236-246` | `markAttendance`/`addOvertime`/apply/bulk çağrıları catch'siz; hata olursa sheet açık kalır, unhandled rejection olur. |
| O11 | `(auth)/sifre-sifirla.tsx:13-16` | `resetPassword` catch'siz **ve e-posta alanı doğrulanmıyor** (`giris.tsx`'tekiyle tutarsız). |
| O12 | `personel/duzenle.tsx:84-107` | Foto izni reddedilince sessiz `return` (kullanıcıya sebep söylenmiyor); `save()` catch'siz. |
| O13 | `src/domain/wage.ts:26-28, 95` | `salaryForDay` fallback'i **sıralanmamış** `salaries[0]`'ı döndürüyor (tek kayıt ileri tarihliyse geçmiş ay sessizce o maaşla hesaplanır); boş maaş listesi → sessiz **0 net**, uyarı yok. |
| O14 | `src/domain/payroll.ts:146-158` | Raporlu koşusu hafta sonu/resmî tatilde bölünüyor → sonraki hafta "ilk 2 gün işveren öder" yeniden başlar. SGK pratiğinde rapor tek olaydır; yorum tartışmalı. |
| O15 | `src/domain/schedule.ts:157-162` | **İş gününe** konan `ek_calisma` olayı sessizce yok sayılıyor (yalnız tatil/hafta sonu günlerinde etkili) — kullanıcı çarpan bekler, uyarı da yok. |
| O16 | `src/export/excel.ts`, `src/export/pdf.ts` | Web'de `File/Paths` + `printToFileAsync` çalışmaz → **web'de tüm dışa aktarma kırık** (platform ayrımı yok). `Sharing.isAvailableAsync()` false ise işlem **sessizce** biter. |
| O17 | `(tabs)/index.tsx:196, 224` | `new Date('YYYY-MM-DD')` UTC gece yarısı parse'u — batı yarıküresi saat diliminde 1 gün kayma riski (projenin kendi `Date.UTC` deseni `format.ts:40`'ta var, burada kullanılmamış). |

### 3.3 Doğrulama boşlukları (test edilmemiş yollar)

- `debtOverride` yolu (`payroll.ts:225-231`) hiç test edilmiyor — override > öneri davranışı belirsiz; üstelik `allocateDebtCut` tavanı yüzünden "borcu erken kapatma" senaryosu şuan imkânsız.
- Şubat/artık yıl (2028-02-29) testi yok; boş maaş listesi senaryosu yok.
- Mesai `multiplier: null` fallback dalı hiç çalıştırılmıyor (test helper'ı hep 1,5 set ediyor).
- `holidays-tr.ts` (tatil tablosunun kendisi) ve export katmanı (excel/pdf) için hiç test yok.
- **RLS testleri hiç koşulmadı** (4 test skip): gerçek projeyle bir kez koşulmalı. Buna bağlı kritik önkoşul: Supabase **Authentication → Email → Confirm email = OFF** yapılmış olmalı — yapılmadıysa **kayıt akışı gerçek cihazda da çalışmaz** (kullanıcı e-posta onayı bekler). Bu ayar panelden kontrol edilmeli.

---

## 4. KÜÇÜK Bulgular (seçki)

**Ölü kod / ölü bağımlılık**
- `src/utils/validation.ts` **tamamen ölü** (hiçbir yerden import edilmiyor; `personel/duzenle.tsx:15-24` aynı şemayı inline kopyalamış). `react-hook-form` + `@hookform/resolvers` package.json'da duruyor ama kodda hiç kullanılmıyor → bağımlılıktan çıkarılabilir.
- Ay adı dizisi **5 yerde kopyalanmış** (`bordro/[yil]/[ay].tsx:95`, `avans-ver.tsx:180`, `para.tsx:191`, `raporlar/index.tsx:29`, `format.ts:30`); `format.ts`'in `ayAdi()`/`formatAy()` export'u ölü.
- `fontScaleBoost` ölü state (`state/settings.ts`), `hapticError` (`utils/haptics.ts:21`) kullanılmıyor, `departmanlar.tsx RENKLER` ≡ `format.ts AVATAR_RENKLER` çift tanım.

**Tema / tutarlılık**
- `IconButton.tsx:38` hardcoded `#1E242F/#F1F3FF` (token karşılığı var), `personel/[id].tsx:146` WhatsApp yeşili `#12B76A` (= `c.success`), `hesap.tsx:96` `#fff`, birkaç ölü stil rengi + ham `fontSize` değerleri.
- `MIN_TOUCH = 48` token'ı tanımlı ama **hiçbir yerde uygulanmıyor**; sekmeler/ikon butonları 40×40.

**Metin/detay**
- `personel/[id].tsx:427` `hesaplaKideem` → "Kıdem"; `davet.tsx:59` "Katılınıyor…" → "Katılıyor…"; `kayit.tsx:31` placeholder "Muhammed Yılmaz" (geliştirici adı); `kurulum/index.tsx:410` `&rsquo;` HTML entity'si; `(tabs)/index.tsx:535-540` Bento 3'te aynı değer iki kez; "Sonra" ve "Bitir ve Başla" aynı `finish`'i çağırıyor.
- `features/bordro/compute.ts:36` ay sonu `"-31"` dizgisi (Şubat'ta geçersiz ama string filtresi yüzünden bugün çalışıyor); `:108` `−{Math.round(debt_cut)} taksit` rozeti TL tutarını yuvarlıyor.
- `expo-doctor`: expo + 4 modül patch farkı, `@types/jest` major 30 → `npx expo install --fix` ile düzeltilmeli.
- Format kaymaları (virgülden önce boşluk vb.) 5 dosyada — Prettier bir kez çalıştırılmalı.

---

## 5. Temiz / Doğrulanmış Alanlar

- **SQL migration'lar kaliteli:** RLS her tabloda etkin ve `SECURITY DEFINER` yardımcı fonksiyonla döngüsüz; `finalize_payroll` satır kilidi + üyelik + durum kontrolüyle gerçekten atomik; davet kodu `FOR UPDATE` ile race korumalı; idempotency (`client_ref UNIQUE`, deterministik UUID'ler) PLAN'a uygun.
- **Canlı doğrulama:** 9 tablonun varlığı REST üzerinden, 6 RPC'nin varlığı ve doğru hata mesajları (`"Giriş yapılmadı"`, `"Bordro bulunamadı veya yetkiniz yok"`…) anon isteklerle teyit edildi; `delete-account` Edge Function deploy edilmiş ve çalışıyor.
- **Bordro motoru:** PLAN 14.1'deki 17 hesap senaryosunun tamamı testli; kuruş tutarlılığı ("net = satır toplamı") garantili; tarihler her yerde ISO string + `Date.UTC` (PLAN kuralına tam uyum); mesai çarpanları (1,5/2,0) ve izin eşikleri (İş K. md. 53) doğru.
- **2026–2027 tatil tarihleri** Diyanet takvimiyle doğrulandı (Ramazan 20-22 Mart 2026, Kurban 27-30 Mayıs 2026 vb.).
- **Ekran katmanında** TODO/console.log/sahte veri yok; `_layout.tsx`, `borc/[id].tsx`, ayarlar ekranlarının çoğu, UI bileşen kütüphanesi, `notifications.ts` ve `haptics.ts` temiz.
- **Kütüphane seçimi** SDK 57 ile uyumlu; jest/lint/tsc yapılandırmaları sağlam.

---

## 6. Bilinçli Tasarım Kararları (hata değil)

- **SGK işçi/işveren primi, damga vergisi, işsizlik, gelir vergisi, asgari ücret kontrolü YOK** — PLAN §1 "kapsam dışı (bilerek)" diyor; PDF pusulada "yasal bordro değildir" feragati var. Uygulama **net ödeme takibidir**.
- Puantajda işaretsiz günün "Geldi" sayılması UI'da açıkça belirtiliyor (soluk rozet + ipucu).
- iOS tarih seçicisi eksikliği kısmen bilinçliydi (Android öncelik) — ancak O8'deki `DateField` tamamen ölü kalması bilinçli tasarım değil.
- `placeholder.supabase.co` fallback'i yanıltıcı görünse de `isSupabaseConfigured=false` iken istek atılmıyor (zararsız).

---

## 7. Kod Dışı Bekleyen İşler (sırayla)

1. **Supabase Auth ayarı:** Authentication → Providers → Email → **Confirm email = OFF** (kayıt akışının çalışması için zorunlu; RLS testleri de bunu gerektirir).
2. **RLS testlerini bir kez koş:** `SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… npx jest supabase/tests`
3. **Audit trigger teyidi:** `npx supabase login && npx supabase migration list` (0004'ün uygulandığını gör).
4. `.gitignore`'a `.env` ekle (O1) — dosyayı elle düzelt.
5. `npx expo install --fix` (6 paket) + Prettier geçişi.
6. Gerçek ikon/feature graphic (şu an Expo varsayılanı).
7. `npx eas-cli init` → projectId'yi doldur; ardından `eas build --profile preview` (iç test APK).
8. Cihazda Maestro E2E (`.maestro/` 3 akış) + PLAN 14.2 elle doğrulama senaryosu (10 çalışan, karışık puantaj, elle hesapla karşılaştırma).
9. Play çıkış kontrol listesi (PLAN Faz 7): gizlilik politikası, veri güvenliği formu, kapalı test.

Not: Yerelde `android/` native klasörü oluşmuş (`expo run:android` ile) — artık CNG "sync" modunda yönetiliyor; `app.json`'da kalıcı native değişiklik gerektiğinde `npx expo prebuild --clean` çalıştırılmalı.

---

## 8. Önerilen Düzeltme Sırası (kod)

1. **K1** (pullAll tablo listesi) — 30 dakikalık düzeltme, veri kaybını keser.
2. **K4** (finalizePayroll çift kayıt) — K1 ile birlikte ele al.
3. **K3** (dashboard maaş toplamı) — tek seçici düzeltmesi.
4. **O3** (hesap silme anahtarları + signOut) — Play zorunluluğu olan akışın düzgünlüğü.
5. **O8/O9/O10** (iOS DateField + try/catch dalgası) — kullanıcı deneyimi.
6. **K2** (tatil tohumu 2029+) — 2028 sonuna kadar vakti var ama şimdi yazılması 10 dakika.
7. Kalan orta/küçük bulgular temizlik turunda (Ölü `validation.ts` + `react-hook-form` bağımlılığının kaldırılması, ay adı tekilleştirme, tema tokenları, Prettier).

---

*Rapor, 7 Ekim 2026'da tüm kod tabanı + canlı Supabase projesi üzerinde yapılan denetimden üretilmiştir. Bulgu referansları `dosya:satır` biçimindedir.*
