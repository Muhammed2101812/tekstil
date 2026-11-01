# Mola Bildirimleri ve Geçici (Günlük/Yardımcı) Çalışan Takibi — Uygulama Planı

Bu belge, Atölye Defteri uygulamasına eklenecek iki yeni özelliğin mimari, veri modeli, ekran akışı ve teknik uygulama planını içerir. Tüm tasarım `agent.md` (Supabase-first, bellek içi store, RLS ve yedekleme) kurallarına tam uyumludur.

---

## Özellik 1: Çoklu Mola Tanımlama ve Mola Saatlerinde Bildirim

### 1.1 Mevcut Durum Analizi
- **Veri Modeli (`src/types/index.ts` & `schedule_days` tablosu):**
  - Veritabanında `schedule_days.breaks` kolonu zaten `JSONB` dizisi (`BreakTime[]`) olarak tanımlıdır:
    ```ts
    export interface BreakTime {
      name: string;   // Örn: 'Sabah Çayı', 'Öğle Yemeği', 'İkindi Molası'
      start: string;  // 'HH:mm' (Örn: '10:00')
      end: string;    // 'HH:mm' (Örn: '10:15')
      paid: boolean;  // false = ücretsiz (net saatten düşülür), true = ücretli
    }
    ```
  - Hesaplama motoru (`src/domain/schedule.ts` → `unpaidBreakMinutesWithin`) zaten birden fazla molayı desteklemektedir.
- **Eksik Olan Kısımlar:**
  1. `src/app/ayarlar/calisma-saatleri.tsx` içindeki `DayEditor` bileşeni yalnızca tek bir öğle molasını düzenlemeye izin veriyor; birden fazla mola ekleme/silme arayüzü yok.
  2. `src/utils/notifications.ts` içinde mola saatlerine göre zamanlanmış yerel bildirim (local notification) mekanizması bulunmuyor.
  3. `OrgSettings` ve `src/app/ayarlar/bildirimler.tsx` içinde mola bildirimlerini açıp kapatma / mola bitiş (iş başı) bildirimi tercihi bulunmuyor.

---

### 1.2 Hedeflenen Kullanıcı Deneyimi (UX)

#### A) Ayarlar → Çalışma Saatleri (`src/app/ayarlar/calisma-saatleri.tsx`)
1. **Sınırsız Mola Ekleme / Düzenleme / Silme:**
   - Bir iş günü düzenlenirken (`DayEditor`), mevcut tekil "Öğle Başlangıç/Bitiş" alanı yerine **"Molalar"** listesi gösterilir.
   - Kullanıcı **"+ Mola Ekle"** butonuna bastığında yeni bir mola satırı eklenir (Hızlı hazır isim önerileri: *Sabah Çayı*, *Öğle Yemeği*, *İkindi Çayı* veya serbest metin).
   - Her mola için:
     - **Mola Adı** (Örn: `Sabah Çayı`)
     - **Başlangıç – Bitiş Saati** (`TimeSheet` ile seçilir, örn. `10:00` – `10:15`)
     - **Ücretli / Ücretsiz Seçimi** (`Chip`: Ücretsiz mola seçilirse günlük net çalışma saatinden düşülür, çay molaları gibi ücretli molalar seçilirse maaş/kesinti hesabını etkilemez, yalnızca bildirim ve takvim için tutulur).
     - **Sil** ikonu (tek dokunuşla ilgili molayı kaldırır).
2. **Hızlı Kopyalama ("Tüm İş Günlerine Uygula"):**
   - Pazartesi günü için 3 mola girildiğinde diğer 4-5 iş gününe tek tek girmemek için `DayEditor` altına **"Bu saat ve molaları tüm iş günlerine uygula"** seçeneği eklenir.
3. **Gün Kartı Özeti:**
   - Gün listesinde mola sayısı ve toplam süresi özetlenir (Örn: `08:00–18:00 · 3 mola (10:00, 12:30, 15:45) · net 9 sa`).

#### B) Ayarlar → Bildirimler (`src/app/ayarlar/bildirimler.tsx`)
1. **"Mola Saatleri Bildirimi" Kartı:**
   - **Mola Başlangıç Bildirimi (Açık / Kapalı):** Mola saati geldiğinde (örn. `10:00`) *"☕ Mola Vakti: Sabah Çayı (10:00–10:15)"* bildirimi gönderir.
   - **Mola Bitiş / İş Başı Bildirimi (Açık / Kapalı):** Mola bittiğinde (örn. `10:15`) *"🔔 Mola Bitti: Sabah Çayı sona erdi, iş başı."* bildirimi gönderir.
   - Kart içinde o an çalışma takviminde tanımlı olan molaların kısa özeti gösterilir ve **"Molaları Düzenle →"** kısayolu ile doğrudan `Çalışma Saatleri` ekranına geçiş sağlanır.

