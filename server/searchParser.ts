import type { DepartmentSlug, NaturalSearchParsed } from '../src/shared/types.ts';

const COLOR_MAP: Record<string, string> = {
  black: 'Black',
  أسود: 'Black',
  sand: 'Sand',
  beige: 'Sand',
  رملي: 'Sand',
  cognac: 'Cognac',
  brown: 'Cognac',
  بني: 'Cognac',
  sage: 'Sage',
  green: 'Sage',
  أخضر: 'Sage',
  charcoal: 'Charcoal',
  titanium: 'Titanium',
  brass: 'Brass',
  cyan: 'Slate Cyan',
};

const DEPARTMENT_HINTS: Record<string, DepartmentSlug> = {
  sneakers: 'fashion',
  shoes: 'fashion',
  shirt: 'fashion',
  overshirt: 'fashion',
  linen: 'fashion',
  bag: 'fashion',
  leather: 'fashion',
  قميص: 'fashion',
  حذاء: 'fashion',
  سنيكرز: 'fashion',
  حقيبة: 'fashion',
  headphones: 'electronics',
  keyboard: 'electronics',
  phone: 'electronics',
  dac: 'electronics',
  wireless: 'electronics',
  سماعات: 'electronics',
  هاتف: 'electronics',
  كيبورد: 'electronics',
  kettle: 'home-gadgets',
  coffee: 'home-gadgets',
  scale: 'home-gadgets',
  ceramic: 'home-gadgets',
  قهوة: 'home-gadgets',
  إبريق: 'home-gadgets',
};

const STOP_WORDS = new Set([
  'under',
  'below',
  'less',
  'than',
  'above',
  'over',
  'size',
  'in',
  'stock',
  'with',
  'for',
  'and',
  'the',
  'a',
  'an',
  'usd',
  'أقل',
  'من',
  'تحت',
  'مقاس',
  'متوفر',
]);

/**
 * Server-side natural-language search parser.
 * Converts queries like "black sneakers size 42 under $60" into structured filters.
 */
export function parseNaturalQuery(rawQuery: string): NaturalSearchParsed {
  const trimmed = rawQuery.trim();
  if (!trimmed) {
    return { rawQuery: '', keywords: [] };
  }

  let working = trimmed.toLowerCase();
  const parsed: NaturalSearchParsed = {
    rawQuery: trimmed,
    keywords: [],
  };

  // Extract price cap: "under $60", "below 90", "أقل من 60$"
  const underMatch = working.match(/(?:under|below|less than|<|أقل من|تحت)\s*\$?\s*(\d{1,5})\s*\$?/i);
  if (underMatch) {
    parsed.maxPriceUsdCents = Number(underMatch[1]) * 100;
    working = working.replace(underMatch[0], ' ');
  }

  // Extract price floor: "above $50", "over 100"
  const overMatch = working.match(/(?:above|over|>|فوق|أكثر من)\s*\$?\s*(\d{1,5})\s*\$?/i);
  if (overMatch) {
    parsed.minPriceUsdCents = Number(overMatch[1]) * 100;
    working = working.replace(overMatch[0], ' ');
  }

  // Extract size: "size 42", "size M", "مقاس 42"
  const sizeMatch = working.match(/(?:size|مقاس)\s*([a-z0-9]{1,4})/i);
  if (sizeMatch) {
    parsed.size = sizeMatch[1].toUpperCase();
    working = working.replace(sizeMatch[0], ' ');
  }

  if (/\b(?:in stock|available|متوفر)\b/i.test(working)) {
    parsed.inStockOnly = true;
  }

  const tokens = working
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    if (COLOR_MAP[token] && !parsed.color) {
      parsed.color = COLOR_MAP[token];
    }
    if (DEPARTMENT_HINTS[token] && !parsed.department) {
      parsed.department = DEPARTMENT_HINTS[token];
    }
    if (!STOP_WORDS.has(token) && !COLOR_MAP[token]) {
      parsed.keywords.push(token);
    }
  }

  return parsed;
}
