import {
  getCurrentVersionCode,
  checkAppVersion,
  DEFAULT_STORE_URL,
} from '../../src/domain/version-gate';
import { supabase } from '../../src/data/supabase';
import * as Application from 'expo-application';

jest.mock('../../src/data/supabase', () => ({
  supabase: {
    from: jest.fn(),
  },
}));

jest.mock('expo-application', () => ({
  nativeBuildVersion: '5',
}));

describe('version-gate domain', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentVersionCode', () => {
    it('returns the parsed native build version when available', () => {
      expect(getCurrentVersionCode()).toBe(5);
    });
  });

  describe('checkAppVersion', () => {
    it('returns needsUpdate = false when app version meets or exceeds min_version_code', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                value: {
                  min_version_code: 5,
                  latest_version_code: 5,
                  title: 'Güncelleme Gerekli',
                  message: 'Lütfen güncelleyin',
                  store_url: DEFAULT_STORE_URL,
                },
              },
              error: null,
            }),
          }),
        }),
      });

      const res = await checkAppVersion();
      expect(res.needsUpdate).toBe(false);
      expect(res.config?.min_version_code).toBe(5);
    });

    it('returns needsUpdate = true when app version is lower than min_version_code', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: {
                value: {
                  min_version_code: 6,
                  latest_version_code: 6,
                  title: 'Yeni Sürüm Mevcut',
                  message: 'Kritik güvenlik güncellemesi',
                  store_url: DEFAULT_STORE_URL,
                },
              },
              error: null,
            }),
          }),
        }),
      });

      const res = await checkAppVersion();
      expect(res.needsUpdate).toBe(true);
      expect(res.config?.title).toBe('Yeni Sürüm Mevcut');
    });

    it('gracefully handles database errors and does not block the user', async () => {
      (supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Network request failed' },
            }),
          }),
        }),
      });

      const res = await checkAppVersion();
      expect(res.needsUpdate).toBe(false);
      expect(res.config).toBeNull();
    });
  });
});
