// The edits: which scenes play when, and the theme each one wears. Entries that overlap crossfade;
// entries that touch hard-cut.
import type { TimelineEntry } from './engine/engine';
import type { Theme } from './engine/palette';
import type { SceneClass } from './engine/scene';

const modules = import.meta.glob<{ default: SceneClass }>('./scenes/*.ts');
const scene = (name: string) => () => {
  const m = modules[`./scenes/${name}.ts`];
  return m ? m() : Promise.reject(new Error(`scene module not found: scenes/${name}.ts`));
};

type Options = { dur?: number; overlap?: number; params?: Record<string, any> };
const E = (id: string, file: string, { dur, overlap, params }: Options = {}): TimelineEntry =>
  ({ id, load: scene(file), start: 0, end: 0, dur, overlap, params });

export type Edit = { timeline: () => TimelineEntry[]; theme?: Theme };

// TodoMVC (React): one recorded session between a title card and an end card, in the app's own red.
function todomvc(): TimelineEntry[] {
  return [
    E('title', 'title-card', {
      params: {
        name: 'TodoMVC',
        subtitle: 'one todo app, in every framework',
        kicker: 'Open source · the React version',
        line: 'TodoMVC is one small todo app, built in many web frameworks.',
        dur: 5.6,
        cards: [
          { footage: 'todomvc', clip: 'session', at: 'added', key: 'list', pad: 2 },
          { footage: 'todomvc', clip: 'session', at: 'filtered', key: 'footer', pad: 2 },
        ],
      },
    }),
    E('session', 'todomvc-session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'TodoMVC',
        subtitle: 'open source, at todomvc.com',
        chips: ['Add', 'Complete', 'Filter', 'Every framework'],
        line: 'That’s TodoMVC. Thanks for watching!',
        card: { footage: 'todomvc', clip: 'session', at: 'filtered', key: 'app', pad: 20 },
      },
    }),
  ];
}

// Vite's homepage: a shots-only reel from one full-page plate, in the default theme.
function vite(): TimelineEntry[] {
  return [
    E('title', 'title-card', {
      params: {
        name: 'Vite',
        subtitle: 'the build tool for the web',
        kicker: 'Open source · MIT licensed',
        line: 'Vite is an open-source build tool for the web.',
        dur: 4.6,
        cards: [
          { footage: 'vite', shot: 'page', key: 'headline', pad: 14 },
          { footage: 'vite', shot: 'page', key: 'install', pad: 40 },
        ],
      },
    }),
    E('page', 'vite-page', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Vite',
        subtitle: 'open source, at vite.dev',
        chips: ['Instant server start', 'Fast HMR', 'Optimized builds'],
        line: 'That’s Vite. Thanks for watching!',
        card: { footage: 'vite', shot: 'page', key: 'headline', pad: 14 },
      },
    }),
  ];
}

// Excalidraw: one recorded session between a title card and an end card, in the default theme.
function excalidraw(): TimelineEntry[] {
  return [
    E('title', 'title-card', {
      params: {
        name: 'Excalidraw',
        subtitle: 'a whiteboard that looks hand-drawn',
        kicker: 'Open source · MIT licensed',
        line: 'Excalidraw is an open-source whiteboard for sketching diagrams.',
        dur: 5.4,
        cards: [
          { footage: 'excalidraw', clip: 'session', at: 'done', key: 'idea', pad: 60 },
          { footage: 'excalidraw', clip: 'session', at: 'done', key: 'share', pad: 60 },
        ],
      },
    }),
    E('session', 'excalidraw-session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Excalidraw',
        subtitle: 'open source, at excalidraw.com',
        chips: ['Shapes', 'Labels', 'Arrows', 'Saved in the browser'],
        line: 'That’s Excalidraw. Thanks for watching!',
        card: { footage: 'excalidraw', clip: 'session', at: 'done', key: 'canvas', pad: 0 },
      },
    }),
  ];
}

// Hoppscotch: one recorded session between a title card and an end card, in the default theme.
function hoppscotch(): TimelineEntry[] {
  return [
    E('title', 'title-card', {
      params: {
        name: 'Hoppscotch',
        subtitle: 'an open-source API client',
        kicker: 'Open source · MIT licensed',
        line: 'Hoppscotch is an open-source client for trying out web APIs.',
        dur: 5.4,
        cards: [
          { footage: 'hoppscotch', clip: 'session', at: 'param2', key: 'key', pad: 150 },
          { footage: 'hoppscotch', clip: 'session', at: 'sent2', key: 'value', pad: 150 },
        ],
      },
    }),
    E('session', 'hoppscotch-session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'Hoppscotch',
        subtitle: 'open source, at hoppscotch.io',
        chips: ['REST', 'Query parameters', 'Instant responses', 'No sign-in'],
        line: 'That’s Hoppscotch. Thanks for watching!',
        card: { footage: 'hoppscotch', clip: 'session', at: 'sent2', key: 'app', pad: 0 },
      },
    }),
  ];
}

// OpenStreetMap: one recorded session between a title card and an end card, in the default theme.
function openstreetmap(): TimelineEntry[] {
  return [
    E('title', 'title-card', {
      params: {
        name: 'OpenStreetMap',
        subtitle: 'the free map of the world',
        kicker: 'Open data · made by its community',
        line: 'OpenStreetMap is a free map of the world, made by its community.',
        dur: 5.4,
        cards: [
          { footage: 'openstreetmap', clip: 'session', at: 'found' },
          { footage: 'openstreetmap', clip: 'session', at: 'done' },
        ],
      },
    }),
    E('session', 'openstreetmap-session', { overlap: 0.5 }),
    E('end', 'end-card', {
      overlap: 0.5,
      params: {
        name: 'OpenStreetMap',
        subtitle: 'open data, at openstreetmap.org',
        chips: ['Search', 'Pan and zoom', 'Open data', 'Free to use'],
        line: 'That’s OpenStreetMap. Thanks for watching!',
        card: { footage: 'openstreetmap', clip: 'session', at: 'done' },
      },
    }),
  ];
}

const TODOMVC_RED: Theme = {
  colors: {
    accent050: '#fdf2f2', accent100: '#fbe4e4', accent200: '#f5c4c6', accent300: '#eb9a9e', accent400: '#dd6d73',
    accent500: '#c94c53', accent600: '#b83f45', accent700: '#9b333a', accent800: '#7f2a30', accent900: '#661f25',
    wash1: '#FBE4E4', wash2: '#FDEEE4', wash3: '#F6E6EC', tape: 'rgba(235,154,158,0.5)', shadow: '70, 22, 28', chrome: '#F8F5F5',
  },
};

export const EDITS: Record<string, Edit> = {
  todomvc: { timeline: todomvc, theme: TODOMVC_RED },
  vite: { timeline: vite },
  excalidraw: { timeline: excalidraw },
  hoppscotch: { timeline: hoppscotch },
  openstreetmap: { timeline: openstreetmap },
};
