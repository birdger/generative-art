// js/sketches/fractal.js —— sketch 3：分形
// 逃逸时间算法 + 平滑着色；渲染按行分块，既能渐进显示，也能一次性同步算完（给验证脚本用）。
import { iterate, smooth, insideRatio, viewToPlane } from '../lib/fractal.js';
import { paletteRgb, ramp, rampLut } from '../lib/palette.js';

export const meta = {
  id: 'fractal',
  title: '分形',
  blurb: '逃逸时间算法画 Mandelbrot 与 Julia 集，滚轮可一直放大到浮点精度极限',
  params: [
    { key: 'mode', label: '集合', type: 'select', options: ['mandelbrot', 'julia'], value: 'mandelbrot' },
    { key: 'maxIter', label: '迭代上限', min: 40, max: 1200, step: 20, value: 260 },
    { key: 'cycle', label: '色带圈数', min: 0.5, max: 12, step: 0.1, value: 3.2 },
    { key: 'cRe', label: 'Julia 常数实部', min: -1.5, max: 1, step: 0.001, value: -0.123 },
    { key: 'cIm', label: 'Julia 常数虚部', min: -1.5, max: 1.5, step: 0.001, value: 0.745 },
    { key: 'palette', label: '色板', type: 'select', options: ['paper', 'ember', 'porcelain', 'ink'], value: 'ember' },
    { key: 'spin', label: '缓转', min: 0, max: 1, step: 1, value: 0 },
  ],
};

// 默认常数取 Douady 兔子（c ≈ -0.123 + 0.745i）：内部有面积，画面有实心区；
// 若用经典的 -0.4+0.6i，得到的是"树枝状"集合，面积为零 —— 数学上对，但视觉上只有细线。
export const defaults = Object.fromEntries(meta.params.map((p) => [p.key, p.value]));
const BG = [26, 22, 19];

export function defaultView(mode) {
  return mode === 'julia'
    ? { centerX: 0, centerY: 0, span: 3.2 }
    : { centerX: -0.75, centerY: 0, span: 3.5 };
}

