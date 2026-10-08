import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as AuthSession from 'expo-auth-session';
import { isSupabaseConfigured, supabase } from './supabase';
import { uuid } from './id';

/**
 * Kimlik doğrulama.
 * - Supabase modu: e-posta + şifre (Supabase Auth) veya Google ile giriş, oturum güvenli depoda.
 * - Cihaz modu (.env yok): tek cihazda yerel hesap — uygulama anında
 *   denenebilsin diye. Parola SHA-256 ile özetlenir, sunucuya hiçbir şey gitmez.
 */

interface LocalAccount {
  userId: string;
  email: string;
  passHash: string;
  name: string;
}

interface AuthState {
  mode: 'supabase' | 'local';
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
}

const AuthContext = createContext<AuthState | null>(null);
const LOCAL_SESSION_KEY = 'tekstil:local-session';
const LOCAL_ACCOUNTS_KEY = 'tekstil:local-accounts';

async function loadLocalAccounts(): Promise<Record<string, LocalAccount>> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_ACCOUNTS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

async function saveLocalAccounts(accounts: Record<string, LocalAccount>) {
  await AsyncStorage.setItem(LOCAL_ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function hashPassword(password: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, `tekstil:${password}`, {
    encoding: Crypto.CryptoEncoding.HEX,
  });
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
      if (isSupabaseConfigured) {
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
      } else {
        const raw = await AsyncStorage.getItem(LOCAL_SESSION_KEY);
        if (raw) {
          const s = JSON.parse(raw) as { userId: string; email: string; name: string };
          setUserId(s.userId);
          setEmail(s.email);
          setName(s.name);
        }
      }
      setReady(true);
    })();
    return () => sub?.data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      mode: isSupabaseConfigured ? 'supabase' : 'local',
      userId,
      email,
      name,
      ready,
      isGoogleConfigured,
      async signUp(mail, password, ad) {
        if (isSupabaseConfigured) {
          const { error } = await supabase.auth.signUp({
            email: mail,
            password,
            options: { data: { name: ad } },
          });
          return error ? error.message : null;
        }
        const key = mail.toLowerCase();
        const accounts = await loadLocalAccounts();
        if (accounts[key]) return 'Bu e-posta ile zaten hesap var, giriş yapın.';
        const account: LocalAccount = {
          userId: uuid(),
          email: key,
          passHash: await hashPassword(password),
          name: ad,
        };
        accounts[key] = account;
        await saveLocalAccounts(accounts);
        await AsyncStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({ userId: account.userId, email: key, name: ad }));
        setUserId(account.userId);
        setEmail(key);
        setName(ad);
        return null;
      },
      async signIn(mail, password) {
        if (isSupabaseConfigured) {
          const { error } = await supabase.auth.signInWithPassword({ email: mail, password });
          return error ? 'E-posta veya şifre hatalı.' : null;
        }
        const accounts = await loadLocalAccounts();
        const account = accounts[mail.toLowerCase()];
        if (!account || account.passHash !== (await hashPassword(password))) {
          return 'E-posta veya şifre hatalı.';
        }
        await AsyncStorage.setItem(
          LOCAL_SESSION_KEY,
          JSON.stringify({ userId: account.userId, email: account.email, name: account.name })
        );
        setUserId(account.userId);
        setEmail(account.email);
        setName(account.name);
        return null;
      },
      async signInWithGoogle() {
        if (!isSupabaseConfigured) {
          return 'Google ile giriş cihaz modunda kullanılamaz. Bulut senkronu için .env yapılandırması gereklidir.';
        }
        const clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID?.trim();
        if (!clientId) {
          return 'Google ile giriş henüz yapılandırılmamış (EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID eksik).';
        }

        try {
          const rawNonce = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            `${Date.now()}-${Math.random()}-${Math.random()}`,
            { encoding: Crypto.CryptoEncoding.HEX }
          );
          const hashedNonce = await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            rawNonce,
            { encoding: Crypto.CryptoEncoding.HEX }
          );

          const redirectUri = AuthSession.makeRedirectUri({
            preferLocalhost: true,
          });

          const discovery: AuthSession.DiscoveryDocument = {
            authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
            revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
            userInfoEndpoint: 'https://openidconnect.googleapis.com/v1/userinfo',
          };

          const request = new AuthSession.AuthRequest({
            clientId,
            scopes: ['openid', 'profile', 'email'],
            responseType: AuthSession.ResponseType.IdToken,
            redirectUri,
            extraParams: {
              nonce: hashedNonce,
            },
          });

          const result = await request.promptAsync(discovery);

          if (result.type !== 'success') {
            if (result.type === 'cancel' || result.type === 'dismiss') {
              return null; // Kullanıcı iptal etti
            }
            return 'Google ile giriş tamamlanamadı veya pencere kapatıldı.';
          }

          const idToken = result.params?.id_token;
          if (!idToken) {
            return 'Google kimlik belirteci (id_token) alınamadı.';
          }

          const { data, error } = await supabase.auth.signInWithIdToken({
            provider: 'google',
            token: idToken,
            nonce: rawNonce,
          });

          if (error) {
            return error.message;
          }

          if (data.user) {
            setUserId(data.user.id);
            setEmail(data.user.email ?? null);
            setName(extractName(data.user));
          }

          return null;
        } catch (err) {
          return err instanceof Error ? err.message : 'Google ile giriş sırasında bir hata oluştu.';
        }
      },
      async signOut() {
        if (isSupabaseConfigured) {
          await supabase.auth.signOut();
        }
        await AsyncStorage.removeItem('tekstil:last-sync');
        await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
        const { useDataStore } = await import('./store');
        const { emptyDB } = await import('./persist');
        useDataStore.getState().replaceDB(emptyDB());
        useDataStore.getState().setOrg(null);
        useDataStore.getState().setUserId('anon');
        setUserId(null);
        setEmail(null);
        setName(null);
      },
      async resetPassword(mail) {
        if (isSupabaseConfigured) {
          const { error } = await supabase.auth.resetPasswordForEmail(mail);
          return error ? error.message : null;
        }
        return 'Cihaz modunda şifre sıfırlama yok. Parolanızı unuttuysanız uygulama verisini temizleyin.';
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
