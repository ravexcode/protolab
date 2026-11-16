import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, parseVolts, ledVf, nextE12 } from '../js/sim.js';
import { parseHole } from '../js/board.js';

let n = 0;
const part = (type, holes, props = {}) => ({ id: type + ++n, type, pins: holes.map(parseHole), props });
const board = (...parts) => ({ cols: 30, rails: 'both', color: '#f4f1e8', parts });
const kinds = r => r.faults.map(f => f.kind).sort();

test('voltages, LED colours and standard resistor values', () => {
  assert.equal(parseVolts('9 V'), 9);
  assert.equal(parseVolts('3,7'), 3.7);
  assert.equal(parseVolts('abc'), null);
  assert.equal(parseVolts('0'), null);
  assert.equal(ledVf('led', '#e53935'), 1.9);
  assert.equal(ledVf('led', '#1e88e5'), 3);
  assert.equal(ledVf('irled', '#7986cb'), 1.2);
  assert.equal(nextE12(467), '470 Ω');
  assert.equal(nextE12(1100), '1.2 kΩ');
});

test('no battery means nothing to test', () => {
  const r = simulate(board(part('led', ['a1', 'a2'])));
  assert.equal(r.sources, 0);
  assert.deepEqual(r.faults, []);
});

test('battery, resistor and LED in series light the LED without faults', () => {
  const led = part('led', ['c7', 'c8']);
  const r = simulate(board(
    part('battery9v', ['T+1', 'T-1']),
    part('wire', ['T+3', 'a3']), part('resistor', ['b3', 'b7'], { value: '470' }),
    led, part('wire', ['a8', 'T-8']),
  ));
  assert.equal(r.short, false);
  assert.deepEqual(r.faults, []);
  assert.ok(r.lit[led.id] > 0.5, 'LED is lit');
  assert.equal(r.leds, 1);
});

test('a wire between + and − is a short, reported with the wire', () => {
  const bat = part('battery9v', ['T+1', 'T-1']), w1 = part('wire', ['T+3', 'a3']), w2 = part('wire', ['b3', 'T-4']);
  const r = simulate(board(bat, w1, w2));
  assert.equal(r.short, true);
  assert.equal(r.shortAt, bat.id);
  assert.deepEqual(r.faults[0].parts.sort(), [bat.id, w1.id, w2.id].sort());
});

test('even a low-voltage cell shorted through a tiny resistance counts', () => {
  const r = simulate(board(part('cell', ['a1', 'a4'], { value: '1.5 V' }), part('resistor', ['b1', 'b4'], { value: '0.01' })));
  assert.equal(r.short, true);
});

test('an LED straight on the battery is overdriven', () => {
  const r = simulate(board(part('battery9v', ['T+1', 'T-1']), part('wire', ['T+3', 'a3']), part('led', ['b3', 'b4']), part('wire', ['a4', 'T-4'])));
  assert.equal(r.short, false);
  assert.deepEqual(kinds(r), ['led']);
  assert.match(r.faults[0].text, /resistencia de \d+ Ω/);
});

test('a reversed LED stays dark and is reported', () => {
  const led = part('led', ['c8', 'c7']);
  const r = simulate(board(part('battery9v', ['T+1', 'T-1']), part('wire', ['T+3', 'a3']),
    part('resistor', ['b3', 'b7'], { value: '470' }), led, part('wire', ['a8', 'T-8'])));
  assert.equal(r.lit[led.id], undefined);
  assert.deepEqual(kinds(r), ['reverse']);
});

test('reversed electrolytic, hot resistor, bad voltage and swapped rails', () => {
  const r = simulate(board(
    part('battery9v', ['T-1', 'T+1']),               // + on the blue rail
    part('wire', ['T-3', 'a3']), part('electrolytic', ['b4', 'b3']), part('wire', ['a4', 'T+4']),
    part('resistor', ['c3', 'c4'], { value: '100' }),
    part('cell', ['h1', 'h4'], { value: 'mucho' }),
  ));
  assert.deepEqual(kinds(r), ['hot', 'rails', 'reverse', 'value']);
});

test('two LEDs in series need enough voltage', () => {
  const a = part('led', ['c4', 'c5'], { color: '#1e88e5' }), b = part('led', ['d5', 'd6'], { color: '#1e88e5' });
  const parts = v => board(part('cell', ['a1', 'a10'], { value: v }), part('resistor', ['b1', 'b4'], { value: '100' }), a, b, part('wire', ['e6', 'e10']));
  assert.equal(Object.keys(simulate(parts('3.7 V')).lit).length, 0);
  assert.equal(Object.keys(simulate(parts('9 V')).lit).length, 2);
});

test('a pushbutton closes the circuit only while pressed', () => {
  const btn = part('button', ['f10', 'f12', 'e12', 'e10']), led = part('led', ['d16', 'd17']);
  const b = board(part('battery9v', ['T+1', 'T-1']), part('wire', ['T+3', 'a10']), btn,
    part('resistor', ['c12', 'c16'], { value: '470' }), led, part('wire', ['a17', 'T-17']));
  assert.equal(simulate(b).lit[led.id], undefined, 'released: LED off');
  const r = simulate(b, new Set([btn.id]));
  assert.ok(r.lit[led.id] > 0.5, 'pressed: LED on');
  assert.deepEqual(r.faults, []);
});

test('pressing a button straight across the battery is a short', () => {
  const bat = part('battery9v', ['T+1', 'T-1']), btn = part('button', ['f10', 'f12', 'e12', 'e10']);
  const b = board(bat, part('wire', ['T+3', 'a10']), btn, part('wire', ['a12', 'T-13']));
  assert.equal(simulate(b).short, false);
  const r = simulate(b, new Set([btn.id]));
  assert.equal(r.short, true);
  assert.ok(r.faults[0].parts.includes(btn.id));
  assert.match(r.faults[0].text, /2 cables y un pulsador/);
  assert.match(r.faults[0].text, /Suelta el pulsador/);
});
