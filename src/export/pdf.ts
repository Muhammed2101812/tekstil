import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { PayrollItem } from '../types';
import { formatMoney } from '../utils/format';

/**
 * PDF üretimi (PLAN 3.2): expo-print + HTML şablonları.
 * Maaş pusulası, bordro özeti, puantaj cetveli (yatay), borç dökümü.
 */

export interface PdfOrgInfo {
  name: string;
  logoUrl?: string | null;
}

const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #101828; padding: 24px; }
  h1 { font-size: 20px; }
  h2 { font-size: 15px; margin-bottom: 8px; }
  .firma { display: flex; align-items: center; gap: 12px; margin-bottom: 18px; }
  .firma img { width: 44px; height: 44px; border-radius: 10px; }
  .muted { color: #667085; font-size: 12px; }
  .baslik { border-bottom: 2px solid #3B5BDB; padding-bottom: 10px; margin-bottom: 14px; display:flex; justify-content: space-between; align-items: flex-end; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th { text-align: left; color: #667085; font-size: 11px; text-transform: uppercase; padding: 6px 8px; border-bottom: 1px solid #E4E7EC; }
  td { padding: 7px 8px; border-bottom: 1px solid #F0F2F7; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .poz { color: #12B76A; font-weight: 700; }
  .neg { color: #F04438; font-weight: 700; }
  .toplam { background: #F6F7FB; font-weight: 800; }
  .kart { border: 1px solid #E4E7EC; border-radius: 12px; padding: 14px; margin-bottom: 10px; }
  .puantaj td, .puantaj th { text-align: center; padding: 4px 2px; font-size: 10px; border-bottom: 1px solid #F0F2F7; }
  .puantaj td.gun { font-size: 10px; }
  .kutu { display:flex; gap: 14px; }
  .kutu > div { flex: 1; }
  @page { margin: 12mm; }
`;

function header(org: PdfOrgInfo, title: string, sub: string) {
  return `
  <div class="baslik">
    <div class="firma">
      ${org.logoUrl ? `<img src="${org.logoUrl}" />` : ''}
      <div>
        <h1>${escapeHtml(org.name)}</h1>
        <div class="muted">${escapeHtml(sub)}</div>
      </div>
    </div>
    <div style="text-align:right">
      <h2>${escapeHtml(title)}</h2>
      <div class="muted">${new Date().toLocaleDateString('tr-TR')}</div>
    </div>
  </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function shareHtml(html: string, fileName: string) {
  if (Platform.OS === 'web') {
    throw new Error('Dışa aktarma yalnızca mobil uygulamada kullanılabilir');
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName });
  } else {
    throw new Error('Paylaşım bu cihazda desteklenmiyor');
  }
}

/** Tek çalışanın maaş pusulası (PLAN 6.8): firma logolu, şık tasarım */
export async function sharePusulaPdf(item: PayrollItem, org: PdfOrgInfo, ayBasligi: string) {
  const satirlar = item.breakdown.lines
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.label)}</td>
        <td class="muted">${escapeHtml(l.detail)}</td>
        <td class="num ${l.amount >= 0 ? 'poz' : 'neg'}">${l.amount >= 0 ? '+' : '−'}${formatMoney(Math.abs(l.amount), { kurus: true })}</td>
      </tr>`
    )
    .join('');

  const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${header(org, 'Maaş Pusulası', ayBasligi)}
    <div class="kart">
      <div class="kutu">
        <div>
          <div class="muted">ÇALIŞAN</div>
          <strong>${escapeHtml(item.employee_name)}</strong>
        </div>
        <div>
          <div class="muted">DEPARTMAN</div>
          <strong>${escapeHtml(item.department_name ?? '—')}</strong>
        </div>
        <div>
          <div class="muted">SAATLİK ÜCRET</div>
          <strong>${formatMoney(item.hourly_rate)}</strong>
        </div>
      </div>
    </div>
    <table>
      <thead><tr><th>Kalem</th><th>Açıklama</th><th class="num">Tutar</th></tr></thead>
      <tbody>
        ${satirlar}
        <tr class="toplam"><td colspan="2">ÖDENECEK NET</td><td class="num">${formatMoney(item.net_payable, { kurus: true })}</td></tr>
      </tbody>
    </table>
    <p class="muted" style="margin-top:18px">Bu pusula net ödeme takibi içindir; yasal bordro değildir. SGK ve vergiler muhasebeci tarafından hesaplanır.</p>
  </body></html>`;

  await shareHtml(html, `pusula-${item.employee_name.replace(/\s+/g, '-')}.pdf`);
}

/** Tüm çalışanların pusulaları tek PDF'te */
export async function sharePayrollPdf(items: PayrollItem[], ayBasligi: string) {
  const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${header({ name: 'Bordro' }, 'Bordro Özeti', ayBasligi)}
    <table>
      <thead><tr><th>Çalışan</th><th>Departman</th><th class="num">Taban</th><th class="num">Kesinti</th><th class="num">Mesai</th><th class="num">Taksit</th><th class="num">Net</th></tr></thead>
      <tbody>
        ${items
          .map(
            (i) => `<tr>
          <td>${escapeHtml(i.employee_name)}</td>
          <td>${escapeHtml(i.department_name ?? '—')}</td>
          <td class="num">${formatMoney(i.base_salary)}</td>
          <td class="num neg">−${formatMoney(i.absence_cut)}</td>
          <td class="num poz">+${formatMoney(i.overtime_pay)}</td>
          <td class="num neg">−${formatMoney(i.debt_cut)}</td>
          <td class="num" style="font-weight:800">${formatMoney(i.net_payable, { kurus: true })}</td>
        </tr>`
          )
          .join('')}
        <tr class="toplam">
          <td colspan="6">TOPLAM (${items.length} kişi)</td>
          <td class="num">${formatMoney(items.reduce((s, i) => s + i.net_payable, 0), { kurus: true })}</td>
        </tr>
      </tbody>
    </table>
  </body></html>`;
  await shareHtml(html, `bordro-${ayBasligi.replace(/\s+/g, '-')}.pdf`);
}

/** Aylık puantaj cetveli (klasik tekstil çizelgesi, yatay PDF) */
export async function sharePuantajPdf(
  org: PdfOrgInfo,
  rows: { name: string; department: string | null; days: (string | null)[] }[],
  gunler: { date: string; isWorkday: boolean }[],
  ayBasligi: string
) {
  const sembol: Record<string, string> = {
    geldi: '✓', gelmedi: 'X', gec_geldi: 'G', erken_cikti: 'E', yarim_gun: 'Y',
    yillik_izin: 'İ', mazeret_izni: 'M', ucretsiz_izin: 'Ü', rapor: 'R',
  };
  const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${header(org, 'Puantaj Cetveli', ayBasligi)}
    <table class="puantaj">
      <thead>
        <tr>
          <th style="text-align:left">Çalışan</th>
          ${gunler.map((g) => `<th class="gun">${g.isWorkday ? Number(g.date.slice(8)) : '·'}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td style="text-align:left">${escapeHtml(r.name)}<div class="muted" style="font-size:9px">${escapeHtml(r.department ?? '')}</div></td>
          ${r.days.map((d, i) => `<td>${gunler[i].isWorkday ? (d ? sembol[d] ?? '?' : '✓') : ' '}</td>`).join('')}
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
    <p class="muted" style="margin-top:10px">✓ Geldi · X Gelmedi · G Geç · E Erken · Y Yarım · İ Yıllık İzin · M Mazeret · Ü Ücretsiz · R Rapor</p>
  </body></html>`;
  await shareHtml(html, `puantaj-${ayBasligi.replace(/\s+/g, '-')}.pdf`);
}

/** Borç dökümü PDF */
export async function shareBorcPdf(
  org: PdfOrgInfo,
  rows: { name: string; given: number; paid: number; remaining: number }[]
) {
  const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${header(org, 'Avans / Borç Dökümü', `${rows.length} kayıt`)}
    <table>
      <thead><tr><th>Çalışan</th><th class="num">Verilen</th><th class="num">Ödenen</th><th class="num">Kalan</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td class="num">${formatMoney(r.given)}</td>
          <td class="num poz">${formatMoney(r.paid)}</td>
          <td class="num" style="font-weight:800">${formatMoney(r.remaining)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </body></html>`;
  await shareHtml(html, 'borc-dokumu.pdf');
}

/** Devamsızlık analizi PDF */
export async function shareDevamsizlikPdf(
  org: PdfOrgInfo,
  rows: { name: string; absent: number; late: number; early: number }[],
  ayBasligi: string
) {
  const html = `<html><head><meta charset="utf-8"><style>${CSS}</style></head><body>
    ${header(org, 'Devamsızlık Analizi', ayBasligi)}
    <table>
      <thead><tr><th>Çalışan</th><th class="num">Gelmedi</th><th class="num">Geç Kalma</th><th class="num">Erken Çıkış</th></tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr>
          <td>${escapeHtml(r.name)}</td>
          <td class="num neg">${r.absent}</td>
          <td class="num">${r.late}</td>
          <td class="num">${r.early}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </body></html>`;
  await shareHtml(html, 'devamsizlik.pdf');
}
