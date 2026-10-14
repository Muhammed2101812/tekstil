import {
  LABEL_COLORS,
  LABEL_COLOR_MAP,
  groupBatchesByModel,
  getRecentModelNames,
  normalizeModelName,
} from '../../src/domain/production';
import { ProductionBatch } from '../../src/types';

describe('production domain', () => {
  describe('LABEL_COLORS', () => {
    it('defines exactly 8 distinct label colors with metadata', () => {
      expect(LABEL_COLORS).toHaveLength(8);
      const ids = LABEL_COLORS.map((c) => c.id);
      expect(ids).toEqual([
        'kraft',
        'blue',
        'green',
        'red',
        'yellow',
        'pink',
        'orange',
        'white',
      ]);

      for (const c of LABEL_COLORS) {
        expect(c.label).toBeTruthy();
        expect(c.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(c.textHex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });

    it('populates LABEL_COLOR_MAP correctly', () => {
      expect(LABEL_COLOR_MAP.get('kraft')?.label).toBe('Krem / Kraft');
      expect(LABEL_COLOR_MAP.get('blue')?.label).toBe('Mavi');
      expect(LABEL_COLOR_MAP.get('white')?.hex).toBe('#FFFFFF');
    });
  });

  describe('normalizeModelName', () => {
    it('normalizes casing with Turkish locale and collapses multiple spaces', () => {
      expect(normalizeModelName('  ATTIS-55  ')).toBe('attis-55');
      expect(normalizeModelName('İPEK  GÖMLEK')).toBe('ipek gömlek');
      expect(normalizeModelName('IŞIK   PANTOLON')).toBe('işik pantolon');
    });
  });

  describe('groupBatchesByModel', () => {
    const mockBatches: ProductionBatch[] = [
      {
        id: '1',
        org_id: 'org1',
        model_name: 'ATTIS-55',
        label_color: 'kraft',
        quantity: 1200,
        date: '2026-10-10',
        note: '1. parti',
        created_at: '2026-10-10T10:00:00Z',
      },
      {
        id: '2',
        org_id: 'org1',
        model_name: 'attis-55',
        label_color: 'blue',
        quantity: 800,
        date: '2026-10-12',
        note: null,
        created_at: '2026-10-12T10:00:00Z',
      },
      {
        id: '3',
        org_id: 'org1',
        model_name: 'Keten Gömlek',
        label_color: 'red',
        quantity: 500,
        date: '2026-10-14',
        note: null,
        created_at: '2026-10-14T09:00:00Z',
      },
      {
        id: '4',
        org_id: 'org1',
        model_name: '  Keten  Gömlek  ',
        label_color: 'green',
        quantity: 700,
        date: '2026-10-14',
        note: 'Acil parti',
        created_at: '2026-10-14T11:00:00Z',
      },
    ];

    it('returns empty array when given no batches', () => {
      expect(groupBatchesByModel([])).toEqual([]);
    });

    it('groups batches by normalized model name and calculates totals', () => {
      const groups = groupBatchesByModel(mockBatches);
      expect(groups).toHaveLength(2);

      // Keten Gömlek has latest date (2026-10-14), so it should be first
      const keten = groups.find((g) => g.modelKey === 'keten gömlek')!;
      expect(keten).toBeDefined();
      expect(keten.totalQuantity).toBe(1200);
      expect(keten.colorTotals.red).toBe(500);
      expect(keten.colorTotals.green).toBe(700);
      expect(keten.colorTotals.blue).toBe(0);
      expect(keten.batches).toHaveLength(2);
      expect(keten.colorBreakdown).toEqual([
        expect.objectContaining({ color: 'green', quantity: 700 }),
        expect.objectContaining({ color: 'red', quantity: 500 }),
      ]);

      const attis = groups.find((g) => g.modelKey === 'attis-55')!;
      expect(attis).toBeDefined();
      expect(attis.totalQuantity).toBe(2000);
      expect(attis.colorTotals.kraft).toBe(1200);
      expect(attis.colorTotals.blue).toBe(800);
      expect(attis.batches).toHaveLength(2);
      // Newest batch first in batches list
      expect(attis.batches[0].id).toBe('2');
      expect(attis.batches[1].id).toBe('1');
    });

    it('aggregates multiple color batches under the same model (user scenario: ATTIS-55 2000 kraft + 1500 blue = 3500)', () => {
      const userBatches: ProductionBatch[] = [
        {
          id: 'b1',
          org_id: 'org1',
          model_name: 'ATTIS-55',
          label_color: 'kraft',
          quantity: 2000,
          date: '2026-10-14',
          note: null,
          created_at: '2026-10-14T10:00:00Z',
        },
        {
          id: 'b2',
          org_id: 'org1',
          model_name: 'ATTIS-55',
          label_color: 'blue',
          quantity: 1500,
          date: '2026-10-14',
          note: null,
          created_at: '2026-10-14T11:00:00Z',
        },
      ];

      const groups = groupBatchesByModel(userBatches);
      expect(groups).toHaveLength(1);
      expect(groups[0].modelName).toBe('ATTIS-55');
      expect(groups[0].totalQuantity).toBe(3500);
      expect(groups[0].colorTotals.kraft).toBe(2000);
      expect(groups[0].colorTotals.blue).toBe(1500);
      expect(groups[0].batches).toHaveLength(2);

      const recent = getRecentModelNames(userBatches);
      expect(recent[0]).toBe('ATTIS-55');
    });

    it('ignores empty or whitespace-only model names', () => {
      const invalid: ProductionBatch[] = [
        {
          id: '5',
          org_id: 'org1',
          model_name: '   ',
          label_color: 'blue',
          quantity: 100,
          date: '2026-10-10',
          note: null,
        },
      ];
      expect(groupBatchesByModel(invalid)).toEqual([]);
    });
  });

  describe('getRecentModelNames', () => {
    const batches: ProductionBatch[] = [
      { id: '1', org_id: 'org1', model_name: 'Model A', label_color: 'kraft', quantity: 100, date: '2026-10-01', note: null },
      { id: '2', org_id: 'org1', model_name: 'Model B', label_color: 'kraft', quantity: 100, date: '2026-10-05', note: null },
      { id: '3', org_id: 'org1', model_name: 'model a', label_color: 'blue', quantity: 100, date: '2026-10-07', note: null },
      { id: '4', org_id: 'org1', model_name: 'Model C', label_color: 'kraft', quantity: 100, date: '2026-10-06', note: null },
      { id: '5', org_id: 'org1', model_name: 'Model D', label_color: 'kraft', quantity: 100, date: '2026-10-02', note: null },
    ];

    it('returns unique model names sorted by most recent date', () => {
      const recent = getRecentModelNames(batches);
      // Dates: Model A (10-07), Model C (10-06), Model B (10-05), Model D (10-02)
      expect(recent).toEqual(['model a', 'Model C', 'Model B', 'Model D']);
    });

    it('respects the limit argument', () => {
      const recent = getRecentModelNames(batches, 2);
      expect(recent).toEqual(['model a', 'Model C']);
    });

    it('returns empty array when batches is empty', () => {
      expect(getRecentModelNames([])).toEqual([]);
    });
  });
});
