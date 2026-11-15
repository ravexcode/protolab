// Application glue: storage, history, palette, side panels and view switching.
import { CATALOG, getDef, SWATCHES } from './catalog.js';
import { PRESETS, MIN_COLS, MAX_COLS, BOARD_COLORS, holes, holeName, pinsValid, key } from './board.js';
import { Editor2D } from './editor2d.js';
import { iconSVG, esc, safeColor } from './draw2d.js';
import { initAI } from './ai.js';

const LS_KEY = 'protolab.v1';
const $ = id => document.getElementById(id);
const uid = () => Math.random().toString(36).slice(2, 10);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const TWO_PIN = new Set(['wire', 'axial', 'radial']);

// ---------- storage ----------
// Rebuilds a board from untrusted JSON, dropping anything that does not fit.
function sanitizeBoard(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const board = {
    id: uid(),
    name: String(raw.name ?? 'Protoboard').slice(0, 60),
    cols: clamp(Math.round(+raw.cols) || 30, MIN_COLS, MAX_COLS),
    rails: ['both', 'top', 'none'].includes(raw.rails) ? raw.rails : 'both',
    color: safeColor(raw.color, BOARD_COLORS[0]),
    parts: [],
  };
  const taken = new Set();
  for (const p of Array.isArray(raw.parts) ? raw.parts : []) {
    const def = getDef(p?.type);
    if (!def || !Array.isArray(p.pins)) continue;
    const pins = p.pins.map(q => [Math.round(+q?.[0]), Math.round(+q?.[1])]);
    const expected = def.kind === 'inline' ? def.n : def.kind === 'dual' ? def.n * 2 : 2;
    if (pins.length !== expected || !pinsValid(board, pins, taken)) continue;
    pins.forEach(q => taken.add(key(...q)));
    const props = {};
    for (const f of def.fields || []) {
      const v = p.props?.[f.key];
      if (v != null) props[f.key] = f.type === 'color' ? safeColor(v, def.props?.[f.key]) : String(v).slice(0, 24);
    }
    board.parts.push({ id: uid(), type: def.type, pins, props });
  }
  return board;
}

function demoBoard() {
  return sanitizeBoard({
    name: 'Ejemplo', cols: 30, rails: 'both',
    parts: [
      { type: 'wire', pins: [[3, 0], [3, 3]], props: { color: '#e53935' } },
      { type: 'resistor', pins: [[3, 5], [7, 5]], props: { value: '220' } },
      { type: 'led', pins: [[7, 6], [8, 6]], props: { color: '#43a047' } },
      { type: 'wire', pins: [[8, 4], [8, 1]], props: { color: '#222222' } },
      { type: 'ic-NE555', pins: [[12, 10], [13, 10], [14, 10], [15, 10], [15, 7], [14, 7], [13, 7], [12, 7]] },
      { type: 'wire', pins: [[12, 12], [12, 17]], props: { color: '#222222' } },
      { type: 'wire', pins: [[15, 5], [15, 0]], props: { color: '#e53935' } },
      { type: 'electrolytic', pins: [[18, 12], [19, 12]] },
      { type: 'button', pins: [[22, 10], [24, 10], [24, 7], [22, 7]] },
      { type: 'pot', pins: [[26, 12], [27, 12], [28, 12]] },
    ],
  });
}

function loadStore() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY));
    const boards = (raw?.boards || []).map(sanitizeBoard).filter(Boolean);
    if (boards.length) {
      const index = clamp(raw.current | 0, 0, boards.length - 1);
      return { boards, current: boards[index], view: ['2d', 'split', '3d'].includes(raw.view) ? raw.view : 'split' };
    }
  } catch { /* corrupt or unavailable storage: start fresh */ }
  const board = demoBoard();
  return { boards: [board], current: board, view: matchMedia('(max-width: 900px)').matches ? '2d' : 'split' };
}

function save() {
  let ok = true;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({
      boards: store.boards, current: store.boards.indexOf(app.board), view: store.view,
    }));
  } catch { ok = false; }
  $('saved').textContent = ok ? 'Guardado' : 'No se pudo guardar';
  $('saved').style.color = ok ? '' : 'var(--danger)';
}

// ---------- state ----------
const store = loadStore();
const hist = { stack: [], i: 0 };
const lastProps = {};
let view3d = null, loading3d = null;

