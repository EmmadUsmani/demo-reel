// Polaroid cards cut from real footage, for the title, chapter and end cards: an element out of a
// shot (by its captured box), or out of one frame of a recorded clip (by a mark's box), or the whole
// plate. Each card keeps its own decoded bitmap, so it never depends on the clip frame cache.
import { loadFootage, type Box } from '../engine/assets';

/**
 * Where a card comes from. `shot`, or `clip` plus `at` (a mark name or frame index, default the
 * clip's first frame). `key` crops to that captured box, grown by `pad` CSS px (default 24).
 */
export type CardSpec = { footage: string; shot?: string; clip?: string; at?: string | number; key?: string; pad?: number };

export type Card = { image: ImageBitmap; crop: Box };

export async function loadCard(spec: CardSpec): Promise<Card> {
  const footage = await loadFootage(spec.footage);
  const dpr = footage.dpr;
  const pad = spec.pad ?? 24;
  const cropOf = (image: ImageBitmap, box: Box | undefined, top: number): Box => {
    if (!box) return { x: 0, y: 0, w: image.width, h: image.height };
    const x = Math.max(0, (box.x - pad) * dpr), y = Math.max(0, (box.y - top - pad) * dpr);
    return { x, y, w: Math.min(image.width - x, (box.w + pad * 2) * dpr), h: Math.min(image.height - y, (box.h + pad * 2) * dpr) };
  };

  if (spec.shot) {
    const shot = footage.shots[spec.shot];
    if (!shot) throw new Error(`footage/${spec.footage} has no shot '${spec.shot}'`);
    const box = spec.key ? shot.boxes[spec.key] : undefined;
    if (spec.key && !box) throw new Error(`shot '${spec.shot}' has no box '${spec.key}'`);
    return { image: shot.image, crop: cropOf(shot.image, box, shot.scrollY) };
  }

  if (!spec.clip) throw new Error('a card needs a shot or a clip');
  const clip = footage.clips[spec.clip];
  if (!clip) throw new Error(`footage/${spec.footage} has no clip '${spec.clip}'`);
  const mark = typeof spec.at === 'string' ? clip.marks[spec.at] : undefined;
  if (typeof spec.at === 'string' && !mark) throw new Error(`clip '${spec.clip}' has no mark '${spec.at}'`);
  const index = mark ? mark.frame : Math.max(0, Math.min(clip.frames.length - 1, typeof spec.at === 'number' ? spec.at : 0));
  const response = await fetch(`/footage/${spec.footage}/${clip.dir}/${clip.frames[index]!.file}`);
  if (!response.ok) throw new Error(`clip '${spec.clip}' frame ${index}: HTTP ${response.status}`);
  const image = await createImageBitmap(await response.blob());
  // a mark's boxes are document px; the frame shows the page at the scroll it had then
  const box = spec.key ? mark?.boxes[spec.key] : undefined;
  if (spec.key && !box) throw new Error(`clip '${spec.clip}' mark '${String(spec.at)}' has no box '${spec.key}'`);
  return { image, crop: cropOf(image, box, mark?.scrollY ?? clip.scrollY) };
}

/** Where up to three cards sit above a title, relative to the frame's centre: [x, y, width, rotation]. */
export function cardLayout(count: number, width = 560): [number, number, number, number][] {
  if (count <= 1) return [[0, -200, width * 1.15, 0.03]];
  if (count === 2) return [[-330, -200, width, -0.05], [330, -210, width, 0.05]];
  return [[-560, -190, width * 0.85, -0.07], [0, -225, width * 0.9, 0.02], [560, -195, width * 0.85, 0.07]];
}
