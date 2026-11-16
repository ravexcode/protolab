// Top-down SVG drawing of every part. Coordinates are pitch units.
import { resistorBands } from './catalog.js';
import { footprint } from './board.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
export const safeColor = (c, fallback = '#888888') => (/^#[0-9a-fA-F]{6}$/.test(c || '') ? c : fallback);

const n = v => +(+v).toFixed(3);
const METAL = '#b9bcc2', DARK = '#1d1d1f', ANODE = '#d32f2f';
const lead = (a, b) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${METAL}" stroke-width=".14" stroke-linecap="round"/>`;
const dot = (p, fill = '#d5d8de') => `<circle cx="${p[0]}" cy="${p[1]}" r=".17" fill="${fill}" stroke="rgba(0,0,0,.55)" stroke-width=".04"/>`;
const rect = (x, y, w, h, fill, extra = '') => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}" ${extra}/>`;
const OUTLINE = 'stroke="rgba(0,0,0,.45)" stroke-width=".05"';

function text(x, y, label, maxWidth, maxSize = 0.8, fill = '#e6e6e6') {
  const t = String(label ?? '');
  if (!t) return '';
  const size = Math.min(maxSize, maxWidth / (t.length * 0.62));
  if (size < 0.18) return '';
  return `<text x="${n(x)}" y="${n(y)}" font-size="${n(size)}" font-weight="600" fill="${fill}" text-anchor="middle" dominant-baseline="central">${esc(t)}</text>`;
}

function span(pins) {
  const [a, b] = pins;
  const dx = b[0] - a[0], dy = b[1] - a[1];
  return { len: Math.hypot(dx, dy), ang: Math.atan2(dy, dx) * 180 / Math.PI, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 };
}
const at = (g, body) => `<g transform="translate(${n(g.mx)} ${n(g.my)}) rotate(${n(g.ang)})">${body}</g>`;

function wire(pins, p) {
  const [a, b] = pins, c = safeColor(p.color, '#e53935');
  const line = (stroke, w) => `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round"/>`;
  return line('rgba(0,0,0,.55)', 0.44) + line(c, 0.32) + dot(a) + dot(b);
}

// A cylindrical cell lying between its two terminals: + nub at pin 0, flat − at pin 1.
function cell(pins, p) {
  const g = span(pins), bl = Math.max(0.9, g.len - 0.55), h = 1.15;
  const s = rect(-bl / 2, -h / 2, bl, h, '#1f6f43', `rx=".2" ${OUTLINE}`)
    + rect(bl / 2 - 0.2, -h / 2, 0.2, h, METAL)
    + rect(-bl / 2 - 0.16, -0.24, 0.2, 0.48, METAL, `rx=".05" ${OUTLINE}`)
    + rect(-bl / 2 + 0.12, -h / 2, 0.12, h, '#e0a526')
    + (bl > 2.4 ? text(0.1, 0, p.value, bl - 1.4, 0.6, '#fff') : '')
    + `<path d="M${n(-bl / 2 + 0.38)} 0h.36M${n(-bl / 2 + 0.56)} -.18v.36" stroke="#fff" stroke-width=".09"/>`;
  return lead(pins[0], pins[1]) + at(g, s) + dot(pins[0]) + dot(pins[1]);
}