---

### 1.3 Teknik Mimari ve Bildirim Zamanlama Motoru

1. **`OrgSettings` Genişletmesi (`src/types/index.ts`):**
   - `organizations.settings` JSONB alanına (veritabanı şema değişikliği gerektirmeden, geriye dönük uyumlu) iki alan eklenir:
     ```ts
     /** Mola başlangıç saatlerinde bildirim gönderilsin mi? */
     breakReminderEnabled?: boolean;
     /** Mola bitiş (iş başı) saatlerinde de bildirim gönderilsin mi? */
     breakEndReminderEnabled?: boolean;
     ```
   - `DEFAULT_SETTINGS` içinde varsayılan değerler: `breakReminderEnabled: true`, `breakEndReminderEnabled: true`.

2. **Sesli Bildirim Kanalı ve İzinler (`src/utils/notifications.ts`):**
   - Atölye ortamında mola bildiriminin duyulabilmesi için `setNotificationHandler` içinde `shouldPlaySound: true` yapılır.
   - Android için `mola-bildirimleri` adında yüksek öncelikli (`AndroidImportance.HIGH`, varsayılan ses ve titreşim açık) ayrı bir bildirim kanalı oluşturulur.

3. **Haftalık Tekrarlayan Bildirimlerin Senkronizasyonu (`syncBreakReminders`):**
   - `expo-notifications` içindeki `SchedulableTriggerInputTypes.WEEKLY` tetikleyicisi kullanılır.
   - **Kritik Gün Dönüşümü:** `ScheduleDay.weekday` değerinde `1 = Pazartesi … 7 = Pazar` iken, `expo-notifications` `WeeklyTriggerInput.weekday` alanında `1 = Pazar, 2 = Pazartesi … 7 = Cumartesi` bekler. Dönüşüm formülü:
     ```ts
     const expoWeekday = (day.weekday % 7) + 1;
     ```
   - **Temizleme ve Yeniden Kurma:**
     - `Notifications.getAllScheduledNotificationsAsync()` çağrılarak `identifier` değeri `'break-reminder-'` ile başlayan tüm eski mola bildirimleri iptal edilir.
     - `breakReminderEnabled` açıksa, `is_workday === true` olan her günün her molası (`breaks[i]`) için:
       - Başlangıç bildirimi: `id = break-reminder-${day.weekday}-${i}-start` (`hour`, `minute`)
       - `breakEndReminderEnabled` açıksa bitiş bildirimi: `id = break-reminder-${day.weekday}-${i}-end` (`hour`, `minute`)
   - **iOS 64 Bildirim Sınırı Koruması:**
     - iOS işletim sistemi uygulama başına en fazla 64 zamanlanmış yerel bildirime izin verir. Haftada 6 iş günü × günde 4 mola × 2 (başlangıç+bitiş) = 48 bildirim (yoklama ve yedek bildirimleriyle toplam 50) sınırı aşmaz; yine de güvenlik amacıyla toplam mola bildirimi sayısı 56 ile sınırlandırılır.
   - **Tetikleme Noktaları:**
     - `calisma-saatleri.tsx` içinde gün/mola kaydedildiğinde,
     - `bildirimler.tsx` içinde mola bildirimi ayarları değiştirildiğinde,
     - `DataProvider.tsx` içinde ilk senkron (`pullAll`) tamamlandığında otomatik çağrılır.

---

## Özellik 2: Devamlı Olmayan (Günlük / Geçici / Yardımcı) Çalışanların Takibi

### 2.1 Problem ve İhtiyaç Analizi
- Mevcut `employees` tablosu **sabit (kadrolu, aylık maaşlı)** personel içindir. Sabit personel her iş günü Puantaj listesine otomatik gelir, işaretlenmezse "Geldi" sayılır, yıllık izin hak eder ve aylık bordroya girer.
- Ancak tekstil atölyelerine sık sık **1 gün veya birkaç günlüğüne yardıma gelen (iplik temizleme, paketleme, ütü, yükleme vb.) geçici / yevmiyeci kişiler** olur.
- Bu kişiler sabit personel olmadığı için puantaj ve aylık bordroya dahil edilmemeli; bunun yerine **hızlı not alma, hangi günler geldiğini görme, (varsa) günlük yevmiyesini ve ödenip ödenmediğini takip etme** odaklı bağımsız bir modül kurulmalıdır.

---

### 2.2 Veri Modeli ve Veritabanı Tasarımı (`temp_work_logs`)

Her çalışma günü (veya tek seferlik yardım) bir kayıt satırı olarak tutulur. Aynı kişi birden fazla gün geldiğinde ismi üzerinden otomatik gruplanır (tıpkı `production_batches` tablosunda model adlarının gruplanması gibi).

