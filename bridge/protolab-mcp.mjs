#!/usr/bin/env node
// ProtoLab bridge: lets AI agents on this PC (Claude Code, Codex, OpenCode or any
// MCP client) read and edit the breadboards open in the ProtoLab web page.
//
//   agent  --MCP (HTTP or stdio)-->  this bridge  --SSE on 127.0.0.1-->  ProtoLab tab
//
// Run:   node protolab-mcp.mjs [--port 7337] [--origin https://your.site] [--stdio]
// No dependencies. Requires Node.js 18 or newer.

import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';

const VERSION = '1.0.0';
const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const all = name => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []));

const PORT = Number(flag('--port') || process.env.PROTOLAB_PORT || 7337);
const STDIO = args.includes('--stdio');
const SITE = 'https://ravexcode.github.io';
const EXTRA_ORIGINS = new Set(all('--origin').map(o => o.replace(/\/+$/, '')));
const log = (...m) => console.error('[protolab]', ...m);   // stdout is reserved for MCP in stdio mode

// Only the ProtoLab site and pages served from this machine may talk to the bridge.
const originAllowed = o => o === SITE || EXTRA_ORIGINS.has(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);

const GUIDE = `ProtoLab is a breadboard (protoboard) editor running in the user's browser. These tools read and edit the boards the user is looking at, live. The user can undo any change.

LAYOUT. Columns are numbered 1..N. Terminal rows a-e form the upper half and f-j the lower half. The five holes of one column within one half are connected together (a5 b5 c5 d5 e5 are one node; f5..j5 are another). The centre channel between rows e and f separates the halves. Power rails: T+ and T- along the top, B+ and B- along the bottom; each rail row is connected along its whole length. Rails skip some columns: if a rail hole does not exist, use the next column.

HOLE NAMES. "a1".."j30" for terminal holes, "T+3", "T-3", "B+3", "B-3" for rail holes.

PLACING PARTS. Each hole takes one pin. To connect two pins, put them in different holes of the same connected strip.
- Two-pin parts (wire, resistor, led, capacitors, diodes...) take "pins": [hole, hole]. LED: pin 1 is the anode. Diodes and electrolytic capacitors: pin 2 is the cathode / negative.
- Row parts (transistors, potentiometers, sensors, modules) take "at": the hole of pin 1; the remaining pins follow to the right in the same row.
- DIP parts (ICs, push buttons, displays, dev boards) take "at": any hole in the column of pin 1; they always straddle the centre channel. Pins 1..n run left to right along the lower row, pins n+1..2n right to left along the upper row.
Every response lists the hole of each pin, in pin order: use it to wire correctly.

Call list_components before adding parts to get the valid "type" values, and get_board to see what is already placed.`;

const partSpec = {
  type: 'object',
  properties: {
    type: { type: 'string', description: 'Component type from list_components, e.g. "wire", "resistor", "led", "ic-NE555".' },
    pins: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2, description: 'Two-pin parts only: the two holes, e.g. ["a5","a9"].' },
    at: { type: 'string', description: 'Row and DIP parts only: hole of pin 1 (leftmost pin), e.g. "f10".' },
    props: {
      type: 'object',
      description: 'Optional properties, depending on the type: color ("#rrggbb"), value (e.g. "220", "4.7k", "100nF"), label.',
      properties: { color: { type: 'string' }, value: { type: 'string' }, label: { type: 'string' } },
    },
  },
  required: ['type'],
};

const tool = (name, description, properties = {}, required = []) =>
  ({ name, description, inputSchema: { type: 'object', properties, required } });

