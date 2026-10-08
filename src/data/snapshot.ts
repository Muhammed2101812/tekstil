import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { useDataStore } from './store';
import { restoreFromJsonText } from '../export/excel';

export interface SnapshotItem {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeFormatted: string;
  reason?: string;
}

export interface SnapshotAdapter {
  writeSnapshot(filename: string, content: string): Promise<void>;
  readSnapshot(filename: string): Promise<string | null>;
  listSnapshots(): Promise<{ filename: string; sizeBytes: number; createdAt: string }[]>;
  deleteSnapshot(filename: string): Promise<void>;
}

const MAX_SNAPSHOTS = 7;
const LAST_SNAPSHOT_TIME_KEY = 'tekstil:snapshot:last-time';
const LAST_APP_VERSION_KEY = 'tekstil:snapshot:last-app-version';

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

export function generateSnapshotFilename(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const h = pad(date.getHours());
  const min = pad(date.getMinutes());
  const s = pad(date.getSeconds());
  return `snapshot-${y}-${m}-${d}-${h}${min}-${s}.json`;
}

/** Expo FileSystem tabanlı yerel dosya bağdaştırıcısı */
function createFileSnapshotAdapter(): SnapshotAdapter {
  const getBackupsDir = async () => {
    const fs = await import('expo-file-system');
    const dir = new fs.Directory(fs.Paths.document, 'backups');
    if (!dir.exists) {
      dir.create();
    }
    return { dir, fs };
  };

  return {
    async writeSnapshot(filename: string, content: string) {
      const { dir, fs } = await getBackupsDir();
      const file = new fs.File(dir, filename);
      file.create({ overwrite: true });
      file.write(content);
    },
    async readSnapshot(filename: string) {
      const { dir, fs } = await getBackupsDir();
      const file = new fs.File(dir, filename);
      if (!file.exists) return null;
      return await file.text();
    },
    async listSnapshots() {
      const { dir, fs } = await getBackupsDir();
      const items = dir.list();
      const results: { filename: string; sizeBytes: number; createdAt: string }[] = [];

      for (const item of items) {
        if (item instanceof fs.File && item.name.startsWith('snapshot-') && item.name.endsWith('.json')) {
          try {
            const info = item.info();
            const size = info.size ?? 0;
            const modTime = info.modificationTime ? new Date(info.modificationTime * 1000).toISOString() : new Date().toISOString();
            results.push({
              filename: item.name,
              sizeBytes: size,
              createdAt: modTime,
            });
          } catch {
            // bilgi alınamadıysa atla
          }
        }
      }
      return results;
    },
    async deleteSnapshot(filename: string) {
      const { dir, fs } = await getBackupsDir();
      const file = new fs.File(dir, filename);
      if (file.exists) {
        file.delete();
      }
    },
  };
}

/** Testler için bellek içi snapshot bağdaştırıcısı */
export function createMemorySnapshotAdapter(): SnapshotAdapter & {
  getFiles: () => Map<string, { content: string; sizeBytes: number; createdAt: string }>;
} {
  const files = new Map<string, { content: string; sizeBytes: number; createdAt: string }>();
  return {
    async writeSnapshot(filename: string, content: string) {
      files.set(filename, {
        content,
        sizeBytes: typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(content).length : content.length,
        createdAt: new Date().toISOString(),
      });
    },
    async readSnapshot(filename: string) {
      return files.get(filename)?.content ?? null;
    },
    async listSnapshots() {
      return Array.from(files.entries()).map(([filename, v]) => ({
        filename,
        sizeBytes: v.sizeBytes,
        createdAt: v.createdAt,
      }));
    },
    async deleteSnapshot(filename: string) {
      files.delete(filename);
    },
    getFiles: () => files,
  };
}

let activeAdapter: SnapshotAdapter | null = null;

export function setSnapshotAdapter(adapter: SnapshotAdapter | null) {
  activeAdapter = adapter;
}

export function getSnapshotAdapter(): SnapshotAdapter {
  if (activeAdapter) return activeAdapter;
  return createFileSnapshotAdapter();
}

/**
 * Mevcut yerel veritabanının anlık görüntüsünü (snapshot) alır.
 * - Web ortamında sessizce atlar.
 * - Bozuk JSON dosyalarını temizler.
 * - En son 7 anlık görüntü kalacak şekilde eskileri budar (prune).
 */
export async function takeSnapshot(_reason?: string): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  const adapter = getSnapshotAdapter();
  const db = useDataStore.getState().db;
  const content = JSON.stringify(db, null, 2);

  const filename = generateSnapshotFilename();
  await adapter.writeSnapshot(filename, content);

  await AsyncStorage.setItem(LAST_SNAPSHOT_TIME_KEY, new Date().toISOString());

  // Prune (en fazla 7 snapshot sakla + bozuk dosyaları temizle)
  await pruneSnapshots();

  return filename;
}

