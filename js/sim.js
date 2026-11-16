// DC test of a board: finds the nets, solves node voltages and reports faults.
// Pure, no DOM. Sources, resistors, LEDs and diodes are simulated; ICs, modules
// and switches are left out (their pins simply float).
//
// Pin order of polarised parts: pins[0] is + / anode, pins[1] is − / cathode.
import { getDef, parseOhms } from './catalog.js';

const G_OFF = 1e-9;       // conductance of an open diode or capacitor
const G_MIN = 1e-12;      // tiny leak from every node, keeps the matrix solvable
const LED_RS = 15, DIODE_RS = 0.5;
const LED_MAX = 0.03, LED_FULL = 0.015, RES_WATTS = 0.25;

// Internal resistance of each kind of source, in ohms.
const SOURCES = { battery9v: 1.5, cell: 0.1, coin: 15, jack: 0.5 };
const SHORTS = new Set(['wire', 'fuse', 'inductor']);
const LOADS = { ldr: 10e3, thermistor: 10e3, motor: 20, buzzer: 200, speaker: 8 };

const isRail = y => y === 0 || y === 1 || y === 16 || y === 17;
// Every hole of a terminal strip, or of a rail, is the same conductor.
export const stripOf = ([c, y]) => (isRail(y) ? 'r' + y : c + (y < 8 ? 't' : 'b'));

export function parseVolts(text) {
  const m = /^(\d*\.?\d+)\s*v?$/i.exec(String(text ?? '').trim().replace(',', '.'));
  const v = m ? parseFloat(m[1]) : NaN;
  return v > 0 && v <= 60 ? v : null;
}

// Forward voltage from the LED colour: red and orange drop less than blue or white.
export function ledVf(type, hex) {
  if (type === 'irled') return 1.2;
  const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return 2;
  const v = parseInt(m[1], 16), r = (v >> 16) / 255, g = ((v >> 8) & 255) / 255, b = (v & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d < 0.15) return 3;   // white or grey
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 45 || h >= 330) return 1.9;
  if (h < 70) return 2;
  if (h < 170) return 2.1;
  return 3;
}

const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
// Smallest standard value at or above `ohms`, as "330 Ω" or "1.2 kΩ".
export function nextE12(ohms) {
  const exp = Math.floor(Math.log10(ohms));
  let pick = null;
  for (const e of [exp, exp + 1]) for (const m of E12) if (pick == null && m * 10 ** e >= ohms - 1e-9) pick = m * 10 ** e;
  return pick >= 1e3 ? `${+(pick / 1e3).toFixed(1)} kΩ` : `${Math.round(pick)} Ω`;
}

const fmt = (v, unit) => {
  const a = Math.abs(v);
  if (unit === 'A') return a >= 1 ? `${+a.toFixed(2)} A` : `${+(a * 1e3).toFixed(a < 0.01 ? 1 : 0)} mA`;
  return `${+a.toFixed(2)} ${unit}`;
};

function unionFind() {
  const parent = new Map();
  const find = k => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r);
    while (parent.get(k) !== r) { const next = parent.get(k); parent.set(k, r); k = next; }
    return r;
  };
  return { find, join: (a, b) => parent.set(find(a), find(b)) };
}

// Gaussian elimination with partial pivoting; A is n×n, b length n.
function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]];
    [b[i], b[p]] = [b[p], b[i]];
    const piv = A[i][i] || 1e-30;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / piv;
      if (!f) continue;
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
    x[i] = s / (A[i][i] || 1e-30);
  }
  return x;
}

// Conductor path (wires, fuses, inductors) between two strips, as part ids.
function shortPath(conductors, from, to) {
  const prev = new Map([[from, null]]), queue = [from];
  while (queue.length) {
    const s = queue.shift();
    if (s === to) break;
    for (const c of conductors) {
      const [a, b] = c.strips;
      const next = a === s ? b : b === s ? a : null;
      if (next != null && !prev.has(next)) { prev.set(next, { s, id: c.id }); queue.push(next); }
    }
  }
  const ids = [];
  for (let s = to; prev.get(s); s = prev.get(s).s) ids.push(prev.get(s).id);
  return ids;
}

