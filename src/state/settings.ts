import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

/** Küçük arayüz tercihleri (PLAN 3.1: Zustand) */

export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * PIN özeti (agent.md): uygulama kilidi PIN'i düz metin saklanmaz;
 * SHA-256 ile özetlenir. Yerel crypto yoksa (test/mock ortamı) zayıf
 * FNV-1a yedeğine düşer — yalnızca test ortamı için kabul edilir.
 */
export async function hashPin(pin: string): Promise<string> {
  try {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `tekstil-pin:${pin}`, {
      encoding: Crypto.CryptoEncoding.HEX,
    });
  } catch {
    return fnv1aHex(`tekstil-pin:${pin}`);
  }
}

function fnv1aHex(seed: string): string {
  let hex = '';
  let h = 0x811c9dc5;
  let salt = 0;
  while (hex.length < 64) {
    for (let i = 0; i < seed.length; i++) {
      h = ((h ^ (seed.charCodeAt(i) + salt)) * 0x01000193) >>> 0;
    }
    hex += h.toString(16).padStart(8, '0');
    salt += 1;
    h = (h ^ salt) >>> 0;
  }
  return hex;
}

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 30_000;

/** Bekleme kilidinin kalan süresi (ms) — render sırasında Date.now çağırmamak için */
export function pinLockRemaining(): number {
  const s = useThemeStore.getState();
  return Math.max(0, s.pinLockUntil - Date.now());
}

interface SettingsState {
  themeMode: ThemeMode;
  appLockEnabled: boolean;
  /** SHA-256 özet — düz metin PIN asla saklanmaz */
  appLockPinHash: string | null;
  autoLockMinutes: number;
  /** Uygulama kilidi durumu (arka plana geçince true, açınca false) */
  locked: boolean;
  pinFailCount: number;
  /** Kilit sonu (epoch ms); 0 = bekleme kilidi yok */
  pinLockUntil: number;
  setThemeMode: (m: ThemeMode) => void;
  setAppLock: (enabled: boolean, pin: string | null) => void;
  setAutoLockMinutes: (m: number) => void;
  setLocked: (v: boolean) => void;
  /** PIN deneme sonucunu kaydeder; 5 hatalı denemede 30 sn kilit koyar */
  registerPinAttempt: (ok: boolean) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'tekstil:prefs';

export const useThemeStore = create<SettingsState>((set, get) => ({
  themeMode: 'system',
  appLockEnabled: false,
  appLockPinHash: null,
  autoLockMinutes: 3,
  locked: false,
  pinFailCount: 0,
  pinLockUntil: 0,
  setThemeMode: (m) => {
    set({ themeMode: m });
    persist(get());
  },
  setAppLock: (enabled, pin) => {
    if (!enabled || !pin) {
      set({ appLockEnabled: enabled, appLockPinHash: null, pinFailCount: 0, pinLockUntil: 0 });
      persist(get());
      return;
    }
    void hashPin(pin).then((hash) => {
      set({ appLockEnabled: true, appLockPinHash: hash, pinFailCount: 0, pinLockUntil: 0 });
      persist(get());
    });
  },
  setAutoLockMinutes: (m) => {
    set({ autoLockMinutes: m });
    persist(get());
  },
  setLocked: (v) => set({ locked: v }),
  registerPinAttempt: (ok) => {
    const st = get();
    if (ok) {
      set({ pinFailCount: 0, pinLockUntil: 0 });
      persist(get());
      return;
    }
    // Bekleme kilidi süresi geçtiyse sayaç yeniden başlar
    const expired = st.pinLockUntil > 0 && Date.now() >= st.pinLockUntil;
    const count = expired ? 1 : st.pinFailCount + 1;
    if (count >= PIN_MAX_ATTEMPTS) {
      set({ pinFailCount: count, pinLockUntil: Date.now() + PIN_LOCKOUT_MS });
    } else {
      set({ pinFailCount: count, pinLockUntil: 0 });
    }
    persist(get());
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({
          themeMode: saved.themeMode ?? 'system',
          appLockEnabled: saved.appLockEnabled ?? false,
          appLockPinHash: saved.appLockPinHash ?? null,
          autoLockMinutes: saved.autoLockMinutes ?? 3,
          pinFailCount: saved.pinFailCount ?? 0,
          pinLockUntil: saved.pinLockUntil ?? 0,
        });
        // Tek seferlik geçiş: eski düz metin PIN → hash (Faz 4.2)
        if (saved.appLockPin && /^\d{4}$/.test(saved.appLockPin) && !saved.appLockPinHash) {
          const hash = await hashPin(saved.appLockPin);
          set({ appLockEnabled: true, appLockPinHash: hash });
          persist(get());
        }
      }
    } catch {
      // tercihler bozuksa varsayılanla devam
    }
  },
}));

function persist(s: SettingsState) {
  AsyncStorage.setItem(
    KEY,
    JSON.stringify({
      themeMode: s.themeMode,
      appLockEnabled: s.appLockEnabled,
      appLockPinHash: s.appLockPinHash,
      autoLockMinutes: s.autoLockMinutes,
      pinFailCount: s.pinFailCount,
      pinLockUntil: s.pinLockUntil,
    })
  ).catch(() => undefined);
}
