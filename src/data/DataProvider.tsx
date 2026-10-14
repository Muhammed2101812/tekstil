import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore } from '../state/settings';
import { useAuth } from './auth';
import { useDataStore, useSyncState } from './store';
import { isSupabaseConfigured, pullAll } from './supabase';
import { ensureHolidays } from './repo';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

/**
 * Veri sağlayıcı (tamamen online, agent.md):
 * 1. Oturum açıldığında store'u kullanıcıya bağlar ve sunucudan çeker (pullAll).
 * 2. Uygulama öne gelince, ağ dönünce ve 60 sn'de bir yeniden çeker.
 * 3. Firma bağlandıktan sonra eksik yıl tatillerini sunucuda tohumlar.
 * Offline kuyruk YOKTUR: yazmalar remote-first (repo.ts) olduğundan yalnızca
 * okuma tazeliği burada yönetilir.
 */
export function DataProvider({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const initialized = useRef(false);
  const memberCount = useDataStore((s) => s.db.org_members.length);

  useEffect(() => {
    useThemeStore.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!auth.ready || initialized.current) return;
    initialized.current = true;
    (async () => {
      useDataStore.getState().init(auth.userId ?? 'anon', null);
      if (auth.userId) {
        const org = useDataStore.getState().db.org_members.find((m) => m.user_id === auth.userId);
        if (org) useDataStore.getState().setOrg(org.org_id);
      }
    })();
  }, [auth.ready, auth.userId]);

  // Org üyeliği auth sonrası oluşunca (kayıt → kurulum) bağlan
  useEffect(() => {
    if (!auth.userId || !useDataStore.getState().loaded) return;
    const st = useDataStore.getState();
    // init 'anon' ile açılmış olabilir; gerçek kullanıcı bağlanınca güncelle
    if (st.userId !== auth.userId) st.setUserId(auth.userId);
    if (st.orgId) return;
    const org = st.db.org_members.find((m) => m.user_id === auth.userId);
    if (org && org.org_id !== st.orgId) st.setOrg(org.org_id);
  }, [auth.userId, memberCount]);

  // M3: Org bağlandıktan sonra mevcut yıl ve gelecek yıl tatillerini kontrol et (eksikse tohumla)
  const orgId = useDataStore((s) => s.orgId);
  const loaded = useDataStore((s) => s.loaded);
  useEffect(() => {
    if (!loaded || !orgId) return;
    const thisYear = new Date().getFullYear();
    ensureHolidays(orgId, thisYear).catch(() => undefined);
    ensureHolidays(orgId, thisYear + 1).catch(() => undefined);
  }, [loaded, orgId]);

  // Senkron motoru: pullAll — ilk girişte, öne gelince, ağ dönünce, 60 sn'de bir
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    // Kullanıcı değişti (giriş/çıkış) → ilk senkron durumunu sıfırla.
    // Böylece owner'ın oluşturduğu kullanıcı ilk girişte, sunucudan üyeliği
    // çekilmeden /kurulum'a yönlendirilip yanlışlıkla ikinci firma kuramaz.
    const sync = useSyncState.getState();
    sync.setFirstSyncDone(false);
    sync.setInitialSyncError(false);

    let busy = false;
    const attemptSync = async () => {
      const currentUserId = useDataStore.getState().userId;
      if (busy || !currentUserId || currentUserId === 'anon') return;
      const { online } = useSyncState.getState();
      if (!online) {
        if (!useSyncState.getState().firstSyncDone) useSyncState.getState().setInitialSyncError(true);
        return;
      }
      busy = true;
      try {
        const res = await pullAll();
        if (res.ok) {
          useSyncState.getState().setFirstSyncDone(true);
          useSyncState.getState().setInitialSyncError(false);
          useSyncState.getState().setLastError(null);
        } else {
          useSyncState.getState().setLastError('Veriler güncellenemedi');
          if (!useSyncState.getState().firstSyncDone) useSyncState.getState().setInitialSyncError(true);
        }
        const st = useDataStore.getState();
        if (st.userId && !st.orgId) {
          const org = st.db.org_members.find((m) => m.user_id === st.userId);
          if (org) st.setOrg(org.org_id);
        }
      } catch {
        useSyncState.getState().setLastError('Bağlantı yok');
        if (!useSyncState.getState().firstSyncDone) useSyncState.getState().setInitialSyncError(true);
      } finally {
        busy = false;
      }
    };

    // Hata ekranındaki "Tekrar Dene" buraya bağlanır
    useSyncState.getState().setTriggerSync(() => attemptSync());

    // Giriş yapıldığında veya online olunduğunda hemen senkronize et
    attemptSync();

    const net = NetInfo.addEventListener((state) => {
      useSyncState.getState().setOnline(!!state.isConnected);
      if (state.isConnected) attemptSync();
    });
    const interval = setInterval(attemptSync, 60_000);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') attemptSync();
    });

    return () => {
      useSyncState.getState().setTriggerSync(null);
      net();
      clearInterval(interval);
      appState.remove();
    };
  }, [auth.userId]);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
