// PDF差分検出ツール — タコまる Diff Reader
// pdf.js を使ってブラウザ完結で2ファイルの差分を検出する。
// (元 mockup.js の機能は保持。Vanta 背景は削除。
//  ローダー演出を タコまる Design System の和紙トーンに差し替え。)

pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const RENDER_SCALE = 2.0;
const PIXEL_THRESHOLD = 32;
const MIN_REGION_PX = 24;
const PADDING = 4;

const state = {
  before: null,
  after: null,
  beforeName: null,
  afterName: null,
  diffsByPage: [],
  currentPage: 0,
  mode: 'sbs',
  opacity: 0.5,
  selected: null,
  zoom: null,
  beforeRange: { start: 1, end: 1 },
  afterRange:  { start: 1, end: 1 },
  hideChecked: false,
};

const $ = (s) => document.querySelector(s);
const els = {
  fileBefore: $('#fileBefore'), fileAfter: $('#fileAfter'),
  nameBefore: $('#nameBefore'), nameAfter: $('#nameAfter'),
  diffList: $('#diffList'), diffStats: $('#diffStats'),
  bulkOps: $('#bulkOps'),
  stage: $('#stage'), status: $('#status'),
  pageLabel: $('#pageLabel'), pageNav: $('#pageNav'),
  empty: $('#empty'),
  opacity: $('#opacity'), opacityValue: $('#opacityValue'),
  renderInfo: $('#renderInfo'),
  compareBar: $('#compareBar'),
  beforeStart: $('#beforeStart'), beforeEnd: $('#beforeEnd'),
  afterStart: $('#afterStart'), afterEnd: $('#afterEnd'),
  beforeTotal: $('#beforeTotal'), afterTotal: $('#afterTotal'),
  cbSummary: $('#cbSummary'),
  btnCompare: $('#btnCompare'), btnReset: $('#btnReset'),
};

function setStatus(t) { els.status.textContent = t; }

// ---- ローディングオーバーレイ (CSSはmockup.cssに統合) ----
const _loader = {
  el: null, text: null, prog: null,
  init() {
    this.el = document.getElementById('loaderOverlay');
    this.text = document.getElementById('loaderText');
    this.prog = document.getElementById('loaderProgress');
  },
  show(text, progress) {
    if (!this.el) this.init();
    if (text != null && this.text) {
      // テキスト本体だけ差し替え、JPサブテキストは残す
      const jp = this.text.querySelector('.jp');
      this.text.textContent = text;
      if (jp) this.text.appendChild(jp);
    }
    if (progress != null && this.prog) this.prog.textContent = progress;
    this.el.classList.add('active');
  },
  update(progress) {
    if (!this.el) this.init();
    if (progress != null && this.prog) this.prog.textContent = progress;
  },
  hide() {
    if (!this.el) this.init();
    this.el.classList.remove('active');
  },
};

// 描画フレームを譲って UI を確実に更新させるユーティリティ
const yieldToRender = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

// ---- ファイル読み込み ----
async function loadFile(file, side) {
  // file slot の表示名を更新
  const nameEl = side === 'before' ? els.nameBefore : els.nameAfter;
  nameEl.textContent = file.name;
  nameEl.classList.remove('empty');

  // レポート出力用にファイル名を保持
  if (side === 'before') state.beforeName = file.name;
  else                   state.afterName  = file.name;

  setStatus(`${side === 'before' ? 'Before' : 'After'} を解析中…`);
  const buf = await file.arrayBuffer();
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) state[side] = await loadPdf(buf);
  else       state[side] = await loadImage(buf, file.type);
  if (state.before && state.after) {
    showCompareBar();
    setStatus('ファイル準備完了。ページ範囲を確認して「比較を実行」を押してください。');
  } else {
    setStatus(`${side} 読み込み完了。もう一方を選択してください。`);
  }
}

async function loadPdf(buf) {
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const textContent = await page.getTextContent();
    const texts = textContent.items.map((it) => {
      const tx = pdfjsLib.Util.transform(viewport.transform, it.transform);
      const x = tx[4];
      const y = tx[5] - it.height * tx[3];
      return { str: it.str, x, y, w: it.width * tx[0], h: it.height * Math.abs(tx[3]) };
    });
    pages.push({ canvas, texts, viewport });
  }
  return { type: 'pdf', pages };
}

async function loadImage(buf, mime) {
  const blob = new Blob([buf], { type: mime || 'image/png' });
  const url = URL.createObjectURL(blob);
  const img = await new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  canvas.getContext('2d').drawImage(img, 0, 0);
  URL.revokeObjectURL(url);
  return { type: 'image', pages: [{ canvas, texts: [], viewport: null }] };
}

// 埋め込みデータのロード(初回のみ <script> を遅延注入)。
// file:// で開かれた場合でも fetch を介さずに使えるようにするため。
let _samplesDataPromise = null;
function ensureSamplesData() {
  if (window.SAMPLE_PDFS) return Promise.resolve(window.SAMPLE_PDFS);
  if (_samplesDataPromise) return _samplesDataPromise;
  _samplesDataPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'samples/samples_data.js';
    s.onload = () => {
      if (window.SAMPLE_PDFS) resolve(window.SAMPLE_PDFS);
      else reject(new Error('SAMPLE_PDFS が見つかりませんでした'));
    };
    s.onerror = () => reject(new Error('samples_data.js の読み込みに失敗しました'));
    document.head.appendChild(s);
  });
  return _samplesDataPromise;
}

function base64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function loadSample(name) {
  setStatus('サンプル取得中…');
  try {
    const data = await ensureSamplesData();
    if (!data[name]) throw new Error(`サンプル "${name}" が定義されていません`);
    const b = base64ToArrayBuffer(data[name].before);
    const a = base64ToArrayBuffer(data[name].after);
    state.before = await loadPdf(b);
    state.after  = await loadPdf(a);
    state.beforeName = `${name}_before.pdf`;
    state.afterName  = `${name}_after.pdf`;
    els.nameBefore.textContent = state.beforeName;
    els.nameBefore.classList.remove('empty');
    els.nameAfter.textContent = state.afterName;
    els.nameAfter.classList.remove('empty');
    showCompareBar();
    setStatus('サンプル読み込み完了。「比較を実行」を押してください。');
  } catch (e) {
    alert(`サンプル読み込みに失敗しました: ${e.message}`);
    setStatus('サンプル読み込み失敗');
  }
}

// ---- 比較範囲指定 ----
function showCompareBar() {
  const bN = state.before.pages.length;
  const aN = state.after.pages.length;
  state.beforeRange = { start: 1, end: bN };
  state.afterRange  = { start: 1, end: aN };
  els.beforeStart.value = 1; els.beforeEnd.value = bN;
  els.afterStart.value  = 1; els.afterEnd.value  = aN;
  els.beforeStart.max = els.beforeEnd.max = bN;
  els.afterStart.max  = els.afterEnd.max  = aN;
  els.beforeTotal.textContent = `/ TOTAL ${bN}`;
  els.afterTotal.textContent  = `/ TOTAL ${aN}`;
  els.compareBar.hidden = false;
  updateCompareSummary();
}

