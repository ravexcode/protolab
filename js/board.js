// Breadboard geometry. All coordinates are in pitch units (1 = 2.54 mm).
// A hole is [column, y]. Rows: top rails y=0,1 · a–e y=3..7 · f–j y=10..14 · bottom rails y=16,17.

export const PRESETS = {
  mini: { name: 'Mini · 170 puntos', cols: 17, rails: 'none' },
  half: { name: 'Media · 400 puntos', cols: 30, rails: 'both' },
  full: { name: 'Completa · 830 puntos', cols: 63, rails: 'both' },
  xl: { name: 'Doble · 1660 puntos', cols: 126, rails: 'both' },
};
export const MIN_COLS = 5, MAX_COLS = 150;
export const BOARD_COLORS = ['#f4f1e8', '#ffffff', '#2b2b2e', '#e53935', '#1e88e5', '#43a047', '#fdd835'];

const LETTERS = 'abcdefghij';
const TERMINAL_Y = [3, 4, 5, 6, 7, 10, 11, 12, 13, 14];

export const key = (c, y) => c + ',' + y;
const isRailY = y => y === 0 || y === 1 || y === 16 || y === 17;

// Rail holes come in groups of five, centred along the board.
export function railHole(board, c) {
  const groups = Math.floor((board.cols + 1) / 6);
  const span = groups * 6 - 1;
  const k = c - Math.floor((board.cols - span) / 2);
  return k >= 0 && k < span && k % 6 !== 5;
}

export function railRows(board) {
  if (board.rails === 'both') return [0, 1, 16, 17];
  if (board.rails === 'top') return [0, 1];
  return [];
}

export function holeExists(board, c, y) {
  if (!Number.isInteger(c) || !Number.isInteger(y) || c < 0 || c >= board.cols) return false;
  if (TERMINAL_Y.includes(y)) return true;
  return railRows(board).includes(y) && railHole(board, c);
}

export function holes(board) {
  const out = [];
  const rails = railRows(board);
  for (let c = 0; c < board.cols; c++) {
    for (const y of TERMINAL_Y) out.push([c, y]);
    if (railHole(board, c)) for (const y of rails) out.push([c, y]);
  }
  return out;
}

export function bounds(board) {
  return {
    x0: -1.7, x1: board.cols + 0.7,
    y0: board.rails === 'none' ? 1.5 : -1.2,
    y1: board.rails === 'both' ? 18.2 : 15.5,
  };
}

export function holeName(c, y) {
  if (isRailY(y)) return `Riel ${y % 2 === 0 ? '+' : '−'} ${y < 8 ? 'superior' : 'inferior'} · ${c + 1}`;
  return LETTERS[TERMINAL_Y.indexOf(y)] + (c + 1);
}

const RAIL_NAMES = { 0: 'T+', 1: 'T-', 16: 'B+', 17: 'B-' };

// Short hole ids used by the AI tools: "a1".."j30", "T+3", "B-12".
export function holeId([c, y]) {
  return (RAIL_NAMES[y] ?? LETTERS[TERMINAL_Y.indexOf(y)] ?? '?') + (c + 1);
}

export function parseHole(name) {
  const s = String(name ?? '').trim();
  let m = /^([a-j])(\d{1,3})$/i.exec(s);
  if (m) return [m[2] - 1, TERMINAL_Y[LETTERS.indexOf(m[1].toLowerCase())]];
  m = /^([tb])([+\-−])(\d{1,3})$/i.exec(s);
  if (m) return [m[3] - 1, (m[1].toLowerCase() === 't' ? 0 : 16) + (m[2] === '+' ? 0 : 1)];
  throw new Error(`Invalid hole "${s}". Use names like "a5", "j12", "T+3" or "B-7".`);
}

// The strip of holes electrically joined to [c, y], as a rectangle.
export function stripRect(board, c, y) {
  if (isRailY(y)) return { x: -0.4, y: y - 0.38, w: board.cols - 0.2, h: 0.76 };
  return { x: c - 0.38, y: (y < 8 ? 3 : 10) - 0.38, w: 0.76, h: 4.76 };
}

