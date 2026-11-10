import { describe, expect, test } from 'bun:test';
import { Recorder } from './canvas';

const draw = (rec: Recorder, fn: (g: CanvasRenderingContext2D) => void) => { rec.reset(); fn(rec.context()); return rec; };

describe('Recorder: a fake 2D context', () => {
  test('records calls and property sets in order, and names objects stably', () => {
    const rec = draw(new Recorder(), (g) => {
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 10, 20);
      const gradient = g.createLinearGradient(0, 0, 1, 1);
      gradient.addColorStop(0, 'red');
      g.fillStyle = gradient;
    });
    expect(rec.calls).toEqual(['1.fillStyle="#fff"', '1.fillRect(0,0,10,20)', '1.createLinearGradient(0,0,1,1)', 'LinearGradient#1.addColorStop(0,"red")', '1.fillStyle=LinearGradient#1']);
    expect(rec.problems).toEqual([]);
  });

  test('keeps state and the transform across save() and restore()', () => {
    const g = new Recorder().context();
    g.globalAlpha = 0.5;
    g.translate(10, 20);
    g.save();
    g.globalAlpha = 0.25;
    g.scale(2, 2);
    expect(g.getTransform()).toMatchObject({ a: 2, d: 2, e: 10, f: 20 });
    g.restore();
    expect(g.globalAlpha).toBe(0.5);
    expect(g.getTransform()).toMatchObject({ a: 1, d: 1, e: 10, f: 20 });
  });

  test('reports what a real canvas ignores or rejects', () => {
    const rec = draw(new Recorder(), (g) => {
      g.fillRect(0, 0, NaN, 10);
      g.font = 'NaNpx Inter';
      g.globalAlpha = 1.4;
      g.arc(0, 0, -3, 0, 1);
      g.restore();
      g.createRadialGradient(0, 0, 0, 0, 0, -1).addColorStop(2, 'red');
      g.setLineDash([4, Infinity]);
    });
    expect(rec.problems.map((p) => p.split(':')[0]!.split(' =')[0]!)).toEqual(['fillRect', 'set font', 'globalAlpha', 'arc', 'restore() without a save()', 'createRadialGradient', 'addColorStop offset 2', 'setLineDash']);
  });

  test('counts saves a frame left open', () => {
    const rec = new Recorder();
    const g = rec.context();
    g.save();
    g.save();
    g.restore();
    expect(rec.openSaves()).toBe(1);
  });
});