function axial(def, pins, p) {
  if (def.shape === 'cell') return cell(pins, p);
  const g = span(pins), bl = Math.max(0.8, Math.min(g.len - 0.7, 2.6)), h = 0.76;
  const body = (fill, extra = OUTLINE) => rect(-bl / 2, -h / 2, bl, h, fill, `rx=".3" ${extra}`);
  const band = (t, fill, w = 0.13) => rect(t * bl - w / 2, -h / 2, w, h, fill);
  let s;
  if (def.shape === 'resistor') {
    const c = resistorBands(p.value);
    s = body('#d8b98a') + band(-0.3, c[0]) + band(-0.14, c[1]) + band(0.02, c[2]) + band(0.3, c[3]);
  } else if (def.shape === 'diode') s = body(DARK) + band(0.3, '#cfd3da', 0.18);
  else if (def.shape === 'zener') s = body('#e0703a') + band(0.3, '#111', 0.16);
  else if (def.shape === 'inductor') s = body('#3f8f5a') + band(-0.25, '#2b6a41') + band(0, '#2b6a41') + band(0.25, '#2b6a41');
  else s = body('rgba(200,230,255,.55)') + rect(-bl / 2, -h / 2, 0.3, h, METAL) + rect(bl / 2 - 0.3, -h / 2, 0.3, h, METAL)
    + `<line x1="${n(-bl / 2)}" y1="0" x2="${n(bl / 2)}" y2="0" stroke="#666" stroke-width=".05"/>`;
  return lead(pins[0], pins[1]) + at(g, s) + dot(pins[0]) + dot(pins[1]);
}

// Red + in the gap between four holes, so it never hides a pin.
const plusMark = (x, y) => `<path d="M${n(x - 0.17)} ${n(y)}h.34M${n(x)} ${n(y - 0.17)}v.34" stroke="${ANODE}" stroke-width=".11" stroke-linecap="round"/>`;

const RADIAL = {
  // The rim has a flat on the cathode side (pin 1, local +x); a red + marks the anode (pin 0).
  led: (p, g) => {
    const c = safeColor(p.color, '#e53935');
    return `<path d="M.5-.49A.7.7 0 1 0 .5.49Z" fill="${c}" ${OUTLINE}/><circle r=".55" fill="${c}" stroke="rgba(0,0,0,.25)" stroke-width=".04"/>`
      + `<circle cx="-.17" cy="-.17" r=".22" fill="#fff" opacity=".4"/>`
      + plusMark(-g.len / 2 - 0.5, -0.5);
  },
  ceramic: () => `<ellipse rx=".65" ry=".28" fill="#d98a2b" ${OUTLINE}/>`,
  thermistor: () => `<ellipse rx=".6" ry=".3" fill="#2e7d32" ${OUTLINE}/>`,
  electrolytic: () => `<circle r=".95" fill="#1c2a5a" ${OUTLINE}/><path d="M.45-.837A.95.95 0 0 1 .45.837Z" fill="#cfd3da"/>`
    + `<circle r=".7" fill="none" stroke="#9aa0a8" stroke-width=".05"/>`,
  crystal: () => rect(-0.9, -0.38, 1.8, 0.76, '#cfd3da', `rx=".38" ${OUTLINE}`),
  buzzer: () => `<circle r="1.25" fill="#1b1b1b" ${OUTLINE}/><circle r=".25" fill="#000"/><circle r=".9" fill="none" stroke="#333" stroke-width=".06"/>`,
  speaker: () => `<circle r="1.6" fill="#222" ${OUTLINE}/><circle r="1.15" fill="none" stroke="#444" stroke-width=".1"/><circle r=".55" fill="#3a3a3a"/>`,
  ldr: () => `<circle r=".65" fill="#c9753d" ${OUTLINE}/><polyline points="-.4,-.15 -.2,.15 0,-.15 .2,.15 .4,-.15" fill="none" stroke="#f3e2c0" stroke-width=".07"/>`,
  mic: () => `<circle r=".75" fill="#b0b5bd" ${OUTLINE}/><circle r=".5" fill="#222"/>`,
  motor: () => `<circle r="1.3" fill="#9aa0a8" ${OUTLINE}/><circle r=".9" fill="none" stroke="#7d838c" stroke-width=".07"/><circle r=".2" fill="#555"/>`,
  jack: (p, g) => `<path d="M${n(-g.len / 2 - 0.22)} -1.3h.44M${n(-g.len / 2)} -1.52v.44" stroke="${ANODE}" stroke-width=".13" stroke-linecap="round"/>` + rect(-1, -0.9, 2, 1.8, '#1b1b1b', `rx=".12" ${OUTLINE}`) + `<circle r=".45" fill="#000" stroke="#666" stroke-width=".08"/><circle r=".12" fill="#c9ccd2"/>`,
  coin: (p, g) => `<circle r="1.6" fill="#cfd3da" ${OUTLINE}/><circle r="1.3" fill="none" stroke="#9aa0a8" stroke-width=".06"/>${text(0, 0, '+', 2, 1, '#666')}`
    + `<path d="M${n(-g.len / 2 - 0.22)} -1.95h.44M${n(-g.len / 2)} -2.17v.44" stroke="${ANODE}" stroke-width=".13" stroke-linecap="round"/>`,
};