/**
 * Bozuk olanları siler ve son 7 snapshot dışındakileri temizler.
 */
export async function pruneSnapshots(): Promise<number> {
  const adapter = getSnapshotAdapter();
  const list = await adapter.listSnapshots();

  const validSnapshots: { filename: string; sizeBytes: number; createdAt: string }[] = [];

  for (const item of list) {
    try {
      const raw = await adapter.readSnapshot(item.filename);
      if (!raw) {
        await adapter.deleteSnapshot(item.filename);
        continue;
      }
      JSON.parse(raw); // Parse bütünlük kontrolü
      validSnapshots.push(item);
    } catch {
      // Bozuk veya eksik JSON -> sil
      await adapter.deleteSnapshot(item.filename);
    }
  }

  // Yeniden eskiye sırala (dosya adı zaman damgalı olduğu için ters sıralama)
  validSnapshots.sort((a, b) => b.filename.localeCompare(a.filename));

  let deletedCount = 0;
  if (validSnapshots.length > MAX_SNAPSHOTS) {
    const toDelete = validSnapshots.slice(MAX_SNAPSHOTS);
    for (const item of toDelete) {
      await adapter.deleteSnapshot(item.filename);
      deletedCount++;
    }
  }

  return deletedCount;
}

/**
 * Mevcut geçerli anlık görüntüleri listeler (en yeniden en eskiye).
 */
export async function listSnapshots(): Promise<SnapshotItem[]> {
  if (Platform.OS === 'web') return [];

  const adapter = getSnapshotAdapter();
  const rawList = await adapter.listSnapshots();

  const validItems: SnapshotItem[] = [];

  for (const item of rawList) {
    try {
      const text = await adapter.readSnapshot(item.filename);
      if (!text) continue;
      JSON.parse(text); // bütünlük kontrolü
      validItems.push({
        filename: item.filename,
        createdAt: item.createdAt,
        sizeBytes: item.sizeBytes,
        sizeFormatted: formatSize(item.sizeBytes),
      });
    } catch {
      // bozuk olanları sessizce atla
    }
  }

  validItems.sort((a, b) => b.filename.localeCompare(a.filename));
  return validItems;
}

/**
 * Belirtilen anlık görüntüyü geri yükler.
 * Geri yükleme yapmadan hemen önce mevcut durumun bir anlık görüntüsünü (pre-restore) alır.
 */
export async function restoreSnapshot(filename: string): Promise<{ ok: boolean; error?: string }> {
  if (Platform.OS === 'web') {
    return { ok: false, error: 'Web ortamında anlık görüntü geri yükleme desteklenmez.' };
  }

  const adapter = getSnapshotAdapter();
  const raw = await adapter.readSnapshot(filename);
  if (!raw) {
    return { ok: false, error: 'Anlık görüntü dosyası bulunamadı.' };
  }

  try {
    // 1. Geri yükleme öncesi güvenlik anlık görüntüsü al
    await takeSnapshot('pre-restore');

    // 2. Geri yüklemeyi gerçekleştir
    const result = await restoreFromJsonText(raw);
    return result;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Geri yükleme başarısız oldu.' };
  }
}

/**
 * Uygulama açılışında otomatik kontrol:
 * 1. Sürüm değiştiyse (uygulama güncellemesi) -> anında anlık görüntü
 * 2. Son anlık görüntüden 24 saat geçtiyse -> günlük anlık görüntü
 */
export async function checkAndTriggerAutoSnapshot(currentAppVersion?: string): Promise<{ taken: boolean; reason?: string }> {
  if (Platform.OS === 'web') return { taken: false };

  try {
    const currentVersion = currentAppVersion ?? Constants.expoConfig?.version ?? '1.0.0';
    const lastVersion = await AsyncStorage.getItem(LAST_APP_VERSION_KEY);

    // 1. Sürüm yükseltme kontrolü
    if (lastVersion && lastVersion !== currentVersion) {
      await takeSnapshot('version_upgrade');
      await AsyncStorage.setItem(LAST_APP_VERSION_KEY, currentVersion);
      return { taken: true, reason: 'version_upgrade' };
    }

    if (!lastVersion) {
      await AsyncStorage.setItem(LAST_APP_VERSION_KEY, currentVersion);
    }

    // 2. Günlük (24 saat) kontrolü
    const lastTimeStr = await AsyncStorage.getItem(LAST_SNAPSHOT_TIME_KEY);
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;

    if (!lastTimeStr || now - new Date(lastTimeStr).getTime() >= DAY_MS) {
      await takeSnapshot('daily');
      return { taken: true, reason: 'daily' };
    }

    return { taken: false };
  } catch {
    return { taken: false };
  }
}
