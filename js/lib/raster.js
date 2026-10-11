// js/lib/raster.js —— 浏览器端文字栅格化（Node 里不加载；只在这一层碰 DOM/Canvas）
import { alphaToTargets } from './textmask.js';

export function rasterizeText(text, { width = 1200, height = 400, fontSize = 300, fontFamily = '"Songti SC","SimSun",Georgia,serif', weight = 700, stride = 4, threshold = 128, maxPoints = 60000 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = width;
  cv.height = height;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, width, height);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  // 自适应字号：让长句子也能铺满画布
  let size = fontSize;
  g.font = `${weight} ${size}px ${fontFamily}`;
  const maxW = width * 0.9;
  while (g.measureText(text).width > maxW && size > 24) {
    size -= 4;
    g.font = `${weight} ${size}px ${fontFamily}`;
  }
  g.fillText(text, width / 2, height / 2);
  const data = g.getImageData(0, 0, width, height).data;
  const pts = alphaToTargets(data, width, height, { stride, threshold, maxPoints });
  return { points: pts, width, height, fontSize: size };
}

export function canvasToPng(canvas, filename = 'sketch.png') {
  const url = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  return url;
}