export function create({ width = 1440, height = 900, params = {}, seed = 1, allocBuffer = null } = {}) {
  const P = { ...defaults, ...params };
  let curSeed = seed;   // 分形是纯确定性的（同视图必然同图），种子只作为元数据记录
  let w = width;
  let h = height;
  let { centerX, centerY, span } = defaultView(P.mode);
  let lut = rampLut(paletteRgb(P.palette), 64);
  let buffer = null;
  let progress = 0;
  let frames = 0;
  let rowsPerChunk = 18;
  let insideCol = [244, 236, 224];

  const alloc = allocBuffer || (typeof ImageData !== 'undefined' ? (ww, hh) => new ImageData(ww, hh) : null);

  function makeBuffer() {
    if (!alloc) { buffer = null; return; }
    buffer = alloc(w, h);
    const d = buffer.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i] = BG[0]; d[i + 1] = BG[1]; d[i + 2] = BG[2]; d[i + 3] = 255;
    }
    progress = 0;
  }

  function effectiveMaxIter() {
    const zoomBoost = Math.max(0, Math.log2(3.5 / Math.max(1e-6, span))) * 45;
    return Math.min(6000, Math.round(P.maxIter + zoomBoost));
  }

  function renderChunk(rows = rowsPerChunk) {
    if (!buffer || progress >= h) return false;
    const maxIter = effectiveMaxIter();
    const aspect = w / h;
    const halfW = span / 2;
    const halfH = halfW / aspect;
    const data = buffer.data;
    const stop = Math.min(h, progress + rows);
    for (let py = progress; py < stop; py++) {
      const y = centerY - (((py + 0.5) / h) * 2 - 1) * halfH;
      const rowBase = py * w * 4;
      for (let px = 0; px < w; px++) {
        const x = centerX + (((px + 0.5) / w) * 2 - 1) * halfW;
        const r = iterate(P.mode, x, y, { maxIter, cRe: P.cRe, cIm: P.cIm });
        let c;
        if (!r.escaped) {
          c = insideCol;
        } else {
          const t = smooth(r.iter, r.modulus, maxIter) / maxIter;
          c = ramp(lut, (t * P.cycle) % 1);
        }
        const i = rowBase + px * 4;
        data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
      }
    }
    progress = stop;
    return progress < h;
  }

  function renderAll() {
    let guard = 0;
    while (buffer && progress < h && guard++ < 5000) renderChunk(Math.max(rowsPerChunk, 64));
    return progress >= h;
  }

  makeBuffer();

  function step(n = 1) {
    for (let i = 0; i < n; i++) {
      if (buffer && progress < h) renderChunk();
      frames++;
    }
  }

  function draw(p) {
    if (!buffer) makeBuffer();
    if (buffer && progress < h) renderChunk();
    if (buffer && progress >= h) {
      if (P.spin) {
        const a = (frames % 7200) / 7200 * Math.PI * 2;
        p.push();
        p.translate(w / 2, h / 2);
        p.rotate(a);
        p.translate(-w / 2, -h / 2);
        p.drawingContext.putImageData(buffer, 0, 0);
        p.pop();
      } else {
        p.drawingContext.putImageData(buffer, 0, 0);
      }
      p.noFill();
      p.stroke(244, 236, 224, 90);
      p.textSize(13);
      p.textFont('ui-monospace, Menlo, Consolas, monospace');
      p.text(`${P.mode}  ×${(3.5 / span).toFixed(2)}  iter≤${effectiveMaxIter()}  (${centerX.toFixed(6)}, ${centerY.toFixed(6)})`, 16, h - 16);
      return;
    }
    p.background(BG[0], BG[1], BG[2]);
  }

  return {
    id: 'fractal',
    get width() { return w; },
    get height() { return h; },
    get frames() { return frames; },
    params: P,
    get seed() { return curSeed; },
    setSeed(next) { curSeed = next; return curSeed; },
    step,
    draw,
    renderAll,
    get view() { return { centerX, centerY, span }; },
    setView(v = {}) {
      if (Number.isFinite(v.centerX)) centerX = v.centerX;
      if (Number.isFinite(v.centerY)) centerY = v.centerY;
      if (Number.isFinite(v.span)) span = v.span;
      progress = 0;
    },
    reset() {
      const v = defaultView(P.mode);
      centerX = v.centerX;
      centerY = v.centerY;
      span = v.span;
      progress = 0;
    },
    zoomAt(px, py, factor) {
      const [x, y] = viewToPlane(px, py, { width: w, height: h, centerX, centerY, span });
      const next = Math.min(4.2, Math.max(1e-12, span * factor));
      const k = next / span;
      centerX = x - (x - centerX) * k;
      centerY = y - (y - centerY) * k;
      span = next;
      progress = 0;
      return span;
    },
    resize(nw, nh) {
      w = nw; h = nh;
      progress = 0;
      makeBuffer();
    },
    setParam(key, value) {
      const structural = ['mode', 'maxIter', 'cycle', 'cRe', 'cIm', 'palette'].includes(key);
      P[key] = value;
      if (key === 'palette') lut = rampLut(paletteRgb(P.palette), 64);
      if (key === 'mode') this.reset();
      if (structural && key !== 'mode') progress = 0;
    },
    stats() {
      const view = { ...viewToStatsView() };
      const inside = insideRatio({ ...view, w: 72, h: 45, maxIter: Math.min(400, effectiveMaxIter()), mode: P.mode, cRe: P.cRe, cIm: P.cIm });
      function viewToStatsView() {
        const halfW = span / 2;
        const halfH = halfW / (w / h);
        return { minX: centerX - halfW, maxX: centerX + halfW, minY: centerY - halfH, maxY: centerY + halfH };
      }
      return {
        id: 'fractal',
        frames,
        seed: curSeed,
        mode: P.mode,
        progress: h ? progress / h : 0,
        zoom: Math.round((3.5 / span) * 100) / 100,
        centerX: Math.round(centerX * 1e6) / 1e6,
        centerY: Math.round(centerY * 1e6) / 1e6,
        maxIter: effectiveMaxIter(),
        insideRatio: Math.round(inside * 1e4) / 1e4,
        palette: P.palette,
        hash: (progress >= h && buffer) ? pixelHash() : null,
      };
    },
    pixelHash,
  };

  function pixelHash() {
    if (!buffer) return null;
    const d = buffer.data;
    let hash = 2166136261 >>> 0;
    for (let i = 0; i < d.length; i += 4 * 37) {
      hash = Math.imul(hash ^ d[i], 16777619);
      hash = Math.imul(hash ^ d[i + 1], 16777619);
      hash = Math.imul(hash ^ d[i + 2], 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
  }
}
