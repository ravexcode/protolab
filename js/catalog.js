// Component catalog. Every definition describes how a part is placed (kind)
// and how it is drawn (shape) in both the 2D editor and the 3D view.
//
// kinds:
//   wire / axial / radial  -> two free pins, placed hole to hole
//   inline                 -> n pins in a single row
//   dual                   -> two rows of n pins straddling the centre channel

export const SWATCHES = ['#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa',
  '#ec407a', '#6d4c41', '#222222', '#9e9e9e', '#f5f5f5'];

const COLOR = { key: 'color', label: 'Color', type: 'color' };
const LABEL = { key: 'label', label: 'Etiqueta', type: 'text' };
const value = (label, ph) => ({ key: 'value', label, type: 'text', ph });
const VOLTS = value('Voltaje (V)', '9, 3.7, 5');

const two = (type, name, kind, shape, props = {}, fields = [], o = {}) => ({ type, name, kind, shape, props, fields, ...o });
const inl = (type, name, shape, n, o = {}) =>
  ({ type, name, kind: 'inline', shape, n, props: { label: name }, fields: [LABEL], ...o });
const dual = (type, name, shape, n, span, o = {}) =>
  ({ type, name, kind: 'dual', shape, n, span, props: { label: name }, fields: [LABEL], ...o });

// [name, description, pins per side, row span]
const ICS = [
  ['NE555', 'Temporizador', 4], ['LM358', 'Op-amp doble', 4], ['LM741', 'Op-amp', 4],
  ['LM386', 'Amplificador de audio', 4], ['ATtiny85', 'Microcontrolador', 4], ['24LC256', 'EEPROM I2C', 4],
  ['PC817', 'Optoacoplador', 2], ['74HC00', '4× NAND', 7], ['74HC04', '6× NOT', 7], ['74HC08', '4× AND', 7],
  ['74HC32', '4× OR', 7], ['74LS21', '2× AND de 4 entradas (TTL)', 7], ['74HC86', '4× XOR', 7], ['74HC14', '6× Schmitt', 7], ['74HC74', '2× Flip-flop D', 7],
  ['LM324', 'Op-amp cuádruple', 7], ['CD4011', '4× NAND CMOS', 7], ['74HC595', 'Registro de desplazamiento', 8],
  ['74HC165', 'Registro paralelo-serie', 8], ['74HC138', 'Decodificador 3:8', 8], ['CD4017', 'Contador de década', 8],
  ['CD4051', 'Multiplexor 8:1', 8], ['L293D', 'Puente H', 8], ['ULN2003', 'Driver Darlington', 8],
  ['MAX232', 'Conversor RS-232', 8], ['ULN2803', 'Driver 8 canales', 9], ['PIC16F84A', 'Microcontrolador', 9],
  ['74HC245', 'Transceptor de bus', 10], ['74HC573', 'Latch octal', 10], ['ATmega328P', 'Microcontrolador', 14],
  ['MCP23017', 'Expansor de E/S', 14], ['ATmega32', 'Microcontrolador', 20, 6], ['PIC16F877A', 'Microcontrolador', 20, 6],
];

