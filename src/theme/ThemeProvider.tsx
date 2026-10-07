import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '../state/settings';
import { DARK, LIGHT, STATUS_COLORS, Spacing, Radius, Type, ThemeColors, MIN_TOUCH } from './tokens';

export interface Theme {
  dark: boolean;
  c: ThemeColors;
  spacing: typeof Spacing;
  radius: typeof Radius;
  type: typeof Type;
  minTouch: number;
  statusColor: (status: string) => { main: string; soft: string };
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useThemeStore((s) => s.themeMode);
  const system = useColorScheme();
  const dark = mode === 'dark' || (mode === 'system' && system === 'dark');

  const theme = useMemo<Theme>(() => ({
    dark,
    c: dark ? DARK : LIGHT,
    spacing: Spacing,
    radius: Radius,
    type: Type,
    minTouch: MIN_TOUCH,
    statusColor: (status: string) => {
      const sc = STATUS_COLORS[status] ?? STATUS_COLORS.geldi;
      return dark ? { main: sc.dark, soft: sc.darkSoft } : { main: sc.light, soft: sc.soft };
    },
  }), [dark]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const t = useContext(ThemeContext);
  if (!t) throw new Error('useTheme, ThemeProvider içinde kullanılmalı');
  return t;
}
