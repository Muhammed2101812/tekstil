import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Undo2, CheckCircle2, AlertTriangle } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeProvider';
import { hapticSuccess } from '../utils/haptics';

interface ToastOptions {
  message: string;
  /** "Geri al" bildirimi (PLAN 2.5): küçük işlemlerden sonra onay penceresi yerine */
  undo?: () => void;
  undoLabel?: string;
  tone?: 'info' | 'success' | 'warning';
  durationMs?: number;
}

const ToastContext = createContext<{ showToast: (o: ToastOptions) => void } | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { c, radius, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const [anim] = useState(() => new Animated.Value(0));
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (o: ToastOptions) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      setToast(o);
      if (o.tone === 'success') hapticSuccess();
      Animated.timing(anim, { toValue: 1, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start();
      hideTimer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 220, useNativeDriver: Platform.OS !== 'web' }).start(() => setToast(null));
      }, o.durationMs ?? (o.undo ? 5000 : 3200));
    },
    [anim]
  );

  const doUndo = () => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }).start(() => {
      setToast(null);
      toast?.undo?.();
    });
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <Animated.View
          style={[
            styles.wrap,
            {
              pointerEvents: 'box-none',
              paddingTop: insets.top + 8,
              opacity: anim,
              transform: [
                {
                  translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-30, 0] }),
                },
              ],
            },
          ]}
        >
          <View
            style={[
              styles.toast,
              {
                backgroundColor: toast.tone === 'warning' ? c.warningSoft : c.surface,
                borderColor: toast.tone === 'warning' ? c.warning : c.border,
                borderRadius: radius.card,
              },
            ]}
          >
            {toast.tone === 'warning' ? (
              <AlertTriangle size={20} color={c.warning} />
            ) : (
              <CheckCircle2 size={20} color={c.success} />
            )}
            <Text style={[type.small, { color: c.text, flex: 1, fontWeight: '600' }]}>{toast.message}</Text>
            {toast.undo ? (
              <Pressable onPress={doUndo} hitSlop={8} accessibilityLabel={toast.undoLabel ?? 'Geri al'}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Undo2 size={18} color={c.primary} />
                  <Text style={[type.small, { color: c.primary, fontWeight: '800' }]}>{toast.undoLabel ?? 'Geri al'}</Text>
                </View>
              </Pressable>
            ) : null}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast, ToastProvider içinde kullanılmalı');
  return ctx;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 0, left: 0, right: 0, alignItems: 'center', paddingHorizontal: 16, zIndex: 100 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
