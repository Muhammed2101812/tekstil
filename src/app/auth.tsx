import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { useRouter } from 'expo-router';
import * as Linking from 'expo-linking';
import { supabase, isSupabaseConfigured } from '../data/supabase';
import { extractOAuthParams } from '../data/auth';

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState('Giriş doğrulanıyor…');

  useEffect(() => {
    let active = true;

    async function processAuth() {
      if (!isSupabaseConfigured) {
        router.replace('/(auth)/giris');
        return;
      }

      try {
        const url = await Linking.getInitialURL();
        if (url) {
          const params = extractOAuthParams(url);
          if (params.code) {
            await supabase.auth.exchangeCodeForSession(params.code);
          } else if (params.access_token && params.refresh_token) {
            await supabase.auth.setSession({
              access_token: params.access_token,
              refresh_token: params.refresh_token,
            });
          }
        }

        const { data } = await supabase.auth.getSession();
        if (!active) return;

        if (data.session) {
          router.replace('/(tabs)');
        } else {
          router.replace('/(auth)/giris');
        }
      } catch (err) {
        if (!active) return;
        setStatus(err instanceof Error ? err.message : 'Giriş yapılamadı.');
        setTimeout(() => router.replace('/(auth)/giris'), 1500);
      }
    }

    processAuth();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F9FA' }}>
      <ActivityIndicator size="large" color="#2D54CD" />
      <Text style={{ marginTop: 16, color: '#495057', fontSize: 15, fontFamily: 'PlusJakartaSans_500Medium' }}>
        {status}
      </Text>
    </View>
  );
}