function readRanges() {
  const bN = state.before.pages.length;
  const aN = state.after.pages.length;
  const bs = Math.max(1, Math.min(bN, parseInt(els.beforeStart.value, 10) || 1));
  const be = Math.max(bs, Math.min(bN, parseInt(els.beforeEnd.value, 10) || bs));
  const as_ = Math.max(1, Math.min(aN, parseInt(els.afterStart.value, 10) || 1));
  const ae = Math.max(as_, Math.min(aN, parseInt(els.afterEnd.value, 10) || as_));
  state.beforeRange = { start: bs, end: be };
  state.afterRange  = { start: as_, end: ae };
}

function updateCompareSummary() {
  if (!state.before || !state.after) return;
  readRanges();
  const bLen = state.beforeRange.end - state.beforeRange.start + 1;
  const aLen = state.afterRange.end  - state.afterRange.start  + 1;
  if (bLen === aLen) {
    els.cbSummary.textContent = `対象 ${bLen} ページ`;
    els.compareBar.classList.remove('range-error');
    els.btnCompare.disabled = false;
  } else {
    els.cbSummary.textContent = `長さ不一致 — Before ${bLen}p / After ${aLen}p`;
    els.compareBar.classList.add('range-error');
    els.btnCompare.disabled = true;
  }
}

function resetRanges() {
  if (!state.before || !state.after) return;
  showCompareBar();
}

// ---- 差分計算 ----
async function runDiff() {
  if (!state.before || !state.after) return;
  readRanges();
  const bLen = state.beforeRange.end - state.beforeRange.start + 1;
  const aLen = state.afterRange.end  - state.afterRange.start  + 1;
  if (bLen !== aLen) {
    alert('Before と After のページ範囲の長さを合わせてください。');
    return;
  }
  setStatus('差分を計算中…');
  if (els.empty) els.empty.style.display = 'none';
  document.body.classList.add('has-pages');
  document.body.classList.remove('show-controls');
  const editBtn = document.getElementById('btnEditMode');
  if (editBtn) editBtn.textContent = '✎ 編集';
  state.diffsByPage = [];
  const _diffStart = performance.now();
  _loader.show('Scanning…', `準備中 — 全 ${bLen} ページ`);
  // モバイル Safari ではクラス変更によるレイアウト反映が click ハンドラ完了まで
  // 遅延することがあるので、計算開始前に確実にリフローさせる
  await yieldToRender();
  try {
    for (let i = 0; i < bLen; i++) {
      _loader.update(`PAGE ${i + 1} / ${bLen} を解析中…`);
      if (i > 0) await yieldToRender();
      const pa = state.before.pages[state.beforeRange.start - 1 + i];
      const pb = state.after.pages[state.afterRange.start  - 1 + i];
      if (!pa || !pb) {
        state.diffsByPage.push({
          pageIndex: i, regions: [], textDiffs: [],
          diffCanvas: null, w: 0, h: 0, missing: pa ? 'after' : 'before',
          missingChecked: false,
          beforePage: state.beforeRange.start + i,
          afterPage:  state.afterRange.start + i,
        });
        continue;
      }
      const w = Math.max(pa.canvas.width, pb.canvas.width);
      const h = Math.max(pa.canvas.height, pb.canvas.height);
      const ca = padCanvas(pa.canvas, w, h);
      const cb = padCanvas(pb.canvas, w, h);
      const ia = ca.getContext('2d').getImageData(0, 0, w, h);
      const ib = cb.getContext('2d').getImageData(0, 0, w, h);
      const { mask, regions, diffCanvas } = pixelDiff(ia, ib, w, h);
      const textDiffs = textDiff(pa.texts, pb.texts, regions);
      textDiffs.forEach(d => { d.checked = false; });
      state.diffsByPage.push({
        pageIndex: i,
        beforePage: state.beforeRange.start + i,
        afterPage:  state.afterRange.start + i,
        regions, textDiffs, diffCanvas, w, h, mask,
      });
    }
    state.currentPage = 0;
    renderDiffList();
    renderStage();
    const MIN_LOADER_MS = 700;
    const elapsed = performance.now() - _diffStart;
    if (elapsed < MIN_LOADER_MS) {
      await new Promise(r => setTimeout(r, MIN_LOADER_MS - elapsed));
    }
    setStatus(`完了 — ${bLen} ページ比較`);
  } catch (err) {
    console.error('runDiff failed:', err);
    setStatus('差分計算に失敗しました');
    alert('差分計算中にエラーが発生しました。\n' + (err && err.message ? err.message : err));
  } finally {
    // どんな経路でも必ずローダーを閉じる (モバイルでローダーが残り続けないように)
    _loader.hide();
    // iOS Safari ではレイアウト反映タイミングが遅れることがあるため、
    // 比較完了後に複数回再フィットして確実に表示する
    requestAnimationFrame(() => {
      requestAnimationFrame(() => fitFrames());
    });
    // アドレスバーの表示/非表示などで dvh が変わる場合にも追随
    setTimeout(() => fitFrames(), 250);
  }
}

function padCanvas(src, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0);
  return c;
}

function pixelDiff(ia, ib, w, h) {
  const a = ia.data, b = ib.data;
  const mask = new Uint8Array(w * h);
  const out = new ImageData(w, h);
  const o = out.data;
  const FADE = 0.88;
  for (let i = 0, p = 0; i < a.length; i += 4, p++) {
    const dr = Math.abs(a[i]   - b[i]);
    const dg = Math.abs(a[i+1] - b[i+1]);
    const db = Math.abs(a[i+2] - b[i+2]);
    const delta = Math.max(dr, dg, db);
    if (delta > PIXEL_THRESHOLD) {
      mask[p] = 1;
      o[i]   = b[i];
      o[i+1] = b[i+1];
      o[i+2] = b[i+2];
      o[i+3] = 255;
    } else {
      o[i]   = b[i]   + (255 - b[i])   * FADE;
      o[i+1] = b[i+1] + (255 - b[i+1]) * FADE;
      o[i+2] = b[i+2] + (255 - b[i+2]) * FADE;
      o[i+3] = 255;
    }
  }
  const regions = clusterRegions(mask, w, h);
  const diffCanvas = document.createElement('canvas');
  diffCanvas.width = w; diffCanvas.height = h;
  diffCanvas.getContext('2d').putImageData(out, 0, 0);
  return { mask, regions, diffCanvas };
}

