// AI link: lets an agent on this PC (through the local MCP bridge) read and edit the boards.
// The bridge forwards each tool call here over Server-Sent Events; the result goes back by POST.
import { CATALOG, getDef } from './catalog.js';
import { footprint, pinsValid, takenHoles, holeExists, key, parseHole, holeId, holes, MIN_COLS, MAX_COLS } from './board.js';
import { esc } from './draw2d.js';

const LS_KEY = 'protolab.ai';
const DEFAULT_PORT = 7337;
const SITE = 'https://ravexcode.github.io';
const TWO_PIN = new Set(['wire', 'axial', 'radial']);
const $ = id => document.getElementById(id);

// ---------- tools the agent can call ----------
export function createTools({ store, app, editor, uid, sanitizeBoard, switchBoard, commit, showBoard }) {
  const describe = part => {
    const def = getDef(part.type), props = { ...def.props, ...part.props };
    for (const k of Object.keys(props)) if (!(def.fields || []).some(f => f.key === k)) delete props[k];
    return { id: part.id, type: part.type, pins: part.pins.map(holeId), ...(Object.keys(props).length && { props }) };
  };

  const resolvePins = (def, spec) => {
    if (TWO_PIN.has(def.kind)) {
      if (!Array.isArray(spec.pins) || spec.pins.length !== 2) throw new Error(`"${def.type}" needs "pins": [hole, hole].`);
      return spec.pins.map(parseHole);
    }
    if (spec.at == null) throw new Error(`"${def.type}" needs "at": the hole of pin 1.`);
    const [c, y] = parseHole(spec.at);
    return footprint(def, c + Math.floor(((def.n - 1) * (def.step || 1)) / 2), y);
  };

  const checkPins = (pins, exceptId) => {
    const board = app.board, taken = takenHoles(board, exceptId), seen = new Set();
    for (const pin of pins) {
      const k = key(...pin), id = holeId(pin);
      if (!holeExists(board, ...pin)) {
        throw new Error(`Pin would land on ${id}, which does not exist on this ${board.cols}-column board${/^[TB]/.test(id) ? ' (rails skip some columns, or this board has no such rail)' : ''}.`);
      }
      if (taken.has(k)) throw new Error(`Hole ${id} is already used by another part.`);
      if (seen.has(k)) throw new Error(`Two pins of the part would share hole ${id}.`);
      seen.add(k);
    }
  };

  const cleanProps = (def, props, base = {}) => {
    const out = { ...base };
    for (const f of def.fields || []) {
      const v = props?.[f.key];
      if (v == null) continue;
      if (f.type === 'color' && !/^#[0-9a-f]{6}$/i.test(v)) throw new Error('color must look like "#rrggbb".');
      out[f.key] = String(v).slice(0, 24);
    }
    return out;
  };

  const boardInfo = (b, index) => ({ index, name: b.name, cols: b.cols, rails: b.rails, parts: b.parts.length, open: b === app.board });

  return {
    list_components({ query }) {
      const q = String(query || '').toLowerCase(), components = [];
      for (const group of CATALOG) for (const d of group.items) {
        if (q && !`${d.type} ${d.name} ${d.desc || ''} ${group.cat}`.toLowerCase().includes(q)) continue;
        const place = TWO_PIN.has(d.kind) ? 'pins: [hole, hole]'
          : d.kind === 'inline' ? `at: pin 1 of ${d.n} pins in a row`
            : `at: pin 1 of a DIP, ${d.n} pins per row${d.step > 1 ? `, ${d.step} columns apart` : ''}`;
        const props = (d.fields || []).map(f => f.key);
        components.push({ type: d.type, name: d.name + (d.desc ? ` (${d.desc})` : ''), category: group.cat, place, ...(props.length && { props }) });
      }
      return { count: components.length, components };
    },

    list_boards: () => ({ boards: store.boards.map(boardInfo) }),

    get_board() {
      const b = app.board;
      return { ...boardInfo(b, store.boards.indexOf(b)), color: b.color, holes: holes(b).length, parts: b.parts.map(describe) };
    },

    create_board({ name, cols, rails, color }) {
      const board = sanitizeBoard({ name: name || `Protoboard ${store.boards.length + 1}`, cols: cols ?? 30, rails: rails ?? 'both', color });
      store.boards.push(board);
      switchBoard(board);
      return boardInfo(board, store.boards.length - 1);
    },

    select_board({ index }) {
      const board = store.boards[index];
      if (!board) throw new Error(`There is no board with index ${index}. Call list_boards.`);
      switchBoard(board);
      return boardInfo(board, index);
    },

    update_board({ name, cols, rails, color, drop_parts }) {
      const board = app.board, patch = {};
      if (name != null) patch.name = String(name).slice(0, 60) || board.name;
      if (cols != null) {
        if (!Number.isInteger(cols) || cols < MIN_COLS || cols > MAX_COLS) throw new Error(`cols must be an integer from ${MIN_COLS} to ${MAX_COLS}.`);
        patch.cols = cols;
      }
      if (rails != null) {
        if (!['both', 'top', 'none'].includes(rails)) throw new Error('rails must be "both", "top" or "none".');
        patch.rails = rails;
      }
      if (color != null) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('color must look like "#rrggbb".');
        patch.color = color;
      }
      const next = { ...board, ...patch };
      const kept = board.parts.filter(p => pinsValid(next, p.pins));
      const lost = board.parts.filter(p => !kept.includes(p));
      if (lost.length && !drop_parts) {
        throw new Error(`${lost.length} part(s) would not fit: ${lost.map(p => p.id).join(', ')}. Move them first or pass drop_parts: true.`);
      }
      Object.assign(board, patch, { parts: kept });
      if (!kept.some(p => p.id === app.selected)) app.selected = null;
      commit();
      showBoard();
      return { ...boardInfo(board, store.boards.indexOf(board)), removed: lost.map(p => p.id) };
    },

    add_parts({ parts }) {
      if (!Array.isArray(parts) || !parts.length) throw new Error('"parts" must be a non-empty array.');
      const added = [], errors = [];
      parts.forEach((spec, index) => {
        try {
          const def = getDef(spec?.type);
          if (!def) throw new Error(`Unknown type "${spec?.type}". Call list_components.`);
          const pins = resolvePins(def, spec);
          checkPins(pins);
          const part = { id: uid(), type: def.type, pins, props: cleanProps(def, spec.props) };
          app.board.parts.push(part);
          added.push(describe(part));
        } catch (err) {
          errors.push({ index, type: spec?.type, error: err.message });
        }
      });
      if (added.length) commit();
      return { added, ...(errors.length && { errors }) };
    },

    update_part(spec) {
      const part = app.board.parts.find(p => p.id === spec.id);
      if (!part) throw new Error(`There is no part with id "${spec.id}" on the open board. Call get_board.`);
      const def = getDef(part.type);
      const pins = spec.pins || spec.at != null ? resolvePins(def, spec) : part.pins;
      checkPins(pins, part.id);
      const props = cleanProps(def, spec.props, part.props);
      part.pins = pins;
      part.props = props;
      commit();
      return describe(part);
    },

    remove_parts({ ids, all }) {
      const board = app.board, before = board.parts.length;
      const wanted = new Set(Array.isArray(ids) ? ids : []);
      if (!all && !wanted.size) throw new Error('Give "ids" or "all": true.');
      const missing = [...wanted].filter(id => !board.parts.some(p => p.id === id));
      board.parts = all ? [] : board.parts.filter(p => !wanted.has(p.id));
      if (!board.parts.some(p => p.id === app.selected)) app.selected = null;
      if (board.parts.length !== before) commit();
      return { removed: before - board.parts.length, ...(missing.length && { not_found: missing }) };
    },
  };
}