// Where the body of a battery with snap clip lies: beside the board, on the side nearest its pins.
// Shared with the 3D view. `end` is the y of the clip, `dir` points from the clip into the battery.
export function snapLayout(pins) {
  const mx = (pins[0][0] + pins[1][0]) / 2, my = (pins[0][1] + pins[1][1]) / 2;
  const dir = my < 8.5 ? -1 : 1, len = 6.5, w = 3.6;
  const end = dir < 0 ? -2.25 : 19.25;
  return { x: mx, y: end + dir * len / 2, end, dir, len, w, plus: [mx - 0.75, end], minus: [mx + 0.75, end] };
}

function snap(pins, p) {
  const L = snapLayout(pins), { x, y, w, len, dir, end } = L;
  const cable = (from, to, color) => {
    const c1 = [from[0], from[1] + dir * 2.2], c2 = [to[0], to[1] - dir * 2.2];
    const d = `M${n(from[0])} ${n(from[1])}C${n(c1[0])} ${n(c1[1])} ${n(c2[0])} ${n(c2[1])} ${n(to[0])} ${n(to[1])}`;
    return `<path d="${d}" fill="none" stroke="rgba(0,0,0,.5)" stroke-width=".36" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="${color}" stroke-width=".24" stroke-linecap="round"/>`;
  };
  const top = y - len / 2, label = dir < 0 ? top + 0.5 : end + 1.5;
  return rect(x - w / 2, top, w, len, '#2b2b2e', `rx=".35" ${OUTLINE}`)
    + rect(x - w / 2, label, w, len - 2, '#e0a526')
    + text(x, label + (len - 2) / 2, p.value, w - 0.6, 1.1, '#1b1b1d')
    + rect(x - w / 2 + 0.2, dir < 0 ? end - 0.9 : end - 0.1, w - 0.4, 1, DARK, `rx=".2" ${OUTLINE}`)
    + cable(pins[0], L.plus, '#e53935') + cable(pins[1], L.minus, '#222222')
    + dot(pins[0]) + dot(pins[1]);
}

function radial(def, pins, p) {
  if (def.shape === 'snap') return snap(pins, p);
  const g = span(pins);
  return lead(pins[0], pins[1]) + dot(pins[0]) + dot(pins[1]) + at(g, RADIAL[def.shape](p, g));
}

