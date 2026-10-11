// js/lib/palette.js —— 暖纸系色板与色带插值（配色是生成艺术的一半）
export function hexToRgb(hex) {
  let h = String(hex).trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error('bad hex: ' + hex);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

export function lerpRgb(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function css([r, g, b], alpha = 1) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return alpha >= 1 ? `rgb(${c(r)},${c(g)},${c(b)})` : `rgba(${c(r)},${c(g)},${c(b)},${alpha})`;
}

// 色板：暖色编辑风（米纸 → 陶土 → 赭石），符合本机一贯审美
export const PALETTES = {
  paper: ['#F7F2E8', '#EADFC8', '#D8B98A', '#C07B4A', '#8C4A32', '#2E2622'],
  ember: ['#FAF0E4', '#F2C078', '#D9773F', '#A63C20', '#3B1F16'],
  porcelain: ['#F4F7F5', '#CFE0DA', '#8FB6AC', '#3F6F6A', '#22383A'],
  ink: ['#F5F1EA', '#C6BFB4', '#8A8378', '#4A4640', '#1E1C1A'],
};

export function paletteRgb(name = 'paper') {
  const hexes = PALETTES[name] || PALETTES.paper;
  return hexes.map(hexToRgb);
}

// t ∈ [0,1] 在整条色带上取色（t 越界自动夹紧）
export function ramp(stops, t) {
  const k = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(k));
  return lerpRgb(stops[i], stops[i + 1], k - i);
}

export function rampLut(stops, n = 64) {
  const lut = new Array(n);
  for (let i = 0; i < n; i++) lut[i] = ramp(stops, n === 1 ? 0 : i / (n - 1));
  return lut;
}

// 明暗：让同一色带能画在纸底/夜幕上
export function shade(rgb, amount) {
  return amount >= 0 ? lerpRgb(rgb, [255, 255, 255], amount) : lerpRgb(rgb, [0, 0, 0], -amount);
}