// One-line Spanish summary of a tool call for the activity log.
function summary(tool, args, result) {
  switch (tool) {
    case 'list_components': return 'Consultó el catálogo de componentes';
    case 'list_boards': return 'Consultó la lista de protoboards';
    case 'get_board': return `Leyó la protoboard «${result.name}»`;
    case 'create_board': return `Creó la protoboard «${result.name}»`;
    case 'select_board': return `Abrió la protoboard «${result.name}»`;
    case 'update_board': return `Modificó la protoboard «${result.name}»`;
    case 'add_parts': return `Añadió ${result.added.length} componente(s)` + (result.errors ? `, ${result.errors.length} rechazado(s)` : '');
    case 'update_part': return `Modificó un componente (${result.type})`;
    case 'remove_parts': return `Eliminó ${result.removed} componente(s)`;
    default: return tool;
  }
}

// ---------- connection and dialog ----------
export function initAI(api) {
  const tools = createTools(api);
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(LS_KEY)) || {}; } catch { /* first run */ }
  let port = Number.isInteger(saved.port) ? saved.port : DEFAULT_PORT;
  let state = 'off';          // off | waiting | on
  let source = null, retry = 0, agent = 'claude';
  const entries = [];

  const base = () => `http://127.0.0.1:${port}`;
  const persist = () => {
    try { localStorage.setItem(LS_KEY, JSON.stringify({ port, auto: state !== 'off' })); } catch { /* storage unavailable */ }
  };

  function setState(next) {
    state = next;
    for (const dot of [$('aiDot'), $('bAI').firstElementChild]) dot.dataset.state = next;
    $('aiState').textContent = next === 'on' ? 'Conectado al puente'
      : next === 'waiting' ? 'Buscando el puente… ¿está en marcha?' : 'Desconectado';
    $('aiToggle').textContent = next === 'off' ? 'Conectar' : 'Desconectar';
    $('aiToggle').classList.toggle('active', next === 'off');
    $('aiPort').disabled = next !== 'off';
  }

  function addLog(text, isError) {
    entries.unshift({ time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }), text, isError });
    entries.length = Math.min(entries.length, 50);
    renderLog();
  }
  function renderLog() {
    $('aiLog').innerHTML = entries.map(e => `<li${e.isError ? ' class="err"' : ''}><time>${e.time}</time><span>${esc(e.text)}</span></li>`).join('')
      || '<li class="hint">Aquí verás lo que haga el agente.</li>';
  }

  async function handle(msg) {
    let body;
    try {
      const fn = tools[msg.tool];
      if (!fn) throw new Error(`Unknown tool: ${msg.tool}`);
      api.editor.cancel();
      const result = fn(msg.args || {});
      body = { id: msg.id, result };
      addLog(summary(msg.tool, msg.args, result));
    } catch (err) {
      body = { id: msg.id, error: err.message };
      addLog(`${msg.tool}: ${err.message}`, true);
    }
    try {
      await fetch(base() + '/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch { /* bridge went away; the stream handler will notice */ }
  }

  function open() {
    clearTimeout(retry);
    source?.close();
    source = new EventSource(base() + '/events');
    source.addEventListener('hello', () => { if (state !== 'on') { setState('on'); addLog('Conectado al puente'); } });
    source.onmessage = e => {
      try { handle(JSON.parse(e.data)); } catch { /* ignore malformed frames */ }
    };
    source.onerror = () => {
      if (state === 'on') addLog('Se perdió la conexión con el puente', true);
      if (state !== 'off') setState('waiting');
      // The browser retries by itself unless it gave up; then try again shortly.
      if (source.readyState === EventSource.CLOSED) retry = setTimeout(() => state !== 'off' && open(), 3000);
    };
  }

  function connect() {
    setState('waiting');
    persist();
    open();
  }
  function disconnect() {
    clearTimeout(retry);
    source?.close();
    source = null;
    setState('off');
    persist();
  }

  // ---------- setup commands ----------
  function renderCommands() {
    const url = new URL('bridge/protolab-mcp.mjs', location.href).href;
    const local = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(location.origin);
    const opts = (port !== DEFAULT_PORT ? ` --port ${port}` : '') + (location.origin !== SITE && !local ? ` --origin ${location.origin}` : '');
    const windows = /win/i.test(navigator.userAgentData?.platform || navigator.platform || '');
    $('cmdBridge').textContent = windows
      ? `curl.exe -fsSLO ${url}; node protolab-mcp.mjs${opts}`
      : `curl -fsSLO ${url} && node protolab-mcp.mjs${opts}`;

    const mcp = `${base()}/mcp`;
    const setup = {
      claude: [`claude mcp add --transport http --scope user protolab ${mcp}`,
        'Ejecútalo en una terminal y abre una sesión nueva de Claude Code.'],
      codex: [`codex mcp add protolab --url ${mcp}`,
        'Ejecútalo en una terminal y abre una sesión nueva de Codex.'],
      opencode: [`opencode mcp add protolab --url ${mcp} --global`,
        'Ejecútalo en una terminal y reinicia OpenCode.'],
      other: [`node protolab-mcp.mjs --stdio${opts}`,
        `Cualquier cliente MCP sirve. Por HTTP usa ${mcp}; por stdio registra este comando (con la ruta completa al archivo).`],
    }[agent];
    $('cmdAgent').textContent = setup[0];
    $('agentNote').textContent = setup[1];
    for (const b of $('aiTabs').children) b.classList.toggle('active', b.dataset.agent === agent);
  }

  // ---------- events ----------
  $('bAI').onclick = () => $('aiDlg').showModal();
  $('aiToggle').onclick = () => (state === 'off' ? connect() : disconnect());
  $('aiPort').value = port;
  $('aiPort').onchange = e => {
    const v = Math.round(+e.target.value);
    port = v >= 1024 && v <= 65535 ? v : DEFAULT_PORT;
    e.target.value = port;
    persist();
    renderCommands();
  };
  $('aiTabs').onclick = e => {
    if (!e.target.dataset.agent) return;
    agent = e.target.dataset.agent;
    renderCommands();
  };
  $('aiDlg').addEventListener('click', async e => {
    const id = e.target.dataset.copy;
    if (!id) return;
    try {
      await navigator.clipboard.writeText($(id).textContent);
      e.target.textContent = 'Copiado';
    } catch { e.target.textContent = 'Selecciona y copia'; }
    setTimeout(() => { e.target.textContent = 'Copiar'; }, 1500);
  });

  setState('off');
  renderLog();
  renderCommands();
  // Reconnect automatically on computers where the link was left on.
  if (saved.auto && getComputedStyle($('bAI')).display !== 'none') connect();
}
