import React, { useCallback, useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Özel alt sayfa (PLAN 7.5): RN Modal + yumuşak yay animasyonu.
 * @gorhom/bottom-sheet yerine yerleşik bileşen — daha az yerel bağımlılık,
 * Expo Go ile sorunsuz (PLAN 15'teki alternatif notu).
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  maxHeightRatio = 0.88,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxHeightRatio?: number;
}) {
  const { c, radius, spacing, type } = useTheme();
  const insets = useSafeAreaInsets();
  const [slide] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: Platform.OS !== 'web' }),
      ]).start();
    } else {
      slide.setValue(0);
      fade.setValue(0);
    }
  }, [visible, slide, fade]);

  const close = useCallback(() => {
    // Önce aşağı kaydır + karart, animasyon bitince kapat
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }),
      Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: Platform.OS !== 'web' }),
    ]).start(() => onClose());
  }, [slide, fade, onClose]);

  if (!visible) return null;

  const maxH = Dimensions.get('window').height * maxHeightRatio;

  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <View style={styles.fill}>
        <Animated.View style={[styles.overlay, { backgroundColor: c.overlay, opacity: fade }]}>
          <Pressable style={styles.fill} onPress={close} accessibilityLabel="Kapat" />
        </Animated.View>
        <Animated.View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: maxH,
            transform: [
              {
                translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [Dimensions.get('window').height * 0.4, 0] }),
              },
            ],
            opacity: fade,
          }}
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: c.surface,
                borderTopLeftRadius: radius.sheet,
                borderTopRightRadius: radius.sheet,
                paddingBottom: insets.bottom + spacing.lg,
                borderColor: c.border,
              },
            ]}
          >
            <View style={styles.handleWrap}>
              <View style={[styles.handle, { backgroundColor: c.border }]} />
            </View>
            {title ? (
              <Text style={[type.title, { color: c.text, paddingHorizontal: spacing.xl, paddingBottom: spacing.md }]}>{title}</Text>
            ) : null}
            <View style={{ paddingHorizontal: spacing.xl }}>{children}</View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  overlay: { position: 'absolute' as const, top: 0, left: 0, right: 0, bottom: 0 },
  sheet: { borderWidth: 1, borderBottomWidth: 0 },
  handleWrap: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 44, height: 5, borderRadius: 3 },
});
