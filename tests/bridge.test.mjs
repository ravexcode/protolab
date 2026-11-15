import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = 41000 + Math.floor(Math.random() * 20000);
const ORIGIN = 'http://localhost:8000';
let bridge;

// Raw HTTP so the test can send headers (Host, Origin) that fetch() would not allow.
function request(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, res => {
      let data = '';
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, json: data ? JSON.parse(data) : null }));
    });
    req.on('error', reject);
    req.end(body ? JSON.stringify(body) : undefined);
  });
}
const rpc = (method, params, id = 1) =>
  request('POST', '/mcp', { headers: { 'Content-Type': 'application/json' }, body: { jsonrpc: '2.0', id, method, params } });

test.before(async () => {
  bridge = spawn(process.execPath, ['bridge/protolab-mcp.mjs', '--port', String(PORT)], { stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise((resolve, reject) => {
    bridge.stderr.on('data', d => String(d).includes('listening') && resolve());
    bridge.on('exit', code => reject(new Error(`bridge exited with ${code}`)));
  });
});
test.after(() => bridge.kill());

test('MCP handshake and tool list', async () => {
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(init.json.result.serverInfo.name, 'protolab');
  assert.equal(init.json.result.protocolVersion, '2025-06-18');
  assert.ok(init.json.result.instructions.includes('HOLE NAMES'));
  const note = await request('POST', '/mcp', { body: { jsonrpc: '2.0', method: 'notifications/initialized' } });
  assert.equal(note.status, 202);
  const list = await rpc('tools/list');
  assert.deepEqual(list.json.result.tools.map(t => t.name).sort(),
    ['add_parts', 'create_board', 'get_board', 'list_boards', 'list_components', 'remove_parts', 'select_board', 'update_board', 'update_part']);
  assert.equal((await rpc('nope')).json.error.code, -32601);
});

test('tool calls fail clearly while no page is connected', async () => {
  const r = await rpc('tools/call', { name: 'get_board', arguments: {} });
  assert.equal(r.json.result.isError, true);
  assert.match(r.json.result.content[0].text, /not connected/);
});

test('web pages cannot reach the MCP endpoint or the page channel', async () => {
  assert.equal((await request('POST', '/mcp', { headers: { Origin: 'https://evil.example' }, body: {} })).status, 403);
  assert.equal((await request('POST', '/mcp', { headers: { Host: 'evil.example' }, body: {} })).status, 403);
  assert.equal((await request('GET', '/events', { headers: { Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await request('GET', '/events')).status, 403);
  const pre = await request('OPTIONS', '/events', { headers: { Origin: ORIGIN } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], ORIGIN);
});

test('a connected page receives tool calls and its answer reaches the agent', async () => {
  const page = http.request({ host: '127.0.0.1', port: PORT, path: '/events', headers: { Origin: ORIGIN } });
  page.end();
  const res = await new Promise(resolve => page.on('response', resolve));
  assert.equal(res.statusCode, 200);
  res.setEncoding('utf8');
  res.on('data', chunk => {
    const line = chunk.split('\n').find(l => l.startsWith('data: {"id"'));
    if (!line) return;
    const call = JSON.parse(line.slice(6));
    request('POST', '/result', { headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
      body: { id: call.id, result: { echo: call.tool, args: call.args } } });
  });
  await new Promise(r => setTimeout(r, 100));
  const r = await rpc('tools/call', { name: 'select_board', arguments: { index: 2 } });
  assert.deepEqual(JSON.parse(r.json.result.content[0].text), { echo: 'select_board', args: { index: 2 } });
  page.destroy();
});