#### A) SQL Migrasyonu (`supabase/migrations/0010_temp_work_logs.sql`)
```sql
CREATE TABLE IF NOT EXISTS temp_work_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  worker_name TEXT NOT NULL,
  phone TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  duration_type TEXT NOT NULL DEFAULT 'tam_gun'
    CHECK (duration_type IN ('tam_gun', 'yarim_gun', 'saatlik')),
  hours NUMERIC(4,2),
  task_description TEXT,
  daily_wage NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid BOOLEAN NOT NULL DEFAULT false,
  paid_at DATE,
  payment_method TEXT CHECK (payment_method IN ('nakit', 'banka')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```
- **İndeksler:**
  - `idx_temp_work_logs_org_date ON temp_work_logs(org_id, date DESC)`
  - `idx_temp_work_logs_org_worker ON temp_work_logs(org_id, worker_name)`
- **Güvenlik (RLS) ve Denetim (`agent.md` uyumu):**
  - `SELECT`, `INSERT`, `UPDATE`: `org_id IN (SELECT current_user_org_ids())` (tüm yöneticiler).
  - `DELETE`: `is_org_owner(org_id)` (yalnızca Firma Sahibi silebilir).
  - `trg_temp_work_logs_updated` (`set_updated_at`) ve `trg_audit_temp_work_logs` (`audit_row_change`) tetikleyicileri eklenir.
  - `restore_org_backup` RPC fonksiyonundaki (`0007_data_protection.sql`) tablo listelerine `production_batches` ve `temp_work_logs` dahil edilerek JSON yedek/geri yükleme tam uyumu sağlanır.

#### B) TypeScript Veri Tipi (`src/types/index.ts`)
```ts
export type TempWorkDurationType = 'tam_gun' | 'yarim_gun' | 'saatlik';

export interface TempWorkLog {
  id: string;
  org_id: string;
  worker_name: string;
  phone: string | null;
  date: string; // YYYY-MM-DD
  duration_type: TempWorkDurationType;
  hours: number | null; // 'saatlik' seçilirse
  task_description: string | null; // Örn: 'İplik temizleme', 'Paket yardımı'
  daily_wage: number; // 0 = sadece not amaçlı (ücret girilmedi)
  paid: boolean;
  paid_at: string | null;
  payment_method: SalaryPaymentMethod | null;
  note: string | null;
  created_at?: string;
  updated_at?: string;
}
```

---

### 2.3 Ekran Tasarımı ve Kullanıcı Akışları (`/gecici-calisan` & Erişim Noktaları)

#### A) Nereden Erişilecek?
1. **Hızlı İşlemler Menüsü (`➕` butonu — `src/features/QuickActions.tsx`):**
   - *"Günlük / Yardımcı Çalışan"* aksiyonu eklenir (Her ekrandan 2 dokunuşla kayıt).
2. **Personel Ekranı (`src/app/(tabs)/personel.tsx`):**
   - Üstteki `SegmentedControl` seçenekleri `Aktif` | `Günlük / Geçici` | `Ayrılanlar` olarak güncellenir (veya doğrudan liste içinden yönetim sağlanır). Böylece sabit çalışanlarla karışmadan Personel sekmesi altından da doğrudan ulaşılır.
3. **Puantaj Ekranı (`src/app/(tabs)/puantaj.tsx`):**
   - Seçili günde (`day`) kayıtlı geçici/yardımcı çalışan varsa liste üstünde bilgilendirici kompakt bir satır gösterilir: *"Bugün ayrıca 2 günlük/yardımcı çalışan not alındı · Görüntüle / Ekle"*. Sabit personelin puantaj hesabına **kesinlikle karışmaz**.

#### B) Geçici / Günlük Çalışan Ekranı (`src/app/gecici-calisan.tsx`)
Üretim ekranındaki (`uretim.tsx`) pratik yapıyla uyumlu, 2 sekmeli bir ekran:

1. **Sekme 1: Hızlı Kayıt (`Not Al / Kaydet`)**
   - **Son Gelen Kişiler (Tek Dokunuşla Seçim):**
     - Daha önce yardıma gelmiş kişilerin isimleri `Chip` olarak listelenir. Dokunulduğunda kişinin adı, en son yaptığı iş (`task_description`), telefonu ve son yevmiye tutarı otomatik doldurulur.
   - **Ad Soyad / Takma Ad:** (Örn: *"Ahmet Yılmaz"* veya *"Ayşe Abla - Paket"*).
   - **Tarih ve Çoklu Gün Desteği:**
     - Varsayılan: **Bugün**.
     - **"Birkaç gün çalıştı"** seçeneği: Kullanıcı tek gün yerine başlangıç-bitiş tarihi (veya gün sayısı, örn. Salı–Perşembe 3 gün) seçerse, seçilen her gün için kayıtlar tek seferde oluşturulur.
   - **Çalışma Süresi:** `Tam Gün` (varsayılan) · `Yarım Gün` · `Saatlik`.
   - **Yapılan İş / Not:** Hazır etiketler (*Paketleme*, *İplik Temizleme*, *Ütü*, *Kesim Yardımı*, *Yükleme*) + serbest açıklama alanı.
   - **Günlük Ücret / Yevmiye (İsteğe Bağlı):**
     - Tutar girilebilir (örn. `1.200 ₺`) veya sadece kimin geldiğini not almak için boş (`0 ₺`) bırakılabilir.
     - Tutar girildiyse yanında **"Ödendi mi?"** (`Ödendi` / `Daha Sonra Ödenecek`) seçimi yer alır.

