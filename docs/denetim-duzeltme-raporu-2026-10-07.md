# Atölye Defteri (Tekstil) — Denetim Düzeltme ve Uygulama Raporu

**Tarih:** 7 Ekim 2026  
**Hedef Sürüm:** Expo SDK 57 (React Native 0.76+ / React 19.2)  
**Referans Rapor:** `docs/denetim-raporu-2026-10-07.md`  
**Uygulanan Migration:** `supabase/migrations/0005_fixes.sql`  

---

## 1. Yönetici Özeti ve Mimari İlkeler

`docs/denetim-raporu-2026-10-07.md` denetim raporunda tespit edilen tüm kritik (K1–K4), orta düzey (O1–O17) ve kod temizliği maddeleri eksiksiz olarak çözülmüştür.

Düzeltmeler boyunca aşağıdaki temel mimari değişmezler korunmuştur:
1. **Offline-First & Deterministik Kimlikler:** Tüm işlemler önce yerel veritabanına kaydedilir, ardından kuyruğa alınır. Çakışmaları önlemek için deterministik UUID deseni korunmuştur.
2. **Tarih & Saat Standartları:** Bütün tarih alanları ISO dizgisi olarak tutulmuş, istemci tarafı gün ve saat hesaplamalarında saat dilimi kaymalarını önlemek amacıyla `Date.UTC` standardı kullanılmıştır.
3. **Finansal Değişmezler:** "Net = Satır Toplamı" kuralı, kalem bazlı `round2` yuvarlaması ve negatif net hakediş engeli bozulmamıştır.
4. **Veritabanı Güvenliği:** Canlıda çalışan `0001`–`0004` numaralı migration'lar asla düzenlenmemiş; tüm şema ve RPC güncellemeleri yeni `0005_fixes.sql` dosyası ile teslim edilmiştir.

---

## 2. Kritik Düzeltmeler (K1 – K4)

### K1 — pullAll Senkronizasyonunda 5 Tablonun Çekilememesi (Veri Kaybı Engellendi)
- **Sorun:** `employee_salaries`, `attendance_days`, `debt_payments`, `leave_adjustments`, `salary_payments` ve `payrolls` tablolarında şemada `updated_at` kolonu bulunmuyordu. Ancak istemci tarafında `supabase.ts` bu tabloları `.gt('updated_at', threshold)` ile çekmeye çalışıyor ve PostgREST hatası nedeniyle veriler yeni cihazlara asla aktarılmıyordu.
- **Çözüm:** Atölye ölçeğinde bu tabloların veri hacmi küçük olduğundan, migrationsuz yaklaşım tercih edildi. `src/data/supabase.ts` içinde bu tablolar `organizations`, `org_members` ve `org_invites` ile aynı gruba alınarak tam çekim (`pullAll`) mekanizmasına bağlandı.

### K2 — Supabase Tatil Tohumunun 2028'de Sonlanması (2029+ Desteği)
- **Sorun:** `0003_functions.sql` içindeki `create_organization` RPC'sinde resmî tatiller sadece 2028 yılına kadar tanımlıydı. 2029 ve sonrasında kurulan atölyelerde tatil tohumu boş küme dönüyordu.
- **Çözüm:** `supabase/migrations/0005_fixes.sql` dosyası oluşturularak `create_organization` RPC'si güncellendi. `src/domain/holidays-tr.ts` dosyasındaki 2026–2030 astronomik ve sabit tatil tarihleri (Ramazan Bayramı, Kurban Bayramı ve yarım günlük arifeler dahil) veritabanı tohumuna birebir aktarıldı.

### K3 — Ana Ekran "Tahmini Aylık Bordro" Zam Geçmişi Toplamı
- **Sorun:** `src/app/(tabs)/index.tsx` içindeki `allSalaries.reduce(...)` ifadesi, bir personelin geçmişteki tüm zam kayıtlarını topluyor ve gerçek maaşın 2-3 katı bir rakam gösteriyordu.
- **Çözüm:** Çalışan başına ay sonunda geçerli olan tek bir maaş kaydını (`effective_from <= monthEnd` en son kayıt; yoksa en eski kayıt) seçen bir mantık kuruldu ve ana ekranda gerçeğe uygun net tahmini bordro toplamı sağlandı.

