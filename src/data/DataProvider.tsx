import React, { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useThemeStore } from '../state/settings';
import { useAuth } from './auth';
import { useDataStore, useSyncQueue } from './store';
import { filePersist } from './persist';
import { flushQueue, isSupabaseConfigured, pullAll } from './supabase';
import { ensureHolidays } from './repo';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: 1 } },
});

/**
 * Veri sağlayıcı:
 * 1. Kalıcı dosyadan DB'yi yükler, kullanıcıya firma üyeliğini bağlar.
 * 2. Supabase modunda: ağ dinler, kuyruğu boşaltır (önce push, sonra pull),
 *    60 sn'de bir ve uygulama öne gelince yeniden dener (PLAN Bölüm 9).
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
      await useDataStore.getState().init(filePersist(), auth.userId ?? 'anon', null);
      if (auth.userId) {
        const org = useDataStore.getState().db.org_members.find((m) => m.user_id === auth.userId);
        if (org) useDataStore.getState().setOrg(org.org_id);
      }
      const q = await (useDataStore.getState().persist?.loadQueue() ?? Promise.resolve([]));
      if (q.length) useSyncQueue.getState().setPending(q);
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

  // Senkron motoru
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let busy = false;
    const attemptSync = async () => {
      if (busy || !useDataStore.getState().userId) return;
      busy = true;
      const { pending, setPending, setFlushing, online } = useSyncQueue.getState();
      if (!online) {
        busy = false;
        return;
      }
      setFlushing(true);
      try {
        if (pending.length > 0) {
          const { ok, failed } = await flushQueue(pending);
          if (ok.length) setPending(pending.filter((p) => !ok.includes(p)));
          if (failed.length) {
            setFlushing(false, 'Gönderilemeyen kayıtlar var, tekrar denenecek');
          } else {
            setFlushing(false, null);
          }
        }
        await pullAll();
      } catch {
        setFlushing(false, 'Bağlantı yok');
      } finally {
        busy = false;
      }
    };

    const net = NetInfo.addEventListener((state) => {
      useSyncQueue.getState().setOnline(!!state.isConnected);
      if (state.isConnected) attemptSync();
    });
    const interval = setInterval(attemptSync, 60_000);
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'active') attemptSync();
    });

    return () => {
      net();
      clearInterval(interval);
      appState.remove();
    };
  }, []);

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
