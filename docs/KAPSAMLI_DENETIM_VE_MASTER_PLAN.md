# Atölye Defteri — Kapsamlı Denetim Raporu ve Master Plan

> **Tarih:** 26 Ekim 2026 · **Sürüm:** v1.1
> **Kapsam:** Kod tabanının uçtan uca incelenmesi (veri katmanı, domain/hesap motoru, tüm ekranlar, Supabase backend, depo hijyeni) + "defteri yenen bir ürün" için vizyon, yeni fikirler ve fazlanmış yol haritası.
> **Yöntem:** 4 paralel derin inceleme; `tsc --noEmit` (0 hata), `expo lint` (0 hata), `jest` (66 geçti / 8 uzak-proje atlaması) doğrulaması; kritik bulgular koddan elle teyit edildi. Ardından plan, **4 bağımsız review'dan** (mobil mimar, ürün/UX stratejisti, bordro/mevzuat danışmanı, kırmızı ekip plan kritikçisi) geçirildi; düzeltmeler işlendi.
> **Durum:** Bu belge bir **plan ve öneri** dokümanıdır; içindeki hiçbir şey uygulanmış değildir.

## Revizyon geçmişi

| Sürüm | Değişiklik |
|---|---|
| v1.0 | İlk denetim + plan. |
| v1.1 | Review düzeltmeleri: gerçekçi kapasite varsayımı ve faz süreleri; offline/cache için `agent.md` uyum maddesi ve silme-senkron kapısı; OTA Faz 0–1'e alındı; akord'a **asgari ücret garantisi** ve geçiş/birleştirme kuralları eklendi; APHB gün tanımı düzeltildi (prim günü ≠ çalışılan gün); kıdem/ihbar brüt esas sorunu işlendi ("brüt hesaplamaz, uyarı üretir" ilkesi); Kapanış Sihirbazı zorunlu kapıdan durum çubuğuna çevrildi; yeni bulgular (G8 admin-silme çatışması, H19 izin iş günü sayımı, ödeme kısmi başarısızlığı); yeni fikirler (Yıl Sonu Karnesi, sosyal kanıt dipnotu, SGK bildirim hatırlatması, akşam özeti+seri); Riskler bölümü (Bölüm 8) eklendi; metrik tanımları netleştirildi; dahili referans hataları giderildi. |
| v1.2 | Tüm süre tahminleri kaldırıldı (faz süreleri, toplam program, kapasite varsayımı); efor etiketleri (S/M/L) göreli tanımlara çevrildi; faz sırası ve bağımlılıklar değişmedi. |
| v1.2.1 | **Faz 0 kod düzeltmeleri uygulandı** (26 Ekim 2026): H3 (tam devamsızlıkta net 0 + kesinti tabanla sınırlı), H4 (gece vardiyası), H12 (taksit kuruşu), H15 (hafta sonu yarım günü), H9 (aktif filtre + breakdown.warning kopyalanması), S4 (hatalı turda imleç ilerletme), H8 (borç dedup + `debts.payroll_item_id`), giveDebt doğrulaması, G1/G2 (admin-create-user hesap devralması kapatıldı — mevcut hesaba dokunulmadan üyelik), S3 (restore_org_backup production_batches + kapsam koruması), D1 (departman silme onayı), U1 (raporlar erişimi: Bugün + Ayarlar), U2/U3 (pusula butonu + WhatsApp metni + PDF'e firma adı), H1 (ana ekran metni), U5 (mesai çarpanı gün türünden), U6 (Hepsini Ödendi onayı), U7 (taslakta PDF/Excel), U8 (gerçek çekerek yenileme), U9 (gün onayı geri alma), U11 (QuickActions kapanması), U14 (kurulum departman ataması), RECORD_AUDIO kaldırıldı, README/.env.example/.gitignore/.zcodeignore güncellendi. Migration `0010_faz0_duzeltmeleri.sql` yazıldı — **prod'a `db push` edilmemiş, edge function deploy edilmemiş (doğrulanmadı)**. Faz 0'dan kalan: MOLA Faz 1 commit'i (kullanıcı onayıyla), `git rm --cached data_safety_export.csv`, G1 OTP'li kalıcı doğrulama, expo-updates kurulumu. |

---

## Bölüm 1 — Yönetici Özeti

Proje temeli sağlam: hesap motoru testli ve kuruş disiplinli, RLS katmanı gerçek projeye karşı test ediliyor, tasarım sistemi tutarlı, tsc/lint temiz. Ama "tam takır çalışması ve gerçekten işe yaraması" hedefi karşısında tablo üç eksik gruba ayrılıyor:

1. **Doğruluk delikleri (para yanlış hesaplanır):** Yöntem A'da **her devamsız çalışanca sistemik fazla ödeme** kalıyor (ay tümü devamsız olsa bile artık ödeniyor), gece vardiyası 0 saat üretiyor, ücretsiz firma tatilinde fiilen çalışan kesiliyor, "farkı borca çevir" her basışta yeni borç üretiyor. Akord/parça başı sistemi hiç yokken ana ekran onu vaat ediyor.
2. **Dayanıklılık delikleri (veri kaybolur / bayatlar):** Bir cihazda yapılan **silme işlemi diğer cihaza hiçbir zaman senkron olmuyor**, iki cihaz paralel ödeme girerse toplam bozuluyor **ve akım yarıda kalırsa kayıtlı-ama-tutarlı-olmayan durum** oluşuyor, senkron imleci hata durumunda ilerleyip satırları kaçırıyor, JSON yedekten dönüş üretim kayıtlarını sessizce kaybediyor. Atölye ortamı (çekmeyen internet) için uygulama tamamen online ve yazma yapamıyor.
3. **Değerin görünürlüğü (yapılan iş kullanıcıya ulaşmıyor):** Raporlar ekranına **hiçbir yerden erişilemiyor**, kişisel maaş pusulası PDF'i yazılmış ama hiçbir butona bağlı değil, bordro PDF'inde firma adı yerine "Bordro" yazıyor, yasal mesai sinyalleri hesaplanıyor ama hiç gösterilmiyor.

Ürün tarafında mevcut durum **"günlük kayıt + aylık hesap"** makinesi. Defteri yenmek için eksik olan şey daha çok özellik değil; **alışkanlık döngüsü** (her gün açılacak neden), **para katmanı** (nakit planlama, tahsilat, akord) ve **dış paydaş kilidi** (muhasebeciye tek dokunuşla veri) + biriken geçmişin kendisini görünür kılan çıktılar (Yıl Sonu Karnesi).

**Stratejik çerçeve (v1.1):** Sahil (beachhead) segmenti **mevcut kullanıcının kendi atölyesi: aylık net maaşlı, küçük ekip**. Buna hizmet etmeyen hiçbir şey ondan öncesine girmez; akord (4.2) bu sahili sağlamlaştırdıktan sonraki genişleme hamlesidir. Ana ekrandaki karşılanmayan "Parça Başı" vaadi v1.0.7'de metinle geri çekilir (Faz 0), özelliğin kendisi Faz 2'de gelir.

**Özet öneri:** Önce acil düzeltme sprint'i (para/veri KRİTİK'leri + erişilemeyen ekranların bağlanması + OTA altyapısı), sonra sırasıyla "Güven & Görünürlük" → "Para & Tekstil Derinliği" → "Dayanıklılık (offline)" fazları. En büyük tek ürün hamlesi: **Ay Sonu Kapanış Çubuğu** (fikir 4.1); genişleme hamlesi: **parça başı/akord hakediş** (fikir 4.2). Fazlar arası sıra ve bağımlılıklar Bölüm 6'dadır; süre tahmini bilinçli olarak verilmez.

---

## Bölüm 2 — Denetim Bulguları

Kritiklik: **[K]** KRİTİK (para yanlış / veri kaybı / güvenlik) · **[Y]** YÜKSEK · **[O]** ORTA · **[D]** DÜŞÜK. Satır referansları 26 Ekim 2026 çalışma ağacınadır. Metindeki tüm atıflar bu bölümün numaralandırmasındadır (S/G/D/H/U); v1.0'daki dağınık iç referanslar normalize edilmiştir.

### 2.1 Senkronizasyon ve Veri Katmanı

