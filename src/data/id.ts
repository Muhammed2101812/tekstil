import * as Crypto from 'expo-crypto';

/** İstemci tarafı rastgele UUID (satır ilk kez yazıldığında üretilir) */
export function uuid(): string {
  const native = Crypto.randomUUID?.();
  // test ortamındaki nil-UUID dönen mock'a düşme (sürüm/varyant bitli sıfırlar dahil)
  const nilPattern = /^0{8}-0{4}-[0-9a-f]{4}-[0-9a-f]{4}-0{12}$/;
  if (native && native.length === 36 && !nilPattern.test(native)) {
    return native;
  }
  return uuidFromBytes(randomBytes());
}

function randomBytes(): Uint8Array {
  const bytes = new Uint8Array(16);
  if (typeof Crypto.getRandomValues === 'function') {
    try {
      Crypto.getRandomValues(bytes);
    } catch {
      // mock/simülasyon ortamında hata verirse Math.random'a düş
    }
  }
  if (bytes.every((b) => b === 0)) {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function uuidFromBytes(bytes: Uint8Array): string {
  const b = new Uint8Array(bytes); // kopyala (deterministik yolda)
  b[6] = (b[6] & 0x0f) | 0x40; // sürüm 4
  b[8] = (b[8] & 0x3f) | 0x80; // RFC 4122 varyantı
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Tohumdan deterministik UUID: aynı mantıksal kayıt (örn. aynı çalışan+gün
 * yoklaması) her cihazda aynı id'yi üretir. Böylece offline tekrar
 * gönderimde ve iki cihazın aynı kaydı yazmasında upsert tek satırda
 * birleşir — çift kayıt oluşmaz (PLAN Bölüm 9).
 */
export async function deterministicUuid(seed: string): Promise<string> {
  try {
    const hex = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, seed, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
    const bytes = Uint8Array.from(hex.slice(0, 32).match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    return uuidFromBytes(bytes);
  } catch {
    return deterministicUuidSync(seed);
  }
}

/** Yerel modül yoksa senkron FNV-1a tabanlı yedek (tam 32 onaltılık hane) */
export function deterministicUuidSync(seed: string): string {
  let hex = '';
  let h = 0x811c9dc5;
  let salt = 0;
  while (hex.length < 32) {
    for (let i = 0; i < seed.length; i++) {
      h = ((h ^ (seed.charCodeAt(i) + salt)) * 0x01000193) >>> 0;
    }
    hex += h.toString(16).padStart(8, '0');
    salt += 1;
    h = (h ^ salt) >>> 0;
  }
  const bytes = Uint8Array.from(hex.slice(0, 32).match(/.{2}/g)!.map((b) => parseInt(b, 16)));
  return uuidFromBytes(bytes);
}