2. **Sekme 2: Kayıtlar & Kişi Özeti (`Geçmiş & Kişiler`)**
   - **Özet Kartları:** Bu ay toplam kaç yevmiye/gün çalışıldı, ödenen toplam tutar ve **bekleyen (ödenmemiş) toplam tutar**.
   - **Görünüm Filtresi:** `Kişi Bazlı Grupla` | `Gün Gün Liste` | `Ödeme Bekleyenler`.
   - **Kişi Kartı:**
     - Kişinin toplam kaç gün geldiği, hangi tarihlerde ne iş yaptığı ve varsa kalan alacağı gösterilir.
     - Kişi ertesi gün tekrar geldiyse kart üzerindeki **"+ Bugün de Geldi"** butonu ile form doldurmadan tek dokunuşla bugüne kayıt eklenir.
     - Ödenmemiş yevmiyesi varsa **"Ödendi İşaretle"** butonu ile tek dokunuşla kapatılır.

#### C) Raporlar ve Yedekleme Entegrasyonu (`src/app/raporlar/index.tsx` & `src/export/excel.ts`)
- **Raporlar ekranına** *"Günlük / Geçici Çalışan Dökümü (Excel)"* raporu eklenir (Tarih, Ad Soyad, Süre, Yapılan İş, Tutar, Ödeme Durumu).
- `shareFullBackupExcel` ve `shareFullBackupJson` içine `temp_work_logs` tablosu dahil edilir.

---

## Uygulama Adımları (Faz Planı)

1. **Faz 1 — Çoklu Mola ve Bildirim Altyapısı:**
   - `src/types/index.ts` içine `breakReminderEnabled` ve `breakEndReminderEnabled` ayarlarının eklenmesi.
   - `src/utils/notifications.ts` içine `mola-bildirimleri` Android kanalı ve `syncBreakReminders` fonksiyonunun yazılması.
   - `src/app/ayarlar/calisma-saatleri.tsx` ekranında çoklu mola ekleme/düzenleme/silme ve "Tüm iş günlerine uygula" özelliğinin kodlanması.
   - `src/app/ayarlar/bildirimler.tsx` ve `src/data/DataProvider.tsx` bağlantılarının yapılması.

2. **Faz 2 — Geçici Çalışan Veritabanı ve Veri Katmanı:**
   - `supabase/migrations/0010_temp_work_logs.sql` migrasyonunun oluşturulması (Tablo, indeksler, RLS, audit trigger ve `restore_org_backup` güncellemesi).
   - `src/types/index.ts`, `src/data/store.ts`, `src/data/supabase.ts` (`pullAll` & `NUMERIC_FIELDS`), `src/data/hooks.ts` (`useTempWorkLogs`) ve `src/data/repo.ts` (`addTempWorkLog`, `markTempWorkPaid`, `deleteTempWorkLog`) fonksiyonlarının eklenmesi.
   - `src/domain/temp-workers.ts` içinde kişi bazlı gruplama, son gelen isimleri çıkarma ve özet hesaplama saf (pure) fonksiyonlarının yazılması.

3. **Faz 3 — Geçici Çalışan Arayüzü ve Raporlar:**
   - `src/app/gecici-calisan.tsx` ekranının oluşturulması ve `src/app/_layout.tsx` Stack rotasına eklenmesi.
   - `src/features/QuickActions.tsx`, `src/app/(tabs)/personel.tsx` ve `src/app/(tabs)/puantaj.tsx` ekranlarına erişim noktalarının eklenmesi.
   - `src/export/excel.ts` ve `src/app/raporlar/index.tsx` içine Excel dışa aktarımının eklenmesi.

4. **Faz 4 — Doğrulama ve Testler:**
   - Çoklu mola hesaplama, bildirim gün dönüşümü (`expoWeekday`) ve geçici çalışan gruplama/bakiye hesapları için Jest birim testlerinin (`__tests__/`) yazılması.
   - `npx tsc --noEmit`, `npx expo lint` ve `npx jest` kontrollerinin sıfır hata ile geçirilmesi.