| # | Bulgu | Yer | Detay |
|---|---|---|---|
| S1 | **[K] Silmeler cihazlar arası senkron olmuyor** | `src/data/supabase.ts:100-108, 148-171` | Merge yalnızca union/üzerine-yazma yapıyor; uzaktan silinen satır yerelde hayalet olarak kalıyor, düzelme yalnızca uygulama yeniden başlatılınca. **Kapsam:** `remoteDelete` kodda 7 tabloda çağrılıyor — attendance, overtime, calendar_events, debts, **departments** (`repo.ts:176`), **org_members** (`repo.ts:637`), **production_batches** (`repo.ts:713`). Ayrıca `org_members`'ın `updated_at` kolonu yok (`supabase.ts:137-146` noUpdatedAtTables) → silme senkronu için şema değişikliği ya da set-replace yaklaşımı gerekir. Çıkarılan üye diğer cihazda üye listesinde kalmaya devam eder. |
| S2 | **[K] İki cihaz paralel ödeme girerse `paid_amount` bozulur; akım yarıda kalırsa tutarsız durum kalır** | `src/data/repo.ts:573-603` | Toplam, istemcinin eski anlık görüntüsünden toplanıp LWW upsert ile yazılıyor (lost update). Ek ağırlaştırıcı: 0007'deki `protect_finalized_payroll_item_update` trigger'ı `NEW.paid_amount >= OLD.paid_amount` arar — eski anlık görühten hesaplanan toplam sunucudan küçükse **upsert exception atar ama `salary_payments` satırı çoktan yazılmıştır**: ödeme kayıtlı, toplam eski, "odendi" durumuna dönüş olmaz. Çözüm tek RPC transaction'ında insert + `SUM(salary_payments)`'dan türetilen toplam + durum flip'i olmalı. |
| S3 | **[K] `restore_org_backup` 0008'den habersiz — üretim kayıtları yedek dönüşünde kaybolur** | `supabase/migrations/0007_data_protection.sql:245-254` | `v_ins_tables`/`v_del_tables` listelerinde `production_batches` yok; `excel.ts` yedeğe yazıyor ama geri yüklemiyor. **Not:** Düzeltme her iki listeye ve doğru FK sırasına (employees önce) eklenecek; kalıcı çözüm Önkoşul 4'tür (liste elle değil katalogdan). |
| S4 | **[Y] `pullAll` hata verse bile imleç ilerliyor → uzun süren tablo hatalarında satır kaçırma** | `src/data/supabase.ts:126, 162-175` | 5 dakikalık geri tolerans sayesinde kısa hatalarda satır bir sonraki pull'da yine gelir; kalıcı kaçırma için hatanın 5 dk'dan uzun sürmesi ya da istemci saatinin >5 dk ileride olması gerekir. Doğru düzeltme **tablo başına imleç**: hata veren tablonun eşiği ilerlemez, başarılı tablolar ilerler. |
| S5 | **[Y] Senkron eşiği istemci saatiyle yazılıyor, karşılaştırma sunucu saatiyle** | `src/data/supabase.ts:126, 175` | `updated_at` sunucu trigger'ı (DB saati) ile yazılır; imleç istemci saatiyle. Çözüm: pullAll dönüşünde sunucu `now()` değeri imleç olur. |
| S6 | **[O] Paralel `pullAll` yarışı** — `busy` bayrağı yalnız DataProvider tetiklerini koruyor | `src/data/DataProvider.tsx:92`, `repo.ts:541, 563, 638` | `finalizePayroll` / `revertPayroll` / `removeMember` / `restoreBackupFromText` doğrudan çağırıyor; tek kuyruklu/kilitli pullAll gerekir. |
| S7 | **[Y] Atölyede internet yokken hiçbir yazma yapılamıyor** | `src/data/DataProvider.tsx:21-23`, `store.ts:24` | Offline kuyruk bilinçli olarak yok (`agent.md` kural 1); PLAN.md Bölüm 9 ve README'deki "offline kuyruk" vaadiyle çelişiyor. Bkz. fikir 4.6 ve Önkoşul 7. |
| S8 | **[O] Çakışan yoklamada sessiz LWW** — deterministik UUID çift kaydı önlüyor ama çakışma uyarısı yok | `src/data/id.ts:43-53`, `supabase.ts:73-75` | İki yönetici aynı gün farklı durum girerse son yazan sessizce kazanır. Not: LWW upsert (`onConflict:'id'`) offline kuyruğun **stale replay**'inin daha yeni sunucu verisini ezmesine karşı da korumasızdır — kuyruk tasarımında base-version taşıma gerekir (bkz. 4.6). |
| S9 | **[O] Kullanıcı tüm gömülü tatilleri silerse her açılışta yeniden tohumlanıyor; birkaçını silerse eksik kalan asla tamamlanmıyor** | `src/data/repo.ts:90-93` | Varlık kontrolü "en az 1 olay" üzerinden. |
| S10 | **[O] `useDayAttendance`/`useMonthAttendance` org filtresiz** | `src/data/hooks.ts:105-116` | 0006'daki 1:1 üyelik kuralı şimdilik koruyor; kalkarsa cross-org sızıntı anında gerçekleşir. |
| S11 | **[D] Store tamamen bellek içi** — uygulama kapanınca her şey gider, açılış `pullAll`'a bağımlı | `store.ts:24, 97-100` | Offline okuma cache'i de yok. **Dikkat:** kalıcı cache, S1 kapanmadan yapılmamalı — yoksa hayalet satırlar restart'la da temizlenmez, kalıcılaşır. |
| S12 | **[O] 8 tablo her 60 saniyede tam çekiliyor** — egress/performans maliyeti yıllar içinde büyür | `supabase.ts:149-159`, `DataProvider.tsx:135` | 200 çalışan senaryosunda `attendance_days`, `debt_payments`, `salary_payments` büyür; `noUpdatedAtTables` kademeli `updated_at`'a geçirilmeli (Faz 3). Küçük tutarsızlık: `organizations` listede ama kolonu var. |

### 2.2 Supabase Güvenliği

| # | Bulgu | Yer | Detay |
|---|---|---|---|
| G1 | **[K] `admin-create-user`: e-posta sahipliği doğrulanmadan hesap devralma — ve bu açık Play'deki v1.0.6'da CANLI** | `supabase/functions/admin-create-user/index.ts:68-94` | Kayıt olmuş ama firma kurmamış kullanıcının e-postasını bilen herkes o hesabın **şifresini doğrudan değiştirebiliyor**; onay e-postası yok, `email_confirm: true` bypass. OTA olmadığından düzeltme mağaza onayına (1–3 gün) bağlıdır → **Faz 0 öncesi geçici azaltım kararı** gerekir (Risk R1). Doğrulama çözümü OTP/magic-link — Supabase SMTP saatte birkaç e-posta sınırlı olduğundan Resend benzeri kurulum önkoşul olabilir. |
| G2 | **[Y] Aynı fonksiyonda eksik rollback** — yetim hesabın şifresi değişmiş kalabilir | `admin-create-user/index.ts:120-126` | Üyelik insert'i patlarsa orijinal şifre geri getirilemez. |
| G3 | **[Y] "DELETE yalnızca owner" kuralı 5 tabloya uygulanmamış** | `0007:15-18`; `0002_rls.sql:29-42, 79-82`; `0008:41-42` | `departments`, `schedule_days`, `calendar_events`, `leave_adjustments`, `production_batches`'te sıradan admin üye satır silebilir. |
| G4 | **[Y] Cross-org referans bütünlüğü yok** — `employee_id`/`debt_id` başka firmanın satırına işaret edebilir | `0003_functions.sql:151-167`, `0005_fixes.sql:159-165` | Composite FK yok; `upsert_attendance_bulk` ve `finalize_payroll` RPC'leri payload'dan serbest `employee_id`/`debt_id` alıyor. |
| G5 | **[O] Son firma sahibi koruması yalnızca istemcide** | `repo.ts:630-636` | Owner kendi üyeliğini doğrudan PostgREST'ten silebilir → firma sahipsiz kalır. |
| G6 | **[O] Audit log delikleri**: `org_members`/`organizations` loglanmıyor; Edge Function silmeleri `auth.uid()` NULL ile loglanıyor; şifre değişiklikleri hiç loglanmıyor; retention yok | `0004_audit.sql:28, 38-42` | |
| G7 | **[D]** CORS `*` (3 edge function) · `delete-account` hata yönetimi yok/ölü sorgu · şifre politikası 6 karakter | `admin-create-user:11`, `delete-account:46, 63-70`, `auth.tsx:251` | |
| G8 | **[Y] Rol×silme matrisi çatışıyor: admin'lerin kullandığı silme butonları, owner-only DELETE RLS'sine takılıyor** | `0007:15-18` (attendance, debts dahil owner-only) vs `StatusSheet.tsx:187` (`clearAttendance`), `avans-ver.tsx:79`, `borc/[id].tsx:189` (`deleteDebtIfUnpaid`) | Admin rolü bu butonlara bastığında PostgREST RLS hatası alır. S1 çözümü tasarlanırken rol tablosu (hangi rol hangi tabloda silebilir) istemci + RLS birlikte tanımlanmalı: ya DELETE admin'e açılır ya bu akışlar admin'e gizlenir. |

### 2.3 Şema

| # | Bulgu | Yer | Detay |
|---|---|---|---|
| D1 | **[K] Departman silinince departmana özel takvim/olay satırları CASCADE ile sessizce siliniyor** | `0001_schema.sql:72, 90`; `repo.ts:169-177` | `removeDepartment` yalnızca çalışanları sıyırıyor; uyarı yok. |
| D2 | **[O] Eksik index'ler**: `debt_payments.employee_id`, `salary_payments.employee_id`, `leave_adjustments` (hiç yok) | `0001_schema.sql:215-227, 282` | |
| D3 | **[O] `leave_adjustments`'ta zaman damgası yok** — delta senkron protokolüyle uyumsuz | `0001_schema.sql:220-227` | |
| D4 | **[D] 0009 migration mevcut `app_config.min_version` değerini ezebilir** | `0009_app_config.sql:23-35` | |
| D5 | **[İYİ] Personel silme zinciri doğru**: 0007 FK'ları `NO ACTION`'a çevirmiş + istemci soft-delete kullanıyor. | `0007:43-58` | |

### 2.4 Domain / Hesap Motoru