const app = {
  board: store.current,
  tool: 'select',
  selected: null,
  addPart(type, pins) {
    const part = { id: uid(), type, pins, props: { ...lastProps[type] } };
    app.board.parts.push(part);
    app.selected = part.id;
    commit();
  },
  removePart(id) {
    app.board.parts = app.board.parts.filter(p => p.id !== id);
    if (app.selected === id) app.selected = null;
    commit();
  },
  select(id) {
    app.selected = id;
    editor.renderOverlay();
    renderProps();
  },
  commit,
  status(text) { $('stHole').textContent = text; },
};

const editor = new Editor2D($('svg'), app);

function resetHistory() {
  hist.stack = [JSON.stringify(app.board)];
  hist.i = 0;
}

function commit() {
  hist.stack.length = hist.i + 1;
  hist.stack.push(JSON.stringify(app.board));
  if (hist.stack.length > 100) hist.stack.shift();
  hist.i = hist.stack.length - 1;
  save();
  refresh();
}

function travel(step) {
  const i = hist.i + step;
  if (i < 0 || i >= hist.stack.length) return;
  hist.i = i;
  const next = JSON.parse(hist.stack[i]), prev = app.board;
  store.boards[store.boards.indexOf(prev)] = app.board = next;
  if (!next.parts.some(p => p.id === app.selected)) app.selected = null;
  save();
  showBoard(next.cols !== prev.cols || next.rails !== prev.rails);
}

// Redraws everything that depends on the parts of the current board.
function refresh() {
  editor.renderParts();
  renderProps();
  renderBOM();
  $('bUndo').disabled = hist.i === 0;
  $('bRedo').disabled = hist.i === hist.stack.length - 1;
  if (view3d && store.view !== '2d') view3d.setBoard(app.board);
}

// Redraws the board itself as well (after switching, resizing or undoing).
function showBoard(fit = true) {
  editor.renderBoard();
  if (fit) editor.fit();
  renderBoardSel();
  syncBoardForm();
  refresh();
}

function switchBoard(board) {
  app.board = board;
  app.selected = null;
  editor.cancel();
  resetHistory();
  save();
  showBoard();
}

