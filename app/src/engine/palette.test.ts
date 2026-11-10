import { afterEach, describe, expect, test } from 'bun:test';
import { applyTheme, C, FONT, font, shadow, withAlpha } from './palette';

afterEach(() => applyTheme());

describe('withAlpha', () => {
  test('turns a hex colour into rgba with the alpha', () => {
    expect(withAlpha('#ffffff', 0.5)).toBe('rgba(255,255,255,0.5)');
    expect(withAlpha('#6366f1', 0.3)).toBe('rgba(99,102,241,0.3)');
    expect(withAlpha('#000000', 0)).toBe('rgba(0,0,0,0)');
  });

  test('reads upper and lower case alike', () => {
    expect(withAlpha('#FAF8F5', 1)).toBe(withAlpha('#faf8f5', 1));
  });

  test('every hex token in the default theme converts', () => {
    for (const value of Object.values(C)) if (/^#[0-9a-f]{6}$/i.test(value)) expect(withAlpha(value, 0.5)).toMatch(/^rgba\(\d+,\d+,\d+,0\.5\)$/);
  });
});

describe('font and shadow', () => {
  test('font builds a CSS shorthand from the theme role', () => {
    expect(font('display', 132)).toBe('400 132px "Instrument Serif"');
    expect(font('sans', 52, 600)).toBe('600 52px "Inter"');
    expect(font('text', 26.5, 500)).toBe('500 26.5px "Inter"');
  });

  test('shadow uses the theme\'s shadow hue', () => {
    expect(shadow(0.2)).toBe('rgba(30, 27, 75, 0.2)');
    applyTheme({ colors: { shadow: '0, 0, 0' } });
    expect(shadow(0.2)).toBe('rgba(0, 0, 0, 0.2)');
  });
});

describe('applyTheme', () => {
  test('overrides colour tokens and font roles', () => {
    applyTheme({ colors: { accent600: '#ff0000' }, fonts: { sans: '"Georgia"' } });
    expect(C.accent600).toBe('#ff0000');
    expect(font('sans', 10)).toBe('400 10px "Georgia"');
  });

  test('leaves tokens the theme does not name at their defaults', () => {
    applyTheme({ colors: { accent600: '#ff0000' } });
    expect(C.accent500).toBe('#6366f1');
    expect(FONT.display).toBe('"Instrument Serif"');
  });

  test('a theme replaces the previous one instead of stacking on it', () => {
    applyTheme({ colors: { accent600: '#ff0000' } });
    applyTheme({ colors: { ink: '#123456' } });
    expect(C.accent600).toBe('#4f46e5');
    expect(C.ink).toBe('#123456');
  });

  test('no theme restores every default', () => {
    applyTheme({ colors: { accent600: '#ff0000', paper: '#000000' }, fonts: { text: '"X"' } });
    applyTheme();
    expect(C.accent600).toBe('#4f46e5');
    expect(C.paper).toBe('#FFFEFB');
    expect(FONT.text).toBe('"Inter"');
  });
});