| # | Bulgu | Yer | Detay |
|---|---|---|---|
| H1 | **[K] Parça başı / akord ücret sistemi YOK — ama ana ekran "Maaş & Parça Başı Hakediş" vaat ediyor** | `types/index.ts:205-213, 52-62`; `app/(tabs)/index.tsx:243` | `EmployeeSalary.amount` yalnızca net aylık; `ProductionBatch`'te `employee_id` yok. Vaat edilmeyen özelliği andıran etiket **Faz 0'da düzeltilir** ("Maaş Günü & Bordro" gibi); sistem Faz 2'de (4.2). |
| H2 | **[K] Üretim modülünde fire/defekt ve verimlilik yok** | `domain/production.ts:104-182` | Yalnızca model+renk bazında miktar toplama. |
| H3 | **[K] Yöntem A'da her devamsız çalışanca sistemik fazla ödeme; tüm ay devamsızlıkta maaş sıfırlanmıyor** | `domain/wage.ts:49-51`, `attendance.ts:82` | Aylık taban 195 sabit saat; 21×9=189 saat kesinti yapılınca ay tamamı devamsız olsa bile ~923 ₺ artık kalır — kısmi devamsızlıkta bile her ay ~%3 sistematik fazla ödeme. Yöntem B'de aynı senaryo net 0. Test (payroll 15) davranışı doğruluyor ama kullanıcı varsayılan yöntemde farkında olmadan fazla öder. Düzeltme: kesinti toplamı tabanla sınırlanır. |
| H4 | **[Y] Gece vardiyası tamamen bozuk** | `domain/schedule.ts:33-37` | `netHoursBetween('22:00','06:00')` → −960 dk → `Math.max(0,..)` = 0 planlı saat; `'25:00'` doğrulanmıyor. |
| H5 | **[Y] Ücretsiz firma tatili + fiilen çalışan: kesilir; ek çalışma sessizce yok sayılır. Mevzuat notu: tek taraflı ücretsiz izin hukuken riskli** | `domain/schedule.ts:142-148, 228-236`, `payroll.ts:131-144` | `firma_tatili` dalı `ek_calisma`'dan önce döner. Ayrıca Yargıtay yerleşik uygulamasına göre işveren hafta tatili/resmî tatil dışında işçiyi tek taraflı ücretsiz izne çıkaramaz (doğrulanmalı) — ücretsiz firma tatili girilirken uyarı/onay akışı eklenmeli. |
| H6 | **[O] Rapor koşusu hafta sonunda bölünüyor VE her bordro ayında "ilk 2 gün işveren öder" hakkı yeniden doğuyor** | `payroll.ts:121-122, 146-161` | Düzeltme iki uç kapsamalı: hafta sonu/ay sınırı istirahati bölmez; önceki ayın son iş günü rapor durumu bordroya bağlam parametresi olarak taşınmalı (yoksa H6'nın yalnızca yarısı düzeltilmiş olur). |
| H7 | **[O] Hafta tatili kesintisi ay sınırında çift ceza; tutar ayın 15'inin ücretiyle hesaplanıyor** | `payroll.ts:180-194` | Özelliğin kendisi İK md.46 ile uyumlu; aynı takvim haftası iki ayda tekrar sayılmamalı. |
| H8 | **[O] "Farkı borca çevir" her basışta yeni borç üretir; kavramsal olarak da tartışmalı** | `bordro/[yil]/[ay].tsx:155-169` | Dedup yok. Mevzuat notu: kıst tabanı aşan kesinti artığı işçinin **almadığı** paradır; avans/borç değildir (İK md.32 mahsup sınırları). Devamsızlık artığı için "borç" kaydı değil "ödenmeyen gün" bilgisi üretilmeli; borca çevirme yalnızca gerçek avans/borç farkı için. |
| H9 | **[O] Bordro hesabı `active=false` + `end_date=null` kalmış çalışanı saymaya devam ediyor** | `features/bordro/compute.ts:41` | |
| H10 | **[O] Kayıt yoksa "geldi" varsayımı denetimsiz** | `attendance.ts:67-70` | Yoklama unutulan günler otomatik ücretleniyor; "X gün için yoklama girilmedi" uyarısı yok. Kapanış çubuğunun 1. adımı bunu çözer. |
| H11 | **[Y] 45 saat haftalık ve günlük 11 saat sınırları hiçbir yerde denetlenmiyor; 270 saat bayrağı hiç gösterilmiyor** | `domain/schedule.ts:44-51`, `overtime.ts:21-27` | İK md.41 (yıllık 270 saat) ve günlük 11 saat ihlalleri idari para cezasına tabi; tekstilde mesai yoğun. Gösterim: bildirim değil **personel detayında nötr kart** ("yıllık mesai 252 saat") — "denetleniyor" hissi üretmemek için (bkz. 4.10). |
| H12 | **[O] Taksit bölünmesinde kuruş artığı son taksite yuvarlanmıyor** | `debts.ts:31-35` | 100 ₺ / 3 → 99.99; kalan 0.01 için 4. ay gerekir. |
| H13 | **[O] A/B yöntemi aynı senaryoda belirgin farklı net veriyor; fark kullanıcıya somut gösterilmiyor** | `wage.ts:15-22` | |
| H14 | **[O] `salaryForDay` gelecek tarihli maaşı geriye uygular** (fallback en eski kayıt) | `wage.ts:25-31` | İşe girişle ilk maaş `effective_from` uyumsuzsa sessizce yanlış dönem ücreti; 4.10'daki zam uyarısıyla birleştirilir. |
| H15 | **[O] `yarim_gun` olayı hafta sonunu zorla iş gününe çeviriyor** | `schedule.ts:150-155` | |
| H16 | **[O] Tatiller 2026–2030 gömülü; 2031+ yok; dini bayramlar bağımsız doğrulanmıyor** | `holidays-tr.ts:48-103`, `repo.ts:87` | |
| H17 | **[D] Diğer nüanslar**: `breakdown.hourlyRate` ayın 15'inin oranı, `giveDebt` girdi doğrulaması yok, `leaveStatus` eksi bakiyeyi gizler, 29 Şubat yıldönümü kırılgan, `sumTotals` yuvarlamasız toplar. *Not: /30 kıst yaklaşımının kendisi SGK/bordro pratiğidir; 31 günlük ayda 30 gün aktif çalışana tam maaş gitmesi hata değil, kabul görmüş uygulamadır.* | `payroll.ts:251`, `repo.ts:372-397`, `leave.ts:58, 21`, `compute.ts:116-126` | |
| H18 | **[İYİ] Doğru olanlar**: kuruş yuvarlama + "net = satırlar toplamı" garantisi, dönemleme motoru, md.53 izin eşikleri/yaş istisnaları, ISO-dizgi tarih politikası, resmî tatil ücretlendirmesi, mola düşümü. | | |
| H19 | **[Y] Yıllık izin "iş günü" üzerinden işletilmiyor; hafta sonuna yanlışlıkla girilen izin bakiyeden düşüyor** | `leave.ts:57`, `attendance.ts:165-166` | İK md.53/54: izne rastlayan hafta tatili ve resmî tatil izinden sayılmaz; `usedDays` yalnızca `plan.isWorkday` günlerdeki kayıtları saymalı. Eski kayıtlar için düzeltme migration'ı gerekmez (hesap anında düzelir) ama kullanıcıya bakiye değişimi duyurulur. |
| H20 | **[D] Mola ve gece mevzuat denetimi yok** | `types/index.ts:66-71`, `schedule.ts` | İK md.68 (4+ saatte en az yarım saat mola) girdi doğrulaması; İK md.69 (gece 20:00–06:00 tanımı) 4.9 vardiyasıyla birlikte. Denkleştirme (md.42) yol haritasına "ileride" notu. |

### 2.5 Test Kapsamı Açıkları

- **[Y] `features/bordro/compute.ts` tamamen testsiz** — Kapanış Çubuğu'na (4.1) önkoşuldur; **Faz 0 işidir** (v1.0'da faza atanmamıştı).
- **[O]** `attendance.ts` fallback'leri, `wage.ts` kenar durumları, 31 günlük ay, gece vardiyası, rapor ay sınırı, kesinleştirme-sonrası değişiklik senaryoları testsiz.
- **[O]** `notifications.ts` (+97 satır commit'lenmemiş değişiklik) ve `supabase.ts` senkron katmanı testsiz; edge function'lar testsiz. Hatırlatma Merkezi (4.7) notifications.ts'in test edilmemiş yüzeyini ~3 kat büyütür → 4.7 öncesi sahte-zamanlayıcı bildirim testleri önkoşuldur.
- **[D]** README "40 test" diyor; gerçek 74 (66 geçiyor, 8 RLS atlıyor). Yeni `schedule.test.ts` commit'lenmemiş.
- **[O]** RLS testleri ortam değişkeni yoksa sessizce atlanıyor; "restore kapsamı her migration'da test edilir" kuralının koşumu yok — atlanan test fail-with-warning üretmeli.

### 2.6 UX / Ekranlar

| # | Bulgu | Yer | Detay |
|---|---|---|---|
| U1 | **[K] Raporlar ekranına hiçbir yerden erişilemiyor** (koddan doğrulandı) | `src/app/raporlar/index.tsx` | `/raporlar`'a giden tek `push`/`Link` yok. Defterin en büyük avantajı "sayfayı koparıp vermek"ti. |
| U2 | **[Y] Kişisel maaş pusulası (`sharePusulaPdf`) hiçbir butona bağlı değil** (koddan doğrulandı) | `export/pdf.ts:75-116` | "Ayşe Hanım'ın hakedişini WhatsApp'tan yollayayım" senaryosu yok. **Önkoşul:** eksik yoklama günü uyarısı olmadan pusula göndermek (H10 varsayımıyla) yanlış gün sayılı belge üretir — çelişki kanıtı olur (bkz. 4.4 riski). |
| U3 | **[Y] Bordro PDF'inde firma adı yok — başlık "Bordro"** | `bordro/[yil]/[ay].tsx:314-315`, `pdf.ts:121` | |
| U4 | **[Y] Maaş günü bildirimi yok; bildirimler işveren değil işçi mantığıyla kurulmuş** | `utils/notifications.ts:69-212`, `bildirimler.tsx:203-211`, `DataProvider.tsx:73-86` | Tahsilat/taksit, kapanış, rapor bitişi, yeni çalışan SGK bildirimi hatırlatmaları yok. Mola bildirimleri varsayılan açık ve otomatik kuruluyor → tüm bildirimlerin kapatılması riski. Varsayılan set ve günlük üst sınır tanımlanmalı (bkz. 4.7). |
| U5 | **[Y] Mesai girişi kısıtlı ve tutarsız** — StatusSheet "Mesai Ekle" hep 1 saat, hep `hafta_ici` çarpanıyla; QuickActions yalnız 1/2/3 saat | `StatusSheet.tsx:150-163`, `QuickActions.tsx:145` | Cumartesi/tatil mesaisi yanlış çarpanla ücretlendirilir. Mevzuat notu (İK md.41): sözleşme saatini aşan ilk segment "fazla süreli çalışma" %25, 45 üstü %50'dir; tek %1,5 çarpan işçi lehine olmadığı için ödeme hukuka aykırı değildir ama işvereni sistematik fazla ödetir — mesai kaydına haftalık segment modeli düşünülmeli (çarpanlar ayarlanabilir kalır; tatil ×2'nin saatlik karşılığı İK md.47 "tam gün" esasına oturmayabilir — uygulanırken doğrulanmalı). |
| U6 | **[O] Bordro "Hepsini Ödendi" tek dokunuş, onay yok; döngüde loading yok** | `bordro/[yil]/[ay].tsx:130-152, 190-199` | |
| U7 | **[O] PDF/Excel butonları yalnızca kesinleşmiş bordroda** | `bordro/[yil]/[ay].tsx:294-347` | |
| U8 | **[O] Bugün ekranında çekerek yenileme sahte** | `index.tsx:287` | |
| U9 | **[O] Toplu işaretleme (long-press) keşfedilebilir değil; gün onayı geri alınamıyor** | `puantaj.tsx:171-173, 216-236` | |
| U10 | **[O] Bordro geçmişi en fazla 3 ay geriye** | `para.tsx:142-155` | |
| U11 | **[O] QuickActions bazı aksiyonlarda kapanmıyor** | `QuickActions.tsx:37, 58, 75` | |
| U12 | **[O] StatusPill metin kontrastı WCAG altında** | `tokens.ts:115-125` | |
| U13 | **[O] iOS'ta tarih/saat seçiciler ölü** | `ui/DateTime.tsx:21-33, 83-95` | |
| U14 | **[O] Kurulumda departman seçimi çalışana yansımıyor; maaş günü ve ödeme şekli hiç sorulmuyor** | `kurulum/index.tsx:201-206` | `paydayOfMonth` yalnız ayarlarda (varsayılan 5). 4.1/4.3/4.7'nin hepsi bu girdilere bağımlı — **Faz 0'da toplanmalı**. |
| U15 | **[D] Diğer**: BottomSheet kaydırma, skeleton 2 ekranda, yoklama saati sabit 5 seçenek, `formatMoneyShort` "Mn", maaş günü 'son'→31 sabiti 30 günük ayda bozuk, üretim adet alanı normal klavye, Excel içe aktarma katı + şablon yok, kurulum sonrası ilk kullanım kartı yok (PLAN 6.2.7'de vaat). | | |
| U16 | **[D] Bildirim tıklamasında derin bağlantı yok** — bildirim uygulamayı açar, ilgili ekrana düşürmez | `utils/notifications.ts` | Hatırlatma Merkezi'yle birlikte girer. |

### 2.7 Depo Hijyeni ve Dokümantasyon

- **[O] `data_safety_export.csv` (208 KB) depoya işlenmiş** — ignore'a alınmalı. **Sır ifşası yok**: `client_secret_*.json`, keystore, `.env`, `*.aab` git geçmişinde hiç yok (doğrulandı). Yerelde ~240 MB `.aab` + test PNG çöp.
- **[Y] README güncelliğini yitirmiş**: "cihaz modu / offline kuyruk / zustand+dosya" anlatımı kaldırılmış mimariyle çelişiyor; "40 test" yanlış; "ikon Expo varsayılanı" yanlış; mimari şemasında silinmiş dosyalar.
- **[O] OTA yok ama docs var** (`YEDEKLEME.md`, PLAN maliyet tablosu "eas update" diyor). Zorunlu sürüm kapısı mağaza onayına bağımlı → kritik hata 1–3 gün yayında kalır. OTA'ın bootstrap gerçeği: önce mağazadan çıkmış bir binary'ye gömülü olmalı — **erken eklendiği her gün risk penceresi daralır** (Faz 0–1'e alındı, native değişiklik gerektiren düzeltmelerin OTA ile gidemeyeceği notuyla).
- **[O] `android.permission.RECORD_AUDIO` gereksiz** — `app.json` listesinden silmek yetmez; `expo-image-picker` manifest merge'i geri getirebilir. Doğru mekanizma: plugin'e `androidRecordAudioPermission: false` ya da `expo-build-properties` kısıtı.
- **[O] `.zcodeignore` senkron değil** (client_secret, aab, dist_web, supabase/.temp dışlanmamış).
- **[O] Commit'lenmemiş yarım özellik**: MOLA Faz 1 (5 modified + 2 untracked, +424/−69); `schedule.test.ts` izlenmemiş.
- **[D]** `date-fns` kullanılmıyor; `reanimated`/`worklets` doğrudan kullanılmıyor; version-gate yorum/kod sapması; dependabot dalı merge'siz; CI'da test kapısı yok.
- **[Y] `agent.md` kuralları bu planın Faz 1/3 hedefleriyle harfiyen çelişiyor**: "Uygulama tamamen online… offline senkron kuyruğu veya yerel JSON DB YOKTUR", "Hiçbir veri önce store'a yazılıp arkadan sunucuya gönderilmez". Offline Faz A (kalıcı okuma cache'i) bile kalıcılık yasağına takılır. **Plan, agent.md revizyonunu içermelidir** (Önkoşul 7) — aksi halde uygulama aşamasında her AI ajan kurallarla çatışır.

### 2.8 Korunacak Güçlü Yönler

1. Deterministik UUID ile idempotent yazma iskeleti — offline kuyruğun doğru temeli (base-version eksiğiyle birlikte, bkz. S8).
2. Remote-first yazma disiplini (mutasyon önce sunucuda, store sonra) — sapma üretmez; kuyruk moduna geçişte ilke "store her zaman sunucu gerçeğini yansıtır" diye genelleştirilebilir.
3. 0007 veri koruma katmanı: kesinleşmiş bordroyu trigger'larla koruyan, transaction-local bypass'li olgun tasarım.
4. Gerçek projeye karşı çalışan RLS testleri; `SECURITY DEFINER` hijyeni.
5. "Sadece gelmeyeni işaretle" yoklama modeli, MoneyField/NumberPad, avans taksit önizleme + Geri Al, "Nasıl hesaplandı?" şeffaflığı, kilit ekranı, tasarım sistemi disiplini.

---

## Bölüm 3 — Ürün Vizyonu: Defteri Neden Yener

### 3.1 Kullanıcı ve Döngüleri

Kullanıcı: teknolojiyle arası orta seviyede atölye sahibi; muhasebe eğitimi yok; telefonu %90 tek elle, ayakta; parası nakit dönüyor; çalışanlarıyla ilişkisi kişisel. Üç döngüde de kazanmak zorunda:

| Döngü | Sıklık | Defter bugün | Uygulamanın kazanma koşulu |
|---|---|---|---|
| **Günlük** | Her sabah 30 sn | Kim geldi/gelmedi yazar | Yoklama 30 sn'de biter. **Günlük açılış nedeni hatırlatma değil, üretilen değerdir** (akord atölyesinde üretim adedi; aylık atölyede gün kapanışı hissi). Hatırlatma destekleyicidir, çekici değil — bildirim yorgunluğu 3 haftada söndürür |
| **Aylık** | Ay sonu 2–3 saat + gerginlik | Hesap makinesiyle kesinti/avans/mesai | Bordro 5 dakikada, satır satır gerekçeli. Tekrarlayan stresi sıfırlamak asıl alışkanlık kancası |
| **Olağanüstü** | Anlaşmazlık anı | Defter sayfası çevrilir | Isı haritası + pusula + cetvel. **Çıktı masaya konabilir fiziksel kanıt ağırlığında olmalı** (bkz. 3.3) |

### 3.2 Değer Merdiveni

1. **Kayıt** — veriyi tutar (✅)
2. **Hesap** — hatasız hesaplar (⚠️ Bölüm 2.4 kapatılınca ✅)
3. **Hatırlatma** — unutulan işi hatırlatır (❌ → 4.7)
4. **Paylaşım** — değeri dışarı çıkarır (❌ → 4.4/4.5)
5. **İçgörü** — nakit planı, maliyet, verim (❌ → 4.3/4.10/4.13)
6. **Birikmiş hafıza** — 6 ay sonra "tüm puantajım, borç sicilim, hakedişlerim burada" hissi; **terk etme maliyeti** zamanla artar (❌ → 4.19 Yıl Sonu Karnesi, 4.10 mevsim karşılaştırması)

Kritik içgörü (v1.1): içgörü bir kere-okuma değeridir; süreklilik **birikmiş geçmişin kendisinden** gelir. Uygulamanın en değerli parçaları zaten yazılmış ama görünmüyor (U1–U3) — görünürlük düzeltmeleri yeni özellik yazmadan bir basamak yukarı taşır.

### 3.3 "Defter Testi" — her fikir için 4 soru

1. *"Bunun için uygulama açar mı, yoksa defter kapağı yeterli mi?"* — bugün kaçan senaryolar: internet yok (S7), pusula (U2), muhasebeciye cetvel (U1).
2. *"Anlaşmazlıkta bunu masaya koyabilir miyim?"* — defter, mahalle ölçeğinde sosyal ağırlığı olan kanıttır. Puantaj cetveli PDF'i imza alanı, sayfa numarası ve tarih damgasıyla "resmî görünümlü belge" olmalı; bu, üçüncü kişi gözünde tarafsızlık üretir.
3. *"Bunu yaptım diye patron kendini nasıl hisseder?"* — tamamlanma duygusu (gün kapanışı, ay kapanışı, seri) görev yükünden güçlüdür.
4. *"Bu özellik yanlış dokunuşla paranı bozabilir mi?"* — para işlemlerinde onay/geri al şart (U6, 4.15).

---

## Bölüm 4 — Yeni Özellik Fikirleri

Efor: **S** küçük (tek oturumda biten iş) · **M** orta (birkaç oturum süren iş) · **L** büyük (en az iki shippable parçaya bölünmesi gereken iş). Etki: 1–5. ⭐ = oyun değiştirici.

### 4.1 ⭐ Ay Sonu Kapanış Çubuğu — Etki 5 · Efor M

**Sorun:** Ay sonu işi 5 ayrı ekrana dağılmış; esnaf birini unutur ve uygulama suçlu görünür.

**Fikir:** Ayın son iş günü "Bu Ayı Kapat" — ama **zorunlu kapı değil, görünür durum çubuğu**: 5 adımın her biri bağımsız tamamlanabilir, "3/5" kalıcı görünür, eksik kalan ay sonu uyarısı olarak geri döner. (Gerçekte ödeme günleri dağılır; tamamlanamayan ritüel alışkanlık değil suçluluk üretir.)
1. **Eksik gün taraması:** "3 gün yoklama girilmemiş: 4, 12, 27 → Doldur / Gelmiş say / Sonra". "Gelmiş say" toplu seçimde adım içi Geri Al içerir.
2. **Bordro önizleme:** toplam + geçen aya değişim; uyarılı satırlar.
3. **Kesinleştir** (mevcut onay akışı).
4. **Ödeme:** v1 yalnızca "yarın gereken toplam" özet kartı; nakit/banka kırılımı + zarf modu 4.3 ile Faz 2'de eklenir.
5. **Kapanış:** otomatik JSON yedek + paylaşım menzü (muhasebeci Excel paketi 4.5 ile Faz 2'de). Adımlar eklenebilir (progressive) tasarlanır.

**Teknik:** `src/app/bordro/kapanis/[yil]/[ay].tsx`; adım motoru domain'de saf (`domain/closing.ts`); **compute.ts testleri (Faz 0) tamamlanmadan başlamaz**; haftalık akord ödemesi gerektiren segment için periyot parametresi (4.2 sonrası).

### 4.2 ⭐ Parça Başı / Akord Hakediş — Etki 5 · Efor L (genişleme hamlesi)

**Sorun:** Tekstilde ücretin yarısı parça başıdır (İK md.51–52 götürü ücret rejimi). Sistem yok; ana ekran vaat ediyor (H1).

**Fikir:**
- `EmployeeSalary`'ye `type: 'aylik' | 'akord' | 'aylik_akord'` + `EmployeePieceRate` tanımları (iş türü, birim fiyat, geçerlilik).
- `production_batches`'e `employee_id` + `piece_rate_id` migration'ı → parti kime, hangi fiyattan; giriş akışında canlı kazanç önizleme ("85 şebeke × ₺14 = ₺1.190", NumberPad ile).
- Ay sonu: akord kazancı bordroya "Hakediş" satırı olarak akar.
- **Asgari ücret garantisi (İK md.39 + md.52 son fıkra — v1.1 ekledi):** akord hakedişi (+ ay içindeki sabit ödemeler) brüt asgari ücretin karşılığı eşik altındaysa fark **"Garanti Farkı"** kalemi olarak bordroya yazılır. Eşik = ayarlara gömülü yıllık parametreler (brüt asgari + işçi SGK/işsizlik oranı) ile **yaklaşık** hesap; çıktıda "yaklaşık, muhasebeci teyidi gerekir" ibaresi (Bölüm 3.4 ilkesi).
- **Birleştirme kuralı:** `aylik_akord` çalışanda net = dönemleşmiş taban − kesintiler + hakediş + garanti farkı. PLAN 14.1 senaryo tablosuna 3 yeni satır (sadece akord / sadece aylık / karışık).
- **Geçiş:** 0011 öncesi girilmiş üretim kayıtları "atanmamış" etiketlenir; "eskiden girilen partileri kişiye bağla" isteğe bağlı, geri alınabilir toplu atama ekranı.
- Fire/defekt sayacı (H2): partiye hatalı adet; ücretten düşme opsiyonu ayarlanabilir.
- Hakediş ekranında "resmî bordroyu etkileyebilir — muhasebecinize gösterin" notu.

**Teknik:** `domain/piecework.ts` (testli); `restore_org_backup` kapsamına ekle + FK sırası (employees önce).

### 4.3 ⭐ Maaş Günü Nakit Planlayıcı + Zarf Modu — Etki 4 · Efor M

**Sorun:** Maaşlar çoğunlukla nakit; "bankadan ne kadar çekeceğim, kim elden ne alacak" kafada.

**Fikir:**
- **Nakit özet kartı:** "Maaş günü: toplam ₺412.500 — nakit ₺380.200 / banka ₺32.300 · açık avans tahsilatı ₺4.850".
- **Zarf modu (ana değer):** ödeme günü liste sırayla; kişiye bas → "Ödendi (nakit/banka)" → yeşil tik + sıradaki; yarım kalan oturum devam eder; tümü bitince "Ay kapandı 🎉" + yedek hatırlatması. Geçici yevmiyeler ve ödenmemiş taksitler aynı "ödenecekler" listesine karışır (4.8).
- **Bankamatik küçük-brekleri:** darphane hesabı özellik enflasyonudur — **ana akış dışı, ayar arkasına** saklanır (v1.1). Ana akış "toplam nakit ihtiyacı + kim elden alacak".

**Teknik:** `domain/cash-plan.ts` (testli); mevcut `salary_payments` yeterli.

### 4.4 WhatsApp Pusula Akışı — Etki 4 · Efor S

- Bordro kalem ekranına "Pusulayı Gönder" ana buton + hazır mesaj metni ("Ayşe Hanım, Ekim: 24 gün çalışma… Net ₺27.300. Detay ekte. — [Atölye adı]"); PDF başlığına firma adı (U3 aynı iş).
- **Risk yönetimi (v1.1):** pusula iki ucu keskin — (a) eksik yoklama uyarısı: ayda eksik gün varsa gönderim öncesi uyar; (b) detay seviyesi ayarlanabilir (tam kalem / özet) — bazı patronlar sözlü müzakere alanını korumak ister; (c) uygulama puantajı ile SGK bildirimi çakışmadığında pusula **çelişki kanıtı** olabilir → "yaklaşık" dili ve 4.5 doğrulaması şart.
- Personel detayındaki `wa.me` linkine "bu ay özeti gönder".

### 4.5 Muhasebeci Paketi — Etki 4 · Efor M (doğrulama koşullu)

**Sorun:** Esnafın uygulama dışı zorunlu paydaşı muhasebeci; her ay "kim kaç gün çalıştı" diye sorar.

**Fikir:** Kapanışta "Muhasebecime Gönder" → tek Excel:
- Çalışan başına **iki ayrı sütun (v1.1 düzeltmesi):** "Fiilen çalışılan gün" + "Bildirilecek prim günü = çalışılan + hafta tatili + ücretli resmî tatil + ücretli izin − ücretsiz izin/istirahat (APHB'de prim günü ≠ çalışılan gün; aylık en fazla 30)". Domain'de saf `reportableDays()` fonksiyonu — `getMonthPlans` ve puantaj durumları zaten elinizde.
- Yeni giren/çıkanlar, ücret listesi, avans/ödeme dökümü; "bilgi amaçlı" etiketi.
- Ayarlara muhasebeci e-postası.
- **Doğrulama kapısı (v1.1):** "dış paydaş kilidi" kanıtlanmamış bir inançtır; tersine de dönebilir (muhasebecinin kendi bordrosuyla uyuşmazsa arada kalan esnaf olur, suçlu uygulama görünür). **2–3 gerçek muhasebeciyle format onayı alınmadan mağazaya çıkmaz**; pilot temini Faz 1'de başlar (temin edilemezse sentetik kabul, Bölüm 6).

### 4.6 Çevrimdışı Çalışma — Etki 5 · Efor L

**Sorun:** S7 — atölyede çekmez; yazma toast hatasıyla düşer.

**Fikir (kademeli, v1.1 revize):**
1. **Faz A (okuma):** kalıcı cache — ama **S1 kapanmadan şans yok**: hayalet satırlar restart'la da temizlenmez. Kapı: "silme senkronu kabul testi geçmeden Faz A başlamaz". Teknik seçim: tüm DB'yi tek AsyncStorage blob'una yazmak ölçeklenmez (yıllar içinde 100k+ satır, O(N) yazım, jank) → **tablo bazlı yansıma** (MMKV veya expo-sqlite) ya da projeksiyonlu cache ("aktif ay yoklamaları + çalışanlar + açık borçlar + son bordro" — açılış hedefi için tüm geçmiş gerekmez). Debounce'lu yazım + 200×12 ay sentetik veriyle açılış ölçümü kabul kriteri.
2. **Faz B (yazma kuyruğu):** repo katmanındaki ~30 yazma fonksiyonu "önce await remote → hata fırlat → store'a dokunma" sözleşmesiyle yazılmış; kuyruk bu sözleşmenin **tersine çevrilmesidir** — repo katmanının önemli ölçüde yeniden yazılması + ekranların hata akışlarının gözden geçirilmesi. Bölünür: **B1 yalnızca ekleme/upsert** (yoklama, üretim, avans) kuyruğa girer; **B2 güncelleme/silme** (silme RLS/kuyruk etkileşimi yüzünden en zor). Kuyruk girdisinde **base-version** taşınır; LWW upsert stale replay'e karşı korumasız (S8). Silmeler kuyruğa alınmaz — "çevrimişi zorunlu" listesine eklenir ve UI'da öyle işaretlenir.
3. Senkron düzeltmeleriyle birlikte: S1 (tombstone), S2 (RPC), S4/S5 (tablo başına imleç + sunucu saati).

### 4.7 Hatırlatma Merkezi — Etki 4 · Efor M

- **Maaş günü:** "Yarın maaş günü — toplam ₺412.500 hazırlayın" (3 gün önce + sabah).
- **Taksit/avans:** ay başı taksit önizleme + elden tahsilat günü.
- **Rapor bitişi:** "Mehmet'in raporu yarın bitiyor" (puantajta o gün vurgulu).
- **Yeni çalışan SGK bildirim hatırlatması (v1.1):** "Yeni çalışan — muhasebecinize bildirildi mi?" (`start_date` biliniyor; yasal sinyallerin en masumu, muhasebeci paketine doğal köprü).
- **Kapanış uyarısı:** "Kasım'ı kapatmanıza 2 gün var · 3 gün yoklama eksik".
- **Akşam kapanış özeti + seri (v1.1):** "Bugün 43/46, 2 üretim kaydı eksik · Üst üste 24 gün eksiksiz yoklama 🔥" — tamamlanma döngüsü kurar; abartısız, patrona yönelik.
- **270 saat mesai:** bildirim **değil** — personel detayında nötr sessiz kart (4.10); bildirim "denetim" hissi üretir, veri kalitesini düşürür (kullanıcı mesaiyi yazmamaya başlar).
- **Bildirim disiplini (v1.1):** kurulum sonrası tek "Size ne hatırlatalım?" ekranı — maaş günü + kapanış varsayılan açık, diğerleri kapalı; **günlük bildirim üst sınırı 2** ürün kuralı; yoklama hatırlatması girilmişse susar; mola bildirimleri opt-in; bildirime basınca derin bağlantı (U16). notifications.ts testleri (sahte zamanlayıcı) önkoşul.

### 4.8 Geçici / Günlük Çalışan — Etki 4 · Efor M

`docs/MOLA_VE_GECICI_CALISAN_PLANI.md` aynen geçerli (Faz 2'de). Ek: yevmiyeler 4.3 zarf/ödenecekler listesine karışsın; aylık toplam yevmiye gideri Para özetinde görünsün; "bu yıl toplam kaç gün geldi" mevsimlik sıklık göstergesi.

### 4.9 Vardiya Sistemi (Gece Ekibi) — Etki 3 · Efor M

H4'ü düzelten yapısal çözüm: `'25:00'` doğrulaması + geceyi saran aritmetik; İK md.69 gece çalışması denetimi (gece 20:00–06:00 tanımı, gündüz+gece 7,5 saat sınırı) bu işin kapsamına girer. Ardından departman bazlı takvim UI'ı (`department_id` modelde var, UI yok).

### 4.10 Çalışan Performans Kartı + Mevsimsellik — Etki 3 · Efor S

Personel detayına "son 6 ay" şeridi: devamsızlık mini-bar, geç kalma, mesai (nötr kart: "yıllık mesai 252 saat" — H11 gösterimi burada), akord hakedişi; "sıradaki zam zamanı" notu (son zam +12 ay; H14 uyarısıyla birleşir). **Mevimsel karşılaştırma (v1.1):** "geçen yıl bu ayda kaç kişiydik, ne ürettik" — birikmiş hafızanın en somut çıktısı; 4.13 sipariş arşiviyle aynı altyapı.

### 4.11 QR ile Çalışan Self-Yoklama — Etki 2 · Efor L (moonshot'a yakın)

Persona için üç katmanlı sürtünme (okutma davranışı, tablet maliyeti, "okuttu sonra çıktı" şüphesi → yine manuel kontrol). Ek yapısal engel: çalışanlar auth kullanıcısı değil; RLS `org_members` rollerine kurulu — çalışan principal'ı + her tabloda kendi-kaydı politikaları gerekir (ayrı M'lik ön çalışma). Katalogda kalsın; ancak 4.2 + çalışan self-service birlikte değerlendirilince anlam kazanır.

### 4.12 Kıdem / İhbar Tazminatı Tahmini — Etki 3 · Efor M (yaklaşık modda)

**v1.1 düzeltmesi:** "son net maaş üzerinden" yaklaşımı **yanlış sonuç üretir** — İK md.147 uyarınca tazminata esas ücret giydirilmiş **brüt** (mesai, prim, hakediş dahil son 1 yıl ortalaması) ve kıdem tavanı kontrolü gerekir. Ya: (a) taban = "son maaş + düzenli ek ödemeler (12 ay ortalaması)" + ayar parametreleriyle yaklaşık brüte çıkış + tavan uyarısı + "yaklaşık, muhasebeciniz kesinleştirir" etiketi; ya da (b) özellik ertelenir. İhbar aralıkları İK md.17: 6 ay altı 2, 1,5 yıl altı 4, 3 yıl altı 6, 3+ yıl 8 hafta.

### 4.13 Üretim Modülü v2 (Fire, Verim, Sipariş Durumu) — Etki 3 · Efor L

Partiye hatalı adet (fire oranı); verimlilik = üretim / kişi·gün (puantajla birleşir); `order_name` + durum çipleri (Kesim → Dikim → Ütü → Paket → Kargolandı); tamamlanmış sipariş arşivi ("geçen sene bu işi 12 günde çıkarmışız"). Akord (4.2) sonrası gerçek günlük açılış nedeni olur — sıralama bu yüzden doğru.

### 4.14 Android Widget — Etki 2 · Efor M

"Bugün 43/46 işte" widget'ı ancak günlük çekirdek değer güçlüyende anlamlıdır (akord/üretim girişinden sonra). **Veri tazelik sorunu:** uygulama online-only ve pullAll yalnız foreground'da — widget bayat veri gösterir ya da background görev altyapısı gerekir; "son açılışta" etiketi gibi dürüst bir çözümle başlanır. Paket doğrulaması gerekir (`react-native-android-widget` gibi; CNG uyumlu config plugin şart) — plan aşamasında kesin paket adı iddia edilmez.

### 4.15 Fotoğraflı Avatar Grid Yoklama — Etki 3 · Efor S (Faz 1b'ye alındı)

≤30 kişi için liste yerine 4 sütunlu avatar grid. **Dokunma tasarımı (v1.1):** tek dokunuş = kırmızı (gelmedi) yanlış dokunuşta maaşı bozan kayıt üretir — döngü "geldi → gelmedi → diğer" + dokunma anında Geri Al toast'u ile kurulur; uzun bas = diğer durumlar; fotoğrafsızlarda baş harf avatarı. Ucuz, çekirdek döngüyü hızlandırır → Faz 4'ten Faz 1b'ye alındı. Toplu işaretleme keşfedilebilirliği (U9) grid modunda doğal çözer.

### 4.16 OTA Güncelleme (expo-updates) — Etki 4 · Efor S (Faz 0–1'e alındı)

Mağaza onayı beklemeden kritik JS düzeltmesi; **bootstrap gerçeği**: OTA ancak içinde gömülü geldiği binary'den itibaren çalışır → erken eklendiği her gün risk penceresi daralır. `npx expo install expo-updates` ile SDK 57 sürüm teyidi ilk iş; `eas.json`'a `channel`, `runtimeVersion` politikası (`appVersionSource: "remote"` etkileşimi netleştirilir); native değişiklik gerektiren düzeltmeler OTA ile gidemez — dağıtım notunda belirtilir; version-gate ile birlikte: "kritik hata → OTA 24 saatte, gerektiğinde kapı mağaza sürümünü zorla". Docs çelişkisi kapanır.

### 4.17 Diğer Hızlı Kazanımlar — Efor S

- **Kurulum tamamlama (v1.1, Faz 0'a alındı):** sihirbaza "maaş gününüz + ödeme şekli (nakit/banka/karışık)" adımı (4.1/4.3/4.7'nin girdileri); bitişte 3 adımlık ilk kullanım kartı (ilk yoklamayı gir…); U14 departman→çalışan bağlantısı.
- **Ana ekran metin düzeltmesi (v1.1, Faz 0):** "Maaş & Parça Başı Hakediş" → "Maaş Günü & Bordro" (karşılanmayan vaat her maaş döngüsünde güven eritir).
- **Cetvel PDF'ine imza alanı + sayfa no/tarih damgası** (defter testi 2. soru).
- **Otomatik yedek güvencesi:** aylık kapanışta otomatik JSON yedeği + "son yedek X ay önce" uyarısı.
- **Excel içe aktarma şablonu** ("örnek dosyayı indir" + sütun eşleme esnekliği).
- Puantaj gün onayı geri alma (U9), "Hepsini Ödendi" onayı (U6), taslakta PDF (U7).
- **Rehberden içe aktarma (erteledi):** `expo-contacts` `READ_CONTACTS` izni Play prominent-disclosure yükü getirir (planın kendi RECORD_AUDIO eleştirisiyle aynı mantık) — manuel giriş + Excel şablonu yeterliyken ertelenir.

### 4.18 Moonshot Kataloğu (bilinçli ertelenen)

Çalışan self-service uygulaması · sesli yoklama · çoklu şube · abonelik modeli (tek atölye ücretsiz + çoklu yönetici ücretli, RevenueCat) · çoklu dil · muhasebeci web paneli · denkleştirme (İK md.42) · fazla süreli çalışma %25/%50 segment modeli (U5 notundaki mevzuat ayrımı).

### 4.19 Yıl Sonu Karnesi — Etki 4 · Efor S–M (v1.1 yeni)

Ocak'ta "bu yıl: X gün kayıt, Y ₺ maaş ödendi, Z ₺ avans tahsil edildi, ortalama devam %94, en uzun kıdem Ayşe Hanım 6 yıl" — PDF + WhatsApp paylaşımı. Birikmiş hafızanın (3.2/6. basamak) görünür kılması; veri zaten var, paketleme gerekiyor. Esnaf için duygusal ve terk edilemezlik hissi veren tek çıktı; paylaşıldıkça sosyal kanıt olur.

### 4.20 Çıktılarda marka dipnotu (sosyal kanıt) — Etki 3 · Efor S (v1.1 yeni)

Pusula/cetvel PDF'lerinde küçük, zarif, **kapatılabilir** "Atölye Defteri ile hazırlandı" dipnotu. Pusulalar zaten üçüncü kişilere gidiyor; bu bedava dağıtılan marka malzemesinin çöpe atılmamasıdır. Opt-out ayarı + mağaza linki paylaşım kutusu; esnaf güvenini sarsmayacak ölçüde.

---

## Bölüm 5 — Mimari Ön Koşullar (özelliklerden önce)

1. **Silme senkronizasyonu (S1):** S1'in kapsamı 7 tablo (attendance, overtime, calendar_events, debts, departments, org_members, production_batches). Tombstone protokolü **ayrı bir tasarım notu** olmalı: kolon, merge kuralı (`tombstone.updated_at > local.updated_at`), resurrect kuralı (deterministik UUID'li tabloda sil→yeniden ekle aynı id'yi üretir — upsert diriltmeli), retention, her biri için regression testi. Pilot: 4 tablo, kural stabilize, sonra kalan 3. `org_members` için `updated_at` migration'ı ya da set-replace. **Rol×silme matrisi (G8)** bu tasarımla birlikte netleşir.
2. **Ödemelerde sunucu tarafı bütünlük (S2):** tek RPC transaction (insert + `SUM`'dan toplam + durum); akım yarıda kesilirse tutarsız durum kalmaz; Faz kabulüne "bilinçli yarım-durum testi".
3. **Senkron imleci (S4/S5/S6):** tablo başına imleç (hata veren tablo ilerlemez), sunucu `now()` bazlı, tek pullAll kilidi.
4. **restore_org_backup kökensel kapsamı (S3):** tablo listesi migration'da elle değil sistem katalogundan üretilir + otomatik kapsam testi (atlanan test fail-with-warning üretir). **Tek strateji uzlaşısı:** Faz 0'daki restore işi "listeyi katalogdan üreten migration + kapsam testi" olarak yapılır; MOLA planının 0010 içindeki elle liste maddesi düşer, yalnızca yeni tablo test senaryosuna girer. Migration numaralandırması tek kronolojide: Faz 0 → 0010 (restore otomasyonu + Faz 0 şema düzeltmeleri), Faz 2 → 0011 (temp_work_logs), 0012 (akord).
5. **compute.ts testi (2.5):** Faz 0 işi; kapanış çubuğu ve bordro değişiklikleri bu testler yeşil olmadan başlamaz. Mekanizma: `jest __tests__/features/bordro` kırmızıysa faz çıkışı yok.
6. **Bildirimler matris altına alınır:** 4.7 bildirim sayısını ~3'ten ~10'a çıkarır; iOS 64 limit politikası, Android kanal grupları, sahte-zamanlayıcı testleri önkoşul.
7. **agent.md revizyonu (v1.1):** Faz 1'in İLK işi. Kural 1–2 offline Faz A/B ile uyumlu yeni haline getirilir ("mutasyon önce sunucuya gider; kuyruk modunda önce kuyruğa sonra sunucuya; store her zaman sunucu gerçeğini yansıtır"); "deleted_at eklenmez" maddesi yalnızca employees tablosuyla sınırlanır. README/docs güncellemeleri (2.7) aynı işin parçası.

---

## Bölüm 6 — Master Yol Haritası

**Efor disiplini:** **L** işleri en az iki parçaya bölünerek planlanır; her parça ayrı shippable'dır. Her faz sonunda tsc/lint/jest sıfır hata + değişiklik notu; Supabase migration'ları dev'de `db push` + RLS testleriyle doğrulanır.

**Prod dağıtım kuralı (v1.1, her migration için):** (1) dev'de doğrula → (2) prod'dan tam yedek al + geri-yükleme provası → (3) migration'ı prod'a uygula (**geriye uyumlu** — alanları eski istemci bozulmayacak şekilde; bozulacaksa önce `min_version` yükseltilir, mağaza onayı sonrası migration) → (4) istemci sürümünü mağazaya ver → (5) 48 saat hata izleme. Yıkıcı değişiklik iki aşamalı.

**Mağaza süreci düzeltmesi (v1.1):** her faz bir **iç test (internal)** derlemesiyle biter; iç test kanalında 12 kullanıcı/14 gün şartı yoktur — o kural yalnızca yeni kişisel hesapla ilk üretime çıkışta geçerlidir ve bir kez tatmin edilmiştir (v1.0.6 yayında). Mağaza onayı 1–3 gün sürebilen dış bir bağımlılıktır; OTA sonrası JS-only düzeltmeler bu beklemeden ayrışır.

### Faz 0 — Acil Düzeltme Sprint'i

Amaç: para/veri KRİTİK'leri, görünürlük hızlı kazanımları, OTA altyapısı, planın kendi önkoşulları. **İç sıra önemlidir: önce para doğruluğu, sonra raporlar girişi, pusula en son** — yeni görünen çıktılar yanlış rakamı daha geniş kitleye dağıtmamalı (S1/S2 Faz 1'de kapandığından pusula v1'e eksik-gün uyarısı iliştirilir).

| İş | Kaynak | Efor |
|---|---|---|
| **G1 geçici azaltım kararı** (24 saat içinde): davet/kullanıcı oluşturma akışı geçici kısıtlanır ya da owner-only yapılır — karar ve tarihi Risk R1'e yazılır | G1 | S |
| G1 kalıcı düzeltme: e-posta sahipliği OTP/magic-link + rollback + Resend kurulum değerlendirmesi | G1, G2 | **M** |
| restore_org_backup katalogdan üretim + kapsam testi koşumu (atlanan test fail-with-warning) | S3, Önkoşul 4 | S–M |
| Departman silmede takvim/olay koruması (CASCADE → SET NULL / uyarılı) | D1 | S |
| "Farkı borca çevir" dedup + gerçek-borç/borç-değil ayrımı | H8 | S |
| Yöntem A kesintiyi tabanla sınırla + `active=false` filtresi | H3, H9 | S |
| Gece vardiyası aritmetiği + '25:00' doğrulaması (geçici; yapısal 4.9 Faz 2'de) | H4 | S |
| pullAll tablo-başına imleç (S4 minimal) | S4 | S |
| **compute.ts birim test katmanı** (kapanış çubuğunun önkoşulu) | Önkoşul 5 | S–M |
| **Raporlar'a giriş noktası** | U1 | S |
| **Pusula butonu + WhatsApp metni + PDF firma adı + eksik-gün uyarısı** | U2, U3, 4.4 | S |
| Ana ekran "Parça Başı" vaadini düzelten metin değişikliği | H1 | S |
| Kurulum: maaş günü + ödeme şekli adımı, ilk kullanım kartı, departman→çalışan bağlantısı | U14, 4.17 | S |
| **expo-updates kurulumu** (SDK 57 teyidi, kanal, runtimeVersion politikası) | 4.16 | S |
| MOLA Faz 1'i test+lint ile bitirip commit'le (schedule.test.ts dahil) | 2.7 | S |
| README/docs/agent.md senkron (cihaz modu sil, test sayıları, ikon, OTA artık gerçek) + `data_safety_export.csv` çıkar + `.zcodeignore` + RECORD_AUDIO plugin yoluyla | 2.7 | S |

**Kabul (v1.1 düzeltmesi):** (1) yedek→dönüş sonrası üretim kayıtları her iki cihazda görünür; (2) H3/H4/H8 için yeni regression testleri yeşil; (3) compute.ts testleri yeşil; (4) raporlar ve pusula ulaşılabilir, pusulada firma adı ve eksik-gün uyarısı var; (5) G1 geçici azaltım uygulanmış ve belgelenmiş; (6) **S1'in hâlâ açık olduğu iki cihazla belgelenmiş senaryo notu üretilir** (bilinen hata kaydı — kapanışı Faz 1 kabulündedir); (7) OTA iç test kanalında ilk dağıtım yapılmış.

### Faz 1 — Güven & Görünürlük (1a/1b bölünmüş)

**Faz 1a — Veri bütünlüğü:**

| İş | Kaynak |
|---|---|
| **agent.md revizyonu (fazın ilk işi)** | Önkoşul 7 |
| Silme senkronu (tombstone protokolü, 4 tablo pilot + 3 tablo; rol×silme matrisi G8 çözümü dahil) | S1, G8, Önkoşul 1 |
| Ödeme RPC (idempotent, tek transaction, yarım-durum testi) | S2 |
| RLS DELETE boşlukları + composite FK/org-check + son-owner DB'de | G3–G5 |
| Sentry (crash + ürün olayları: kapanış adımları, pusula, silme-geri al) | 2.7, Bölüm 7 |

**Faz 1b — Ürün:**

| İş | Kaynak |
|---|---|
| Offline Faz A: tablo bazlı/projeksiyonlu kalıcı cache — **Faz 1a silme kabulü geçmeden başlamaz**; 200×12 ay sentetik veriyle açılış ölçümü | 4.6-A, S11 |
| Ay Sonu Kapanış Çubuğu v1 (adım 4 = toplam kartı, adım 5 = JSON yedek + paylaşım) | 4.1 |
| Hatırlatma Merkezi v1 (maaş günü, taksit, rapor bitişi, SGK bildirim, kapanış, akşam özeti+seri; varsayılan set + günlük üst sınır; derin bağlantı) | 4.7, U4, U16 |
| Avatar grid yoklama (dokunma döngüsü + Geri Al) | 4.15 |
| Bordro UX: "Hepsini Ödendi" onayı + loading, taslakta PDF, gün onayı geri alma | U6, U7, U9 |
| Bordro geçmişi yıl geçişli seçici | U10 |

**Kabul:** uçak modunda tüm listeler okunur; iki cihazda silme 60 sn içinde yansır; kapanış çubuğu eksik günü yakalar ve her adımın tetik koşulu yazılı senaryo tablosuyla doğrulanır (maaş gününden 3 gün önce 09:00 vb.); bildirimler opt-in, günlük ≤ 2; agent.md yeni kurallarla tutarlı.

### Faz 2 — Para & Tekstil Derinliği

| İş | Kaynak |
|---|---|
| Akord/parça başı: 0012 migration'ı, uretim akışı, hakediş→bordro, **asgari ücret garantisi**, fire alanı, geçiş/atanmamış partiler, birleştirme senaryoları (PLAN 14.1 +3 satır) | 4.2 |
| Geçici/Günlük çalışan (0011, MOLA planı + zarf/ödenecekler entegrasyonu) | 4.8 |
| Maaş Günü Nakit Planlayıcı + Zarf Modu (bankamatik brekleri ayar arkasında) | 4.3 |
| Muhasebeci Paketi (iki sütunlu gün listesi — **2–3 muhasebeci format onayı olmadan mağazaya çıkmaz**; temin edilemezse sentetik kabul: 10 çalışanlık veri seti + bağımsız elle hesapla kuruş karşılaştırması) | 4.5 |
| Vardiya (gece aritmetiği yapısal + İK md.69) + departman bazlı takvim UI | 4.9 |
| Mesai UX: çarpan seçici + 4+ saat/dakika; 270 saat nötr kartı (4.10'da) | U5, H11 |
| H5–H7 düzeltmeleri: firma tatili onay/uyarı + ek çalışma önceliği; rapor koşusu (hafta sonu + ay sınırı bağlam parametresi); hafta tatili ay sınırı | H5–H7 |
| Yıllık izin iş günü sayımı (H19; bakiye değişimi kullanıcıya duyurulur) | H19 |

**Kabul:** akord hakediş + garanti farkı elle hesapla kuruşu kuruşuna aynı (testli); gece ekibi doğru ücretleniyor; muhasebeci formatı onaylı ya da sentetik kabul geçerli; izin bakiyeleri iş günü bazlı.

### Faz 3 — Dayanıklılık

| İş | Kaynak |
|---|---|
| Offline Faz B1: ekleme/upsert kuyruğu (yoklama, üretim, avans) + base-version + pending şeridi | 4.6-B1 |
| Offline Faz B2: güncelleme kuyruğu; silmeler çevrimiçi-zorunlu olarak işaretlenir | 4.6-B2 |
| Senkron sertleştirme: sunucu saati imleci (kalan), tek pullAll kilidi; `noUpdatedAtTables` kademeli `updated_at`'a | S5, S6, S12 |
| Çakışma görünürlüğü: aynı gün farklı girilen kayıtta "diğer cihazda değişti" bilgisi (audit_log'tan) | S8 |
| Audit log tamamlama + retention | G6 |
| Schema bakımı: eksik index'ler, leave_adjustments damgaları | D2, D3 |

**Kabul:** uçak modunda yoklama/üretim/avans girilir, internet gelince çakışmasız çıkar (bilinçli senaryo testi); OTA ile iç test kanalına 1 saatte dağıtım.

### Faz 4 — Büyüme ve Tutundurma (sürekli)

Öncelik: Performans kartı + mevsim karşılaştırma (4.10) → Yıl Sonu Karnesi (4.19) → marka dipnotu (4.20) → cetvel imza alanı → otomatik yedek güvencesi + Excel şablonu (4.17) → kıdem/ihbar yaklaşık modda (4.12) → Üretim v2/sipariş (4.13) → widget (4.14). Her birinin başlangıcı, önceki fazın kabul kriterleri tamamlanınca değerlendirilir.

### Süreç kuralları (tüm fazlar)

- Her migration'da restore kapsamı **otomatik test** (Faz 0'da kurulan koşum; atlanan test fail-with-warning).
- Hesap motoruna dokunan her iş PLAN 14.1 senaryo tablosuna satır ekler; `jest __tests__` (domain + compute) kırmızıysa faz çıkışı yok — satır yoksa iş bitmiş sayılmaz.
- Kesinleşmiş geçmiş bordrolar 0007 trigger'larıyla kilitli kalır; yeni kalemler (hakediş, garanti farkı) yalnızca **sonraki** bordrolara girer.
- Hesap davranışı değişiklikleri (H3, H19 vb.) sürüm notu + uygulama içi "bu ay hesap yöntemi düzeltildi" bilgisiyle duyurulur (Risk R6).

---

## Bölüm 7 — Başarı Ölçütleri (v1.1 tanımları netleştirildi)

**Ölçüm altyapısı:** Sentry (Faz 1a) + anonim, toplu olay sayacı (PII'sız; gizlilik politikasına ek satır). `Sharing.shareAsync` gerçek gönderimi bildirmez → paylaşım metrikleri **"paylaşım başlatma"** olarak adlandırılır (tamamlanma iddiası yok).

**Teknik:** crash-free oturum ≥ %99,5 · senkron hatası < %1 · hayalet satır 0 · her sürümde restore testi yeşil.

**Ürün:** "yoklama tamamlama" = o org-günü için en az bir yoklama satırı girilmiş gün / o ay ≥ 3 gün uygulama açmış org-günü — hedef **≥ %80** · kapanış çubuğu: başlatma ≥ %80, tamamlama ilk çeyrek **≥ %60** (sonraki %75) ve **hangi adımda düştükleri huni olarak ölçülür** · paylaşımlar: "son 3 ayda en az bir pusula/cetvel/muhasebeci paketi başlatan org oranı ≥ %50" · vekil defter-dönüş metriği: "ay boyunca tek gün bile yoklama girilmeyen org oranı" düşüyor · kohort: Hafta 1 vs 4 vs 8 yoklama tamamlama.

**Küçük taban dönemi (< 20 org):** yüzdeler yerine mutlak sayılar (örn. "ayda ≥ 30 paylaşım başlatma") + aylık 5 kullanıcı görüşmesi niteliksel paneli.

**Nitel:** "Geçen aya göre bu ayı kapatmak ne kadar sürdü?" — cevap "5 dakika" olmalı.

---

## Bölüm 8 — Riskler (v1.1 eklendi; PLAN.md Bölüm 15'ten taşınanlar dahil)

| # | Risk | Önlem |
|---|---|---|
| R1 | **G1 canlı üretimde açık** (v1.0.6); OTA yok, mağaza onayı 1–3 gün | Faz 0 öncesi 24 saat içinde geçici azaltım kararı (davet akışı kısıtı/owner-only); karar-tarih bu belgeye yazılır |
| R2 | Supabase ücretsiz katman: 7 gün hareketsizlikte duraklama, otomatik yedek yok | JSON yedek disiplini + aylık restore provası; büyümede Pro plan kararı |
| R3 | Tek geliştirici yedekliliği (bus factor) | Kurtarma kitabı (Supabase/Play/EAS erişimleri, prod geri dönüş adımları) dış ortamda ikinci kopya |
| R4 | Play/Expo SDK yıllık zorunlulukları | Yıllık SDK yükseltme için ayrık bakım penceresi planlanır |
| R5 | Migration veri kaybı / backfill yanlışlığı (canlı kullanıcı verisi var) | Bölüm 6 prod dağıtım kuralı (5 adım, geriye uyumlu, min_version koordinasyonu) |
| R6 | Hesap davranışı değişikliğinde "aynı veriyle net değişti" güven şoku | Sürüm notu + uygulama içi duyuru; PLAN 15'in ilk riski |
| R7 | Pilot atölye / muhasebeci temini | Faz 1'de temin süreci başlar; temin yoksa sentetik kabul kriterleri (Faz 2) |
| R8 | SMTP limiti (Supabase saatte birkaç e-posta) — G1 OTP çözümünü doğrudan etkiler | Resend ücretsiz katmanı değerlendirmesi G1 işinin parçası |
| R9 | Muhasebeci direnci / net-brüt ikiliği | "Yaklaşık, muhasebeciniz kesinleştirir" dili; format onayı kapısı (4.5) |
| R10 | Bildirim spam → bildirimlerin tamamının kapatılması | Varsayılan set (maaş günü + kapanış açık, diğerleri kapalı), günlük üst sınır 2, akıllı susma |
| R11 | Yasal uyarıların "denetim" hissi üretmesi → veri kalitesi çöküşü | 270 saat nötr kart olarak (bildirim değil); dil nötr, eşik ayarlanabilir |

---

## Ek A — Mevcut Durumla İlişki

- `docs/PLAN.md` (v2): ürün omurgası geçerli; **Bölüm 9 (offline) ve 10 (OTA maliyeti)** bu planın Faz 1/0'ında gerçekleşir — PLAN'da güncellenecek olan "Bilinen sınırlar" değil (o bölüm README.md:104'tedir; Faz 0 README işiyle kapanır), Bölüm 9 ve mimari şemadır.
- `docs/MOLA_VE_GECICI_CALISAN_PLANI.md`: geçerli; Faz 1'i Faz 0'ın son maddesi, Faz 2–3'ü master plan Faz 2'si. **Restore maddesi uzlaşısı:** 0010 içindeki elle tablo listesi ekleme maddesi düşer (Önkoşul 4 katalog yaklaşımı yerine geçer); yalnızca yeni tablonun kapsam testine eklenmesi kalır. Migration numaralandırması tek kronolojide: 0010 restore+Faz 0, 0011 temp_work_logs, 0012 akord.
- Bu doküman bulgu listesini 26 Ekim 2026 çalışma ağacı olarak dondurur; düzeltme yapılan her madde burada ✅ ile işaretlenir.

## Ek B — Review Süreci (v1.1)

Plan v1.0, dört bağımsız bakışla denetlendi: (1) kıdemli RN/Expo mobil mimar — senkron/veri bulguları ve çözüm gerçekçiliği; (2) Türk KOBÜT/esnaf pazarına odaklı ürün-UX stratejisti — değer hipotezi ve tutundurma; (3) iş hukuku/bordro-mevzuat danışmanı — hesap ve yasal doğruluk; (4) teknik program yöneticisi (kırmızı ekip) — tutarlılık, uygulanabilirlik, risk. Katkılarının tamamı bu sürüme işlenmiştir; mevzuat kapsamında kesinlik gerektiren noktalar metinde "doğrulanmalı" olarak işaretlenmiştir (hukuki görüş değil).