// ---------- top bar ----------
function renderBoardSel() {
  $('boardSel').innerHTML = store.boards.map((b, i) =>
    `<option value="${i}"${b === app.board ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
}

$('boardSel').onchange = e => switchBoard(store.boards[+e.target.value]);
$('bNew').onclick = () => {
  const board = sanitizeBoard({ name: `Protoboard ${store.boards.length + 1}`, cols: 30, rails: 'both' });
  store.boards.push(board);
  switchBoard(board);
};
$('bDup').onclick = () => {
  const board = sanitizeBoard({ ...app.board, name: `${app.board.name} (copia)`.slice(0, 60) });
  store.boards.push(board);
  switchBoard(board);
};
$('bDel').onclick = () => {
  if (!confirm(`¿Eliminar "${app.board.name}"? No se puede deshacer.`)) return;
  store.boards.splice(store.boards.indexOf(app.board), 1);
  if (!store.boards.length) store.boards.push(sanitizeBoard({ name: 'Protoboard 1' }));
  switchBoard(store.boards[0]);
};
$('bUndo').onclick = () => travel(-1);
$('bRedo').onclick = () => travel(1);

$('bExport').onclick = () => {
  const blob = new Blob([JSON.stringify({ app: 'protolab', version: 1, board: app.board }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (app.board.name.replace(/[^\w\- ]+/g, '').trim() || 'protoboard') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
};
$('bImport').onclick = () => $('fileIn').click();
$('fileIn').onchange = async e => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const raw = JSON.parse(await file.text());
    const list = (raw.boards || [raw.board || raw]).map(sanitizeBoard).filter(Boolean);
    if (!list.length) throw new Error('empty');
    store.boards.push(...list);
    switchBoard(list[0]);
  } catch {
    alert('El archivo no es una protoboard válida.');
  }
};

// ---------- views ----------
function ensure3D() {
  if (view3d) return Promise.resolve();
  loading3d ??= import('./view3d.js').then(m => {
    view3d = new m.View3D($('pane3d'));
  }).catch(err => {
    console.error(err);
    $('msg3d').hidden = false;
    $('msg3d').textContent = 'No se pudo iniciar la vista 3D (WebGL no disponible).';
  });
  return loading3d;
}

function setView(view) {
  store.view = view;
  $('stage').dataset.view = view;
  for (const b of $('viewSeg').children) b.classList.toggle('active', b.dataset.view === view);
  save();
  if (view !== '2d') ensure3D().then(() => { view3d?.resize(); view3d?.setBoard(app.board); });
}
$('viewSeg').onclick = e => e.target.dataset.view && setView(e.target.dataset.view);
$('zIn').onclick = () => editor.zoom(1 / 1.3);
$('zOut').onclick = () => editor.zoom(1.3);
$('zFit').onclick = () => editor.fit();

// ---------- tools and palette ----------
function setTool(tool) {
  app.tool = tool;
  editor.cancel();
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('active', b.dataset.tool === tool);
  const def = getDef(tool);
  $('stTool').textContent = !def ? (tool === 'erase' ? 'Borrar: haz clic en un componente' : 'Seleccionar: clic para elegir, arrastra para mover')
    : TWO_PIN.has(def.kind) ? `${def.name}: clic en un agujero y luego en otro, o arrastra entre ambos`
      : `${def.name}: clic sobre la protoboard para colocarlo`;
}

function renderPalette(filter = '') {
  const q = filter.trim().toLowerCase();
  let html = '';
  for (const group of CATALOG) {
    const items = group.items.filter(d => !q || (d.name + ' ' + (d.desc || '') + ' ' + group.cat).toLowerCase().includes(q));
    if (!items.length) continue;
    html += `<h3>${esc(group.cat)}</h3>` + items.map(d =>
      `<button class="item${d.type === app.tool ? ' active' : ''}" data-tool="${d.type}">${iconSVG(d)}<span>${esc(d.name)}${d.desc ? `<small>${esc(d.desc)}</small>` : ''}</span></button>`).join('');
  }
  $('palette').innerHTML = html || '<p class="hint">Sin resultados.</p>';
}

// Bottom sheets used on small screens ('left' = components, 'right' = settings).
function setDrawer(name) {
  if (name) document.body.dataset.drawer = name;
  else delete document.body.dataset.drawer;
  for (const b of document.querySelectorAll('[data-drawer]')) b.classList.toggle('open', b.dataset.drawer === name);
}

document.addEventListener('click', e => {
  const tool = e.target.closest('[data-tool]'), drawer = e.target.closest('button[data-drawer]');
  if (tool) { setTool(tool.dataset.tool); setDrawer(null); }
  else if (drawer) setDrawer(document.body.dataset.drawer === drawer.dataset.drawer ? null : drawer.dataset.drawer);
});
$('stage').addEventListener('pointerdown', () => setDrawer(null));
$('search').oninput = e => renderPalette(e.target.value);

// ---------- board form ----------
function swatches(colors, current, withPicker) {
  return colors.map(c => `<button type="button" data-color="${c}" style="background:${c}" title="${c}"${c === current ? ' class="active"' : ''}></button>`).join('')
    + (withPicker ? `<input type="color" value="${safeColor(current, '#e53935')}" title="Otro color">` : '');
}

function syncBoardForm() {
  const b = app.board;
  $('fName').value = b.name;
  $('fCols').value = b.cols;
  $('fRails').value = b.rails;
  const preset = Object.keys(PRESETS).find(k => PRESETS[k].cols === b.cols && PRESETS[k].rails === b.rails);
  $('fPreset').value = preset || 'custom';
  $('fColor').innerHTML = swatches(BOARD_COLORS, b.color);
  $('points').textContent = `${holes(b).length} puntos de conexión`;
}

function applyConfig(patch) {
  const next = { ...app.board, ...patch };
  const kept = app.board.parts.filter(p => pinsValid(next, p.pins));
  const lost = app.board.parts.length - kept.length;
  if (lost && !confirm(`${lost} componente(s) no caben en el nuevo tamaño y se eliminarán. ¿Continuar?`)) return syncBoardForm();
  Object.assign(app.board, patch, { parts: kept });
  if (!kept.some(p => p.id === app.selected)) app.selected = null;
  commit();
  showBoard();
}

$('fPreset').innerHTML = Object.entries(PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('')
  + '<option value="custom">Personalizado</option>';
$('fCols').min = MIN_COLS;
$('fCols').max = MAX_COLS;
$('fPreset').onchange = e => {
  const p = PRESETS[e.target.value];
  if (p) applyConfig({ cols: p.cols, rails: p.rails });
  else $('fCols').focus();
};
$('fCols').onchange = e => applyConfig({ cols: clamp(Math.round(+e.target.value) || app.board.cols, MIN_COLS, MAX_COLS) });
$('fRails').onchange = e => applyConfig({ rails: e.target.value });
$('fName').oninput = e => {
  app.board.name = e.target.value.slice(0, 60) || 'Protoboard';
  renderBoardSel();
  save();
};
$('fName').onchange = commit;
$('fColor').onclick = e => {
  const c = e.target.dataset.color;
  if (!c) return;
  app.board.color = c;
  commit();
  showBoard(false);
};

// ---------- selected part ----------
function renderProps() {
  const part = app.board.parts.find(p => p.id === app.selected);
  $('props').hidden = !part;
  $('mEdit').textContent = part ? 'Editar' : 'Ajustes';
  $('mEdit').classList.toggle('active', !!part);
  if (!part) return;
  const def = getDef(part.type), props = { ...def.props, ...part.props };
  const where = TWO_PIN.has(def.kind)
    ? `${holeName(...part.pins[0])} → ${holeName(...part.pins[1])}`
    : `${part.pins.length} pines · desde ${holeName(...part.pins[0])}`;
  let html = `<div class="name">${esc(def.name)}</div><p class="hint pins">${esc(where)}</p>`;
  for (const f of def.fields || []) {
    html += f.type === 'color'
      ? `<div class="field">${f.label}<div class="swatches" data-key="${f.key}">${swatches(SWATCHES, props[f.key], true)}</div></div>`
      : `<label>${f.label}<input type="text" data-key="${f.key}" maxlength="24" value="${esc(props[f.key])}" placeholder="${esc(f.ph || '')}"></label>`;
  }
  $('propsBody').innerHTML = html + '<button id="bRemove" class="danger">Eliminar componente</button>';
}

function setProp(k, v, done) {
  const part = app.board.parts.find(p => p.id === app.selected);
  if (!part) return;
  part.props[k] = v;
  lastProps[part.type] = { ...part.props };
  if (done) commit();
  else editor.renderParts();
}

$('propsBody').addEventListener('input', e => {
  const k = e.target.dataset.key;
  if (k) setProp(k, e.target.value.slice(0, 24), false);
  else if (e.target.type === 'color') setProp(e.target.parentElement.dataset.key, e.target.value, false);
});
$('propsBody').addEventListener('change', e => {
  if (e.target.dataset.key || e.target.type === 'color') commit();
});
$('propsBody').addEventListener('click', e => {
  if (e.target.id === 'bRemove') { setDrawer(null); return app.removePart(app.selected); }
  const c = e.target.dataset.color;
  if (c) setProp(e.target.parentElement.dataset.key, c, true);
});

function renderBOM() {
  const count = new Map();
  for (const part of app.board.parts) {
    const def = getDef(part.type), p = { ...def.props, ...part.props };
    const extra = p.value || (p.label && p.label !== def.name ? p.label : '');
    const name = def.name + (extra ? ` · ${extra}` : '');
    count.set(name, (count.get(name) || 0) + 1);
  }
  $('bom').innerHTML = [...count].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, n]) => `<li><span>${esc(name)}</span><span>×${n}</span></li>`).join('')
    || '<li class="hint">Aún no hay componentes.</li>';
}

// ---------- keyboard ----------
addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea')) return;
  const ctrl = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (ctrl && k === 'z') { e.preventDefault(); travel(e.shiftKey ? 1 : -1); }
  else if (ctrl && k === 'y') { e.preventDefault(); travel(1); }
  else if (ctrl) return;
  else if (k === 'delete' || k === 'backspace') { if (app.selected) { e.preventDefault(); app.removePart(app.selected); } }
  else if (k === 'escape') { if (!editor.cancel()) { setTool('select'); app.select(null); } }
  else if (k === 'v') setTool('select');
  else if (k === 'e') setTool('erase');
  else if (k === 'w') setTool('wire');
  else if (k === 'r') setTool('resistor');
  else if (k === 'l') setTool('led');
});

// ---------- start ----------
renderPalette();
setTool('select');
resetHistory();
showBoard();
setView(store.view);
initAI({ store, app, editor, uid, sanitizeBoard, switchBoard, commit, showBoard });
