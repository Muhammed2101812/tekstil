import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueuedOp } from './queue';

/**
 * Kalıcılık katmanı (PLAN Bölüm 3.2: expo-file-system yeni API & Web için AsyncStorage).
 * Mobilde dosya tabanlı (JSON, AsyncStorage'ın 6 MB sınırına takılmaz);
 * web'de AsyncStorage (localStorage); testlerde bellek içi sürüm kullanılır.
 */

export interface DataDB {
  organizations: import('../types').Organization[];
  org_members: import('../types').OrgMember[];
  org_invites: import('../types').OrgInvite[];
  departments: import('../types').Department[];
  schedule_days: import('../types').ScheduleDay[];
  calendar_events: import('../types').CalendarEvent[];
  employees: import('../types').Employee[];
  employee_salaries: import('../types').EmployeeSalary[];
  attendance: import('../types').AttendanceRecord[];
  attendance_days: import('../types').AttendanceDay[];
  overtime: import('../types').OvertimeRecord[];
  debts: import('../types').Debt[];
  debt_payments: import('../types').DebtPayment[];
  leave_adjustments: import('../types').LeaveAdjustment[];
  payrolls: import('../types').Payroll[];
  payroll_items: import('../types').PayrollItem[];
  salary_payments: import('../types').SalaryPayment[];
}

export function emptyDB(): DataDB {
  return {
    organizations: [],
    org_members: [],
    org_invites: [],
    departments: [],
    schedule_days: [],
    calendar_events: [],
    employees: [],
    employee_salaries: [],
    attendance: [],
    attendance_days: [],
    overtime: [],
    debts: [],
    debt_payments: [],
    leave_adjustments: [],
    payrolls: [],
    payroll_items: [],
    salary_payments: [],
  };
}

export interface PersistAdapter {
  loadDB(): Promise<DataDB | null>;
  saveDB(db: DataDB): Promise<void>;
  loadQueue(): Promise<QueuedOp[]>;
  saveQueue(q: QueuedOp[]): Promise<void>;
}

const WEB_DB_KEY = 'tekstil_local_db';
const WEB_QUEUE_KEY = 'tekstil_local_queue';

export function webPersist(): PersistAdapter {
  return {
    async loadDB() {
      try {
        const raw = await AsyncStorage.getItem(WEB_DB_KEY);
        if (!raw) return null;
        return { ...emptyDB(), ...JSON.parse(raw) };
      } catch {
        return null;
      }
    },
    async saveDB(db) {
      try {
        await AsyncStorage.setItem(WEB_DB_KEY, JSON.stringify(db));
      } catch {}
    },
    async loadQueue() {
      try {
        const raw = await AsyncStorage.getItem(WEB_QUEUE_KEY);
        if (!raw) return [];
        return JSON.parse(raw);
      } catch {
        return [];
      }
    },
    async saveQueue(q) {
      try {
        await AsyncStorage.setItem(WEB_QUEUE_KEY, JSON.stringify(q));
      } catch {}
    },
  };
}

/** Dosya tabanlı kalıcılık — çağrıldığında yerel modülü yükler; web'de AsyncStorage'a düşer */
export function filePersist(): PersistAdapter {
  if (Platform.OS === 'web') {
    return webPersist();
  }

  let memoryFallback: PersistAdapter | null = null;

  const ensureMemory = () => {
    if (!memoryFallback) memoryFallback = memoryPersist();
    return memoryFallback;
  };

  const loadFs = async () => {
    const fs = await import('expo-file-system');
    return { File: fs.File, Paths: fs.Paths };
  };

  const makeFiles = async () => {
    const { File, Paths } = await loadFs();
    return {
      dbFile: new File(Paths.document, 'tekstil-db.json'),
      queueFile: new File(Paths.document, 'tekstil-queue.json'),
    };
  };

  const readJson = async <T>(file: { exists: boolean; text: () => Promise<string> }): Promise<T | null> => {
    try {
      if (!file.exists) return null;
      return JSON.parse(await file.text()) as T;
    } catch {
      return null;
    }
  };

  const writeText = async (file: import('expo-file-system').File, text: string) => {
    file.create({ overwrite: true });
    file.write(text);
  };

  return {
    async loadDB() {
      try {
        const { dbFile } = await makeFiles();
        const parsed = await readJson<DataDB>(dbFile);
        return parsed ? { ...emptyDB(), ...parsed } : null;
      } catch {
        return ensureMemory().loadDB();
      }
    },
    async saveDB(db) {
      try {
        const { dbFile } = await makeFiles();
        await writeText(dbFile, JSON.stringify(db));
      } catch {
        await ensureMemory().saveDB(db);
      }
    },
    async loadQueue() {
      try {
        const { queueFile } = await makeFiles();
        return (await readJson<QueuedOp[]>(queueFile)) ?? [];
      } catch {
        return ensureMemory().loadQueue();
      }
    },
    async saveQueue(q) {
      try {
        const { queueFile } = await makeFiles();
        await writeText(queueFile, JSON.stringify(q));
      } catch {
        await ensureMemory().saveQueue(q);
      }
    },
  };
}

export function memoryPersist(): PersistAdapter & { snapshot: () => { db: DataDB | null; queue: QueuedOp[] } } {
  let db: DataDB | null = null;
  let queue: QueuedOp[] = [];
  return {
    async loadDB() {
      return db ? JSON.parse(JSON.stringify(db)) : null;
    },
    async saveDB(next) {
      db = JSON.parse(JSON.stringify(next));
    },
    async loadQueue() {
      return [...queue];
    },
    async saveQueue(q) {
      queue = [...q];
    },
    snapshot: () => ({ db, queue }),
  };
}