export const CATALOG = [
  { cat: 'Conexiones', items: [
    two('wire', 'Cable', 'wire', 'wire', { color: '#e53935' }, [COLOR]),
    inl('header3', 'Tira de pines 1×3', 'header', 3, { fields: [] }),
    inl('header4', 'Tira de pines 1×4', 'header', 4, { fields: [] }),
    inl('header6', 'Tira de pines 1×6', 'header', 6, { fields: [] }),
    inl('header8', 'Tira de pines 1×8', 'header', 8, { fields: [] }),
  ] },
  // Sources: pins[0] is +, pins[1] is −. They power the circuit in Probar.
  { cat: 'Alimentación', items: [
    two('battery9v', 'Batería con broche', 'radial', 'snap', { value: '9 V' }, [VOLTS], { desc: 'Conector tipo HW, cables al + y al −', polar: true }),
    two('cell', 'Batería directa', 'axial', 'cell', { value: '3.7 V' }, [VOLTS], { desc: 'Sus terminales van a la protoboard', polar: true }),
    two('coin', 'Pila de botón CR2032', 'radial', 'coin', { value: '3 V' }, [VOLTS], { polar: true }),
    two('jack', 'Jack DC', 'radial', 'jack', { value: '9 V' }, [VOLTS], { desc: 'Entrada de un adaptador', polar: true }),
  ] },
  { cat: 'Pasivos', items: [
    two('resistor', 'Resistencia', 'axial', 'resistor', { value: '220' }, [value('Valor (Ω)', '220, 4.7k, 1M')]),
    two('ceramic', 'Condensador cerámico', 'radial', 'ceramic', { value: '100nF' }, [value('Valor', '100nF')]),
    two('electrolytic', 'Condensador electrolítico', 'radial', 'electrolytic', { value: '100µF' }, [value('Valor', '100µF')], { polar: true }),
    two('inductor', 'Inductor', 'axial', 'inductor', { value: '10mH' }, [value('Valor', '10mH')]),
    inl('pot', 'Potenciómetro', 'pot', 3, { props: { label: '10k' } }),
    two('fuse', 'Fusible', 'axial', 'fuse'),
    two('crystal', 'Cristal de cuarzo', 'radial', 'crystal', { value: '16MHz' }, [value('Frecuencia', '16MHz')]),
    two('ldr', 'Fotorresistencia (LDR)', 'radial', 'ldr'),
    two('thermistor', 'Termistor NTC', 'radial', 'thermistor'),
  ] },
  { cat: 'Semiconductores', items: [
    two('led', 'LED', 'radial', 'led', { color: '#e53935' }, [COLOR], { polar: true }),
    inl('rgb', 'LED RGB', 'rgb', 4, { fields: [] }),
    two('irled', 'LED infrarrojo', 'radial', 'led', { color: '#7986cb' }, [], { polar: true }),
    two('diode', 'Diodo 1N4007', 'axial', 'diode', {}, [], { polar: true }),
    two('zener', 'Diodo Zener', 'axial', 'zener', {}, [], { desc: '5.1 V', polar: true }),
    inl('npn', 'Transistor NPN', 'to92', 3, { props: { label: '2N2222' } }),
    inl('pnp', 'Transistor PNP', 'to92', 3, { props: { label: '2N3906' } }),
    inl('mosfet92', 'MOSFET 2N7000', 'to92', 3, { props: { label: '2N7000' } }),
    inl('reg7805', 'Regulador 7805', 'to220', 3, { props: { label: '7805' } }),
    inl('lm317', 'Regulador LM317', 'to220', 3, { props: { label: 'LM317' } }),
    inl('irf520', 'MOSFET IRF520', 'to220', 3, { props: { label: 'IRF520' } }),
    inl('tip120', 'Darlington TIP120', 'to220', 3, { props: { label: 'TIP120' } }),
  ] },
  { cat: 'Circuitos integrados', items: [
    ...ICS.map(([name, desc, n, span = 3]) => dual('ic-' + name, name, 'ic', n, span, { desc })),
    ...[[4, 3], [7, 3], [8, 3], [10, 3], [14, 3], [20, 6]].map(([n, span]) =>
      dual('dip' + n * 2, `DIP-${n * 2} genérico`, 'ic', n, span, { props: { label: 'DIP-' + n * 2 } })),
  ] },
  { cat: 'Interruptores', items: [
    dual('button', 'Pulsador', 'tact', 2, 3, { step: 2, props: { color: '#e53935' }, fields: [COLOR] }),
    inl('slide', 'Interruptor deslizante', 'slide', 3, { fields: [] }),
    dual('dipsw4', 'DIP switch ×4', 'dipsw', 4, 3, { fields: [] }),
    dual('dipsw8', 'DIP switch ×8', 'dipsw', 8, 3, { fields: [] }),
  ] },
  { cat: 'Salidas', items: [
    two('buzzer', 'Zumbador', 'radial', 'buzzer'),
    two('speaker', 'Altavoz', 'radial', 'speaker'),
    two('motor', 'Motor DC', 'radial', 'motor'),
    dual('seg7', 'Display 7 segmentos', 'seg7', 5, 6, { fields: [] }),
    inl('oled', 'Pantalla OLED I2C', 'module', 4, { w: 10.6, h: 10.6, color: '#1565c0', extra: 'oled', props: { label: 'OLED' } }),
    inl('lcd', 'LCD 16×2', 'module', 16, { w: 31.5, h: 14.2, color: '#2e7d32', extra: 'lcd', props: { label: 'LCD 16x2' } }),
    inl('relay', 'Módulo relé', 'module', 3, { w: 6.7, h: 13, color: '#1565c0', extra: 'relay', props: { label: 'RELAY' } }),
  ] },
  { cat: 'Sensores', items: [
    inl('lm35', 'Sensor LM35', 'to92', 3, { props: { label: 'LM35' } }),
    inl('ds18b20', 'Sensor DS18B20', 'to92', 3, { props: { label: 'DS18B20' } }),
    inl('dht11', 'Sensor DHT11', 'module', 4, { w: 6.1, h: 4.7, color: '#29b6f6', extra: 'dht', props: { label: 'DHT11' } }),
    inl('hcsr04', 'Ultrasonidos HC-SR04', 'module', 4, { w: 17.7, h: 7.9, color: '#1565c0', extra: 'hcsr04', props: { label: 'HC-SR04' } }),
    inl('pir', 'Sensor PIR', 'module', 3, { w: 12.6, h: 9.5, color: '#2e7d32', extra: 'pir', props: { label: 'PIR' } }),
    inl('tsop', 'Receptor infrarrojo', 'ir', 3, { fields: [] }),
    two('mic', 'Micrófono electret', 'radial', 'mic'),
  ] },
  { cat: 'Placas y módulos', items: [
    dual('nano', 'Arduino Nano', 'board', 15, 6, { color: '#00838f', usb: true }),
    dual('esp32', 'ESP32 DevKit', 'board', 15, 9, { color: '#212121', usb: true, shield: true, props: { label: 'ESP32' } }),
    dual('nodemcu', 'NodeMCU ESP8266', 'board', 15, 9, { color: '#1a237e', usb: true, shield: true, props: { label: 'ESP8266' } }),
    dual('pico', 'Raspberry Pi Pico', 'board', 20, 7, { color: '#2e7d32', usb: true, props: { label: 'Pi Pico' } }),
    inl('hc05', 'Bluetooth HC-05', 'module', 6, { w: 6.4, h: 14, color: '#1565c0', extra: 'shield', props: { label: 'HC-05' } }),
  ] },
];

