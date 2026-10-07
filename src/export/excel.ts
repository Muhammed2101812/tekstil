import { Platform } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as XLSX from 'xlsx';
import { PayrollItem, Employee } from '../types';

/**
 * Excel üretimi (PLAN 3.2): SheetJS (xlsx) + paylama.
 * Puantaj cetveli, bordro özeti, borç dökümü, izin, personel listesi, tam yedek.
 */

async function shareWorkbook(wb: XLSX.WorkBook, fileName: string) {
  if (Platform.OS === 'web') {
    throw new Error('Dışa aktarma yalnızca mobil uygulamada kullanılabilir');
  }
  const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' }) as string;
  const { File, Paths } = FileSystem;
  const file = new File(Paths.cache, fileName);
  file.create({ overwrite: true });
  file.write(wbout, { encoding: 'base64' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, {
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      dialogTitle: fileName,
    });
  } else {
    throw new Error('Paylaşım bu cihazda desteklenmiyor');
  }
}

function autoWs(wb: XLSX.WorkBook, name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const keys = Object.keys(rows[0] ?? { A: '' });
  ws['!cols'] = keys.map((k) => ({ wch: Math.max(12, k.length + 4) }));
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31));
}

/** Aylık puantaj cetveli: satır çalışan, sütun günler (klasik çizelge) */
export async function sharePuantajExcel(
  rows: { name: string; department: string | null; days: (string | null)[] }[],
  gunler: { date: string; isWorkday: boolean }[],
  ayBasligi: string
) {
  const etiket: Record<string, string> = {
    geldi: 'G', gelmedi: 'X', gec_geldi: 'Geç', erken_cikti: 'Erken', yarim_gun: 'Yarım',
    yillik_izin: 'İzin', mazeret_izni: 'Maz', ucretsiz_izin: 'Ücr', rapor: 'Rpr',
  };
  const data = rows.map((r) => {
    const obj: Record<string, unknown> = { 'Çalışan': r.name, 'Departman': r.department ?? '' };
    gunler.forEach((g, i) => {
      obj[String(Number(g.date.slice(8)))] = g.isWorkday ? (r.days[i] ? etiket[r.days[i]!] ?? r.days[i] : 'G') : '';
    });
    const absent = r.days.filter((d) => d === 'gelmedi' || d === 'ucretsiz_izin').length;
    const izin = r.days.filter((d) => d === 'yillik_izin' || d === 'mazeret_izni').length;
    obj['Gelmedi'] = absent;
    obj['İzin'] = izin;
    return obj;
  });
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Puantaj', data);
  await shareWorkbook(wb, `puantaj-${ayBasligi.replace(/\s+/g, '-')}.xlsx`);
}

/** Bordro özeti Excel */
export async function shareBordroExcel(items: PayrollItem[], year: number, month: number) {
  const data = items.map((i) => ({
    'Çalışan': i.employee_name,
    'Departman': i.department_name ?? '',
    'Saatlik Ücret': i.hourly_rate,
    'Taban': i.base_salary,
    'Kesinti': -i.absence_cut,
    'Mesai': i.overtime_pay,
    'Prim': i.bonus,
    'Ek Kesinti': -i.extra_cut,
    'Taksit': -i.debt_cut,
    'Ödenecek Net': i.net_payable,
    'Ödenen': i.paid_amount,
  }));
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Bordro', data);
  await shareWorkbook(wb, `bordro-${year}-${String(month).padStart(2, '0')}.xlsx`);
}

/** Avans/borç dökümü Excel */
export async function shareBorcExcel(rows: { name: string; type: string; given: number; paid: number; remaining: number; date: string }[]) {
  const data = rows.map((r) => ({
    'Çalışan': r.name,
    'Tür': r.type,
    'Verilis': r.date,
    'Verilen': r.given,
    'Ödenen': r.paid,
    'Kalan': r.remaining,
  }));
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Borçlar', data);
  await shareWorkbook(wb, 'borc-dokumu.xlsx');
}

/** Yıllık izin durumu Excel */
export async function shareIzinExcel(rows: { name: string; earned: number; used: number; remaining: number }[]) {
  const data = rows.map((r) => ({
    'Çalışan': r.name,
    'Kazanılan': r.earned,
    'Kullanılan': r.used,
    'Kalan': r.remaining,
  }));
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'İzin', data);
  await shareWorkbook(wb, 'yillik-izin.xlsx');
}