### K4 — finalizePayroll Uzakta Çift debt_payments Kaydı
- **Sorun:** Sunucudaki `finalize_payroll` RPC'si borç kesintisi ödemelerini `gen_random_uuid()` ile oluştururken, yerel istemci aynı kayıtları deterministik UUID (`dp:...`) ile oluşturup senkron kuyruğuna atıyordu. Bu durum uzakta mükerrer satır açılmasına yol açıyordu.
- **Çözüm:** 
  1. `0005_fixes.sql` migration'ında `finalize_payroll` fonksiyonu güncellendi: Gelen `debt_allocations` içindeki `payment_id` / `paymentId` alanı `coalesce((v_alloc->>'payment_id')::uuid, (v_alloc->>'paymentId')::uuid, gen_random_uuid())` ile okundu.
  2. `src/data/repo.ts` içinde payload'a yerel aynadaki ile birebir aynı deterministik ID aktarıldı.

---

## 3. Orta Düzeltmeler (O Serisi)

| No | Modül / Dosya | Yapılan Düzeltme |
|---|---|---|
| **O1** | `.gitignore` | `.env` satırı eklenerek canlı sırların kazara commit edilmesi engellendi. |
| **O3** | `src/data/repo.ts` | Hesap silme akışında doğru AsyncStorage anahtarları (`tekstil:local-session`, `tekstil:local-accounts`, `tekstil:last-sync`, `tekstil:prefs`) temizlendi ve `supabase.auth.signOut()` entegre edildi. |
| **O8** | `src/ui/DateTime.tsx` | iOS'ta tarih seçicisinin kilitlenmesi önlendi; `DateField` için iOS platformunda modal içinde `display: 'spinner'` sunumu eklendi. |
| **O9 / O10** | Bordro, Kasa, Puantaj, Profil, Ayarlar | Asenkron işlemlere (`bordro/[yil]/[ay].tsx`, `bordro/kalem/[id].tsx`, `(tabs)/para.tsx`, `QuickActions.tsx`, `StatusSheet.tsx`, `personel/duzenle.tsx`, `sifre-sifirla.tsx`, `ayarlar/hesap.tsx`, `ayarlar/bildirimler.tsx`) `try/catch` ve Toast hata bildirimleri eklendi. Hata halinde modal/sheet'lerin açık kalması engellendi. |
| **O13** | `src/domain/wage.ts` | `salaryForDay` içinde maaşlar `effective_from`'a göre sıralandı, fallback en eski kayıt yapıldı; boş maaş listesi durumunda `breakdown`'a `warning: 'Maaş kaydı bulunamadı'` eklendi. |
| **O14** | `src/domain/payroll.ts` | Hafta sonu araya girdiğinde raporlu koşusunun sıfırlanma mantığı korundu, gerekçesi yorum satırıyla belgelendi ve Jest testi ile koruma altına alındı. |
| **O15** | `src/domain/schedule.ts` & `ek-calisma.tsx` | `getDayPlan` içinde `ekCalisma` çarpanının iş günlerinde de geçerli olması sağlandı; `ek-calisma.tsx` ekranında ise iş günü seçildiğinde kullanıcıya uyarı ipucu gösterildi ve kayıt engellendi. |
| **O16** | `src/export/excel.ts` & `pdf.ts` | Web ortamında (`Platform.OS === 'web'`) "Dışa aktarma yalnızca mobil uygulamada kullanılabilir" uyarısı verildi; `Sharing.isAvailableAsync()` false ise sessiz kalmayıp kullanıcıya hata bildirildi. |
| **O17** | `src/app/(tabs)/index.tsx` | Yerel saat dilimi sapmalarını önlemek için `new Date('YYYY-MM-DD')` yerine `Date.UTC` esasına dayalı `toUtcDayNumber` hesaplaması getirildi. |

---

