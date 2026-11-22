import type { StorefrontThemeId, LocalizedText } from './types.ts';

export interface StorefrontThemeSpec {
  id: StorefrontThemeId;
  name: LocalizedText;
  accentVar: string;
  accentHexDark: string;
  accentHexLight: string;
  surfaceTint: string;
}

export const APPROVED_STOREFRONT_THEMES: Record<StorefrontThemeId, StorefrontThemeSpec> = {
  'obsidian-ember': {
    id: 'obsidian-ember',
    name: { en: 'Obsidian Ember', ar: 'جمر الأوبسيديان' },
    accentVar: 'var(--ember)',
    accentHexDark: '#FF5A44',
    accentHexLight: '#E8452F',
    surfaceTint: 'rgba(255, 90, 68, 0.08)',
  },
  'sand-atelier': {
    id: 'sand-atelier',
    name: { en: 'Sand Atelier', ar: 'أتيليه الرمل' },
    accentVar: 'var(--sand)',
    accentHexDark: '#D9C3A5',
    accentHexLight: '#8A6F4B',
    surfaceTint: 'rgba(217, 195, 165, 0.08)',
  },
  'cyan-lab': {
    id: 'cyan-lab',
    name: { en: 'Cyan Hardware Lab', ar: 'مختبر السيان' },
    accentVar: 'var(--cyan)',
    accentHexDark: '#4DD4E6',
    accentHexLight: '#0E8FA3',
    surfaceTint: 'rgba(77, 212, 230, 0.08)',
  },
  'sage-studio': {
    id: 'sage-studio',
    name: { en: 'Sage Living Studio', ar: 'استوديو المريمية' },
    accentVar: 'var(--sage)',
    accentHexDark: '#9BC995',
    accentHexLight: '#4F7F4A',
    surfaceTint: 'rgba(155, 201, 149, 0.08)',
  },
};