const TOOLS = [
  tool('list_components', 'List the component types that can be placed, with how each one is placed and which props it accepts. Call this before add_parts.',
    { query: { type: 'string', description: 'Optional text filter, e.g. "sensor", "555", "transistor".' } }),
  tool('list_boards', 'List the breadboards saved in the browser and which one is currently open.'),
  tool('get_board', 'Get the breadboard currently open: size, rails and every part with its id, type, pin holes and props.'),
  tool('create_board', 'Create a new empty breadboard and open it.', {
    name: { type: 'string' },
    cols: { type: 'integer', minimum: 5, maximum: 150, description: 'Number of columns. Common sizes: 17 (mini), 30 (half), 63 (full). Default 30.' },
    rails: { type: 'string', enum: ['both', 'top', 'none'], description: 'Power rails. Default "both".' },
    color: { type: 'string', description: 'Board colour as "#rrggbb".' },
  }),
  tool('select_board', 'Open another saved breadboard by its index from list_boards.',
    { index: { type: 'integer', minimum: 0 } }, ['index']),
  tool('update_board', 'Rename, resize or recolour the open breadboard. Shrinking fails if parts would no longer fit, unless drop_parts is true.', {
    name: { type: 'string' },
    cols: { type: 'integer', minimum: 5, maximum: 150 },
    rails: { type: 'string', enum: ['both', 'top', 'none'] },
    color: { type: 'string', description: '"#rrggbb"' },
    drop_parts: { type: 'boolean', description: 'Remove the parts that do not fit after resizing.' },
  }),
  tool('add_parts', 'Place one or more components on the open breadboard. Returns the id and pin holes of each part placed, and an error for each one that could not be placed.',
    { parts: { type: 'array', items: partSpec, minItems: 1, maxItems: 200 } }, ['parts']),
  tool('update_part', 'Move a part or change its props. Give "pins" (two-pin parts) or "at" (row and DIP parts) to move it.', {
    id: { type: 'string' },
    pins: partSpec.properties.pins,
    at: partSpec.properties.at,
    props: partSpec.properties.props,
  }, ['id']),
  tool('remove_parts', 'Remove parts from the open breadboard by id, or all of them.', {
    ids: { type: 'array', items: { type: 'string' } },
    all: { type: 'boolean', description: 'Remove every part on the board.' },
  }),
];

// ---------- link to the ProtoLab page ----------
let page = null;                 // SSE response of the connected ProtoLab tab
const pending = new Map();       // call id -> { resolve, reject, timer }

function callPage(name, params) {
  if (!page) {
    return Promise.reject(new Error(`ProtoLab is not connected. Ask the user to open ${SITE}/protolab/ on this PC, click "IA" and press "Conectar".`));
  }
  const id = randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('ProtoLab did not answer in time.')); }, 15000);
    pending.set(id, { resolve, reject, timer });
    page.write(`data: ${JSON.stringify({ id, tool: name, args: params || {} })}\n\n`);
  });
}

function settle(id, message) {
  const call = pending.get(id);
  if (!call) return;
  clearTimeout(call.timer);
  pending.delete(id);
  if (message.error) call.reject(new Error(String(message.error)));
  else call.resolve(message.result);
}

// ---------- MCP (JSON-RPC) ----------
async function handleRpc(msg) {
  const { id, method, params } = msg;
  const reply = result => ({ jsonrpc: '2.0', id, result });
  if (id === undefined || id === null) return null;   // notification
  switch (method) {
    case 'initialize':
      return reply({
        protocolVersion: params?.protocolVersion || '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'protolab', version: VERSION },
        instructions: GUIDE,
      });
    case 'ping': return reply({});
    case 'tools/list': return reply({ tools: TOOLS });
    case 'tools/call': {
      if (!TOOLS.some(t => t.name === params?.name)) {
        return { jsonrpc: '2.0', id, error: { code: -32602, message: `Unknown tool: ${params?.name}` } };
      }
      try {
        const result = await callPage(params.name, params.arguments);
        return reply({ content: [{ type: 'text', text: JSON.stringify(result) }] });
      } catch (err) {
        return reply({ content: [{ type: 'text', text: err.message }], isError: true });
      }
    }
    default:
      return { jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } };
  }
}