// "un cable", "2 cables y un pulsador": what joins a short, in words.
function joinedBy(ids, board) {
  const count = new Map();
  for (const id of ids) {
    const name = getDef(board.parts.find(q => q.id === id)?.type)?.name.toLowerCase() || 'pieza';
    count.set(name, (count.get(name) || 0) + 1);
  }
  const words = [...count].map(([name, n]) => (n === 1 ? `un ${name}` : `${n} ${name}${/[aeiou]$/.test(name) ? 's' : 'es'}`));
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} y ${words.at(-1)}` : words[0];
}

// Footprint of a pushbutton: pins 0–3 go left-bottom, right-bottom, right-top, left-top.
// The legs facing each other across the channel are always joined; pressing joins left and right.
export const BUTTON_LINKS = { always: [[0, 3], [1, 2]], pressed: [[0, 1]] };

// `pressed`: ids of the pushbuttons that are held down.
export function simulate(board, pressed = new Set()) {
  const nets = unionFind();
  const elements = [], conductors = [], sources = [], faults = [];
  const fault = (kind, parts, title, text) => faults.push({ kind, parts, title, text });

  for (const part of board.parts) {
    const def = getDef(part.type);
    if (!def) continue;
    const p = { ...def.props, ...part.props };
    const strips = part.pins.map(stripOf);
    if (SHORTS.has(part.type)) {
      conductors.push({ id: part.id, strips });
      nets.join(strips[0], strips[1]);
    } else if (def.shape === 'tact') {
      const links = [...BUTTON_LINKS.always, ...(pressed.has(part.id) ? BUTTON_LINKS.pressed : [])];
      for (const [a, b] of links) {
        conductors.push({ id: part.id, strips: [strips[a], strips[b]] });
        nets.join(strips[a], strips[b]);
      }
    } else if (part.type in SOURCES) {
      const volts = parseVolts(p.value);
      if (volts == null) {
        fault('value', [part.id], `${def.name}: voltaje no válido`,
          `No entiendo «${p.value}». Escribe el voltaje como un número, por ejemplo 9 o 3.7.`);
        continue;
      }
      sources.push({ part, def, volts, rint: SOURCES[part.type], strips });
    } else if (part.type === 'resistor') {
      const ohms = parseOhms(p.value);
      if (ohms == null) {
        fault('value', [part.id], 'Resistencia con un valor no válido',
          `No entiendo «${p.value}». Usa valores como 220, 4.7k o 1M. Mientras tanto cuenta como un circuito abierto.`);
        continue;
      }
      elements.push({ kind: 'res', part, def, ohms, strips });
    } else if (part.type === 'pot') {
      const ohms = parseOhms(p.label) || 10e3;
      elements.push({ kind: 'res', part, def, ohms: ohms / 2, strips: [strips[0], strips[1]], quiet: true });
      elements.push({ kind: 'res', part, def, ohms: ohms / 2, strips: [strips[1], strips[2]], quiet: true });
    } else if (part.type in LOADS) {
      elements.push({ kind: 'res', part, def, ohms: LOADS[part.type], strips, quiet: true });
    } else if (def.shape === 'led') {
      elements.push({ kind: 'diode', led: true, part, def, vf: ledVf(part.type, p.color), rs: LED_RS, strips });
    } else if (part.type === 'diode') {
      elements.push({ kind: 'diode', part, def, vf: 0.7, rs: DIODE_RS, strips });
    } else if (part.type === 'zener') {
      elements.push({ kind: 'diode', part, def, vf: 0.7, vz: 5.1, rs: DIODE_RS, strips });
    } else if (part.type === 'electrolytic') {
      elements.push({ kind: 'cap', part, def, strips });
    }
  }

  const report = { sources: sources.length, lit: {}, faults, short: false, shortAt: null, leds: 0 };
  if (!sources.length) return report;

  // A source whose two terminals share a net is a dead short, whatever else is on the board.
  const live = [];
  for (const s of sources) {
    if (nets.find(s.strips[0]) === nets.find(s.strips[1])) {
      const path = [...new Set(shortPath(conductors, s.strips[0], s.strips[1]))];
      const button = path.some(id => pressed.has(id));
      report.short = true;
      report.shortAt ??= s.part.id;
      fault('short', [s.part.id, ...path], `Cortocircuito en ${s.def.name.toLowerCase()}`,
        `El + y el − están unidos ${path.length ? `por ${joinedBy(path, board)}` : 'directamente'}, sin nada que limite la corriente. ${button ? 'Suelta el pulsador o pon' : `Quita ${path.length ? 'esa unión' : 'la unión'} o pon`} una carga en medio, como una resistencia.`);
    } else live.push(s);
  }

  // Number the nets that touch a simulated part.
  const index = new Map();
  const node = strip => {
    const r = nets.find(strip);
    if (!index.has(r)) index.set(r, index.size);
    return index.get(r);
  };
  for (const s of live) s.n = s.strips.map(node);
  for (const e of elements) e.n = e.strips.map(node);
  const N = index.size;

  const diodes = elements.filter(e => e.kind === 'diode');
  diodes.forEach(d => { d.state = 'off'; });
  const ground = live[0]?.n[1] ?? 0;
  let V = new Array(N).fill(0);

  for (let iter = 0; iter < 60 && N; iter++) {
    const A = Array.from({ length: N }, () => new Array(N).fill(0)), b = new Array(N).fill(0);
    const g = (i, j, G) => { A[i][i] += G; A[j][j] += G; A[i][j] -= G; A[j][i] -= G; };
    // Conductance G from i to j in series with an EMF that pushes current from j to i (i is the + end).
    const emf = (i, j, G, E) => { g(i, j, G); b[i] += G * E; b[j] -= G * E; };
    for (let i = 0; i < N; i++) A[i][i] += G_MIN;
    A[ground][ground] += 1;
    for (const s of live) emf(s.n[0], s.n[1], 1 / s.rint, s.volts);
    for (const e of elements) {
      const [a, k] = e.n;
      if (e.kind === 'res') g(a, k, 1 / e.ohms);
      else if (e.kind === 'cap') g(a, k, G_OFF);
      else if (e.state === 'fwd') emf(a, k, 1 / e.rs, e.vf);
      else if (e.state === 'rev') emf(k, a, 1 / e.rs, e.vz);
      else g(a, k, G_OFF);
    }
    V = solve(A, b);
    let changed = false;
    for (const d of diodes) {
      const vak = V[d.n[0]] - V[d.n[1]];
      const next = d.state === 'fwd' ? (vak - d.vf >= 0 ? 'fwd' : 'off')
        : d.state === 'rev' ? (-vak - d.vz >= 0 ? 'rev' : 'off')
          : vak > d.vf ? 'fwd' : d.vz && -vak > d.vz ? 'rev' : 'off';
      if (next !== d.state) { d.state = next; changed = true; }
    }
    if (!changed) break;
  }

  const vmax = Math.max(...sources.map(s => s.volts));
  for (const s of live) {
    const vt = V[s.n[0]] - V[s.n[1]];
    s.current = (s.volts - vt) / s.rint;
    if (vt < s.volts * 0.2) {
      report.short = true;
      report.shortAt ??= s.part.id;
      fault('short', [s.part.id], `Cortocircuito en ${s.def.name.toLowerCase()}`,
        `La batería entrega ${fmt(s.current, 'A')} y su voltaje cae a ${fmt(vt, 'V')}: algo de muy poca resistencia une el + con el −. Busca ese camino y pon una resistencia.`);
    } else if (vt > s.volts + 0.5) {
      fault('fight', [s.part.id], `${s.def.name} recibe corriente de otra fuente`,
        `Otra fuente de más voltaje la está forzando hacia atrás (${fmt(-s.current, 'A')}). No conectes en paralelo fuentes de distinto voltaje.`);
    }
    // Rails are coloured: + is the red line (even rows), − is the blue one.
    const [py, ny] = [s.part.pins[0][1], s.part.pins[1][1]];
    if (isRail(py) && isRail(ny) && py % 2 === 1 && ny % 2 === 0) {
      fault('rails', [s.part.id], `${s.def.name} al revés en los rieles`,
        'El + está en el riel azul y el − en el rojo. Funciona, pero confunde: pon el + en el riel rojo con Invertir polaridad.');
    }
  }

  for (const e of elements) {
    const [a, k] = e.n, vak = V[a] - V[k];
    if (e.kind === 'res' && !e.quiet) {
      const watts = vak * vak / e.ohms;
      if (watts > RES_WATTS) {
        fault('hot', [e.part.id], 'Resistencia que se calienta',
          `Disipa ${fmt(watts, 'W')} y una resistencia normal aguanta ${RES_WATTS} W. Usa un valor mayor o una de más potencia.`);
      }
    } else if (e.kind === 'cap' && vak < -0.5) {
      fault('reverse', [e.part.id], 'Condensador electrolítico al revés',
        `La franja marca la pata negativa y está a ${fmt(-vak, 'V')} más que la positiva. Gíralo con Invertir polaridad: un electrolítico al revés se hincha y puede reventar.`);
    } else if (e.kind === 'diode' && e.led) {
      report.leds++;
      const amps = e.state === 'fwd' ? (vak - e.vf) / e.rs : 0;
      if (amps > 0.0005) report.lit[e.part.id] = Math.min(1, 0.25 + amps / LED_FULL * 0.75);
      if (amps > LED_MAX) {
        const need = (vmax - e.vf) / 0.015;
        fault('led', [e.part.id], 'LED con demasiada corriente',
          `Le llegan ${fmt(amps, 'A')} y aguanta unos 20 mA: en la realidad se quemaría. Pon en serie una resistencia de ${nextE12(need)} o más.`);
      } else if (e.state === 'off' && -vak > 1) {
        fault('reverse', [e.part.id], 'LED al revés',
          `El cátodo está a ${fmt(-vak, 'V')} más que el ánodo, así que no enciende. El ánodo (pata larga, marca +) va hacia el + de la batería. Gíralo con Invertir polaridad.`);
      }
    } else if (e.kind === 'diode' && e.state === 'fwd' && (vak - e.vf) / e.rs > 1) {
      fault('hot', [e.part.id], `${e.def.name} con demasiada corriente`,
        `Le pasan ${fmt((vak - e.vf) / e.rs, 'A')} y aguanta 1 A. Añade una resistencia en serie.`);
    }
  }

  // Shorts first, then the rest in board order.
  faults.sort((x, y) => (y.kind === 'short') - (x.kind === 'short'));
  return report;
}