function inline(def, pins, p) {
  const x0 = pins[0][0], x1 = pins[pins.length - 1][0], y = pins[0][1], cx = (x0 + x1) / 2;
  const dots = pins.map(q => dot(q)).join('');
  switch (def.shape) {
    case 'to92':
      return `<path d="M${cx - 1.05} ${y + 0.45}H${cx + 1.05}A1.05 1.05 0 0 0 ${cx - 1.05} ${y + 0.45}Z" fill="${DARK}" ${OUTLINE}/>`
        + text(cx, y + 0.05, p.label, 1.7, 0.4, '#bdbdbd') + dots;
    case 'to220':
      return rect(cx - 1.3, y - 0.85, 2.6, 0.3, METAL, OUTLINE) + rect(cx - 1.3, y - 0.55, 2.6, 1.1, DARK, OUTLINE)
        + text(cx, y, p.label, 2.3, 0.45, '#bdbdbd') + dots;
    case 'pot':
      return rect(cx - 1.25, y - 1.25, 2.5, 2.5, '#1e6fd0', `rx=".2" ${OUTLINE}`)
        + `<circle cx="${cx}" cy="${y}" r=".8" fill="#e8e3d3" ${OUTLINE}/><line x1="${cx - 0.55}" y1="${y}" x2="${cx + 0.55}" y2="${y}" stroke="#555" stroke-width=".14"/>` + dots;
    case 'rgb':
      return dots + `<circle cx="${cx}" cy="${y}" r=".75" fill="#f4f4f4" opacity=".9" ${OUTLINE}/>`
        + ['#e53935', '#43a047', '#1e88e5'].map((c, i) => `<circle cx="${n(cx - 0.3 + i * 0.3)}" cy="${y}" r=".13" fill="${c}"/>`).join('');
    case 'slide':
      return rect(cx - 1.5, y - 0.55, 3, 1.1, '#3a3d42', `rx=".1" ${OUTLINE}`) + rect(cx - 0.7, y - 0.3, 0.7, 0.6, '#d5d8de') + dots;
    case 'ir':
      return rect(cx - 1.1, y - 0.55, 2.2, 1.1, DARK, `rx=".1" ${OUTLINE}`) + `<circle cx="${cx}" cy="${y + 0.25}" r=".45" fill="#3a3a3a"/>` + dots;
    case 'header':
      return pins.map(q => rect(q[0] - 0.47, q[1] - 0.47, 0.94, 0.94, DARK) + dot(q, '#d4af37')).join('');
    default: {
      const w = def.w || def.n + 0.2, color = def.color || '#1565c0';
      let front = '';
      if (def.extra === 'hcsr04') front = [-4.6, 4.6].map(o => rect(cx + o - 3.1, y + 0.6, 6.2, 2.2, '#c0c4cc', `rx=".2" ${OUTLINE}`)).join('');
      else if (def.extra === 'pir') front = `<ellipse cx="${cx}" cy="${y + 0.6}" rx="4.4" ry="3" fill="#f2f2f2" ${OUTLINE}/>`;
      else if (def.extra === 'relay') front = rect(cx - 3, y + 0.6, 6, 3.4, '#1e88e5', OUTLINE);
      else if (def.extra === 'dht') front = rect(cx - w / 2, y + 0.6, w, 1.4, '#4fc3f7', OUTLINE);
      else if (def.extra === 'shield') front = rect(cx - w / 2 + 0.4, y + 0.6, w - 0.8, 0.5, '#c0c4cc', OUTLINE);
      else if (def.extra) front = rect(cx - w / 2 + 0.6, y + 0.6, w - 1.2, 0.3, '#111');
      return front + rect(cx - w / 2, y - 0.6, w, 1.2, color, `rx=".1" ${OUTLINE}`) + dots
        + text(cx, y - 0.02, p.label, w - 0.4, 0.5, '#fff');
    }
  }
}

