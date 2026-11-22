export type Box = { x: number; y: number; w: number; h: number; small: boolean; shape: 'orb' | 'tile' };
export type Rect = { x: number; y: number; w: number; h: number };

export type LayoutInput = {
  mode: 'star' | 'grid' | 'speaker' | 'present';
  W: number;
  H: number;
  /** Identity shown in the middle (star, speaker). */
  center: string;
  /** Everyone else, already sorted: host first, then most recent speakers. */
  others: string[];
};

export type LayoutOutput = { boxes: Record<string, Box>; screen?: Rect };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function computeLayout({ mode, W, H, center, others }: LayoutInput): LayoutOutput {
  const boxes: Record<string, Box> = {};
  if (W < 40 || H < 40) return { boxes };
  const all = [center, ...others];

  if (mode === 'star') {
    const m = Math.min(W, H);
    const sz = clamp(m * 0.34, 92, 280);
    const sizes = [clamp(sz * 0.5, 50, 140), clamp(sz * 0.38, 40, 108), clamp(sz * 0.3, 34, 84)];
    boxes[center] = { x: W / 2 - sz / 2, y: H / 2 - sz / 2, w: sz, h: sz, small: false, shape: 'orb' };

    const n = others.length;
    const rings: string[][] = n <= 5 ? [others] : n <= 15 ? [others.slice(0, 5), others.slice(5)] : [others.slice(0, 5), others.slice(5, 15), others.slice(15)];
    const used = rings.filter((r) => r.length > 0).length;
    if (used > 0) {
      const last = sizes[used - 1];
      const innerX = sz / 2 + sizes[0] / 2 + 18;
      const innerY = innerX;
      const outerX = Math.max(innerX, W / 2 - last / 2 - 12);
      const outerY = Math.max(innerY, H / 2 - last / 2 - 12);
      const offsets = [0.35, 0.9, 0.15];
      rings.forEach((ring, k) => {
        if (!ring.length) return;
        const t = used === 1 ? 0.55 : k / (used - 1);
        const rx = used === 1 ? Math.max(innerX, outerX * 0.62) : innerX + (outerX - innerX) * t;
        const ry = used === 1 ? Math.max(innerY, outerY * 0.62) : innerY + (outerY - innerY) * t;
        const s = sizes[k];
        ring.forEach((id, i) => {
          const a = -Math.PI / 2 + (i * 2 * Math.PI) / ring.length + offsets[k];
          boxes[id] = { x: W / 2 + Math.cos(a) * rx - s / 2, y: H / 2 + Math.sin(a) * ry - s / 2, w: s, h: s, small: k > 0, shape: 'orb' };
        });
      });
    }
    return { boxes };
  }

  if (mode === 'grid') {
    const g = 10;
    const n = all.length;
    let best = { cols: 1, tw: 0 };
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const w = (W - g * (cols + 1)) / cols;
      const h = (H - g * (rows + 1)) / rows;
      const tw = Math.min(w, h * 1.6);
      if (tw > best.tw) best = { cols, tw };
    }
    const cols = best.cols;
    const rows = Math.ceil(n / cols);
    const tw = best.tw;
    const th = tw / 1.6;
    const totalW = cols * tw + (cols - 1) * g;
    const totalH = rows * th + (rows - 1) * g;
    const ox = (W - totalW) / 2;
    const oy = (H - totalH) / 2;
    all.forEach((id, i) => {
      const c = i % cols;
      const r = Math.floor(i / cols);
      const inLast = r === rows - 1;
      const rowCount = inLast ? n - (rows - 1) * cols : cols;
      const rowShift = inLast ? ((cols - rowCount) * (tw + g)) / 2 : 0;
      boxes[id] = { x: ox + c * (tw + g) + rowShift, y: oy + r * (th + g), w: tw, h: th, small: n > 9, shape: 'tile' };
    });
    return { boxes };
  }

  const g = 10;
  const wide = W >= 900;
  let main: Rect;
  let strip: { x: number; y: number; w: number; h: number; vertical: boolean };
  const stripIds = mode === 'present' ? all : others;
  if (wide) {
    const stripW = clamp(W * 0.17, 150, 220);
    main = { x: g, y: g, w: W - stripW - g * 3, h: H - g * 2 };
    strip = { x: W - stripW - g, y: g, w: stripW, h: H - g * 2, vertical: true };
  } else {
    const stripH = stripIds.length ? clamp(H * 0.2, 72, 120) : 0;
    main = { x: g, y: g, w: W - g * 2, h: H - stripH - g * (stripIds.length ? 3 : 2) };
    strip = { x: g, y: H - stripH - g, w: W - g * 2, h: stripH, vertical: false };
  }

  if (mode === 'speaker') boxes[center] = { ...main, small: false, shape: 'tile' };

  if (stripIds.length) {
    if (strip.vertical) {
      const th = clamp((strip.w * 9) / 16, 80, 140);
      const maxFit = Math.max(1, Math.floor((strip.h + g) / (th + g)));
      stripIds.forEach((id, i) => {
        if (i >= maxFit) return;
        boxes[id] = { x: strip.x, y: strip.y + i * (th + g), w: strip.w, h: th, small: true, shape: 'tile' };
      });
    } else {
      const th = strip.h;
      const tw = clamp((th * 16) / 10, 90, 170);
      const per = Math.max(1, Math.floor((strip.w + g) / (tw + g)));
      const count = Math.min(stripIds.length, per);
      const total = count * tw + (count - 1) * g;
      const ox = strip.x + (strip.w - total) / 2;
      stripIds.slice(0, count).forEach((id, i) => {
        boxes[id] = { x: ox + i * (tw + g), y: strip.y, w: tw, h: th, small: true, shape: 'tile' };
      });
    }
  }

  return { boxes, screen: mode === 'present' ? main : undefined };
}