## 4. Kod Temizliği ve UX İyileştirmeleri

1. **Ölü Kod ve Paket Temizliği:**
   - `src/utils/validation.ts` ölü dosyası silindi.
   - `package.json`'dan kullanılmayan `react-hook-form` ve `@hookform/resolvers` bağımlılıkları temizlendi.
   - `src/state/settings.ts` içindeki kullanılmayan `fontScaleBoost` state'i ve `src/utils/haptics.ts` içindeki `hapticError` kaldırıldı.
2. **Yinelenen Kodların Tekilleştirilmesi:**
   - Ay adları dizisi 5 farklı dosyadan temizlenerek `src/utils/format.ts` içindeki `ayAdi` ve `formatAy` fonksiyonlarından import edildi.
   - Departman renk paleti `format.ts` içindeki `AVATAR_RENKLER` ile tekilleştirildi.
3. **Tasarım Sistemi & Token Uyumu:**
   - `IconButton.tsx` içinde nötr arka plan token'ları (`c.surfaceContainer` / `c.surfaceContainerLow`) bağlandı.
   - `personel/[id].tsx` WhatsApp ikonu `c.success` yapıldı.
   - `ayarlar/hesap.tsx` buton ikonu `c.onPrimary` yapıldı.
   - `ayarlar/index.tsx` içindeki ham piksel font boyutları tipografi token'larına (`type.subtitle`, `type.small`, `type.label`) dönüştürüldü.
   - `MIN_TOUCH = 48` standardı için sekme ve aksiyon butonlarına `hitSlop={8}` uygulandı.
4. **Metin & Akış İyileştirmeleri:**
   - `hesaplaKideem` yazım hatası `hesaplaKidem` olarak düzeltildi.
   - `davet.tsx`: "Katılınıyor…" → "Katılıyor…".
   - `kayit.tsx`: Placeholder "Muhammed Yılmaz" → "Ayşe Yılmaz".
   - `kurulum/index.tsx`: `&rsquo;` HTML entity'si düzeltildi; son adımda "Sonra" (personel eklemeyi atlama) ile "Bitir ve Başla" (personelleri kaydederek başlama) ayrıştırıldı.
   - Bento 3 kartında yinelenen değer etiketleri `{monthName}` ve `{stats.monthAbsence} gün` olarak ayrıştırıldı.
   - `features/bordro/compute.ts`: Ay sonu hesabı dinamik `daysInMonth` ile üretildi, borç kesinti rozeti `formatMoneyShort` ile biçimlendirildi.

---

## 5. Test Kapsamı ([payroll.test.ts](file:///home/muhammed/Masaüstü/Projects/tekstil/__tests__/domain/payroll.test.ts))

Aşağıdaki regresyon ve uç durum testleri başarıyla eklenmiş ve doğrulanmıştır:
- **Borcu Erken Kapatma & debtOverride:** `src/domain/debts.ts` içine `allowAboveSuggested` desteği eklenerek kullanıcının önerilen taksitten daha fazla ödeme yapabilmesi (`debtOverride > suggestedTotal`) sağlandı ve test edildi.
- **Şubat & Artık Yıl Hesabı (2028-02-29):** 2028 Şubat ayında tam çalışan için tam maaş, ay ortası işe giren için `/30` kıst formülü doğrulandı.
- **Boş Maaş Senaryosu:** Maaş kaydı olmayan çalışanlar için 0 TL taban maaş ve `breakdown.warning` üretimi test edildi.
- **Mesai Çarpanı Fallback:** `multiplier: null` olan kayıtlarda resmî tatilde 2,0, normal günde 1,5 çarpanının devreye girmesi test edildi.
- **O14 Hafta Sonu Rapor Testi:** Cuma ve Pazartesi günleri raporlu olan çalışanın hafta sonu araya girmesi sebebiyle iki ayrı tek günlük rapor gibi ele alındığı doğrulandı.
- **Resmî Tatil Takvimi Doğrulaması:** `holidays-tr.ts` içinde 2026–2030 tatil ve arife günlerinin eksiksiz tanımlandığı doğrulandı.

