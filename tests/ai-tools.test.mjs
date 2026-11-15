import test from 'node:test';
import assert from 'node:assert/strict';
import { createTools } from '../js/ai.js';

// Minimal stand-in for the app state the tools operate on.
function setup() {
  let n = 0;
  const make = raw => ({ name: raw.name || 'Board', cols: raw.cols ?? 30, rails: raw.rails ?? 'both', color: raw.color || '#f4f1e8', parts: [] });
  const first = make({ name: 'First' });
  const store = { boards: [first] };
  const app = { board: first, selected: null };
  const calls = { commit: 0 };
  const tools = createTools({
    store, app, editor: { cancel() {} }, uid: () => 'p' + ++n, sanitizeBoard: make,
    switchBoard: b => { app.board = b; }, commit: () => { calls.commit++; }, showBoard() {},
  });
  return { tools, store, app, calls };
}

test('add_parts places valid parts and reports the rest', () => {
  const { tools, app, calls } = setup();
  const r = tools.add_parts({ parts: [
    { type: 'wire', pins: ['T+3', 'a3'], props: { color: '#112233' } },
    { type: 'resistor', pins: ['c3', 'c8'], props: { value: '330' } },
    { type: 'ic-NE555', at: 'a15' },
    { type: 'led', pins: ['c3', 'd9'] },      // c3 is taken
    { type: 'wire', pins: ['T+6', 'a6'] },    // rail gap
    { type: 'nope' },
    { type: 'led', pins: ['a1'] },
    { type: 'led', pins: ['d9', 'd10'], props: { color: 'red' } },
  ] });
  assert.equal(r.added.length, 3);
  assert.deepEqual(r.added[2].pins, ['f15', 'f16', 'f17', 'f18', 'e18', 'e17', 'e16', 'e15']);
  assert.deepEqual(r.errors.map(e => e.index), [3, 4, 5, 6, 7]);
  assert.equal(app.board.parts.length, 3);
  assert.equal(calls.commit, 1, 'one undo step per call');
});

test('update_part moves and edits, refusing collisions', () => {
  const { tools } = setup();
  const [a, b] = tools.add_parts({ parts: [{ type: 'led', pins: ['a1', 'a2'] }, { type: 'npn', at: 'h5' }] }).added;
  assert.deepEqual(tools.update_part({ id: a.id, pins: ['b1', 'b2'], props: { color: '#00ff00' } }).pins, ['b1', 'b2']);
  assert.deepEqual(tools.update_part({ id: b.id, at: 'g10' }).pins, ['g10', 'g11', 'g12']);
  assert.throws(() => tools.update_part({ id: a.id, pins: ['g10', 'a9'] }), /already used/);
  assert.throws(() => tools.update_part({ id: 'missing' }), /no part/);
});

test('update_board protects parts unless drop_parts is set', () => {
  const { tools, app } = setup();
  const { added } = tools.add_parts({ parts: [{ type: 'wire', pins: ['a2', 'a25'] }, { type: 'wire', pins: ['b2', 'b4'] }] });
  assert.throws(() => tools.update_board({ cols: 10 }), /would not fit/);
  assert.equal(app.board.cols, 30);
  assert.deepEqual(tools.update_board({ cols: 10, drop_parts: true }).removed, [added[0].id]);
  assert.equal(app.board.parts.length, 1);
  assert.throws(() => tools.update_board({ cols: 999 }));
  assert.throws(() => tools.update_board({ color: 'blue' }));
});

test('boards can be created, listed, selected and cleared', () => {
  const { tools, app } = setup();
  assert.equal(tools.create_board({ name: 'Second', cols: 63 }).index, 1);
  assert.equal(app.board.name, 'Second');
  assert.deepEqual(tools.list_boards().boards.map(b => b.open), [false, true]);
  tools.select_board({ index: 0 });
  assert.equal(tools.get_board().name, 'First');
  assert.throws(() => tools.select_board({ index: 7 }));
  tools.add_parts({ parts: [{ type: 'led', pins: ['a1', 'a2'] }] });
  assert.throws(() => tools.remove_parts({}));
  assert.equal(tools.remove_parts({ all: true }).removed, 1);
});

test('list_components filters and describes placement', () => {
  const { tools } = setup();
  assert.ok(tools.list_components({}).count >= 80);
  const [c] = tools.list_components({ query: 'NE555' }).components;
  assert.equal(c.type, 'ic-NE555');
  assert.match(c.place, /DIP/);
});