// ---------- HTTP server ----------
function readBody(req, limit = 2e6) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > limit) { reject(new Error('Body too large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers });
  res.end(body === undefined ? '' : JSON.stringify(body));
};

async function onRequest(req, res) {
  const origin = req.headers.origin;
  const path = new URL(req.url, 'http://x').pathname;
  // Refuse anything not addressed to this machine by name (blocks DNS rebinding).
  if (!/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(req.headers.host || '')) return json(res, 403, { error: 'Bad host' });

  if (path === '/mcp') {
    // Agents are local programs and send no Origin; a web page must never reach this endpoint.
    if (origin) return json(res, 403, { error: 'Browsers may not call /mcp' });
    if (req.method !== 'POST') return json(res, 405, { error: 'Use POST' }, { Allow: 'POST' });
    let msg;
    try { msg = JSON.parse(await readBody(req)); }
    catch { return json(res, 400, { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
    const out = Array.isArray(msg) ? (await Promise.all(msg.map(handleRpc))).filter(Boolean) : await handleRpc(msg);
    if (!out || (Array.isArray(out) && !out.length)) return json(res, 202);
    return json(res, 200, out);
  }

  // Everything else is for the ProtoLab page.
  if (!origin || !originAllowed(origin)) return json(res, 403, { error: 'Origin not allowed' });
  const cors = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Private-Network': 'true',
    Vary: 'Origin',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }

  if (path === '/events' && req.method === 'GET') {
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: hello\ndata: ${JSON.stringify({ version: VERSION })}\n\n`);
    if (page && page !== res) page.end();   // the newest tab wins
    page = res;
    log('ProtoLab page connected');
    const beat = setInterval(() => res.write(': ping\n\n'), 20000);
    req.on('close', () => {
      clearInterval(beat);
      if (page === res) { page = null; log('ProtoLab page disconnected'); }
    });
    return;
  }
  if (path === '/result' && req.method === 'POST') {
    try {
      const msg = JSON.parse(await readBody(req));
      settle(msg.id, msg);
      return json(res, 200, { ok: true }, cors);
    } catch { return json(res, 400, { error: 'Bad request' }, cors); }
  }
  return json(res, 404, { error: 'Not found' }, cors);
}

const server = http.createServer((req, res) => {
  onRequest(req, res).catch(err => { log(err.message); if (!res.headersSent) json(res, 500, { error: 'Internal error' }); });
});

// Resolves true when this process owns the port, false when another bridge already does.
function listen() {
  return new Promise((resolve, reject) => {
    server.once('error', err => (err.code === 'EADDRINUSE' ? resolve(false) : reject(err)));
    server.listen(PORT, '127.0.0.1', () => resolve(true));
  });
}

// ---------- start ----------
let owner = await listen();

if (!STDIO) {
  if (!owner) {
    log(`Port ${PORT} is already in use. A bridge is probably running already; use --port to pick another.`);
    process.exit(1);
  }
  log(`Bridge ${VERSION} listening on http://127.0.0.1:${PORT}`);
  log(`MCP endpoint: http://127.0.0.1:${PORT}/mcp`);
  log(`Now open ${SITE}/protolab/, click "IA" and press "Conectar". Ctrl+C to stop.`);
} else {
  // stdio transport: serve MCP on stdin/stdout. If another bridge owns the port, relay to it.
  log(owner ? `stdio bridge listening on 127.0.0.1:${PORT}` : `relaying to the bridge on 127.0.0.1:${PORT}`);
  const relay = async msg => {
    const r = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg),
    });
    return r.status === 202 ? null : r.json();
  };
  const dispatch = async msg => {
    if (owner) return handleRpc(msg);
    try { return await relay(msg); }
    catch {
      owner = await listen();        // the other bridge went away: take over
      return owner ? handleRpc(msg) : relay(msg);
    }
  };
  // Finish the calls still in flight before exiting when the client closes stdin.
  let inflight = 0, closed = false;
  const rl = createInterface({ input: process.stdin });
  rl.on('line', async line => {
    if (!line.trim()) return;
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    inflight++;
    try {
      const out = await dispatch(msg);
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    } catch (err) {
      if (msg.id != null) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: err.message } }) + '\n');
    }
    if (--inflight === 0 && closed) process.exit(0);
  });
  rl.on('close', () => { closed = true; if (!inflight) process.exit(0); });
}
