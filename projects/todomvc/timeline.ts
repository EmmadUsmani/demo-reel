// TodoMVC (React): one recorded session between a title card and an end card, in the app's own red.
import { entries } from '@engine/edit';
import type { Edit } from '@engine/edit';
import type { Theme } from '@engine/palette';

const E = entries(import.meta.glob('./scenes/*.ts'));

const TODOMVC_RED: Theme = {
  colors: {
    accent050: '#fdf2f2', accent100: '#fbe4e4', accent200: '#f5c4c6', accent300: '#eb9a9e', accent400: '#dd6d73',
    accent500: '#c94c53', accent600: '#b83f45', accent700: '#9b333a', accent800: '#7f2a30', accent900: '#661f25',
    wash1: '#FBE4E4', wash2: '#FDEEE4', wash3: '#F6E6EC', tape: 'rgba(235,154,158,0.5)', shadow: '70, 22, 28', chrome: '#F8F5F5',
  },
};

export default {
  theme: TODOMVC_RED,
  timeline: () => [
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
    E('session', 'session', { overlap: 0.5 }),
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
  ],
} satisfies Edit;