function dual(def, pins, p) {
  const nPins = def.n;
  const xL = pins[0][0], xR = pins[nPins - 1][0], yB = pins[0][1], yT = pins[nPins][1];
  const cx = (xL + xR) / 2, cy = (yT + yB) / 2, w = xR - xL + 0.9;
  const stubs = pins.map(([x, y]) => rect(x - 0.15, y === yT ? yT - 0.12 : yB - 0.3, 0.3, 0.42, METAL)).join('');
  const body = (fill, pad = 0.3) => rect(xL - 0.45, yT + pad, w, yB - yT - pad * 2, fill, `rx=".1" ${OUTLINE}`);
  switch (def.shape) {
    case 'tact':
      return pins.map(q => lead(q, [q[0] < cx ? cx - 1 : cx + 1, q[1] < cy ? cy - 1 : cy + 1]) + dot(q)).join('')
        + rect(cx - 1.3, cy - 1.3, 2.6, 2.6, '#2a2a2c', `rx=".2" ${OUTLINE}`)
        + `<circle cx="${cx}" cy="${cy}" r=".8" fill="${safeColor(p.color, '#e53935')}" ${OUTLINE}/>`;
    case 'dipsw':
      return stubs + body('#c62828') + pins.slice(0, nPins).map(([x]) =>
        rect(x - 0.22, cy - 0.55, 0.44, 1.1, 'rgba(0,0,0,.35)') + rect(x - 0.22, cy - 0.55, 0.44, 0.55, '#fff')).join('');
    case 'seg7':
      return stubs + rect(xL - 0.5, yT + 0.2, xR - xL + 1, yB - yT - 0.4, '#1b1b1d', `rx=".1" ${OUTLINE}`)
        + `<path d="M${cx - 1} ${cy - 2}h2v2h-2zM${cx - 1} ${cy}h2v2h-2z" fill="none" stroke="#ff3b30" stroke-width=".32" stroke-linejoin="round"/>`
        + `<circle cx="${cx + 1.6}" cy="${cy + 2}" r=".18" fill="#ff3b30"/>`;
    case 'board': {
      const color = def.color || '#00838f', x = xL - 0.8, bw = xR - xL + 1.6;
      let s = rect(x, yT - 0.7, bw, yB - yT + 1.4, color, `rx=".25" ${OUTLINE}`);
      if (def.usb) s += rect(x - 0.3, cy - 1.4, 2.2, 2.8, '#c0c4cc', OUTLINE);
      if (def.shield) s += rect(xR - 5.5, cy - 3, 6, 6, '#c0c4cc', OUTLINE);
      else s += rect(cx - 0.4, cy - 1.4, 2.8, 2.8, DARK);
      s += pins.map(q => dot(q, '#d4af37')).join('');
      return s + text(cx - (def.shield ? 2 : 3.5), cy, p.label, 4.5, 0.7, '#fff');
    }
    default:
      return stubs + body(DARK)
        + `<path d="M${xL - 0.45} ${cy - 0.35}A.35.35 0 0 1 ${xL - 0.45} ${cy + 0.35}Z" fill="#4a4a4e"/>`
        + `<circle cx="${xL}" cy="${yB - 0.75}" r=".12" fill="#77777c"/>`
        + text(cx + 0.1, cy, p.label, w - 1, 0.85);
  }
}

export function partSVG(def, pins, props) {
  const p = { ...def.props, ...props };
  if (def.kind === 'wire') return wire(pins, p);
  if (def.kind === 'axial') return axial(def, pins, p);
  if (def.kind === 'radial') return radial(def, pins, p);
  if (def.kind === 'inline') return inline(def, pins, p);
  return dual(def, pins, p);
}

// Small standalone icon for the palette.
export function iconSVG(def) {
  let pins, box;
  if (def.kind === 'inline' || def.kind === 'dual') {
    pins = footprint(def, 0, 0);
    const xs = pins.map(q => q[0]), ys = pins.map(q => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const w = Math.max(def.w || 0, Math.max(...xs) - Math.min(...xs) + 2.4) + 0.6;
    const h = Math.max(Math.max(...ys) - Math.min(...ys) + 2.2, def.kind === 'inline' ? 3.4 : 0);
    box = [cx - w / 2, cy - h / 2 + (def.shape === 'module' && def.extra ? 0.6 : 0), w, h];
  } else if (def.shape === 'snap') { pins = [[0, 1], [1, 1]]; box = [-2.8, -8.8, 6.6, 10.6]; }
  else if (def.kind === 'radial') { pins = [[0, 0], [1, 0]]; box = [-1.5, -2, 4, 4]; }
  else { pins = [[0, 0], [3, 0]]; box = [-0.6, -1.4, 4.2, 2.8]; }
  return `<svg viewBox="${box.map(n).join(' ')}" font-family="system-ui,sans-serif">${partSVG(def, pins, {})}</svg>`;
}
