import AsyncStorage from '@react-native-async-storage/async-storage';
import { memoryPersist } from '../../src/data/persist';
import { useDataStore } from '../../src/data/store';
import {
  createMemorySnapshotAdapter,
  setSnapshotAdapter,
  takeSnapshot,
  listSnapshots,
  pruneSnapshots,
  restoreSnapshot,
  checkAndTriggerAutoSnapshot,
  generateSnapshotFilename,
} from '../../src/data/snapshot';
import { createOrganization, addEmployee } from '../../src/data/repo';

describe('Yerel Veritabanı Anlık Görüntüleri (Snapshots - B2)', () => {
  let memoryAdapter: ReturnType<typeof createMemorySnapshotAdapter>;

  beforeEach(async () => {
    // 1. Bellek içi veritabanı ve store'u sıfırla
    const persist = memoryPersist();
    await useDataStore.getState().init(persist, 'test-user', null);

    // 2. Bellek içi snapshot bağdaştırıcısını kur
    memoryAdapter = createMemorySnapshotAdapter();
    setSnapshotAdapter(memoryAdapter);

    // 3. AsyncStorage'ı temizle
    await AsyncStorage.clear();
  });

  afterEach(() => {
    setSnapshotAdapter(null);
  });

  test('takeSnapshot veritabanını snapshot olarak yazar ve listSnapshots ile döndürür', async () => {
    await createOrganization('Tekstil Atölyesi', null);
    await addEmployee({ full_name: 'Mehmet Usta', salary: 35000, start_date: '2026-01-01' });

    const filename = await takeSnapshot('test_manual');
    expect(filename).toBeDefined();
    expect(filename).toMatch(/^snapshot-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}\.json$/);

    const list = await listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe(filename);
    expect(list[0].sizeBytes).toBeGreaterThan(0);

    // İçeriği doğrula
    const content = await memoryAdapter.readSnapshot(filename!);
    expect(content).not.toBeNull();
    const parsed = JSON.parse(content!);
    expect(parsed.employees).toHaveLength(1);
    expect(parsed.employees[0].full_name).toBe('Mehmet Usta');
  });

  test('pruneSnapshots en fazla 7 snapshot saklar, eskileri siler', async () => {
    // 10 adet snapshot dosyası yaz
    for (let i = 1; i <= 10; i++) {
      const padIndex = String(i).padStart(2, '0');
      const filename = `snapshot-2026-10-08-1000-${padIndex}.json`;
      const dummyDb = { employees: [{ id: `emp-${i}`, full_name: `Çalışan ${i}` }] };
      await memoryAdapter.writeSnapshot(filename, JSON.stringify(dummyDb));
    }

    expect(memoryAdapter.getFiles().size).toBe(10);

    const prunedCount = await pruneSnapshots();
    expect(prunedCount).toBe(3); // 10 - 7 = 3 silinmeli

    const remaining = await listSnapshots();
    expect(remaining).toHaveLength(7);

    // En yeni 7 dosyanın kaldığını doğrula (index 10, 09, 08, 07, 06, 05, 04)
    expect(remaining[0].filename).toBe('snapshot-2026-10-08-1000-10.json');
    expect(remaining[6].filename).toBe('snapshot-2026-10-08-1000-04.json');

    // Eski olanlar (01, 02, 03) silinmiş olmalı
    expect(memoryAdapter.getFiles().has('snapshot-2026-10-08-1000-01.json')).toBe(false);
    expect(memoryAdapter.getFiles().has('snapshot-2026-10-08-1000-02.json')).toBe(false);
    expect(memoryAdapter.getFiles().has('snapshot-2026-10-08-1000-03.json')).toBe(false);
  });

  test('pruneSnapshots ve listSnapshots bozuk/eksik JSON dosyalarını otomatik temizler', async () => {
    // Geçerli bir snapshot
    await memoryAdapter.writeSnapshot('snapshot-2026-10-08-1000-01.json', JSON.stringify({ ok: true }));
    // Bozuk JSON
    await memoryAdapter.writeSnapshot('snapshot-2026-10-08-1000-02.json', '{ bozuk_json: ');

    expect(memoryAdapter.getFiles().size).toBe(2);

    await pruneSnapshots();

    // Bozuk dosya silinmiş olmalı
    expect(memoryAdapter.getFiles().has('snapshot-2026-10-08-1000-02.json')).toBe(false);
    expect(memoryAdapter.getFiles().has('snapshot-2026-10-08-1000-01.json')).toBe(true);

    const list = await listSnapshots();
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe('snapshot-2026-10-08-1000-01.json');
  });

  test('checkAndTriggerAutoSnapshot 24 saatte bir ve sürüm değişiminde tetiklenir', async () => {
    // 1. İlk çalıştırma (hiç snapshot yokken günlük tetiklenir)
    const firstCheck = await checkAndTriggerAutoSnapshot('1.0.0');
    expect(firstCheck.taken).toBe(true);
    expect(firstCheck.reason).toBe('daily');

    // 2. Hemen ardından ikinci çalıştırma (24 saat geçmedi, sürüm aynı -> tetiklenmemeli)
    const secondCheck = await checkAndTriggerAutoSnapshot('1.0.0');
    expect(secondCheck.taken).toBe(false);

    // 3. Sürüm yükseltildi (1.0.0 -> 1.1.0) -> anında version_upgrade tetiklenmeli
    const upgradeCheck = await checkAndTriggerAutoSnapshot('1.1.0');
    expect(upgradeCheck.taken).toBe(true);
    expect(upgradeCheck.reason).toBe('version_upgrade');

    // 4. Sürüm 1.1.0 ile tekrar çağrıldığında tetiklenmemeli
    const upgradeRepeatCheck = await checkAndTriggerAutoSnapshot('1.1.0');
    expect(upgradeRepeatCheck.taken).toBe(false);
  });

  test('restoreSnapshot geri yüklemeden hemen önce pre-restore snapshot alır ve verileri geri getirir', async () => {
    // Başlangıç durumu: 1 çalışan ekle
    await createOrganization('Örnek Atölye', null);
    await addEmployee({ full_name: 'Ahmet Kalfa', salary: 25000, start_date: '2026-01-01' });

    // Bu durumun yedeğini manuel kaydet
    const backupDb = useDataStore.getState().db;
    const targetFilename = 'snapshot-2026-10-01-1200-00.json';
    await memoryAdapter.writeSnapshot(targetFilename, JSON.stringify(backupDb));

    // Şimdi veritabanını değiştir: yeni bir çalışan ekle
    await addEmployee({ full_name: 'Hatalı Eklenen Çalışan', salary: 20000, start_date: '2026-02-01' });
    expect(useDataStore.getState().db.employees).toHaveLength(2);

    // Hedef snapshot'a geri dön
    const restoreResult = await restoreSnapshot(targetFilename);
    expect(restoreResult.ok).toBe(true);

    // Veritabanı eski durumuna (1 çalışan) dönmüş olmalı
    const restoredEmployees = useDataStore.getState().db.employees;
    expect(restoredEmployees).toHaveLength(1);
    expect(restoredEmployees[0].full_name).toBe('Ahmet Kalfa');

    // Geri yükleme öncesinde pre-restore yedeği alınmış olmalı
    const allFiles = Array.from(memoryAdapter.getFiles().keys());
    expect(allFiles.length).toBeGreaterThanOrEqual(2); // targetFilename + pre-restore snapshot
  });
});
