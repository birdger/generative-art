// js/lib/fractal.js —— 分形数学：逃逸时间算法（Mandelbrot / Julia）+ 平滑着色
// 纯函数，可以直接对着数学真值写断言（例如集合面积 ≈ 1.5066）。
export function mandelbrot(cx, cy, maxIter = 200) {
  let zx = 0, zy = 0, zx2 = 0, zy2 = 0, i = 0;
  while (i < maxIter && zx2 + zy2 <= 4) {
    zy = 2 * zx * zy + cy;
    zx = zx2 - zy2 + cx;
    zx2 = zx * zx;
    zy2 = zy * zy;
    i++;
  }
  return { iter: i, escaped: i < maxIter, zr: zx, zi: zy, modulus: Math.sqrt(zx2 + zy2) };
}

export function julia(x, y, cRe, cIm, maxIter = 200) {
  let zx = x, zy = y, zx2 = zx * zx, zy2 = zy * zy, i = 0;
  while (i < maxIter && zx2 + zy2 <= 4) {
    zy = 2 * zx * zy + cIm;
    zx = zx2 - zy2 + cRe;
    zx2 = zx * zx;
    zy2 = zy * zy;
    i++;
  }
  return { iter: i, escaped: i < maxIter, zr: zx, zi: zy, modulus: Math.sqrt(zx2 + zy2) };
}

export function iterate(mode, x, y, { maxIter = 200, cRe = -0.4, cIm = 0.6 } = {}) {
  return mode === 'julia' ? julia(x, y, cRe, cIm, maxIter) : mandelbrot(x, y, maxIter);
}

// 平滑逃逸时间：消除色带上的"洋葱圈"断层，让渐变连续
export function smooth(iter, modulus, maxIter) {
  if (iter >= maxIter || modulus <= 2) return iter;
  const nu = Math.log(Math.log(modulus) / Math.LN2) / Math.LN2;
  const s = iter + 1 - nu;
  return Number.isFinite(s) ? s : iter;
}

export function insideRatio({ minX, maxX, minY, maxY, w, h, maxIter = 120, mode = 'mandelbrot', cRe, cIm }) {
  let inside = 0;
  for (let py = 0; py < h; py++) {
    const y = minY + ((py + 0.5) / h) * (maxY - minY);
    for (let px = 0; px < w; px++) {
      const x = minX + ((px + 0.5) / w) * (maxX - minX);
      const r = iterate(mode, x, y, { maxIter, cRe, cIm });
      if (!r.escaped) inside++;
    }
  }
  return inside / (w * h);
}

// 视图 → 复数：把 canvas 像素坐标映射到复平面
export function viewToPlane(px, py, view) {
  const { width, height, centerX, centerY, span } = view;
  const aspect = width / height;
  const halfW = span / 2;
  const halfH = halfW / aspect;
  return [
    centerX + (px / width - 0.5) * 2 * halfW,
    centerY + (py / height - 0.5) * 2 * halfH,
  ];
}

export const KNOWN_VIEW = { centerX: -0.75, centerY: 0, span: 3.5 };