export function railLines(board) {
  const out = [];
  const add = (y, color) => out.push({ x0: -0.6, x1: board.cols - 0.4, y, color });
  if (board.rails !== 'none') { add(-0.6, '#e53935'); add(1.6, '#1e88e5'); }
  if (board.rails === 'both') { add(15.4, '#e53935'); add(17.6, '#1e88e5'); }
  return out;
}

export function labels(board) {
  const out = [];
  for (let c = 0; c < board.cols; c++) {
    if (c === 0 || (c + 1) % 5 === 0) {
      out.push({ x: c, y: 2.1, t: String(c + 1) });
      out.push({ x: c, y: 14.9, t: String(c + 1) });
    }
  }
  TERMINAL_Y.forEach((y, i) => {
    out.push({ x: -1, y, t: LETTERS[i] });
    out.push({ x: board.cols, y, t: LETTERS[i] });
  });
  for (const y of railRows(board)) {
    const t = y % 2 === 0 ? '+' : '−';
    out.push({ x: -1, y, t, color: y % 2 === 0 ? '#e53935' : '#1e88e5' });
    out.push({ x: board.cols, y, t, color: y % 2 === 0 ? '#e53935' : '#1e88e5' });
  }
  return out;
}

// Readable ink colour for labels printed on the board plastic.
export function inkFor(hex) {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return 'rgba(0,0,0,.45)';
  const v = parseInt(m[1], 16);
  const lum = (0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)) / 255;
  return lum > 0.5 ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.6)';
}

// Pins for a fixed-footprint part centred on the hovered hole.
export function footprint(def, c, y) {
  const step = def.step || 1;
  const left = c - Math.floor(((def.n - 1) * step) / 2);
  if (def.kind === 'inline') return Array.from({ length: def.n }, (_, i) => [left + i * step, y]);
  if (def.kind === 'dual') {
    const top = 7 - Math.floor((def.span - 3) / 2), bottom = top + def.span;
    const cols = Array.from({ length: def.n }, (_, i) => left + i * step);
    return [...cols.map(x => [x, bottom]), ...cols.reverse().map(x => [x, top])];
  }
  return null;
}

export function pinsValid(board, pins, taken) {
  const seen = new Set();
  for (const [c, y] of pins) {
    const k = key(c, y);
    if (!holeExists(board, c, y) || seen.has(k) || (taken && taken.has(k))) return false;
    seen.add(k);
  }
  return true;
}

// Holes used by every part except `exceptId`.
export function takenHoles(board, exceptId) {
  const set = new Set();
  for (const part of board.parts) {
    if (part.id === exceptId) continue;
    for (const [c, y] of part.pins) set.add(key(c, y));
  }
  return set;
}

export function boardSVG(board) {
  const b = bounds(board), ink = inkFor(board.color);
  const n = v => +v.toFixed(2);
  let s = `<rect x="${b.x0}" y="${b.y0}" width="${b.x1 - b.x0}" height="${b.y1 - b.y0}" rx=".5" fill="${board.color}" stroke="rgba(0,0,0,.35)" stroke-width=".08"/>`;
  s += `<rect x="${b.x0}" y="8.15" width="${b.x1 - b.x0}" height=".7" fill="rgba(0,0,0,.16)"/>`;
  for (const l of railLines(board))
    s += `<line x1="${l.x0}" y1="${l.y}" x2="${l.x1}" y2="${l.y}" stroke="${l.color}" stroke-width=".12"/>`;
  let d = '';
  for (const [c, y] of holes(board)) d += `M${n(c - 0.2)} ${n(y - 0.2)}h.4v.4h-.4z`;
  s += `<path d="${d}" fill="#1b1b1d"/>`;
  for (const l of labels(board))
    s += `<text x="${l.x}" y="${l.y}" font-size=".6" fill="${l.color || ink}" text-anchor="middle" dominant-baseline="central">${l.t}</text>`;
  return s;
}
