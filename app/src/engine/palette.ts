// The theme: colour tokens and type every scene draws with. The default is a neutral indigo house
// look; an edit can override any of it (EDITS[name].theme in timeline.ts) so a reel can wear the
// colours of the product it demos. Scenes read `C` and `FONT` at render time, so the theme applied
// before the scenes load is the one they draw with.
import interRegular from '@fontsource/inter/files/inter-latin-400-normal.woff2?url';
import interMedium from '@fontsource/inter/files/inter-latin-500-normal.woff2?url';
import interSemibold from '@fontsource/inter/files/inter-latin-600-normal.woff2?url';
import interBold from '@fontsource/inter/files/inter-latin-700-normal.woff2?url';
import instrumentSerif from '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2?url';

const DEFAULT_COLORS = {
  // the accent scale: rings, dots, ripples, display type on light ground
  accent050: '#eef2ff',
  accent100: '#e0e7ff',
  accent200: '#c7d2fe',
  accent300: '#a5b4fc',
  accent400: '#818cf8',
  accent500: '#6366f1',
  accent600: '#4f46e5',
  accent700: '#4338ca',
  accent800: '#3730a3',
  accent900: '#312e81',
  // the backdrop: a warm off-white under three slow washes
  backdropBase: '#FAF8F5',
  wash1: '#E0E7FF',
  wash2: '#E0F2FE',
  wash3: '#EDE9FE',
  // cards, tape and the browser chrome
  paper: '#FFFEFB',
  tape: 'rgba(165,180,252,0.55)',
  chrome: '#F6F6F9',
  /** The hue of every soft drop shadow (window, cards, polaroids), as an "r, g, b" triple. */
  shadow: '30, 27, 75',
  /** The label pill's fill. */
  labelInk: '#14132B',
  // text
  ink: '#101828',
  gray700: '#344054',
  gray600: '#475467',
  gray500: '#667085',
  gray300: '#d0d5dd',
  gray200: '#eaecf0',
  white: '#ffffff',
};

export type Colors = typeof DEFAULT_COLORS;
export const C: Colors = { ...DEFAULT_COLORS };

const DEFAULT_FONT = {
  /** Titles and chapter cards. */
  display: '"Instrument Serif"',
  /** The big names on title and end cards. */
  sans: '"Inter"',
  /** Labels and chrome. */
  text: '"Inter"',
};

export type Fonts = typeof DEFAULT_FONT;
export const FONT: Fonts = { ...DEFAULT_FONT };

/** A font file the engine loads before the first frame: [family, url, weight, style]. */
export type FontFile = [family: string, url: string, weight: number, style?: 'normal' | 'italic'];

/** Open-licensed (SIL OFL) faces from npm, so nothing proprietary ships with the repo. */
export const FONT_FILES: FontFile[] = [
  ['Instrument Serif', instrumentSerif, 400],
  ['Inter', interRegular, 400],
  ['Inter', interMedium, 500],
  ['Inter', interSemibold, 600],
  ['Inter', interBold, 700],
];

export type Theme = { colors?: Partial<Colors>; fonts?: Partial<Fonts>; fontFiles?: FontFile[] };

/** Apply an edit's theme over the defaults (call before the scenes load). */
export function applyTheme(theme: Theme = {}) {
  Object.assign(C, DEFAULT_COLORS, theme.colors);
  Object.assign(FONT, DEFAULT_FONT, theme.fonts);
  if (theme.fontFiles) FONT_FILES.push(...theme.fontFiles);
}

/** CSS font shorthand for Canvas2D. */
export const font = (family: keyof Fonts, px: number, weight = 400) => `${weight} ${px}px ${FONT[family]}`;

export function withAlpha(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** A soft shadow in the theme's shadow hue. */
export const shadow = (alpha: number) => `rgba(${C.shadow}, ${alpha})`;