function clusterRegions(mask, w, h) {
  const CELL = 6;
  const gw = Math.ceil(w / CELL), gh = Math.ceil(h / CELL);
  const cell = new Uint8Array(gw * gh);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x]) {
        const gx = (x / CELL) | 0, gy = (y / CELL) | 0;
        cell[gy * gw + gx] = 1;
      }
    }
  }
  const visited = new Uint8Array(gw * gh);
  const regions = [];
  const queue = new Int32Array(gw * gh);
  for (let i = 0; i < gw * gh; i++) {
    if (!cell[i] || visited[i]) continue;
    let head = 0, tail = 0;
    queue[tail++] = i;
    visited[i] = 1;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;
    while (head < tail) {
      const idx = queue[head++];
      const gx = idx % gw, gy = (idx / gw) | 0;
      count++;
      if (gx < minX) minX = gx;
      if (gx > maxX) maxX = gx;
      if (gy < minY) minY = gy;
      if (gy > maxY) maxY = gy;
      const neigh = [idx - 1, idx + 1, idx - gw, idx + gw];
      for (const n of neigh) {
        if (n < 0 || n >= gw * gh) continue;
        if (gx === 0 && n === idx - 1) continue;
        if (gx === gw - 1 && n === idx + 1) continue;
        if (!cell[n] || visited[n]) continue;
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
    const px = count * CELL * CELL;
    if (px < MIN_REGION_PX) continue;
    const x0 = Math.max(0, minX * CELL - PADDING);
    const y0 = Math.max(0, minY * CELL - PADDING);
    const x1 = Math.min(w, (maxX + 1) * CELL + PADDING);
    const y1 = Math.min(h, (maxY + 1) * CELL + PADDING);
    regions.push({ bbox: [x0, y0, x1 - x0, y1 - y0], cells: count, pixels: px });
  }
  return mergeBoxes(regions);
}

function mergeBoxes(regs) {
  let changed = true;
  let arr = regs.slice();
  while (changed) {
    changed = false;
    outer: for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        if (boxesNearby(arr[i].bbox, arr[j].bbox, 12)) {
          arr[i] = { bbox: unionBox(arr[i].bbox, arr[j].bbox),
            cells: arr[i].cells + arr[j].cells, pixels: arr[i].pixels + arr[j].pixels };
          arr.splice(j, 1);
          changed = true;
          break outer;
        }
      }
    }
  }
  arr.sort((a, b) => b.pixels - a.pixels);
  return arr.map((r, idx) => Object.assign({}, r, { id: `R${idx + 1}` }));
}
function boxesNearby(a, b, gap) {
  const ax2 = a[0]+a[2], bx2 = b[0]+b[2];
  const ay2 = a[1]+a[3], by2 = b[1]+b[3];
  return !(b[0] - ax2 > gap || a[0] - bx2 > gap || b[1] - ay2 > gap || a[1] - by2 > gap);
}
function unionBox(a, b) {
  const x = Math.min(a[0], b[0]), y = Math.min(a[1], b[1]);
  const x2 = Math.max(a[0]+a[2], b[0]+b[2]);
  const y2 = Math.max(a[1]+a[3], b[1]+b[3]);
  return [x, y, x2 - x, y2 - y];
}

function textDiff(beforeTexts, afterTexts, regions) {
  const out = [];
  for (const r of regions) {
    const [x, y, w, h] = r.bbox;
    const inBefore = beforeTexts.filter(t => intersect(t, x, y, w, h)).map(t => t.str.trim()).filter(Boolean);
    const inAfter  = afterTexts.filter(t => intersect(t, x, y, w, h)).map(t => t.str.trim()).filter(Boolean);
    if (inBefore.length === 0 && inAfter.length === 0) {
      out.push({ regionId: r.id, kind: 'visual', bbox: r.bbox, before: '', after: '' });
      continue;
    }
    const beforeStr = inBefore.join(' ');
    const afterStr  = inAfter.join(' ');
    if (!beforeStr && afterStr) out.push({ regionId: r.id, kind: 'add', bbox: r.bbox, before: '', after: afterStr });
    else if (beforeStr && !afterStr) out.push({ regionId: r.id, kind: 'remove', bbox: r.bbox, before: beforeStr, after: '' });
    else if (beforeStr === afterStr) out.push({ regionId: r.id, kind: 'visual', bbox: r.bbox, before: beforeStr, after: afterStr });
    else out.push({ regionId: r.id, kind: 'change', bbox: r.bbox, before: beforeStr, after: afterStr });
  }
  return out;
}
function intersect(t, x, y, w, h) {
  return !(t.x + t.w < x || t.x > x + w || t.y + t.h < y || t.y > y + h);
}

// ---- レンダリング ----
function countChecked(diffsByPage) {
  let total = 0, checked = 0;
  diffsByPage.forEach(p => {
    if (p.missing) {
      total += 1;
      if (p.missingChecked) checked += 1;
      return;
    }
    p.textDiffs.forEach(d => {
      total += 1;
      if (d.checked) checked += 1;
    });
  });
  return { total, checked };
}

function updateDiffStats() {
  const { total, checked } = countChecked(state.diffsByPage);
  els.diffStats.textContent =
    `${total} ITEMS · ${state.diffsByPage.length} PG · ${checked} CHECKED`;
}

function applyCheckedStyle(item, isChecked) {
  item.classList.toggle('checked', !!isChecked);
}

function syncRectCheckedClass(regionId, isChecked) {
  document.querySelectorAll(`rect.diffBox[data-region="${regionId}"]`)
    .forEach(r => r.classList.toggle('checked', !!isChecked));
}

function buildCheckbox(isChecked, onToggle) {
  const label = document.createElement('label');
  label.className = 'diff-check';
  label.title = 'チェック — レビュー済みにする';
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = !!isChecked;
  box.addEventListener('click', e => e.stopPropagation());
  box.addEventListener('change', e => {
    e.stopPropagation();
    onToggle(box.checked);
  });
  label.addEventListener('click', e => e.stopPropagation());
  label.appendChild(box);
  return { label, box };
}

