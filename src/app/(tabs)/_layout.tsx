import React, { useState, useEffect } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { CalendarCheck, LayoutDashboard, Plus, Users, Wallet } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../theme/ThemeProvider';
import { hapticLight, hapticMedium } from '../../utils/haptics';
import { QuickActionsSheet } from '../../features/QuickActions';

/**
 * Yüzen Hap Navigasyon (Floating Pill Dock Navigation)
 * Kusursuz Geometrik Simetri & Kilitli Merkez Artı Butonu
 */
export default function TabsLayout() {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const [quickOpen, setQuickOpen] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const leftTabs = [
    { name: 'index', label: 'Bugün', icon: LayoutDashboard },
    { name: 'puantaj', label: 'Puantaj', icon: CalendarCheck },
  ];

  const rightTabs = [
    { name: 'personel', label: 'Personel', icon: Users },
    { name: 'para', label: 'Para', icon: Wallet },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          lazy: true,
          tabBarStyle: {
            position: 'absolute',
            backgroundColor: 'transparent',
            borderTopWidth: 0,
            elevation: 0,
            height: 0,
          },
        }}
        tabBar={(props) => {
          if (keyboardVisible) return null;
          const { state, navigation } = props;

          const renderTabItem = (tab: { name: string; label: string; icon: typeof LayoutDashboard }) => {
            const isActive =
              pathname.endsWith(`/${tab.name}`) ||
              (tab.name === 'index' && (pathname === '/' || pathname.endsWith('(tabs)')));
            const Icon = tab.icon;

            if (isActive) {
              return (
                <Pressable
                  key={tab.name}
                  onPress={() => {
                    hapticLight();
                    const target = state.routes.find((r) => r.name === tab.name);
                    if (!target) return;
                    navigation.navigate(target.name as never);
                  }}
                  style={[
                    styles.activePill,
                    {
                      backgroundColor: c.primary,
                    },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: true }}
                  accessibilityLabel={tab.label}
                >
                  <Icon size={17} color={c.onPrimary} strokeWidth={2.4} />
                  <Text style={[styles.activePillText, { color: c.onPrimary }]} numberOfLines={1}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            }

            return (
              <Pressable
                key={tab.name}
                hitSlop={8}
                onPress={() => {
                  hapticLight();
                  const target = state.routes.find((r) => r.name === tab.name);
                  if (!target) return;
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: target.key,
                    canPreventDefault: true,
                  });
                  if (!event.defaultPrevented) {
                    navigation.navigate(target.name as never);
                  }
                }}
                style={({ pressed }) => [
                  styles.inactiveTab,
                  pressed && { opacity: 0.7, backgroundColor: c.surfaceSubtle },
                ]}
                accessibilityRole="tab"
                accessibilityState={{ selected: false }}
                accessibilityLabel={tab.label}
              >
                <Icon size={21} color={c.textMuted} strokeWidth={2.0} />
              </Pressable>
            );
          };

          return (
            <View
              style={[
                styles.floatingWrapper,
                {
                  pointerEvents: 'box-none' as const,
                  bottom: Math.max(insets.bottom, 12),
                },
              ]}
            >
              <View
                style={[
                  styles.pillDock,
                  {
                    pointerEvents: 'auto' as const,
                    backgroundColor: c.tabBar,
                    borderColor: c.border,
                    shadowColor: dark ? '#000000' : '#101828',
                  },
                ]}
              >
                {/* SOL KANAT (flex: 1 — tam simetrik genişlik) */}
                <View style={styles.dockWing}>
                  {leftTabs.map(renderTabItem)}
                </View>

                {/* KUSURSUZ MERKEZ: ARTI BUTONU (Her zaman tam ortada sabit) */}
                <View style={styles.centerAnchor}>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      hapticMedium();
                      setQuickOpen(true);
                    }}
                    style={({ pressed }) => [
                      styles.quickBtn,
                      {
                        backgroundColor: c.accent,
                        transform: [{ scale: pressed ? 0.93 : 1 }],
                      },
                    ]}
                    accessibilityLabel="Hızlı İşlem Ekle"
                    accessibilityRole="button"
                  >
                    <Plus size={23} color={c.onAccent} strokeWidth={2.6} />
                  </Pressable>
                </View>

                {/* SAĞ KANAT (flex: 1 — tam simetrik genişlik) */}
                <View style={styles.dockWing}>
                  {rightTabs.map(renderTabItem)}
                </View>
              </View>
            </View>
          );
        }}
      >
        <Tabs.Screen name="index" options={{ title: 'Bugün' }} />
        <Tabs.Screen name="puantaj" options={{ title: 'Puantaj' }} />
        <Tabs.Screen name="personel" options={{ title: 'Personel' }} />
        <Tabs.Screen name="para" options={{ title: 'Para' }} />
      </Tabs>

      <QuickActionsSheet visible={quickOpen} onClose={() => setQuickOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  floatingWrapper: {
    position: 'absolute',
    left: 14,
    right: 14,
    alignItems: 'center',
    zIndex: 99,
  },
  pillDock: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  dockWing: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
  },
  centerAnchor: {
    width: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
    height: 40,
    gap: 6,
    borderRadius: 999,
    shadowColor: '#3B5BDB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  activePillText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  inactiveTab: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#FF7A59',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.36,
    shadowRadius: 8,
    elevation: 6,
  },
});
