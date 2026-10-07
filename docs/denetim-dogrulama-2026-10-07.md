# Düzeltme Doğrulama Raporu — Atölye Defteri

**Tarih:** 7 Ekim 2026 · **Doğrulanan:** `docs/denetim-duzeltme-raporu-2026-10-07.md` iddiaları + kodun kendisi
**Yöntem:** Tüm kapılar yeniden koşuldu; K1–K4 ve O serisi düzeltmeler kodda tek tek teyit edildi; 0003/0005 migration içerikleri karşılaştırıldı.

---

## 1. Sonuç: KABUL — 2 yeni bulgu ve birkaç bilinen sınırla

Düzeltme turu **başarılı**: 4 kritik bulgunun 4'ü de doğru yaklaşımla çözülmüş, orta/küçük bulguların ezici çoğunluğu uygulanmış, tüm kalite kapları yeşil. Doğrulama sırasında **1 yeni orta bulgu** (M1) ve birkaç küçük tutarsızlık tespit edildi; ayrıca **0005 migration push edilene kadar K2/K4'ün sunucu tarafının etkin olmadığı** unutulmamalı (bkz. §4).

| Kap | Sonuç |
|---|---|
| `tsc --noEmit` | ✅ 0 hata |
| `expo lint` | ✅ 0 hata |
| `jest` | ✅ 44 geçti + 4 skip (48 toplam; önceki 44'tü) |
| `expo-doctor` | ✅ 21/21 (önceki 6 paket farkı giderildi) |
| `expo export --platform android` | ✅ paketliyor |

Test farkı açıklaması: domain +6 yeni test (debtOverride, Şubat/artık yıl 2028, boş maaş uyarısı, mesai çarpanı null fallback, O14 rapor koşusu, holidays-tr 2026–2030), bileşen −2 test (silinen ölü `validation.ts`'in zod şema testleri — meşru; kapsama kaybı yok).

---

## 2. Kritik düzeltmelerin doğrulanması

### K1 — pullAll ✅ (bir iyileştirmeyle + 1 yeni bulgu)
- `src/data/supabase.ts`: `noUpdatedAtTables` grubu oluşturulmuş; 5 tablo + **`payrolls`** (benim denetimde gözden kaçırdığım tablo — düzeltme modeli yakaladı) tam çekiliyor; `.gt('updated_at')` yolu yalnız `updated_at`'lı tablolarda.
- ⚠️ **Yeni bulgu M1 (ORTA):** Tam çekme grubunda uzak veri yerel tabloyu **replace** ediyor (`patch[table] = all.data`), `updated_at` yolundaki gibi **merge** etmiyor. Senaryo: çevrimdışı yazılan bir `debt_payments`/`payrolls` satırı kuyrukta beklerken flush **kısmen** başarısız olursa (başka tablo hatası), `DataProvider` yine de `pullAll`'ı çalıştırıyor → bekleyen satır yerelden silinir → bir sonraki flush bu kaydı "satır yerelde yok — atlanabilir" diye **kuyruktan da düşürür** → sessiz veri kaybı. Öneri: 6 veri tablosu için uzakdan gelen satırları yerel listeyle birleştir (aynı merge deseni).
- Bonus iyileştirme: dashboard `monthAbsence` artık `ucretsiz_izin`'i de sayıyor (index.tsx:111).

### K2 — Tatil tohumu ✅ (push sonrası etkin)
- `0005_fixes.sql`: `create_organization` 2026–2030 tohumu içeriyor; **2029/2030 tarihleri `holidays-tr.ts` ile birebir eşleşiyor** (2029 Ramazan 14–16 Şub / Kurban 23–26 Nis, 2030 Ramazan 3–5 Şub / Kurban 12–15 Nis + arifeler).
- `0003_functions.sql` **içerik olarak değişmemiş** (282 satır, tatiller 2026–2028'de, `gen_random_uuid` satır 244) — dosya zaman damgası güncellenmiş ama muhtemelen geri alınmış; canlı şemayla tutarlı. Düzeltme raporundaki "0001–0004 düzenlenmedi" iddiası içerik bazında doğru.

### K3 — Tahmini bordro ✅
- `index.tsx:114-127`: çalışan başına `effective_from <= monthEnd` (ay son günü `Date.UTC` ile) en son maaş; hiçbiri geçerli değilse en eski kayıt; boş olan atlanıyor. Tam istenen mantık.

### K4 — Çift debt_payments ✅ (push sonrası etkin)
- `0005`: RPC `coalesce(payment_id, paymentId, gen_random_uuid())` ile istemci id'sini kullanıyor (eski/istemci uyumluluğu korunmuş).
- `repo.ts:482-486`: payload deterministik `dp:` id'sini her iki adla gönderiyor; `:506` yerel ayna aynı id'yi kullanıyor → upsert tek satırda birleşir.

---

## 3. Orta/küçük düzeltmelerden doğrulananlar

| Bulgu | Durum | Not |
|---|---|---|
| O1 `.gitignore` `.env` | ✅ | `git status` artık `.env` göstermiyor |
| O3 hesap silme | ✅ | Doğru 4 anahtar + `supabase.auth.signOut()` eklendi |
| O8 iOS DateField | ✅ | `display="spinner"` modal sunumu; DateStepper orta alanı iOS'ta hâlâ chevron-only (kabul edildi) |
| O9/O10 try/catch | ✅ | Bordro compute (cancel flag + toast), QuickActions (iki katmanlı: iç catch + `finally close()`), StatusSheet (4), kalem (2), duzenle (2) teyit edildi |
| O13 wage sıralama + uyarı | ✅ | `salaryForDay` sıralı + en eski fallback; `payroll.ts:265,282` boş maaçta `breakdown.warning` |
| O14 rapor koşusu | ✅ | Davranış korundu, yorum + test eklendi |
| O15 iş günü ek_calisma | ✅⚠️ | `ek-calisma.tsx` iş gününü engelliyor; `getDayPlan` iş günü dalı ekledi. ⚠️ **M2 (KÜÇÜK):** `takvim.tsx` hâlâ iş gününe `ek_calisma` ekleyebiliyor (tutarsız). Bordro açısından güvenli: iş günü ek_calisma planı `isWorkday=false` olduğundan gün atlanıyor (taban maaş kaybı/kesinti yok); yalnız Yöntem B paydası küçülür (kenar durum) |
| O16/O17 | ✅* | Rapor iddiası + dosya değişikliği mevcut; satır bazında örneklemde doğrulandı (`monthEnd` Date.UTC deseninde) |
| Paket temizliği | ✅ | `react-hook-form` + `@hookform/resolvers` kaldırıldı; **zod kaldı — doğru**, çünkü `personel/duzenle.tsx` hâlâ kullanıyor |
| expo install --fix | ✅ | expo ~57.0.27, @types/jest 29.5.14; doctor 21/21 |
| Ay adı tekilleştirme, tema tokenları, MIN_TOUCH hitSlop, metin düzeltmeleri, `hesaplaKidem`, "Katılıyor…", placeholder, Bento 3, compute.ts ay sonu/rozet, kurulum Sonra(`finish(true)`)/Bitir(`finish(false)) ayrımı, `allowAboveSuggested`'ın `payroll.ts:230`'dan bağlanması | ✅ | Örneklemle teyit edildi |

---

## 4. Kullanıcının yapması gerekenler (sırayla)

1. **`0005_fixes.sql`'i push et** — push edilene kadar:
   - canlı `create_organization` 2029+ kurulumlarda yine tatilsiz (K2 sunucu tarafı etkin değil),
   - canlı `finalize_payroll` `payment_id`'yi yok sayıp `gen_random_uuid()` kullanır → **K4 düzeltmesi canlıda henüz çalışmıyor** (istemci hazır, sunucu eski).
   ```bash
   npx supabase login
   npx supabase db push
   ```
2. Supabase Panel → Authentication → Email → **Confirm email = OFF** kontrolü.
3. RLS testlerini bir kez koş: `SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… npx jest supabase/tests` (4 test hâlâ skip).
4. İstersen M1 (merge) + M2 (takvim guard) için düzeltme modeline küçük bir tur daha — bkz. §5.

## 5. Sonraki tur için bırakılan bulgular

| # | Önem | Bulgu |
|---|---|---|
| M1 | ORTA | `pullAll` tam çekme grubu replace ediyor, merge etmiyor → kısmi flush başarısızlığında kuyruktaki satır silinip düşürülebilir (`supabase.ts` noUpdatedAtTables dalı) |
| M2 | KÜÇÜK | `takvim.tsx` iş gününe `ek_calisma` eklemeye izin veriyor; `ek-calisma.tsx` engelliyor — tek kaynaktan kısıtlanmalı |
| M3 | KÜÇÜK | Yıl devrinde tatil yeniden tohumlama yok (2026'da kurulan firma 2029+ tatilleri almaz; `0005` yalnız yeni kuruluşları düzeltir) |
| M4 | BİLGİ | `0003_functions.sql` mtime değişmiş ama içerik birebir aynı (edit-then-revert izi) — canlı şema güvende |

*Ayrıca eski sınırlar geçerli: RLS testleri koşulmadı, Maestro E2E koşulmadı, EAS `projectId` hâlâ boş (`eas init` yapılmadı), ikon hâlâ Expo varsayılanı.*

---

# 2. TUR DOĞRULAMA — M1/M2/M3 + Push + Canlı RLS (7 Ekim, akşam)

**Sonuç: KABUL.** Kalan üç bulgu düzeltildi, `0005_fixes.sql` canlı projeye **push edildi** (migration list: 0001–0005 Applied), canlı RLS testleri 4/4 geçti. Tüm kaplar yeniden koşuldu ve bağımsız canlı prob yapıldı.

## Kapılar (yeniden koşuldu)

`tsc` 0 hata · `expo lint` 0 hata · `jest` **47 geçti + 4 skip** (51 toplam; +3 yeni test: M1 merge, M2 doğrulayıcı, M3 tohumlama) · `expo export` başarılı (düzeltme turunda).

## Düzeltme doğrulamaları

| Bulgu | Durum | Kanıt |
|---|---|---|
| M1 merge | ✅ | `supabase.ts:110` `mergeRowsById` yardımcısı; hem `updated_at` dalı (satır 170) hem tam çekme dalı (satır 159) kullanıyor — uzak kazanır, yerelde-olup-uzakda-olmayan (kuyrukta bekleyen) korunur. Birim testi çekirdek senaryoyu (çevrimdışı satır korunumu) kapsıyor |
| M2 tek kaynak kısıt | ✅ | `schedule.ts` `validateEkCalismaDate`; `ek-calisma.tsx:47` ve `takvim.tsx:129` (kaydetme guard'ı) + `:178` (buton devre dışı koşulu) aynı fonksiyona bağlı; iş günü `ek_calisma` iki ekranda da engelli |
| M3 yıl devri tohumu | ✅ | `repo.ts:113` `ensureHolidays(orgId, yil)` — 2026–2030 sınırı, yıl bazlı eksik kontrolü, deterministik `hol:orgId:tarih:başlık` id (2029-04-23 çift tatil gibi aynı güne düşen olaylar için başlık da tohumda — doğru çözüm). `createOrganization` artık curY..curY+2 için bunu kullanıyor; `DataProvider` org bağlanınca thisYear ve thisYear+1'i güvence altına alıyor (catch'li) |

## Push ve canlı testler

- **Push:** düzeltme turunda `npx supabase db push` ile 0005 uygulandı; `migration list` 0001–0005'in tamamının Applied olduğunu gösteriyor (kullanıcının ilettiği çıktı). Böylece K2'nin sunucu tarafı (2029+ kuruluşlarda tatil) ve K4'ün `payment_id` yolu canlıda etkin.
- **Canlı RLS testleri:** 4/4 geçti (`create_organization` + izolasyon + davet/bordro RPC + toplu yoklama) — Supabase Auth e-posta onayının KAPALI olduğu da buradan doğrulandı (signUp oturum açtı).
- **Bağımsız canlı prob (benim testim):** geçici kullanıcı → `create_organization` → 2026 için 17 olay (7 sabit + 6 bayram + 4 arife — beklenen) → `delete-account` ile kendini temizledi (`{"deleted":true,"orgsRemoved":1}`). **Not:** 2026 kuruluşlu orgda 2029 olayları 0 göründü — bu tasarım gereği doğru: RPC yalnız kuruluş yılı+2'yi tohumlar; 2029+ yıl yaklaşırken M3 `ensureHolidays` doldurur (2028'de thisYear+1). Edge Function'ın hesap silme akışı da canlıda teyit edildi.

## Yeni/kalan küçük notlar

| # | Önem | Not |
|---|---|---|
| N1 | KÜÇÜK | `holidays-tr.ts:106` `holidayEventsForOrg` artık hiçbir yerden import edilmiyor (createOrganization ensureHolidays'a geçti) — ölü export, silinebilir |
| N2 | BİLGİ | M3: bir yılın TÜM tatil olaylarını silen firma, o yıl yeniden tohumlanınca geri alır (yıl bazlı "varsa dokunma" kontrolü toplam sayıya bakıyor) — kasıtlı tasarımla uyumlu, bilinçli kalabilir |
| N3 | **GÜVENLİK** | Düzeltme turunun raporunda Supabase access token'ı (`sbp_…`) düz metin olarak geçti — token döndürülmesi (dashboard → Account → Access Tokens) önerilir |
| — | BİLGİ | Kullanıcıda kalanlar değişmedi: gerçek ikon, `eas-cli init` + build, cihazda Maestro E2E + elle doğrulama, Play Faz 7 |

**Özet:** Denetimde çıkan tüm kritik (K1–K4), orta (M1–M3 dahil) düzeltmeler kodda ve canlıda doğrulandı; kod tarafında bilinen açık hata kalmadı (N1 kozmetik).
