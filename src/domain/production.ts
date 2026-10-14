import { LabelColor, ProductionBatch } from '../types';

export interface LabelColorMeta {
  id: LabelColor;
  label: string;
  hex: string;
  textHex: string;
  borderHex?: string;
}

export const LABEL_COLORS: LabelColorMeta[] = [
  {
    id: 'kraft',
    label: 'Krem / Kraft',
    hex: '#D7C4A5',
    textHex: '#42331C',
    borderHex: '#BFA885',
  },
  {
    id: 'blue',
    label: 'Mavi',
    hex: '#2563EB',
    textHex: '#FFFFFF',
  },
  {
    id: 'green',
    label: 'Yeşil',
    hex: '#16A34A',
    textHex: '#FFFFFF',
  },
  {
    id: 'red',
    label: 'Kırmızı',
    hex: '#DC2626',
    textHex: '#FFFFFF',
  },
  {
    id: 'yellow',
    label: 'Sarı',
    hex: '#EAB308',
    textHex: '#422006',
    borderHex: '#CA8A04',
  },
  {
    id: 'pink',
    label: 'Pembe',
    hex: '#EC4899',
    textHex: '#FFFFFF',
  },
  {
    id: 'orange',
    label: 'Turuncu',
    hex: '#EA580C',
    textHex: '#FFFFFF',
  },
  {
    id: 'white',
    label: 'Beyaz',
    hex: '#FFFFFF',
    textHex: '#1E293B',
    borderHex: '#CBD5E1',
  },
];

export const LABEL_COLOR_MAP = new Map<LabelColor, LabelColorMeta>(
  LABEL_COLORS.map((c) => [c.id, c])
);

export interface ModelColorTotal {
  color: LabelColor;
  meta: LabelColorMeta;
  quantity: number;
}

export interface ModelGroup {
  modelKey: string;
  modelName: string;
  totalQuantity: number;
  colorTotals: Record<LabelColor, number>;
  colorBreakdown: ModelColorTotal[];
  batches: ProductionBatch[];
  lastDate: string;
}

/**
 * Normalizes model name for case-insensitive and whitespace-insensitive grouping.
 * Handles Turkish I / İ / ı / i variations uniformly so models like ATTIS-55 and attis-55 match.
 */
export function normalizeModelName(name: string): string {
  return name
    .trim()
    .replace(/İ/g, 'i')
    .replace(/I/g, 'i')
    .replace(/ı/g, 'i')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Groups production batches by model name.
 * Batches within each model are sorted by date descending (newest first).
 * Models are sorted by latest batch date descending.
 */
export function groupBatchesByModel(batches: ProductionBatch[]): ModelGroup[] {
  const groups = new Map<string, {
    modelKey: string;
    modelName: string;
    batches: ProductionBatch[];
    colorTotals: Record<LabelColor, number>;
    totalQuantity: number;
    lastDate: string;
  }>();

  // Sort batches by date descending (and created_at if available)
  const sortedBatches = [...batches].sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  for (const b of sortedBatches) {
    const trimmed = b.model_name.trim();
    if (!trimmed) continue;
    const key = normalizeModelName(trimmed);

    let group = groups.get(key);
    if (!group) {
      group = {
        modelKey: key,
        modelName: trimmed, // Keeps the latest used casing
        batches: [],
        colorTotals: {
          kraft: 0,
          blue: 0,
          green: 0,
          red: 0,
          yellow: 0,
          pink: 0,
          orange: 0,
          white: 0,
        },
        totalQuantity: 0,
        lastDate: b.date,
      };
      groups.set(key, group);
    }

    group.batches.push(b);
    group.totalQuantity += b.quantity;
    if (group.colorTotals[b.label_color] !== undefined) {
      group.colorTotals[b.label_color] += b.quantity;
    } else {
      group.colorTotals[b.label_color] = b.quantity;
    }
    if (b.date > group.lastDate) {
      group.lastDate = b.date;
    }
  }

  const result: ModelGroup[] = [];
  for (const group of groups.values()) {
    const colorBreakdown: ModelColorTotal[] = LABEL_COLORS
      .map((meta) => ({
        color: meta.id,
        meta,
        quantity: group.colorTotals[meta.id] || 0,
      }))
      .filter((c) => c.quantity > 0);

    result.push({
      ...group,
      colorBreakdown,
    });
  }

  // Sort models by lastDate descending, then by totalQuantity descending
  return result.sort((a, b) => {
    const dateComp = b.lastDate.localeCompare(a.lastDate);
    if (dateComp !== 0) return dateComp;
    return b.totalQuantity - a.totalQuantity;
  });
}

/**
 * Returns distinct model names sorted by most recent usage.
 */
export function getRecentModelNames(batches: ProductionBatch[], limit = 6): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // Sort batches by date descending, then created_at descending
  const sorted = [...batches].sort((a, b) => {
    const dateComp = b.date.localeCompare(a.date);
    if (dateComp !== 0) return dateComp;
    return (b.created_at ?? '').localeCompare(a.created_at ?? '');
  });

  for (const b of sorted) {
    const trimmed = b.model_name.trim();
    if (!trimmed) continue;
    const key = normalizeModelName(trimmed);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
      if (result.length >= limit) break;
    }
  }

  return result;
}
