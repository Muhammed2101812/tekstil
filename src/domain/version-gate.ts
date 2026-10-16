import { Linking } from 'react-native';
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { supabase } from '../data/supabase';

export interface AppVersionConfig {
  min_version_code: number;
  latest_version_code: number;
  title: string;
  message: string;
  store_url: string;
}

export const DEFAULT_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.tekstil.takip';

/**
 * Cihazın mevcut derleme numarasını (versionCode) döndürür.
 * 1) Native build runtime'da Application.nativeBuildVersion (en güvenilir)
 * 2) Expo manifest içindeki android.versionCode
 * 3) Geri dönüş (fallback): 5 (0006-0007 online sürümü)
 */
export function getCurrentVersionCode(): number {
  const nativeBuild = Application.nativeBuildVersion;
  if (nativeBuild && !Number.isNaN(Number(nativeBuild))) {
    return Number(nativeBuild);
  }

  const manifestVersion = Constants.expoConfig?.android?.versionCode;
  if (typeof manifestVersion === 'number') {
    return manifestVersion;
  }

  return 6;
}

export interface VersionCheckResult {
  needsUpdate: boolean;
  config: AppVersionConfig | null;
}

/**
 * Supabase app_config tablosundan asgari sürüm gereksinimini sorgular.
 * Ağ hatası durumunda kullanıcıyı kilitlememek için needsUpdate = false döner.
 */
export async function checkAppVersion(): Promise<VersionCheckResult> {
  try {
    const { data, error } = await supabase
      .from('app_config')
      .select('value')
      .eq('key', 'app_version')
      .maybeSingle();

    if (error || !data?.value) {
      return { needsUpdate: false, config: null };
    }

    const config = data.value as unknown as AppVersionConfig;
    const currentCode = getCurrentVersionCode();

    const minRequired = typeof config.min_version_code === 'number' ? config.min_version_code : 0;
    const needsUpdate = currentCode < minRequired;

    return {
      needsUpdate,
      config: {
        min_version_code: minRequired,
        latest_version_code: config.latest_version_code ?? minRequired,
        title: config.title || 'Güncelleme Gerekli',
        message:
          config.message ||
          'Uygulamanın yeni özelliklerini ve güvenlik güncellemelerini kullanabilmek için lütfen Google Play üzerinden son sürüme güncelleyin.',
        store_url: config.store_url || DEFAULT_STORE_URL,
      },
    };
  } catch {
    // Ağ yoksa veya bağlantı başarısızsa akışı tıkama
    return { needsUpdate: false, config: null };
  }
}

/**
 * Kullanıcıyı Google Play Store sayfasına yönlendirir.
 */
export async function openStore(url?: string): Promise<void> {
  const target = url || DEFAULT_STORE_URL;
  try {
    const canOpen = await Linking.canOpenURL(target);
    if (canOpen) {
      await Linking.openURL(target);
    } else {
      await Linking.openURL(DEFAULT_STORE_URL);
    }
  } catch {
    // Intent fallback
    Linking.openURL(DEFAULT_STORE_URL).catch(() => undefined);
  }
}
