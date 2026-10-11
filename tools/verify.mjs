// tools/verify.mjs —— 无头浏览器硬验证（Edge + puppeteer，零新增依赖）
// 运行： node tools/serve.mjs 4183  然后  node tools/verify.mjs
// 判据：断言全绿 + 0 console 错误 + canvas 像素真值 + 完全离线（无任何外部请求）
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

// 复用 gods-eye-view 里已装好的 puppeteer（不必重复下载 Chromium）；换机器用 GEN_PPTR 指定
const req = createRequire(process.env.GEN_PPTR || 'file:///F:/道路/AI/vibe-coding/gods-eye-view/package.json');
const puppeteer = req('puppeteer');

const ROOT = path.resolve(import.meta.dirname, '..');
const SHOTS = path.join(ROOT, 'qa-shots', 'verify');
const URL = process.env.GEN_URL || 'http://127.0.0.1:4183/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let pass = 0;
const fails = [];
const t = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`); }
  else { fails.push(`${name}${extra ? ' — ' + extra : ''}`); console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`); }
};

fs.mkdirSync(SHOTS, { recursive: true });
const consoleErrors = [];
const offsite = [];

const browser = await puppeteer.launch({
  executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--force-device-scale-factor=1'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push('PAGEERROR: ' + e.message));
page.on('requestfailed', (r) => consoleErrors.push('REQFAIL: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
page.on('request', (r) => {
  const u = r.url();
  if (!u.startsWith('http://127.0.0.1:4183/') && !u.startsWith('data:') && !u.startsWith('blob:')) offsite.push(u);
});

console.log('\n[1] 启动与画廊');
const resp = await page.goto(URL, { waitUntil: 'domcontentloaded' });
t('页面 HTTP 200', resp.status() === 200, `status=${resp.status()}`);
await page.waitForFunction('window.__gen && window.__gen.ready === true', { timeout: 30000 });
t('__gen.ready 置位（p5 已在本地加载并装配）', true);
const boot = await page.evaluate(() => ({
  ids: window.__gen.sketchIds,
  meta: window.__gen.sketchMeta(),
  status: window.__gen.status(),
  host: (() => { const b = document.querySelector('#host'); return [b.clientWidth, b.clientHeight]; })(),
  tabs: [...document.querySelectorAll('#tabs .tab')].map((b) => b.textContent),
}));
t('三个作品齐备', boot.ids.join(',') === 'flowfield,particletext,fractal', boot.ids.join(','));
t('标题是中文名', [boot.meta.flowfield.title, boot.meta.particletext.title, boot.meta.fractal.title].join('/') === '流场/粒子字/分形', boot.tabs.join(' / '));
t('首屏默认流场', boot.status.active === 'flowfield');
const cv = boot.status.canvases[0] || [];
t('画布尺寸与容器一致', cv[1] === boot.host[0] && cv[2] === boot.host[1], `canvas ${cv[1]}x${cv[2]} vs host ${boot.host[0]}x${boot.host[1]}`);
t('像素密度固定为 1（跨机器像素可比）', boot.status.pixelDensity === 1, String(boot.status.pixelDensity));

console.log('\n[2] 流场：像素真值 + 同种子必然复现');
// 冻结 → 建引擎 → 设种子 → 推进 → 取像素，全部在一次 evaluate 内完成：
// 拖尾是"历史相关"的媒介（每帧按半透明覆盖叠上去），两次重播必须走完全相同的调用序列，
// 中间一旦被 rAF 插进一帧，像素就不同 —— 这不是随机性，是拖尾的天性。
const replay = async () => page.evaluate(() => {
  window.__gen.freeze(true);
  window.__gen.setSketch('flowfield');
  window.__gen.setSeed('确定-甲');
  const s = window.__gen.advance(120);
  const px = window.__gen.pixelProbe();
  return { engine: s.hash, pixel: px.hash, frames: s.frames, seed: s.seed, particles: s.particles, colors: px.colors, nonBackground: px.nonBackground, alpha: px.alpha };
});
const v1 = await replay();
const p1 = v1;
t('120 帧后画布非空白', p1.colors >= 40 && p1.nonBackground > 0.008, `${p1.colors} 色 / 非底色占比 ${(p1.nonBackground * 100).toFixed(1)}%`);
t('画布完全不透明', p1.alpha === 255, String(p1.alpha));
t('帧数推进到 120', v1.frames === 120, String(v1.frames));
t('引擎真的换成了新种子（不是只重建）', v1.seed === '确定-甲', String(v1.seed));
const v1params = await page.evaluate(() => window.__gen.status().params);
t('粒子数 = 面板上的数值（不是字符串）', v1.particles === v1params.count && typeof v1params.count === 'number', `${v1.particles} 粒子`);

// 另一条路径（中间允许 rAF 插帧）：引擎状态必须仍然一致 —— 帧数相同就必须同状态
await page.evaluate(() => { window.__gen.setSketch('flowfield'); window.__gen.setSeed('确定-甲'); });
const v2 = await page.evaluate(() => window.__gen.advance(120));
t('同种子重播：引擎状态指纹一致', v2.hash === v1.engine, `${v1.engine} vs ${v2.hash}`);
const replay2 = await replay();
t('同种子同调用序：画面像素指纹一致', replay2.pixel === v1.pixel, `${v1.pixel} vs ${replay2.pixel}`);

await page.evaluate(() => { window.__gen.setSketch('flowfield'); window.__gen.setSeed('确定-乙'); });
const v3 = await page.evaluate(() => window.__gen.advance(120));
t('换种子：状态指纹改变', v3.hash !== v1.hash, `${v1.hash} → ${v3.hash}`);
const shotA = await page.screenshot({ encoding: 'binary' });
// 截图这张用足帧数的画面：回到「确定-甲」再推进
await page.evaluate(() => { window.__gen.setSketch('flowfield'); window.__gen.setSeed('确定-甲'); window.__gen.advance(160); });

console.log('\n[3] 粒子字：会归位 + 换文字会变');
await page.evaluate(() => { window.__gen.setSketch('particletext'); window.__gen.setParam('density', 6); window.__gen.setSeed('归位-1'); });
const t1 = await page.evaluate(() => window.__gen.advance(420));
t('文字被采样成目标点', t1.targets > 300, `${t1.targets} 个目标点`);
t('粒子数略少于目标点（留白）', t1.particles < t1.targets && t1.particles > 200, `${t1.particles} 粒子`);
const settledRatio = t1.settled / t1.particles;
t('420 帧后 70% 以上粒子归位', settledRatio >= 0.7, `${(settledRatio * 100).toFixed(1)}%`);
t('平均偏差 < 3.5px', t1.meanDist < 3.5, `${t1.meanDist}px`);
const pt1 = await page.evaluate(() => window.__gen.pixelProbe());
t('粒子字画布非空白', pt1.colors >= 15 && pt1.nonBackground > 0.005, `${pt1.colors} 色 / ${(pt1.nonBackground * 100).toFixed(2)}%`);
const shotB = await page.screenshot({ encoding: 'binary' });
await page.evaluate(() => window.__gen.setParam('text', '北印 2026'));
const t2 = await page.evaluate(() => window.__gen.advance(300));
t('换文字后目标点改变', t2.targets !== t1.targets, `${t1.targets} → ${t2.targets}`);
t('换文字后画面改变', t2.hash !== t1.hash, `${t1.hash} → ${t2.hash}`);

console.log('\n[4] 分形：整幅算完 + 集合占比 + 缩放');
await page.evaluate(() => { window.__gen.setSketch('fractal'); window.__gen.freeze(true); });
const f1 = await page.evaluate(() => { window.__gen.finishRender(); return window.__gen.stats(); });
t('整幅渲染完成', f1.progress === 1, `progress=${f1.progress}`);
t('默认视图放大倍数 = 1', f1.zoom === 1, String(f1.zoom));
t('曼德博集合占比 ≈ 19.7%（已知面积 1.5066）', f1.insideRatio > 0.17 && f1.insideRatio < 0.23, `${(f1.insideRatio * 100).toFixed(2)}%`);
const pf = await page.evaluate(() => window.__gen.pixelProbe('#sketch-canvas', { bits: 5 }));
t('分形画布铺满且色彩丰富', pf.colors >= 60 && pf.nonBackground > 0.3, `${pf.colors} 色 / 非底色 ${(pf.nonBackground * 100).toFixed(1)}%`);
const shotC = await page.screenshot({ encoding: 'binary' });

await page.evaluate(() => { window.__gen.zoom(0.25); });
const f2 = await page.evaluate(() => { window.__gen.finishRender(); return window.__gen.stats(); });
t('放大 4 倍生效', Math.abs(f2.zoom - 4) < 0.01, `×${f2.zoom}`);
t('放大后像素指纹改变', f2.hash !== f1.hash, `${f1.hash} → ${f2.hash}`);
t('放大后画面仍是有效分形（占比在合理区间）', f2.insideRatio >= 0 && f2.insideRatio <= 1 && f2.insideRatio !== f1.insideRatio, `${(f2.insideRatio * 100).toFixed(2)}%`);

await page.evaluate(() => { window.__gen.setSketch('fractal'); });
const f3 = await page.evaluate(() => { window.__gen.finishRender(); return window.__gen.stats(); });
t('重进分形：同一视图逐像素复现', f3.hash === f1.hash, `${f1.hash} vs ${f3.hash}`);
await page.evaluate(() => window.__gen.setParam('mode', 'julia'));
const f4 = await page.evaluate(() => { window.__gen.finishRender(); return window.__gen.stats(); });
t('切到 Julia 集并重新渲染', f4.mode === 'julia' && f4.progress === 1, `占比 ${(f4.insideRatio * 100).toFixed(2)}%`);
t('Julia（Douady 兔子）有实心区', f4.insideRatio > 0.01, String(f4.insideRatio));

console.log('\n[5] 交互：走真实 DOM 事件，不是只调 API');
await page.evaluate(() => { window.__gen.setSketch('flowfield'); window.__gen.freeze(false); });
await page.click('#tabs .tab[data-id="fractal"]');
await sleep(400);
t('点击标签切到分形', await page.evaluate(() => window.__gen.active) === 'fractal');
await page.click('#tabs .tab[data-id="flowfield"]');
await sleep(400);
const slider = await page.evaluate(() => {
  const el = document.querySelector('#controls input[data-key="count"]');
  el.value = '3600';
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return { exists: !!el, count: window.__gen.status().params.count };
});
t('拖动粒子数滑块生效', slider.exists && slider.count === 3600, String(slider.count));
await page.click('#btn-pause');
t('点暂停 → 冻结', await page.evaluate(() => window.__gen.status().frozen) === true);
// 按钮此刻持有焦点：空格会先触发按钮自身，再走全局 handler —— 必须先把焦点移开
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.keyboard.press('Space');
t('空格解冻', await page.evaluate(() => window.__gen.status().frozen) === false);
await page.click('#btn-pause');
t('按钮与空格不会双重切换（点一次只变一次）', await page.evaluate(() => window.__gen.status().frozen) === true);
await page.click('#btn-pause');
await page.keyboard.press('2');
await sleep(400);
t('快捷键 2 切到粒子字', await page.evaluate(() => window.__gen.active) === 'particletext');
const seedSwap = await page.evaluate(() => {
  const before = window.__gen.status().seed;
  document.querySelector('#btn-seed').click();
  return [before, window.__gen.status().seed];
});
t('随机种子按钮改变种子', seedSwap[0] !== seedSwap[1], `${seedSwap[0]} → ${seedSwap[1]}`);
const seedTyped = await page.evaluate(async () => {
  window.__gen.freeze(true);          // 先冻结，否则 rAF 会在 120ms 里又推进几帧
  const el = document.querySelector('#seed-input');
  el.value = '手写种子-A1';
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 120));
  const st = window.__gen.status();
  const s = window.__gen.stats();
  return { ui: st.seed, engine: s.seed, frames: s.frames };
});
t('手写种子生效并传达到引擎', seedTyped.ui === '手写种子-A1' && seedTyped.engine === '手写种子-A1', `${seedTyped.ui} / 引擎 ${seedTyped.engine}`);
t('换种子后引擎从 0 帧重新演化', seedTyped.frames === 0, String(seedTyped.frames));
const tabCount = await page.evaluate(() => [...document.querySelectorAll('#tabs .tab')].length);
t('标签数量正确（切来切去不重复建 DOM）', tabCount === 3, String(tabCount));
const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
t('同时只存在一个画布（旧实例被销毁）', canvasCount === 1, String(canvasCount));

console.log('\n[6] 导出、窄屏、截图与错误');
const png = await page.evaluate(() => window.__gen.exportPNG('verify.png'));
t('导出 PNG 得到 data URL', typeof png === 'string' && png.startsWith('data:image/png') && png.length > 15000, `${Math.round((png || '').length / 1024)}KB`);

const wideW = await page.evaluate(() => document.querySelector('#sketch-canvas').width);
await page.setViewport({ width: 960, height: 900 });
await sleep(600);
const narrowW = await page.evaluate(() => document.querySelector('#sketch-canvas').width);
t('窄屏 960 重排：画布变窄', narrowW > 200 && narrowW < wideW, `${wideW} → ${narrowW}`);
const shotD = await page.screenshot({ encoding: 'binary' });
await page.setViewport({ width: 1440, height: 900 });
await sleep(400);

const shots = {
  '01-流场.png': shotA,
  '02-粒子字.png': shotB,
  '03-分形-曼德博.png': shotC,
  '04-窄屏960-粒子字.png': shotD,
};
for (const [name, buf] of Object.entries(shots)) {
  fs.writeFileSync(path.join(SHOTS, name), buf);
  t(`截图 ${name} 非空白`, buf.length > 25000, `${(buf.length / 1024).toFixed(0)}KB`);
}
const pageErrors = await page.evaluate(() => window.__gen.errors);
t('页面内 0 未捕获异常', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | ') || '无');
t('控制台 0 错误（含 404 / 请求失败）', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | ') || '无');
t('完全离线：没有任何外部请求', offsite.length === 0, offsite.slice(0, 3).join(' | ') || '全部资源来自 127.0.0.1:4183');

await browser.close();
const total = pass + fails.length;
console.log(`\n浏览器硬验证：${pass}/${total}` + (fails.length ? `\n失败项：\n - ${fails.join('\n - ')}` : ''));
process.exit(fails.length ? 1 : 0);
