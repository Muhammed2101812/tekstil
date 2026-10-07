import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { isSupabaseConfigured, supabase } from './supabase';
import { uuid } from './id';

/**
 * Kimlik doğrulama.
 * - Supabase modu: e-posta + şifre (Supabase Auth), oturum güvenli depoda.
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
  signUp: (email: string, password: string, name: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
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

  useEffect(() => {
    let sub: { data: { subscription: { unsubscribe: () => void } } } | null = null;
    (async () => {
      if (isSupabaseConfigured) {
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user ?? null;
        setUserId(user?.id ?? null);
        setEmail(user?.email ?? null);
        setName(((user?.user_metadata as { name?: string } | null)?.name) ?? null);
        sub = supabase.auth.onAuthStateChange((_event, session) => {
          setUserId(session?.user?.id ?? null);
          setEmail(session?.user?.email ?? null);
          setName(((session?.user?.user_metadata as { name?: string } | null)?.name) ?? null);
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
      async signOut() {
        if (isSupabaseConfigured) {
          await supabase.auth.signOut();
        } else {
          await AsyncStorage.removeItem(LOCAL_SESSION_KEY);
          setUserId(null);
          setEmail(null);
          setName(null);
        }
      },
      async resetPassword(mail) {
        if (isSupabaseConfigured) {
          const { error } = await supabase.auth.resetPasswordForEmail(mail);
          return error ? error.message : null;
        }
        return 'Cihaz modunda şifre sıfırlama yok. Parolanızı unuttuysanız uygulama verisini temizleyin.';
      },
    }),
    [userId, email, name, ready]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  return ctx;
}
