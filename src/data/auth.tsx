import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { isSupabaseConfigured, supabase } from './supabase';
import { useDataStore, useSyncState, emptyDB } from './store';
import type { OrgMember, Role } from '../types';

/**
 * Kimlik doğrulama (agent.md: uygulama tamamen online):
 * - Supabase Auth: e-posta + şifre veya Google ile giriş, oturum güvenli depoda.
 * - Cihaz modu KALDIRILDI: yerel hesap yoktur; .env yoksa uygulama çalışmaz.
 */

interface AuthState {
  userId: string | null;
  email: string | null;
  name: string | null;
  ready: boolean;
  isGoogleConfigured: boolean;
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signInWithGoogle: () => Promise<string | null>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<string | null>;
  /** Firma sahibinin kullanıcı oluşturması (owner-only; sunucu tarafı doğrular) */
  createManagedUser: (name: string, email: string, password: string, role: Role) => Promise<string | null>;
  /** Firma sahibinin kullanıcı şifresini sıfırlaması */
  resetManagedUserPassword: (userId: string, newPassword: string) => Promise<string | null>;
}

const AuthContext = createContext<AuthState | null>(null);
const LEGACY_KEYS = ['tekstil:local-session', 'tekstil:local-accounts'];

/** Edge function hatasından insan-okur mesaj çıkarır ({ error: "…" } gövdesi) */
async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const ctx = (error as { context?: unknown }).context;
  try {
    const body = await (ctx as Response | undefined)?.json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // gövde okunamadı — varsayılan mesaja düş
  }
  return fallback;
}

