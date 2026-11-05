import { describe, expect, it } from 'vitest';
import { MAP_H, MAP_W, METROS, metroCovered, metroFrame } from '../src/lib/geo';

/** 지도에서 틀을 눌렀을 때와 같은 방식으로 그 도시권에 맞춘 이동·배율 */
function zoomedTo(box: [number, number, number, number]) {
  const [x, y, w, h] = box;
  const k = Math.min(14, 0.85 / Math.max(w / MAP_W, h / MAP_H));
  return { k, x: MAP_W / 2 - k * (x + w / 2), y: MAP_H / 2 - k * (y + h / 2) };
}

describe('도시권 확대도 접기', () => {
  const frames = Object.fromEntries(METROS.map((m) => [m.id, metroFrame(m)]));
  const covered = (view: { x: number; y: number; k: number }) =>
    METROS.filter((m) => metroCovered(frames[m.id], view, 1, 230)).map((m) => m.id);

  it('전국 보기에서는 하나도 접지 않는다', () => {
    expect(covered({ x: 0, y: 0, k: 1 })).toEqual([]);
  });

  it.each(METROS.map((m) => m.id))('%s 로 확대하면 그 도시권만 접는다', (id) => {
    const got = covered(zoomedTo(frames[id]));
    expect(got.filter((x) => x !== id)).toEqual([]);
  });
});
