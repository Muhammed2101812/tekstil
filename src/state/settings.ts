import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

/** Küçük arayüz tercihleri (PLAN 3.1: Zustand) */

export type ThemeMode = 'system' | 'light' | 'dark';

interface SettingsState {
  themeMode: ThemeMode;
  appLockEnabled: boolean;
  appLockPin: string | null;
  autoLockMinutes: number;
  /** Uygulama kilidi durumu (arka plana geçince true, açınca false) */
  locked: boolean;
  setThemeMode: (m: ThemeMode) => void;
  setAppLock: (enabled: boolean, pin: string | null) => void;
  setAutoLockMinutes: (m: number) => void;
  setLocked: (v: boolean) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'tekstil:prefs';

export const useThemeStore = create<SettingsState>((set, get) => ({
  themeMode: 'system',
  appLockEnabled: false,
  appLockPin: null,
  autoLockMinutes: 3,
  locked: false,
  setThemeMode: (m) => {
    set({ themeMode: m });
    persist(get());
  },
  setAppLock: (enabled, pin) => {
    set({ appLockEnabled: enabled, appLockPin: pin });
    persist(get());
  },
  setAutoLockMinutes: (m) => {
    set({ autoLockMinutes: m });
    persist(get());
  },
  setLocked: (v) => set({ locked: v }),
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        set({
          themeMode: saved.themeMode ?? 'system',
          appLockEnabled: saved.appLockEnabled ?? false,
          appLockPin: saved.appLockPin ?? null,
          autoLockMinutes: saved.autoLockMinutes ?? 3,
        });
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
      appLockPin: s.appLockPin,
      autoLockMinutes: s.autoLockMinutes,
    })
  ).catch(() => undefined);
}