export function extractOAuthParams(url: string): Record<string, string> {
  const params: Record<string, string> = {};
  const hashIdx = url.indexOf('#');
  const queryIdx = url.indexOf('?');

  if (hashIdx !== -1) {
    const hash = url.substring(hashIdx + 1);
    const searchParams = new URLSearchParams(hash);
    searchParams.forEach((val, key) => {
      params[key] = val;
    });
  }

  if (queryIdx !== -1) {
    const end = hashIdx !== -1 && hashIdx > queryIdx ? hashIdx : url.length;
    const query = url.substring(queryIdx + 1, end);
    const searchParams = new URLSearchParams(query);
    searchParams.forEach((val, key) => {
      if (!params[key]) {
        params[key] = val;
      }
    });
  }

  return params;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const isGoogleConfigured = isSupabaseConfigured && Boolean(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim());

  const extractName = (user: { user_metadata?: unknown } | null): string | null => {
    if (!user?.user_metadata) return null;
    const m = user.user_metadata as { name?: string; full_name?: string };
    return m.full_name ?? m.name ?? null;
  };

  useEffect(() => {
    let sub: { data: { subscription: { unsubscribe: () => void } } } | null = null;
    (async () => {
      // Eski cihaz-modu kalıntılarını temizle (tek seferlik)
      await AsyncStorage.multiRemove(LEGACY_KEYS).catch(() => undefined);

      const { data } = await supabase.auth.getSession();
      const user = data.session?.user ?? null;
      setUserId(user?.id ?? null);
      setEmail(user?.email ?? null);
      setName(extractName(user));
      sub = supabase.auth.onAuthStateChange((_event, session) => {
        setUserId(session?.user?.id ?? null);
        setEmail(session?.user?.email ?? null);
        setName(extractName(session?.user ?? null));
      });
      setReady(true);
    })();
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      userId,
      email,
      name,
      ready,
      isGoogleConfigured,
      async signUp(mail, password, ad) {
        const { error } = await supabase.auth.signUp({
          email: mail,
          password,
          options: { data: { name: ad } },
        });
        return error ? error.message : null;
      },
      async signIn(mail, password) {
        const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
        return error ? 'E-posta veya şifre hatalı.' : null;
      },
      async signInWithGoogle() {
        try {
          const redirectTo = AuthSession.makeRedirectUri({
            scheme: 'tekstil',
            path: 'auth',
          });

          if (Platform.OS === 'web') {
            const { error } = await supabase.auth.signInWithOAuth({
              provider: 'google',
              options: {
                redirectTo,
              },
            });
            return error ? error.message : null;
          }

          const { data, error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo,
              skipBrowserRedirect: true,
            },
          });

          if (error) {
            return error.message;
          }

          if (!data?.url) {
            return 'Google giriş bağlantısı oluşturulamadı.';
          }

          const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

          if (result.type !== 'success' || !result.url) {
            if (result.type === 'cancel' || result.type === 'dismiss') {
              return null; // Kullanıcı iptal etti
            }
            return 'Google ile giriş tamamlanamadı veya pencere kapatıldı.';
          }

          const params = extractOAuthParams(result.url);

          if (params.error || params.error_description) {
            return params.error_description || params.error;
          }

          if (params.code) {
            const { data: codeData, error: codeErr } = await supabase.auth.exchangeCodeForSession(params.code);
            if (codeErr) return codeErr.message;
            if (codeData.user) {
              setUserId(codeData.user.id);
              setEmail(codeData.user.email ?? null);
              setName(extractName(codeData.user));
            }
            return null;
          }

          if (params.access_token && params.refresh_token) {
            const { data: sessionData, error: sessionErr } = await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
            if (sessionErr) return sessionErr.message;
            if (sessionData.user) {
              setUserId(sessionData.user.id);
              setEmail(sessionData.user.email ?? null);
              setName(extractName(sessionData.user));
            }
            return null;
          }

          // Arka planda oturumun kurulup kurulmadığını kontrol et
          const { data: checkData } = await supabase.auth.getSession();
          if (checkData.session?.user) {
            setUserId(checkData.session.user.id);
            setEmail(checkData.session.user.email ?? null);
            setName(extractName(checkData.session.user));
            return null;
          }

          return 'Google oturumu doğrulanamadı.';
        } catch (err) {
          return err instanceof Error ? err.message : 'Google ile giriş sırasında bir hata oluştu.';
        }
      },
      async signOut() {
        await supabase.auth.signOut();
        await AsyncStorage.removeItem('tekstil:last-sync');
        // Bellek içi store ve senkron bayraklarını sıfırla (agent.md: çıkış temizliği)
        const st = useDataStore.getState();
        st.replaceDB(emptyDB());
        st.setOrg(null);
        st.setUserId('anon');
        useSyncState.getState().reset();
        setUserId(null);
        setEmail(null);
        setName(null);
      },
      async resetPassword(mail) {
        const { error } = await supabase.auth.resetPasswordForEmail(mail);
        return error ? error.message : null;
      },
      async createManagedUser(ad, mail, password, role) {
        const key = mail.trim().toLowerCase();
        const cleanName = ad.trim();
        const { data, error } = await supabase.functions.invoke<{ userId: string; member: OrgMember }>(
          'admin-create-user',
          { method: 'POST', body: { name: cleanName, email: key, password, role } }
        );
        if (error) {
          return await functionErrorMessage(error, 'Kullanıcı oluşturulamadı.');
        }
        // Sunucudaki satırı olduğu gibi yansıt (id tutarlılığı; pull çakışma yapmaz)
        const member = data?.member;
        if (member) {
          useDataStore.getState().upsert('org_members', member);
        }
        return null;
      },
      async resetManagedUserPassword(targetUserId, newPassword) {
        if (newPassword.length < 6) return 'Şifre en az 6 karakter olmalı.';
        const { error } = await supabase.functions.invoke('admin-set-password', {
          method: 'POST',
          body: { userId: targetUserId, newPassword },
        });
        if (error) {
          return await functionErrorMessage(error, 'Şifre güncellenemedi.');
        }
        return null;
      },
    }),
    [userId, email, name, ready, isGoogleConfigured]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
