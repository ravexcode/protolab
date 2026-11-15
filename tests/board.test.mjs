import test from 'node:test';
import assert from 'node:assert/strict';
import { holes, holeExists, holeId, parseHole, footprint, pinsValid, PRESETS } from '../js/board.js';
import { CATALOG, getDef, parseOhms, resistorBands } from '../js/catalog.js';
import { partSVG, iconSVG } from '../js/draw2d.js';

const board = (cols, rails) => ({ cols, rails, color: '#f4f1e8', parts: [] });

test('preset sizes have the standard number of tie points', () => {
  assert.equal(holes(board(17, 'none')).length, 170);
  assert.equal(holes(board(30, 'both')).length, 400);
  assert.equal(holes(board(63, 'both')).length, 830);
  for (const p of Object.values(PRESETS)) assert.ok(holes(board(p.cols, p.rails)).length > 0);
});

test('hole names round-trip', () => {
  for (const hole of holes(board(30, 'both'))) assert.deepEqual(parseHole(holeId(hole)), hole);
  assert.deepEqual(parseHole('A1'), [0, 3]);
  assert.deepEqual(parseHole('T+3'), [2, 0]);
  assert.deepEqual(parseHole('b-7'), [6, 17]);
  assert.throws(() => parseHole('z9'));
  assert.throws(() => parseHole(''));
});

test('rails exist only where the board has them', () => {
  assert.equal(holeExists(board(30, 'both'), 0, 16), true);
  assert.equal(holeExists(board(30, 'top'), 0, 16), false);
  assert.equal(holeExists(board(30, 'none'), 0, 0), false);
  assert.equal(holeExists(board(30, 'both'), 5, 0), false, 'rails skip every sixth column');
  assert.equal(holeExists(board(30, 'both'), 30, 3), false);
});

test('DIP footprints straddle the centre channel in pin order', () => {
  const pins = footprint(getDef('ic-NE555'), 5, 0);
  assert.deepEqual(pins.map(holeId), ['f5', 'f6', 'f7', 'f8', 'e8', 'e7', 'e6', 'e5']);
  assert.equal(pinsValid(board(30, 'both'), pins), true);
  assert.equal(pinsValid(board(30, 'both'), pins, new Set(['4,10'])), false, 'occupied hole');
  assert.equal(pinsValid(board(6, 'both'), pins), false, 'off the board');
});

test('every catalog entry is unique, fits a full board and draws cleanly', () => {
  const seen = new Set(), full = board(150, 'both');
  for (const group of CATALOG) for (const def of group.items) {
    assert.ok(!seen.has(def.type), `duplicate type ${def.type}`);
    seen.add(def.type);
    const pins = def.kind === 'inline' || def.kind === 'dual' ? footprint(def, 60, 12) : [[3, 3], [7, 3]];
    assert.equal(pinsValid(full, pins), true, `${def.type} does not fit`);
    for (const svg of [partSVG(def, pins, {}), iconSVG(def)]) {
      assert.ok(svg.length > 20, def.type);
      assert.doesNotMatch(svg, /NaN|undefined/, def.type);
    }
  }
  assert.ok(seen.size >= 80);
});

test('resistor values and colour bands', () => {
  assert.equal(parseOhms('220'), 220);
  assert.equal(parseOhms('4.7k'), 4700);
  assert.equal(parseOhms('4k7'), 4700);
  assert.equal(parseOhms('1M'), 1e6);
  assert.equal(parseOhms('abc'), null);
  assert.deepEqual(resistorBands('220').slice(0, 3), ['#e53935', '#e53935', '#7b4a2b']);   // red red brown
  assert.deepEqual(resistorBands('10k').slice(0, 3), ['#7b4a2b', '#111111', '#fb8c00']);  // brown black orange
});

test('SVG output escapes user text', () => {
  const svg = partSVG(getDef('ic-NE555'), footprint(getDef('ic-NE555'), 5, 0), { label: '<script>"x"' });
  assert.doesNotMatch(svg, /<script>/);
});
