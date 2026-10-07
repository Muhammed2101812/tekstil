/** Para ve tarih biçimleme (PLAN 7.2: ₺30.000,00; büyük özetlerde ₺1,2 Mn) */

const nf2 = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const nf0 = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 });

export function formatMoney(amount: number, opts: { kurus?: boolean; sign?: boolean } = {}): string {
  const { kurus = false, sign = false } = opts;
  const abs = Math.abs(amount);
  const body = kurus ? nf2.format(abs) : nf0.format(abs);
  const prefix = sign ? (amount < 0 ? '−' : '+') : amount < 0 ? '−' : '';
  return `${prefix}₺${body}`;
}

export function formatMoneyShort(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const v = (abs / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '');
    return `₺${v} Mn`;
  }
  return formatMoney(amount);
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (m === 0) return `${h} sa`;
  return `${h} sa ${m} dk`;
}

export const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export const GUN_ADLARI = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function ayAdi(month: number): string {
  return AY_ADLARI[month - 1] ?? '';
}

/** '2026-10-03' → '3 Ekim Cumartesi' */
export function formatTarih(iso: string, opts: { gunAdi?: boolean; yil?: boolean } = {}): string {
  const [y, m, d] = iso.split('-').map(Number);
  const jsDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const parts = [`${d} ${AY_ADLARI[m - 1]}`];
  if (opts.yil) parts[0] += ` ${y}`;
  if (opts.gunAdi) parts.push(GUN_ADLARI[jsDay]);
  return parts.join(opts.gunAdi ? ' ' : ', ');
}

export function formatTarihKisa(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

/** '2026-11' → 'Kasım 2026' */
export function formatAy(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  return `${AY_ADLARI[m - 1]} ${y}`;
}

/** TCKN: 11 haneli, algoritma kontrollü */
export function gecerliTckn(tc: string): boolean {
  if (!/^\d{11}$/.test(tc)) return false;
  const d = tc.split('').map(Number);
  if (d[0] === 0) return false;
  const t1 = (d[0] + d[2] + d[4] + d[6] + d[8]) * 7;
  const t2 = d[1] + d[3] + d[5] + d[7];
  if ((t1 - t2) % 10 !== d[9]) return false;
  const toplam = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return toplam % 10 === d[10];
}

/** IBAN: TR + 24 hane; mod-97 kontrolü */
export function gecerliIban(iban: string): boolean {
  const m = iban.replace(/\s+/g, '').toUpperCase();
  if (!/^TR\d{24}$/.test(m)) return false;
  const rearranged = m.slice(4) + m.slice(0, 4);
  const numeric = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
  let remainder = 0;
  for (const digit of numeric) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

export function maskTc(tc: string | null): string {
  if (!tc) return '—';
  return `*** *** ${tc.slice(-4)}`;
}

export function maskIban(iban: string | null): string {
  if (!iban) return '—';
  return `TR** **** **** ${iban.replace(/\s/g, '').slice(-4)}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/** Avatar arka planı — isimden deterministik pastel renk */
export const AVATAR_RENKLER = ['#3B5BDB', '#12B76A', '#F79009', '#7A5AF8', '#15B79E', '#EF6820', '#2E90FA', '#D444F1'];
export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 997;
  return AVATAR_RENKLER[hash % AVATAR_RENKLER.length];
}