/** Personel listesi Excel */
export async function sharePersonelExcel(employees: Employee[], departmentNames: Record<string, string>) {
  const data = employees.map((e) => ({
    'Ad Soyad': e.full_name,
    'Departman': e.department_id ? departmentNames[e.department_id] ?? '' : '',
    'Telefon': e.phone ?? '',
    'İşe Giriş': e.start_date,
    'Durum': e.active ? 'Aktif' : `Ayrıldı (${e.end_date ?? ''})`,
  }));
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Personel', data);
  await shareWorkbook(wb, 'personel-listesi.xlsx');
}

/** Mesai raporu Excel */
export async function shareMesaiExcel(rows: { name: string; hours: number; pay: number }[], ayBasligi: string) {
  const data = rows.map((r) => ({ 'Çalışan': r.name, 'Saat': r.hours, 'Tutar': r.pay }));
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Mesai', data);
  await shareWorkbook(wb, `mesai-${ayBasligi.replace(/\s+/g, '-')}.xlsx`);
}

/**
 * Tüm veri yedeği (PLAN 6.8): Excel sayfa sayfa + geri yüklenebilir JSON.
 */
export async function shareFullBackupExcel(db: import('../data/persist').DataDB) {
  const wb = XLSX.utils.book_new();
  autoWs(wb, 'Personel', db.employees.map((e) => ({ 'Ad': e.full_name, 'Giriş': e.start_date, 'Aktif': e.active })));
  autoWs(wb, 'Maaşlar', db.employee_salaries.map((s) => ({ 'Çalışan': s.employee_id, 'Tutar': s.amount, 'Başlangıç': s.effective_from })));
  autoWs(wb, 'Puantaj', db.attendance.map((a) => ({ 'Gün': a.day, 'Çalışan': a.employee_id, 'Durum': a.status })));
  autoWs(wb, 'Mesai', db.overtime.map((o) => ({ 'Gün': o.day, 'Çalışan': o.employee_id, 'Saat': o.hours, 'Tür': o.kind })));
  autoWs(wb, 'Borçlar', db.debts.map((d) => ({ 'Tarih': d.given_at, 'Çalışan': d.employee_id, 'Tutar': d.amount, 'Taksit': d.installments })));
  autoWs(wb, 'Ödemeler', db.debt_payments.map((p) => ({ 'Tarih': p.paid_at, 'Çalışan': p.employee_id, 'Tutar': p.amount, 'Yöntem': p.method })));
  autoWs(wb, 'Özel Günler', db.calendar_events.map((e) => ({ 'Tarih': e.date, 'Tür': e.type, 'Başlık': e.title })));
  autoWs(wb, 'Bordrolar', db.payroll_items.map((i) => ({ 'Çalışan': i.employee_name, 'Net': i.net_payable })));
  await shareWorkbook(wb, `tam-yedek-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/** JSON yedek: ilişkileri ve jsonb alanları korur, uygulamadan geri yüklenebilir */
export async function shareFullBackupJson(db: import('../data/persist').DataDB) {
  const { File, Paths } = FileSystem;
  const json = JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), db }, null, 2);
  const file = new File(Paths.cache, `tam-yedek-${new Date().toISOString().slice(0, 10)}.json`);
  file.create({ overwrite: true });
  file.write(json, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/json', dialogTitle: 'JSON Yedek' });
  }
}

/** JSON yedeği geri yükle (PLAN 8: "JSON yedek boş hesaba geri yüklenebiliyor") */
export async function restoreFromJsonText(text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const parsed = JSON.parse(text) as { version?: number; db?: import('../data/persist').DataDB };
    if (!parsed.db) return { ok: false, error: 'Geçersiz yedek dosyası' };
    const store = await import('../data/store');
    const { emptyDB } = await import('../data/persist');
    const merged = { ...emptyDB(), ...parsed.db };
    // temel bütünlük kontrolü
    if (!Array.isArray(merged.employees) || !Array.isArray(merged.attendance)) {
      return { ok: false, error: 'Yedek eksik tablo içeriyor' };
    }
    store.useDataStore.getState().replaceDB(merged);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Yedek okunamadı' };
  }
}