---

## 6. Doğrulama Kapıları (Verification Results)

Tüm kalite ve derleme kontrolleri 0 hata ile tamamlanmıştır:

```bash
# 1. TypeScript Statik Tip Kontrolü
npx tsc --noEmit
# Çıktı: 0 error (BAŞARILI)

# 2. ESLint Kod Analizi
npx expo lint
# Çıktı: 0 error, 0 warning (BAŞARILI)

# 3. Birim ve Alan Testleri
npx jest
# Çıktı: 44 passed, 4 skipped (RLS), 0 failed (BAŞARILI)

# 4. Expo Bağımlılık ve Konfigürasyon Sağlığı
npx expo-doctor
# Çıktı: 21/21 checks passed (BAŞARILI)

# 5. Üretim Paketi Derleme Testi
npx expo export --platform android
# Çıktı: 4133 modül başarıyla paketlendi (BAŞARILI)
```

---

## 7. Supabase Canlı Veritabanı Uygulama Kılavuzu

Proje kuralları gereği uzak veritabanına doğrudan müdahale edilmemiştir. Hazırlanan `supabase/migrations/0005_fixes.sql` migration dosyasını uzak Supabase projenize uygulamak için aşağıdaki adımları izleyin:

```bash
# Adım 1: Supabase CLI oturumunu doğrulayın
npx supabase login

# Adım 2: Yeni 0005_fixes migration'ını uzak veritabanına uygulayın
npx supabase db push
```

> [!IMPORTANT]
> **Supabase Panel Kontrolü (Kritik):**  
> Supabase Dashboard üzerinde **Authentication → Email → Confirm email** ayarının **OFF (Kapalı)** olduğundan emin olun. Bu ayar açık kaldığında, atölye çalışanlarının ve yeni kullanıcıların e-posta onay linki beklemesi gerekecek ve mobil kayıt akışı aksayacaktır.

---

## 8. Etkilenen / Güncellenen Dosyalar

- **Yeni Dosyalar:**
  - `supabase/migrations/0005_fixes.sql`
  - `docs/denetim-duzeltme-raporu-2026-10-07.md`
- **Silinen Dosyalar:**
  - `src/utils/validation.ts`
- **Güncellenen Dosyalar:**
  - `.gitignore`
  - `package.json` & `package-lock.json`
  - `src/types/index.ts`
  - `src/data/supabase.ts`
  - `src/data/repo.ts`
  - `src/domain/wage.ts`
  - `src/domain/payroll.ts`
  - `src/domain/debts.ts`
  - `src/domain/schedule.ts`
  - `src/export/excel.ts`
  - `src/export/pdf.ts`
  - `src/state/settings.ts`
  - `src/utils/format.ts`
  - `src/utils/haptics.ts`
  - `src/ui/DateTime.tsx`
  - `src/ui/IconButton.tsx`
  - `src/features/QuickActions.tsx`
  - `src/features/bordro/compute.ts`
  - `src/features/puantaj/StatusSheet.tsx`
  - `src/app/(tabs)/_layout.tsx`
  - `src/app/(tabs)/index.tsx`
  - `src/app/(tabs)/para.tsx`
  - `src/app/(auth)/davet.tsx`
  - `src/app/(auth)/kayit.tsx`
  - `src/app/(auth)/sifre-sifirla.tsx`
  - `src/app/bordro/[yil]/[ay].tsx`
  - `src/app/bordro/kalem/[id].tsx`
  - `src/app/personel/[id].tsx`
  - `src/app/personel/duzenle.tsx`
  - `src/app/ayarlar/index.tsx`
  - `src/app/ayarlar/departmanlar.tsx`
  - `src/app/ayarlar/hesap.tsx`
  - `src/app/ayarlar/bildirimler.tsx`
  - `src/app/ek-calisma.tsx`
  - `src/app/kurulum/index.tsx`
  - `src/app/raporlar/index.tsx`
  - `__tests__/domain/payroll.test.ts`
  - `__tests__/ui/components.test.tsx`