const DEFS = new Map();
for (const group of CATALOG) for (const def of group.items) DEFS.set(def.type, def);
export const getDef = type => DEFS.get(type);

// "4.7k", "4k7", "220", "1M" -> ohms
export function parseOhms(text) {
  const m = String(text ?? '').trim().toLowerCase().replace(',', '.').replace(/[ωΩ\s]/g, '')
    .match(/^(\d*\.?\d+)([kmr]?)(\d*)$/);
  if (!m) return null;
  let v = parseFloat(m[2] && m[3] ? `${m[1]}.${m[3]}` : m[1]);
  if (m[2] === 'k') v *= 1e3;
  if (m[2] === 'm') v *= 1e6;
  return v > 0 ? v : null;
}

const BAND = ['#111111', '#7b4a2b', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa', '#9e9e9e', '#fafafa'];
const GOLD = '#c9a227', SILVER = '#c0c0c0';

// Four-band colour code for a resistance in ohms.
export function resistorBands(text) {
  const ohms = parseOhms(text);
  if (!ohms) return [BAND[1], BAND[0], BAND[1], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exp);
  if (digits >= 100) { digits = Math.round(digits / 10); exp++; }
  const mult = exp >= 0 ? BAND[Math.min(exp, 9)] : exp === -1 ? GOLD : SILVER;
  return [BAND[Math.floor(digits / 10)], BAND[digits % 10], mult, GOLD];
}