function renderDiffList() {
  const lst = els.diffList;
  lst.innerHTML = '';
  if (els.bulkOps) els.bulkOps.hidden = state.diffsByPage.length === 0;
  state.diffsByPage.forEach((p, idx) => {
    const group = document.createElement('div');
    group.className = 'diff-page-group';
    const title = document.createElement('div');
    title.className = 'diff-page-title';

    const totalOnPage = p.missing ? 1 : p.textDiffs.length;
    const checkedOnPage = p.missing
      ? (p.missingChecked ? 1 : 0)
      : p.textDiffs.filter(d => d.checked).length;

    const titleMain = document.createElement('span');
    titleMain.className = 'diff-page-title-main';
    titleMain.innerHTML =
      `<span class="pagenum">p. ${String(idx + 1).padStart(2, '0')}</span>` +
      ` · BEFORE p${p.beforePage} ↔ AFTER p${p.afterPage}` +
      ` · <span class="page-progress">${checkedOnPage} / ${totalOnPage} checked</span>`;
    title.appendChild(titleMain);

    if (totalOnPage > 0) {
      const actions = document.createElement('span');
      actions.className = 'page-check-actions';
      const btnAll = document.createElement('button');
      btnAll.type = 'button';
      btnAll.className = 'page-check-btn';
      btnAll.title = 'このページの差分を全てチェック';
      btnAll.textContent = '✓ ALL';
      btnAll.addEventListener('click', () => setPageChecked(idx, true));
      const btnNone = document.createElement('button');
      btnNone.type = 'button';
      btnNone.className = 'page-check-btn';
      btnNone.title = 'このページのチェックを全て解除';
      btnNone.textContent = '□ NONE';
      btnNone.addEventListener('click', () => setPageChecked(idx, false));
      actions.appendChild(btnAll);
      actions.appendChild(btnNone);
      title.appendChild(actions);
    }
    group.appendChild(title);

    if (p.missing) {
      const item = document.createElement('div');
      item.className = 'diff-item missing-item';
      item.dataset.page = idx;
      item.dataset.region = '__missing__';
      applyCheckedStyle(item, p.missingChecked);
      const { label } = buildCheckbox(p.missingChecked, (val) => {
        p.missingChecked = val;
        applyCheckedStyle(item, val);
        updateDiffStats();
        refreshPageProgress(idx);
      });
      const badgeClass = p.missing === 'after' ? 'remove' : 'add';
      const badgeText = p.missing === 'after' ? 'PAGE-DEL' : 'PAGE-ADD';
      const badge = document.createElement('span');
      badge.className = `badge ${badgeClass}`;
      badge.textContent = badgeText;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<div class="text"><span class="visual-note">この側のドキュメントには対応するページがありません。</span></div>`;
      item.appendChild(label);
      item.appendChild(badge);
      item.appendChild(meta);
      item.addEventListener('click', () => focusDiff(idx, '__missing__'));
      group.appendChild(item);
      lst.appendChild(group);
      return;
    }

    p.textDiffs.forEach((d) => {
      const item = document.createElement('div');
      item.className = 'diff-item';
      item.dataset.page = idx;
      item.dataset.region = d.regionId;
      applyCheckedStyle(item, d.checked);
      const badgeMap = { add: '追加', remove: '削除', change: '変更', visual: '視覚' };
      let textHtml = '';
      if (d.kind === 'add') textHtml = `<ins>${escapeHtml(trim(d.after))}</ins>`;
      else if (d.kind === 'remove') textHtml = `<del>${escapeHtml(trim(d.before))}</del>`;
      else if (d.kind === 'change') textHtml = `<del>${escapeHtml(trim(d.before))}</del> → <ins>${escapeHtml(trim(d.after))}</ins>`;
      else textHtml = '<span class="visual-note">テキスト変更なし — 図形・線・色などの差異。</span>';

      const { label } = buildCheckbox(d.checked, (val) => {
        d.checked = val;
        applyCheckedStyle(item, val);
        syncRectCheckedClass(d.regionId, val);
        updateDiffStats();
        refreshPageProgress(idx);
      });
      item.appendChild(label);

      const badge = document.createElement('span');
      badge.className = `badge ${d.kind}`;
      badge.textContent = badgeMap[d.kind];
      item.appendChild(badge);

      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `
        <div class="pos">[${d.regionId}] x ${(d.bbox[0]/RENDER_SCALE)|0} · y ${(d.bbox[1]/RENDER_SCALE)|0} · ${(d.bbox[2]/RENDER_SCALE)|0}×${(d.bbox[3]/RENDER_SCALE)|0}px</div>
        <div class="text">${textHtml}</div>`;
      item.appendChild(meta);

      item.addEventListener('click', () => focusDiff(idx, d.regionId));
      group.appendChild(item);
    });
    if (p.textDiffs.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'diff-item empty-item';
      empty.innerHTML = `<span class="diff-check-spacer"></span>
        <span class="badge visual">— · 差分</span>
        <div class="meta"><div class="text"><span class="visual-note">このページに差分はありません。</span></div></div>`;
      group.appendChild(empty);
    }
    lst.appendChild(group);
  });
  updateDiffStats();
}

function refreshPageProgress(pageIdx) {
  const p = state.diffsByPage[pageIdx];
  if (!p) return;
  const totalOnPage = p.missing ? 1 : p.textDiffs.length;
  const checkedOnPage = p.missing
    ? (p.missingChecked ? 1 : 0)
    : p.textDiffs.filter(d => d.checked).length;
  const group = els.diffList.querySelectorAll('.diff-page-group')[pageIdx];
  if (!group) return;
  const prog = group.querySelector('.page-progress');
  if (prog) prog.textContent = `${checkedOnPage} / ${totalOnPage} checked`;
}

function setPageChecked(pageIdx, value) {
  const p = state.diffsByPage[pageIdx];
  if (!p) return;
  if (p.missing) {
    p.missingChecked = !!value;
  } else {
    p.textDiffs.forEach(d => {
      d.checked = !!value;
      syncRectCheckedClass(d.regionId, !!value);
    });
  }
  syncCheckboxesForPage(pageIdx);
  refreshPageProgress(pageIdx);
  updateDiffStats();
}

function syncCheckboxesForPage(pageIdx) {
  const group = els.diffList.querySelectorAll('.diff-page-group')[pageIdx];
  if (!group) return;
  const p = state.diffsByPage[pageIdx];
  group.querySelectorAll('.diff-item').forEach((item) => {
    const region = item.dataset.region;
    if (!region) return;
    let isChecked = false;
    if (region === '__missing__') isChecked = !!p.missingChecked;
    else {
      const d = p.textDiffs.find(x => x.regionId === region);
      isChecked = !!(d && d.checked);
    }
    applyCheckedStyle(item, isChecked);
    const box = item.querySelector('input[type="checkbox"]');
    if (box) box.checked = isChecked;
  });
}

function setAllChecked(value) {
  state.diffsByPage.forEach((p, idx) => {
    if (p.missing) {
      p.missingChecked = !!value;
    } else {
      p.textDiffs.forEach(d => {
        d.checked = !!value;
        syncRectCheckedClass(d.regionId, !!value);
      });
    }
    syncCheckboxesForPage(idx);
    refreshPageProgress(idx);
  });
  updateDiffStats();
}

function setHideChecked(value) {
  state.hideChecked = !!value;
  els.diffList.classList.toggle('hide-checked', state.hideChecked);
}
function escapeHtml(s) { return s.replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }
function trim(s) { return s.length > 80 ? s.slice(0, 80) + '…' : s; }

function renderStage() {
  els.stage.innerHTML = '';
  // 内部UI要素を復元
  const zb = document.createElement('div'); zb.id = 'zoomBox'; els.stage.appendChild(zb);
  const vh = document.createElement('div'); vh.id = 'viewHint';
  vh.innerHTML = '<b>DRAG</b> · 移動 &nbsp; <b>WHEEL</b> · 拡大縮小 &nbsp; <b>DBL-CLICK</b> · リセット';
  els.stage.appendChild(vh);

  els.stage.className = state.mode;
  const idx = state.currentPage;
  const p = state.diffsByPage[idx];
  if (!p) return;
  const wrap = document.createElement('div');
  wrap.className = 'pageWrap';
  const pa = state.before.pages[(p.beforePage || (idx + 1)) - 1];
  const pb = state.after.pages[(p.afterPage  || (idx + 1)) - 1];
  if (pa) wrap.appendChild(makeFrame(`BEFORE · p${p.beforePage}`, pa.canvas, [], 'frame-before', 'before'));
  if (pb) wrap.appendChild(makeFrame(`AFTER · p${p.afterPage}`, pb.canvas, p.regions, 'frame-after', 'after'));
  if (p.diffCanvas) wrap.appendChild(makeFrame('DIFF · 差分のみ強調', p.diffCanvas, p.regions, 'frame-diff', 'diff'));
  els.stage.appendChild(wrap);
  els.pageNav.style.display = 'flex';
  els.pageLabel.textContent = `p. ${String(idx + 1).padStart(2,'0')} / ${String(state.diffsByPage.length).padStart(2,'0')} — BEFORE p${p.beforePage} ↔ AFTER p${p.afterPage}`;
  els.renderInfo.textContent = pa ? `RES · ${pa.canvas.width} × ${pa.canvas.height} PX` : '';
  fitFrames();
  // iOS Safari ではクラス変更後すぐは stage の寸法が確定していないことがある。
  // 次フレームでもう一度フィットさせて、初回比較直後の「真っ白」状態を防ぐ。
  requestAnimationFrame(() => {
    requestAnimationFrame(() => fitFrames());
  });
  if (state.selected) highlightRegion(state.selected.regionId);
}

function makeFrame(label, canvas, regions, cls, labelTone) {
  const f = document.createElement('div');
  f.className = `canvasFrame ${cls}`;
  const view = document.createElement('canvas');
  view.width = canvas.width; view.height = canvas.height;
  view.getContext('2d').drawImage(canvas, 0, 0);
  f.style.width = canvas.width + 'px';
  f.style.height = canvas.height + 'px';
  f.dataset.nativeW = canvas.width;
  f.dataset.nativeH = canvas.height;
  f.appendChild(view);
  const lab = document.createElement('div');
  lab.className = 'label' + (labelTone ? ' ' + labelTone : '');
  lab.textContent = label;
  f.appendChild(lab);
  if (regions && regions.length) {
    const currentPage = state.diffsByPage[state.currentPage];
    const checkedIds = new Set(
      currentPage && currentPage.textDiffs
        ? currentPage.textDiffs.filter(d => d.checked).map(d => d.regionId)
        : []
    );
    const svgNs = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNs, 'svg');
    svg.classList.add('overlay');
    svg.setAttribute('viewBox', `0 0 ${canvas.width} ${canvas.height}`);
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.width = '100%'; svg.style.height = '100%';
    for (const r of regions) {
      const rect = document.createElementNS(svgNs, 'rect');
      rect.classList.add('diffBox');
      if (checkedIds.has(r.id)) rect.classList.add('checked');
      rect.dataset.region = r.id;
      rect.setAttribute('x', r.bbox[0]);
      rect.setAttribute('y', r.bbox[1]);
      rect.setAttribute('width', r.bbox[2]);
      rect.setAttribute('height', r.bbox[3]);
      svg.appendChild(rect);
    }
    f.appendChild(svg);
  }
  return f;
}

// ---- View transform (pan + zoom) ----
const view = { scale: 1, x: 0, y: 0, baseScale: 1 };

function applyView() {
  const wrap = document.querySelector('#stage .pageWrap');
  if (!wrap) return;
  wrap.style.transform = 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.scale + ')';
  const zl = document.getElementById('zoomLabel');
  if (zl) zl.textContent = Math.round(view.scale * 100) + '%';
}

function getPageWrapNativeSize() {
  const wrap = document.querySelector('#stage .pageWrap');
  if (!wrap) return { w: 0, h: 0 };
  const prev = wrap.style.transform;
  wrap.style.transform = 'none';
  const w = wrap.offsetWidth;
  const h = wrap.offsetHeight;
  wrap.style.transform = prev;
  return { w, h };
}

function fitFrames() {
  const stageEl = els.stage;
  const sw = stageEl.clientWidth;
  const sh = stageEl.clientHeight;
  const { w, h } = getPageWrapNativeSize();
  if (!w || !h) return;
  // ステージ寸法が確定していない (リフロー前) のときは適用しない。
  // 負スケールが入ると wrap が反転して見えなくなる。
  if (sw < 40 || sh < 40) return;
  const PAD = 36;
  const availW = Math.max(40, sw - PAD * 2);
  const availH = Math.max(40, sh - PAD * 2);
  const fit = Math.min(availW / w, availH / h, 1.0);
  view.baseScale = fit;
  view.scale = fit;
  view.x = (sw - w * fit) / 2;
  view.y = (sh - h * fit) / 2;
  applyView();
}

function zoomAt(factor, anchorX, anchorY) {
  const newScale = Math.max(0.1, Math.min(8, view.scale * factor));
  const contentX = (anchorX - view.x) / view.scale;
  const contentY = (anchorY - view.y) / view.scale;
  view.scale = newScale;
  view.x = anchorX - contentX * newScale;
  view.y = anchorY - contentY * newScale;
  applyView();
}

function focusDiff(pageIdx, regionId) {
  state.selected = { pageIdx, regionId };
  if (state.currentPage !== pageIdx) {
    state.currentPage = pageIdx;
    renderStage();
  }
  highlightRegion(regionId);
  document.querySelectorAll('.diff-item.selected').forEach(e => e.classList.remove('selected'));
  document.querySelectorAll(`.diff-item[data-page="${pageIdx}"][data-region="${regionId}"]`)
    .forEach(e => e.classList.add('selected'));
  const allRects = document.querySelectorAll(`rect.diffBox[data-region="${regionId}"]`);
  let target = null;
  for (const cand of allRects) {
    const frame = cand.closest('.canvasFrame');
    if (frame && getComputedStyle(frame).display !== 'none') {
      target = cand;
      break;
    }
  }
  if (target) {
    const frame = target.closest('.canvasFrame');
    const wrap  = document.querySelector('#stage .pageWrap');
    if (frame && wrap) {
      // canvas-px(rectの属性)→ pageWrap内のCSSピクセル座標で中心を求める
      // (getBoundingClientRectは親のCSS transformと相互作用するブラウザ差があるため使わない)
      const rx = parseFloat(target.getAttribute('x')) || 0;
      const ry = parseFloat(target.getAttribute('y')) || 0;
      const rw = parseFloat(target.getAttribute('width'))  || 0;
      const rh = parseFloat(target.getAttribute('height')) || 0;
      const nativeW = parseFloat(frame.dataset.nativeW) || frame.clientWidth || 1;
      const nativeH = parseFloat(frame.dataset.nativeH) || frame.clientHeight || 1;
      const fcw = frame.clientWidth  || frame.offsetWidth;
      const fch = frame.clientHeight || frame.offsetHeight;
      const sx = fcw / nativeW;
      const sy = fch / nativeH;
      // フレームのpageWrap内オフセット + rect中心 (CSSピクセル, transform前)
      const cxContent = frame.offsetLeft + (rx + rw / 2) * sx;
      const cyContent = frame.offsetTop  + (ry + rh / 2) * sy;
      // ステージ中心に rect 中心を持ってくる
      const sw = els.stage.clientWidth;
      const sh = els.stage.clientHeight;
      view.x = sw / 2 - cxContent * view.scale;
      view.y = sh / 2 - cyContent * view.scale;
      applyView();
    }
  }
}

function highlightRegion(regionId) {
  document.querySelectorAll('rect.diffBox').forEach(r => r.classList.remove('selected'));
  document.querySelectorAll(`rect.diffBox[data-region="${regionId}"]`)
    .forEach(r => {
      r.classList.add('selected');
      r.style.animation = 'none';
      void r.offsetHeight;
      r.style.animation = '';
    });
}

// ---- イベント ----
els.fileBefore.addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0], 'before'));
els.fileAfter.addEventListener('change', e => e.target.files[0] && loadFile(e.target.files[0], 'after'));
const btnSampleTable2 = document.getElementById('btnSampleTable2');
const btnSampleFloor2 = document.getElementById('btnSampleFloor2');
if (btnSampleTable2) btnSampleTable2.addEventListener('click', () => loadSample('table'));
if (btnSampleFloor2) btnSampleFloor2.addEventListener('click', () => loadSample('floorplan'));

[els.beforeStart, els.beforeEnd, els.afterStart, els.afterEnd].forEach(inp => {
  inp.addEventListener('input', updateCompareSummary);
  inp.addEventListener('change', updateCompareSummary);
});
els.btnCompare.addEventListener('click', () => runDiff());
els.btnReset.addEventListener('click', resetRanges);

document.querySelectorAll('#toolbar .modes button').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('#toolbar .modes button').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    state.mode = b.dataset.mode;
    document.body.dataset.mode = state.mode;
    renderStage();
  });
});

els.opacity.addEventListener('input', e => {
  state.opacity = e.target.value / 100;
  document.documentElement.style.setProperty('--ov-opacity', state.opacity);
  els.opacityValue.textContent = `${e.target.value}%`;
});
document.documentElement.style.setProperty('--ov-opacity', state.opacity);

$('#btnPrev').addEventListener('click', () => {
  if (state.currentPage > 0) { state.currentPage--; renderStage(); }
});
$('#btnNext').addEventListener('click', () => {
  if (state.currentPage < state.diffsByPage.length - 1) { state.currentPage++; renderStage(); }
});

window.addEventListener('keydown', (e) => {
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  if (e.key === 'ArrowLeft')  { $('#btnPrev').click(); return; }
  if (e.key === 'ArrowRight') { $('#btnNext').click(); return; }
  if (e.key === ' ' || e.code === 'Space') {
    const sel = document.querySelector('.diff-item.selected');
    if (!sel) return;
    e.preventDefault();
    const pageIdx = parseInt(sel.dataset.page, 10);
    const region  = sel.dataset.region;
    const p = state.diffsByPage[pageIdx];
    if (!p) return;
    let nowChecked;
    if (region === '__missing__') {
      p.missingChecked = !p.missingChecked;
      nowChecked = p.missingChecked;
    } else {
      const d = p.textDiffs.find(x => x.regionId === region);
      if (!d) return;
      d.checked = !d.checked;
      nowChecked = d.checked;
      syncRectCheckedClass(region, nowChecked);
    }
    applyCheckedStyle(sel, nowChecked);
    const box = sel.querySelector('input[type="checkbox"]');
    if (box) box.checked = nowChecked;
    refreshPageProgress(pageIdx);
    updateDiffStats();
    return;
  }
  let dir = 0;
  if (e.key === 'ArrowDown' || e.key === 'j') dir = 1;
  else if (e.key === 'ArrowUp' || e.key === 'k') dir = -1;
  else if (e.key === 'Tab') dir = e.shiftKey ? -1 : 1;
  if (dir !== 0) {
    const items = Array.from(document.querySelectorAll('.diff-item[data-region]'));
    if (!items.length) return;
    e.preventDefault();
    const sel = document.querySelector('.diff-item.selected');
    let idx = sel ? items.indexOf(sel) : (dir > 0 ? -1 : items.length);
    idx = Math.max(0, Math.min(items.length - 1, idx + dir));
    if (items[idx]) {
      items[idx].click();
      items[idx].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }
});

$('#btnZoomIn').addEventListener('click', () => {
  const r = els.stage.getBoundingClientRect();
  zoomAt(1.2, r.width / 2, r.height / 2);
});
$('#btnZoomOut').addEventListener('click', () => {
  const r = els.stage.getBoundingClientRect();
  zoomAt(1 / 1.2, r.width / 2, r.height / 2);
});
$('#btnZoomFit').addEventListener('click', () => fitFrames());

const drag = { mode: null, startX: 0, startY: 0, originX: 0, originY: 0 };

function stagePos(e) {
  const r = els.stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

els.stage.addEventListener('contextmenu', (e) => e.preventDefault());

els.stage.addEventListener('mousedown', (e) => {
  if (!document.querySelector('#stage .pageWrap')) return;
  if (e.button !== 0 && e.button !== 2) return;
  const p = stagePos(e);
  drag.mode = 'pan';
  drag.startX = p.x; drag.startY = p.y;
  drag.originX = view.x; drag.originY = view.y;
  els.stage.classList.add('is-panning');
  e.preventDefault();
});

els.stage.addEventListener('mousemove', (e) => {
  if (drag.mode !== 'pan') return;
  const p = stagePos(e);
  view.x = drag.originX + (p.x - drag.startX);
  view.y = drag.originY + (p.y - drag.startY);
  applyView();
});

window.addEventListener('mouseup', () => {
  if (!drag.mode) return;
  drag.mode = null;
  els.stage.classList.remove('is-panning');
});

els.stage.addEventListener('dblclick', () => {
  fitFrames();
});

els.stage.addEventListener('wheel', (e) => {
  if (!document.querySelector('#stage .pageWrap')) return;
  e.preventDefault();
  const p = stagePos(e);
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
  zoomAt(factor, p.x, p.y);
}, { passive: false });

// ---- タッチ対応 (パン + ピンチズーム + ダブルタップ) ----
(function () {
  const stage = els.stage;
  const touchState = {
    mode: null,             // 'pan' | 'pinch'
    startX: 0, startY: 0,
    originX: 0, originY: 0,
    pinchDist: 0,
    pinchCenter: { x: 0, y: 0 },
    lastTap: 0,
  };

  const stageXY = (clientX, clientY) => {
    const r = stage.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  };
  const dist = (a, b) => {
    const dx = a.clientX - b.clientX, dy = a.clientY - b.clientY;
    return Math.hypot(dx, dy);
  };
  const center = (a, b) => stageXY((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2);

  stage.addEventListener('touchstart', (e) => {
    if (!document.querySelector('#stage .pageWrap')) return;
    if (e.touches.length === 1) {
      const t = e.touches[0];
      const p = stageXY(t.clientX, t.clientY);
      touchState.mode = 'pan';
      touchState.startX = p.x; touchState.startY = p.y;
      touchState.originX = view.x; touchState.originY = view.y;
      // ダブルタップ判定
      const now = Date.now();
      if (now - touchState.lastTap < 300) {
        fitFrames();
        touchState.mode = null;
        touchState.lastTap = 0;
      } else {
        touchState.lastTap = now;
      }
    } else if (e.touches.length === 2) {
      const [a, b] = e.touches;
      touchState.mode = 'pinch';
      touchState.pinchDist = dist(a, b);
      touchState.pinchCenter = center(a, b);
    }
  }, { passive: true });

  stage.addEventListener('touchmove', (e) => {
    if (!touchState.mode) return;
    if (touchState.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      const p = stageXY(t.clientX, t.clientY);
      view.x = touchState.originX + (p.x - touchState.startX);
      view.y = touchState.originY + (p.y - touchState.startY);
      applyView();
      e.preventDefault();
    } else if (touchState.mode === 'pinch' && e.touches.length === 2) {
      const [a, b] = e.touches;
      const newDist = dist(a, b);
      if (touchState.pinchDist > 0) {
        const factor = newDist / touchState.pinchDist;
        const c = center(a, b);
        zoomAt(factor, c.x, c.y);
        touchState.pinchDist = newDist;
        touchState.pinchCenter = c;
      }
      e.preventDefault();
    }
  }, { passive: false });

  const endTouch = (e) => {
    if (e.touches && e.touches.length === 0) {
      touchState.mode = null;
    } else if (e.touches && e.touches.length === 1 && touchState.mode === 'pinch') {
      // ピンチから片手パンへの移行
      const t = e.touches[0];
      const p = stageXY(t.clientX, t.clientY);
      touchState.mode = 'pan';
      touchState.startX = p.x; touchState.startY = p.y;
      touchState.originX = view.x; touchState.originY = view.y;
    }
  };
  stage.addEventListener('touchend', endTouch);
  stage.addEventListener('touchcancel', endTouch);
}());

let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => fitFrames(), 100);
});

$('#btnExport').addEventListener('click', () => {
  const out = state.diffsByPage.map((p, i) => ({
    page: i + 1,
    before_page: p.beforePage,
    after_page: p.afterPage,
    missing: p.missing || null,
    missing_checked: p.missing ? !!p.missingChecked : undefined,
    diffs: p.textDiffs.map(d => ({
      region_id: d.regionId,
      kind: d.kind,
      bbox_px: [
        (d.bbox[0]/RENDER_SCALE)|0, (d.bbox[1]/RENDER_SCALE)|0,
        (d.bbox[2]/RENDER_SCALE)|0, (d.bbox[3]/RENDER_SCALE)|0
      ],
      before: d.before, after: d.after,
      checked: !!d.checked,
    })),
  }));
  download('pdf-diff.json', JSON.stringify(out, null, 2), 'application/json');
});

// レポート: スプリットボタン (主ボタン = FULL, ▼ で UNRESOLVED を選択)
$('#btnExportHtml').addEventListener('click', () => exportHtmlReport('full'));

function filterForReport(diffsByPage, mode) {
  if (mode === 'full') return diffsByPage;
  // unresolved: チェック済み差分を除外。残ゼロのページは欠落ページ以外を除外。
  return diffsByPage
    .map(p => ({ ...p, textDiffs: p.textDiffs.filter(d => !d.checked) }))
    .filter(p => p.textDiffs.length > 0 || (p.missing && !p.missingChecked));
}

function exportHtmlReport(mode) {
  if (!state.diffsByPage.length) { alert('比較データがありません'); return; }
  const reportMode = (mode === 'unresolved') ? 'unresolved' : 'full';
  const filtered = filterForReport(state.diffsByPage, reportMode);
  const stats = countChecked(state.diffsByPage);
  const unresolved = stats.total - stats.checked;

  const titleEn = reportMode === 'unresolved'
    ? 'PDF Diff Report — Unresolved Only'
    : 'PDF Diff Report — Full';
  const titleJp = reportMode === 'unresolved'
    ? 'PDF差分レポート（未チェック差分のみ）'
    : 'PDF差分レポート（全差分）';

  let body = `<h1>${titleJp}<span class="subtitle"> — タコまる Diff Reader</span></h1>`;
  body += `<p class="meta">生成日時: ${new Date().toLocaleString()}`;
  body += ` ／ 総差分 ${stats.total} 件 — チェック済み ${stats.checked} 件 / 未チェック ${unresolved} 件`;
  if (reportMode === 'unresolved') body += ` ／ <b>本レポートは未チェック差分のみを掲載</b>`;
  body += `</p>`;

  if (filtered.length === 0) {
    body += `<p class="empty-msg">— 出力対象の差分はありません（すべての差分がチェック済み）。</p>`;
  }

  filtered.forEach((p) => {
    const idx = p.pageIndex;
    body += `<h2>p. ${String(idx + 1).padStart(2,'0')} — Before p${p.beforePage} ↔ After p${p.afterPage}</h2>`;
    if (p.missing) {
      const badge = reportMode === 'full'
        ? (p.missingChecked
            ? '<span class="rstat checked">☑ CHECKED</span>'
            : '<span class="rstat unresolved">☐ UNRESOLVED</span>')
        : '<span class="rstat unresolved">☐ UNRESOLVED</span>';
      body += `<p>${badge} <b>[${p.missing === 'after' ? 'PAGE-DEL' : 'PAGE-ADD'}]</b> この側のドキュメントには対応するページがありません。</p>`;
      return;
    }
    // ページ単位のチェック進捗（FULLモードのみ表示）
    if (reportMode === 'full') {
      const onPage = p.textDiffs.length;
      const onPageChecked = p.textDiffs.filter(d => d.checked).length;
      body += `<p class="page-stats">${onPageChecked} / ${onPage} checked</p>`;
    }
    if (p.diffCanvas) {
      body += `<img src="${p.diffCanvas.toDataURL('image/png')}" style="max-width:100%; border:1px solid #d8cfbe">`;
    }
    body += '<ul>';
    p.textDiffs.forEach(d => {
      const k = ({ add: '追加', remove: '削除', change: '変更', visual: '視覚' })[d.kind] || d.kind;
      let txt;
      if (d.kind === 'visual') {
        txt = '<span style="color:#4a4640;font-style:italic">テキスト変更なし（図形・線・色など）</span>';
      } else if (d.kind === 'add') {
        txt = '<ins style="background:rgba(91,107,74,.10);color:#3d4a32;text-decoration:none">' + escapeHtml(d.after) + '</ins>';
      } else if (d.kind === 'remove') {
        txt = '<del style="color:#b35a3a">' + escapeHtml(d.before) + '</del>';
      } else {
        txt = '<del style="color:#b35a3a">' + escapeHtml(d.before) + '</del> → <ins style="background:rgba(91,107,74,.10);color:#3d4a32;text-decoration:none">' + escapeHtml(d.after) + '</ins>';
      }
      const statusBadge = reportMode === 'full'
        ? (d.checked
            ? '<span class="rstat checked">☑ CHECKED</span> '
            : '<span class="rstat unresolved">☐ UNRESOLVED</span> ')
        : '';
      body += `<li>${statusBadge}<b>[${k}]</b> ${txt}</li>`;
    });
    body += '</ul>';
  });

  const css =
    'body{font-family:"Noto Serif JP",serif; color:#1a1816; background:#faf8f3; max-width:1100px; margin:24px auto; padding:0 16px}' +
    'h1{font-family:"Cormorant Garamond",serif; font-style:italic; font-weight:300; font-size:44px; margin:0 0 8px}' +
    'h1 .subtitle{font-size:18px; color:#4a4640}' +
    'h2{margin-top:32px; border-bottom:0.5px solid #1a1816; padding-bottom:6px; font-family:"Cormorant Garamond",serif; font-style:italic; font-weight:300; font-size:26px}' +
    'p.meta{font-family:JetBrains Mono,ui-monospace,monospace; font-size:11px; letter-spacing:0.06em; color:#4a4640; text-transform:uppercase}' +
    'p.page-stats{font-family:JetBrains Mono,ui-monospace,monospace; font-size:10px; letter-spacing:0.12em; color:#4a4640; text-transform:uppercase; margin:6px 0 12px}' +
    'p.empty-msg{font-style:italic; color:#4a4640; margin:24px 0}' +
    'li{margin:6px 0; line-height:1.65}' +
    '.rstat{display:inline-block; font-family:JetBrains Mono,ui-monospace,monospace; font-size:9px; letter-spacing:0.14em; padding:1px 6px; border:0.5px solid #c8bfae; border-radius:999px; vertical-align:middle; margin-right:6px}' +
    '.rstat.checked{color:#5b6b4a; border-color:#a8b497}' +
    '.rstat.unresolved{color:#b35a3a; border-color:#d9a995}';

  const html = '<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>' + escapeHtml(titleEn) + '</title>' +
    '<style>' + css + '</style>' +
    '</head><body>' + body + '</body></html>';
  const filename = buildReportFilename(reportMode);
  download(filename, html, 'text/html');
}

// レポートのファイル名を BEFORE/AFTER のPDF名から組み立てる
// 例: A.pdf と B.pdf → "AとBの仕様比較.html"
function buildReportFilename(reportMode) {
  const stripExt = (n) => (n || '').replace(/\.[^.\/\\]+$/, '');
  const sanitize = (n) => (n || '').replace(/[\\\/:*?"<>|\r\n\t]/g, '_').trim();
  const a = sanitize(stripExt(state.beforeName)) || 'BEFORE';
  const b = sanitize(stripExt(state.afterName))  || 'AFTER';
  const suffix = reportMode === 'unresolved' ? '_未チェックのみ' : '';
  return `${a}と${b}の仕様比較${suffix}.html`;
}
function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// ---- レポート: スプリットボタンのドロップダウン ----
(function () {
  const trigger = document.getElementById('btnExportHtmlMenu');
  const menu    = document.getElementById('reportMenu');
  if (!trigger || !menu) return;

  const openMenu = () => {
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  };
  const closeMenu = () => {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  };
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (menu.hidden) openMenu(); else closeMenu();
  });
  menu.querySelectorAll('button[data-report-mode]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const m = btn.dataset.reportMode;
      closeMenu();
      exportHtmlReport(m);
    });
  });
  document.addEventListener('click', (e) => {
    if (menu.hidden) return;
    if (e.target === trigger) return;
    if (menu.contains(e.target)) return;
    closeMenu();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) closeMenu();
  });
}());

// ---- サイドバー: 一括操作 ----
(function () {
  const btnAll  = document.getElementById('btnCheckAll');
  const btnNone = document.getElementById('btnUncheckAll');
  const chkHide = document.getElementById('chkHideChecked');
  if (btnAll)  btnAll.addEventListener('click', () => setAllChecked(true));
  if (btnNone) btnNone.addEventListener('click', () => setAllChecked(false));
  if (chkHide) chkHide.addEventListener('change', (e) => setHideChecked(e.target.checked));
}());

// 起動時に initial fit (空状態用)
window.addEventListener('DOMContentLoaded', () => {
  _loader.init();
});

// ---- INFO モーダル ----
(function () {
  const modal   = document.getElementById('infoModal');
  const btnOpen = document.getElementById('btnInfo');
  const btnClose = document.getElementById('btnInfoClose');
  if (!modal || !btnOpen || !btnClose) return;

  const open  = () => modal.removeAttribute('hidden');
  const close = () => modal.setAttribute('hidden', '');

  btnOpen.addEventListener('click', open);
  btnClose.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) close(); });
}());

// ---- 編集モード切替 (モバイル比較後にファイル選択・範囲バーを呼び戻す) ----
(function () {
  const btn = document.getElementById('btnEditMode');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const showing = document.body.classList.toggle('show-controls');
    btn.textContent = showing ? '✕ 閉じる' : '✎ 編集';
  });
}());

// ---- モバイル: サイドバー(差分一覧)のドロワー ----
(function () {
  const sidebar  = document.getElementById('sidebar');
  const toggle   = document.getElementById('sidebarToggle');
  const backdrop = document.getElementById('sidebarBackdrop');
  const badge    = document.getElementById('sidebarBadge');
  if (!sidebar || !toggle || !backdrop) return;

  const isMobile = () => window.matchMedia('(max-width: 820px)').matches;

  const open = () => {
    sidebar.classList.add('open');
    backdrop.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  };
  const close = () => {
    sidebar.classList.remove('open');
    backdrop.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  };

  toggle.addEventListener('click', () => {
    if (sidebar.classList.contains('open')) close();
    else open();
  });
  backdrop.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) close();
  });

  // 差分項目クリック時、モバイルなら自動で閉じる
  sidebar.addEventListener('click', (e) => {
    if (!isMobile()) return;
    const item = e.target.closest('.diff-item');
    if (!item) return;
    // チェックボックス操作では閉じない
    if (e.target.closest('.diff-check') || e.target.closest('.page-check-actions')) return;
    close();
  });

  // ビューポートが大きく戻ったら状態をリセット
  window.addEventListener('resize', () => {
    if (!isMobile()) close();
  });

  // 件数バッジを差分統計から拾って同期
  const sync = () => {
    const m = (document.getElementById('diffStats')?.textContent || '').match(/(\d+)\s*ITEMS/i);
    const n = m ? parseInt(m[1], 10) : 0;
    if (n > 0) {
      badge.textContent = n;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  };
  const stats = document.getElementById('diffStats');
  if (stats) {
    const mo = new MutationObserver(sync);
    mo.observe(stats, { childList: true, characterData: true, subtree: true });
  }
  sync();
}());
