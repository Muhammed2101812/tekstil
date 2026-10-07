/**
 * Tasarım sistemi token'ları (PLAN.md Bölüm 7).
 * "Lacivert & Mercan" — güven veren, kurumsal ama sıcak.
 * 4 pt ızgara; durum renkleri renk + ikon + yazı ile birlikte kullanılır.
 */

export interface ThemeColors {
  primary: string;
  primarySoft: string;
  primaryFixed: string;
  primaryFixedDim: string;
  onPrimary: string;
  onPrimaryContainer: string;
  accent: string;
  accentSoft: string;
  onAccent: string;
  background: string;
  surface: string;
  surfaceSubtle: string;
  surfaceContainerLowest: string;
  surfaceContainerLow: string;
  surfaceContainer: string;
  surfaceContainerHigh: string;
  surfaceContainerHighest: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  success: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  warning: string;
  warningSoft: string;
  tertiary: string;
  tertiarySoft: string;
  skeleton: string;
  overlay: string;
  tabBar: string;
}

export const LIGHT: ThemeColors = {
  primary: '#3B5BDB',
  primarySoft: '#EBEFFE',
  primaryFixed: '#DDE1FF',
  primaryFixedDim: '#B8C3FF',
  onPrimary: '#FFFFFF',
  onPrimaryContainer: '#E2E5FF',
  accent: '#FF7A59',
  accentSoft: '#FFF1EC',
  onAccent: '#FFFFFF',
  background: '#F6F7FB',
  surface: '#FFFFFF',
  surfaceSubtle: '#F0F2F7',
  surfaceContainerLowest: '#FFFFFF',
  surfaceContainerLow: '#F1F3FF',
  surfaceContainer: '#E9EDFF',
  surfaceContainerHigh: '#E0E8FF',
  surfaceContainerHighest: '#DBE2F9',
  text: '#101828',
  textSecondary: '#475467',
  textMuted: '#667085',
  border: '#E4E7EC',
  success: '#12B76A',
  successSoft: '#ECFDF3',
  danger: '#F04438',
  dangerSoft: '#FEF3F2',
  warning: '#F79009',
  warningSoft: '#FEF0C7',
  tertiary: '#EF6820',
  tertiarySoft: '#FFECE5',
  skeleton: '#EAECF1',
  overlay: 'rgba(16, 24, 40, 0.45)',
  tabBar: '#FFFFFF',
};

export const DARK: ThemeColors = {
  primary: '#748FFC',
  primarySoft: '#1D2440',
  primaryFixed: '#2D3B6E',
  primaryFixedDim: '#1E284A',
  onPrimary: '#0E1116',
  onPrimaryContainer: '#DDE1FF',
  accent: '#FF9E85',
  accentSoft: '#3A241E',
  onAccent: '#0E1116',
  background: '#0E1116',
  surface: '#171B22',
  surfaceSubtle: '#1F242E',
  surfaceContainerLowest: '#10131A',
  surfaceContainerLow: '#171B22',
  surfaceContainer: '#1E242F',
  surfaceContainerHigh: '#252C39',
  surfaceContainerHighest: '#2E3646',
  text: '#F2F4F7',
  textSecondary: '#B6BFCC',
  textMuted: '#98A2B3',
  border: '#2A303A',
  success: '#34D399',
  successSoft: '#083822',
  danger: '#F87171',
  dangerSoft: '#441411',
  warning: '#FBBF24',
  warningSoft: '#3D2403',
  tertiary: '#FB923C',
  tertiarySoft: '#421A07',
  skeleton: '#222833',
  overlay: 'rgba(0, 0, 0, 0.6)',
  tabBar: '#151920',
};

/** Puantaj durum renkleri (PLAN 7.1 & Stitch Tasarım Sistemi) */
export type StatusColorSet = { light: string; soft: string; dark: string; darkSoft: string };

export const STATUS_COLORS: Record<string, StatusColorSet> = {
  geldi: { light: '#12B76A', soft: '#ECFDF3', dark: '#34D399', darkSoft: '#083822' },
  gelmedi: { light: '#F04438', soft: '#FEF3F2', dark: '#F87171', darkSoft: '#441411' },
  gec_geldi: { light: '#F79009', soft: '#FEF0C7', dark: '#FBBF24', darkSoft: '#3D2403' },
  erken_cikti: { light: '#EF6820', soft: '#FFECE5', dark: '#FB923C', darkSoft: '#421A07' },
  yarim_gun: { light: '#15B79E', soft: '#F0FDF9', dark: '#2DD4BF', darkSoft: '#08332B' },
  yillik_izin: { light: '#7A5AF8', soft: '#F4F3FF', dark: '#A78BFA', darkSoft: '#261A63' },
  mazeret_izni: { light: '#7A5AF8', soft: '#F4F3FF', dark: '#A78BFA', darkSoft: '#261A63' },
  ucretsiz_izin: { light: '#667085', soft: '#F2F4F7', dark: '#98A2B3', darkSoft: '#1D242D' },
  rapor: { light: '#2E90FA', soft: '#EFF8FF', dark: '#60A5FA', darkSoft: '#0C2D5E' },
} as const;

export const Spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const Radius = { sm: 10, md: 14, card: 16, pill: 999, sheet: 28 } as const;

export const Type = {
  display: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.6 },
  title: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.4 },
  subtitle: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 18, fontWeight: '600' as const },
  body: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 16, fontWeight: '500' as const, lineHeight: 22 },
  small: { fontFamily: 'PlusJakartaSans_500Medium', fontSize: 14, fontWeight: '500' as const, lineHeight: 20 },
  label: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, fontWeight: '600' as const, letterSpacing: 0.2 },
  money: { fontFamily: 'PlusJakartaSans_800ExtraBold', fontSize: 26, fontWeight: '800' as const, letterSpacing: -0.4 },

  // Stitch Tasarım Sistemi Tipografi Hiyerarşisi
  headlineLg: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 30, fontWeight: '700' as const, lineHeight: 38 },
  headlineMd: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 24, fontWeight: '600' as const, lineHeight: 32 },
  headlineSm: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 20, fontWeight: '600' as const, lineHeight: 26 },
  titleMd: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 17, fontWeight: '600' as const, lineHeight: 22 },
  bodyLg: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
  bodyMd: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },
  bodySm: { fontFamily: 'PlusJakartaSans_400Regular', fontSize: 13, fontWeight: '400' as const, lineHeight: 18 },
  labelMd: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
  labelSm: { fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11, fontWeight: '600' as const, lineHeight: 14 },
  numericHero: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 32, fontWeight: '700' as const, lineHeight: 38 },
  numericCard: { fontFamily: 'PlusJakartaSans_700Bold', fontSize: 22, fontWeight: '700' as const, lineHeight: 28 },
};

/** Dokunma alanı asgari 48 dp (PLAN 2.8) */
export const MIN_TOUCH = 48;

