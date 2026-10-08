import React, { useEffect, useRef } from 'react';
import { AppState, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as WebBrowser from 'expo-web-browser';
import { Stack, useRouter, useSegments } from 'expo-router';

import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../theme/ThemeProvider';
import { ToastProvider } from '../ui/Toast';
import { AuthProvider, useAuth } from '../data/auth';
import { DataProvider } from '../data/DataProvider';
import { useDataStore } from '../data/store';
import { useThemeStore } from '../state/settings';
import { OfflineBanner } from '../ui/Feedback';
import { useSyncStatus } from '../data/hooks';
import { setupNotifications } from '../utils/notifications';

WebBrowser.maybeCompleteAuthSession();
SplashScreen.preventAutoHideAsync().catch(() => undefined);

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => undefined);
  }, [fontsLoaded]);

  useEffect(() => {
    setupNotifications().catch(() => undefined);
  }, []);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <DataProvider>
                <RootNavigator />
              </DataProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { c, dark } = useTheme();
  const auth = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const orgId = useDataStore((s) => s.orgId);
  const loaded = useDataStore((s) => s.loaded);
  const lockEnabled = useThemeStore((s) => s.appLockEnabled);
  const { pending, online } = useSyncStatus();

  // Otomatik kilit: arka plana geçince kilitlenir (PLAN 6.9 Güvenlik)
  const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const st = useThemeStore.getState();
      if (!st.appLockEnabled) return;
      if (state === 'background') {
        const delay = st.autoLockMinutes * 60_000;
        lockTimer.current = setTimeout(() => useThemeStore.setState({ locked: true }), Math.min(delay, 600_000));
      } else if (state === 'active') {
        if (lockTimer.current) {
          clearTimeout(lockTimer.current);
          lockTimer.current = null;
        }
      }
    });
    return () => sub.remove();
  }, []);

  // Giriş kapısı (PLAN 6.1)
  useEffect(() => {
    if (!auth.ready || !loaded) return;
    const inAuth = segments[0] === '(auth)';
    const inKurulum = segments[0] === 'kurulum';
    const inKilit = segments[0] === 'kilit';

    if (!auth.userId) {
      if (!inAuth) router.replace('/(auth)/hosgeldin');
      return;
    }
    if (useThemeStore.getState().locked && lockEnabled) {
      if (!inKilit) router.replace('/kilit');
      return;
    }
    if (inKilit) {
      router.replace('/(tabs)');
      return;
    }
    if (!orgId) {
      if (!inKurulum) router.replace('/kurulum');
      return;
    }
    if (inAuth || inKurulum) router.replace('/(tabs)');
  }, [auth.ready, auth.userId, loaded, orgId, segments, lockEnabled, router]);

  const showBanner = !online && pending > 0;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {showBanner ? <OfflineBanner pendingCount={pending} /> : null}
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="kurulum" options={{ gestureEnabled: false }} />
        <Stack.Screen name="kilit" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ animation: 'fade' }} />
        <Stack.Screen name="personel/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="avans-ver" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        <Stack.Screen name="ek-calisma" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
      </Stack>
    </View>
  );
}
