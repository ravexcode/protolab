// Three.js view of the board. World units are pitch units: X = column, Z = row, Y = up.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { bounds, holes, railLines, labels, inkFor } from './board.js';
import { getDef, resistorBands } from './catalog.js';
import { safeColor } from './draw2d.js';

const BOARD_H = 3.4;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

const cache = new Map();
function mat(color, opts = {}) {
  const k = color + JSON.stringify(opts);
  if (!cache.has(k)) cache.set(k, new THREE.MeshStandardMaterial({ color, roughness: 0.6, ...opts }));
  return cache.get(k);
}
const METAL = mat('#c9ccd2', { metalness: 0.9, roughness: 0.3 });
const GOLD = mat('#d4af37', { metalness: 0.9, roughness: 0.3 });
const DARK = mat('#1c1c1e', { roughness: 0.5 });

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#1c4c40');
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 2000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.maxPolarAngle = Math.PI / 2 - 0.03;
    this.controls.addEventListener('change', () => this.render());

    this.sun = new THREE.DirectionalLight('#ffffff', 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.scene.add(this.sun, this.sun.target, new THREE.HemisphereLight('#ffffff', '#30343c', 0.5));

    // The desk is the same green cutting mat as the 2D workspace: a line every 4 units, heavier every 20.
    const cv = document.createElement('canvas');
    cv.width = cv.height = 320;
    const c = cv.getContext('2d');
    c.fillStyle = '#245e4f'; c.fillRect(0, 0, 320, 320);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = i ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.2)';
      c.fillRect(i * 64, 0, 2, 320); c.fillRect(0, i * 64, 320, 2);
    }
    const grid = new THREE.CanvasTexture(cv);
    grid.colorSpace = THREE.SRGBColorSpace;
    grid.wrapS = grid.wrapT = THREE.RepeatWrapping;
    grid.repeat.set(200, 200);
    grid.anisotropy = 8;
    this.desk = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ map: grid, roughness: 0.95 }));
    this.desk.rotation.x = -Math.PI / 2;
    this.desk.position.y = -BOARD_H;
    this.desk.receiveShadow = true;
    this.scene.add(this.desk);

    this.root = null;
    this.disposables = [];
    this.frameKey = '';
    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.render();
  }

  render() { this.renderer.render(this.scene, this.camera); }

  setBoard(board) {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse(o => o.geometry?.dispose());
      this.disposables.forEach(d => d.dispose());
      this.disposables = [];
    }
    this.root = new THREE.Group();
    this.addBoard(board);
    for (const part of board.parts) {
      const def = getDef(part.type);
      if (!def) continue;
      const g = new THREE.Group();
      this[def.kind](g, def, part.pins, { ...def.props, ...part.props }, part);
      this.root.add(g);
    }
    this.root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.scene.add(this.root);

    const b = bounds(board), cx = (b.x0 + b.x1) / 2, cz = (b.y0 + b.y1) / 2, size = Math.max(b.x1 - b.x0, 30);
    this.sun.position.set(cx - size * 0.3, size * 0.9, cz + size * 0.35);
    this.sun.target.position.set(cx, 0, cz);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -size * 0.75; cam.right = cam.top = size * 0.75; cam.far = size * 3;
    cam.updateProjectionMatrix();

    // Reframe only when the board itself changed size.
    const frameKey = board.id + ':' + board.cols + ':' + board.rails;
    if (frameKey !== this.frameKey) {
      this.frameKey = frameKey;
      this.controls.target.set(cx, 0, cz);
      // Distance at which the whole board fits both horizontally and vertically.
      const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
      const dist = Math.max((b.x1 - b.x0) / 2 / (tanV * this.camera.aspect), (b.y1 - b.y0) / 2 / tanV) * 1.25 + 6;
      this.camera.position.set(cx, dist * 0.7, cz + dist * 0.72);
      this.controls.update();
    }
    this.render();
  }

  // ---------- helpers ----------
  mesh(g, geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    g.add(m);
    return m;
  }
  box(g, w, h, d, material, x, y, z) { return this.mesh(g, new THREE.BoxGeometry(w, h, d), material, x, y, z); }
  cyl(g, r, h, material, x, y, z, rTop = r) { return this.mesh(g, new THREE.CylinderGeometry(rTop, r, h, 28), material, x, y, z); }
  seg(g, a, b, r = 0.07, material = METAL) {
    const d = b.clone().sub(a), len = d.length();
    if (len < 1e-4) return;
    const m = this.mesh(g, new THREE.CylinderGeometry(r, r, len, 10), material);
    m.position.copy(a).addScaledVector(d, 0.5);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  }
  leg(g, x, z, top, material = METAL) { this.seg(g, V(x, -0.3, z), V(x, top, z), 0.07, material); }

  texture(wUnits, hUnits, draw, ppu = 48) {
    const cv = document.createElement('canvas');
    cv.width = Math.max(16, Math.round(wUnits * ppu));
    cv.height = Math.max(16, Math.round(hUnits * ppu));
    draw(cv.getContext('2d'), cv.width, cv.height);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    this.disposables.push(t);
    return t;
  }

  // Box with a canvas texture on one face (2 = top, 4 = front).
  faceBox(g, w, h, d, side, face, draw, x, y, z) {
    const [tw, th] = face === 2 ? [w, d] : [w, h];
    const m = new THREE.MeshStandardMaterial({ map: this.texture(tw, th, draw), roughness: 0.6 });
    this.disposables.push(m);
    const mats = Array(6).fill(side);
    mats[face] = m;
    return this.box(g, w, h, d, mats, x, y, z);
  }

  label(color, textValue, fg = '#e0e0e0', decorate) {
    return (c, W, H) => {
      c.fillStyle = color; c.fillRect(0, 0, W, H);
      decorate?.(c, W, H);
      const t = String(textValue ?? '');
      if (!t) return;
      const size = Math.min(H * 0.45, (W * 0.85) / (t.length * 0.6));
      c.fillStyle = fg; c.font = `600 ${size}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(t, W / 2, H / 2);
    };
  }

  // ---------- board ----------
  addBoard(board) {
    const b = bounds(board), W = b.x1 - b.x0, D = b.y1 - b.y0;
    const ppu = Math.max(8, Math.min(48, Math.floor(4096 / W)));
    const color = safeColor(board.color, '#f4f1e8');
    const draw = c => {
      const X = x => (x - b.x0) * ppu, Y = y => (y - b.y0) * ppu;
      c.fillStyle = color; c.fillRect(0, 0, W * ppu, D * ppu);
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(0, Y(8.15), W * ppu, 0.7 * ppu);
      for (const l of railLines(board)) { c.fillStyle = l.color; c.fillRect(X(l.x0), Y(l.y - 0.06), (l.x1 - l.x0) * ppu, 0.12 * ppu); }
      for (const [x, y] of holes(board)) {
        c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(X(x - 0.26), Y(y - 0.26), 0.52 * ppu, 0.52 * ppu);
        c.fillStyle = '#101012'; c.fillRect(X(x - 0.19), Y(y - 0.19), 0.38 * ppu, 0.38 * ppu);
      }
      c.font = `600 ${0.6 * ppu}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const l of labels(board)) { c.fillStyle = l.color || inkFor(color); c.fillText(l.t, X(l.x), Y(l.y)); }
    };
    const top = new THREE.MeshStandardMaterial({ map: this.texture(W, D, draw, ppu), roughness: 0.75 });
    this.disposables.push(top);
    const side = mat(color, { roughness: 0.75 });
    this.box(this.root, W, BOARD_H, D, [side, side, top, side, side, side], (b.x0 + b.x1) / 2, -BOARD_H / 2, (b.y0 + b.y1) / 2);
  }

  // ---------- two-pin parts ----------
  wire(g, def, pins, p, part) {
    const a = V(pins[0][0], 0, pins[0][1]), b = V(pins[1][0], 0, pins[1][1]);
    const len = a.distanceTo(b);
    const jitter = ((part?.id?.charCodeAt(0) || 0) % 5) * 0.1;
    const h = 0.9 + Math.min(len * 0.22, 3.2) + jitter;
    const at = (t, y) => a.clone().lerp(b, t).setY(y);
    const curve = new THREE.CatmullRomCurve3([at(0, 0.3), at(0.1, h * 0.75), at(0.5, h), at(0.9, h * 0.75), at(1, 0.3)]);
    this.mesh(g, new THREE.TubeGeometry(curve, 40, 0.15, 10), mat(safeColor(p.color, '#e53935'), { roughness: 0.45 }));
    this.leg(g, a.x, a.z, 0.4);
    this.leg(g, b.x, b.z, 0.4);
  }

  axial(g, def, pins, p) {
    const a = V(pins[0][0], 0, pins[0][1]), b = V(pins[1][0], 0, pins[1][1]);
    const len = a.distanceTo(b), h = 0.6, bl = Math.max(0.8, Math.min(len - 0.7, 2.6));
    this.leg(g, a.x, a.z, h);
    this.leg(g, b.x, b.z, h);
    this.seg(g, a.clone().setY(h), b.clone().setY(h));
    const body = new THREE.Group();
    body.position.copy(a).lerp(b, 0.5).setY(h);
    body.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
    g.add(body);
    const band = (t, color, r, w = 0.14) => this.cyl(body, r + 0.015, w, mat(color), 0, t * bl, 0);
    if (def.shape === 'resistor') {
      this.cyl(body, 0.38, bl, mat('#d8b98a'), 0, 0, 0);
      const c = resistorBands(p.value);
      [-0.3, -0.14, 0.02, 0.3].forEach((t, i) => band(t, c[i], 0.38));
    } else if (def.shape === 'diode') { this.cyl(body, 0.36, bl, DARK, 0, 0, 0); band(0.3, '#cfd3da', 0.36, 0.2); }
    else if (def.shape === 'zener') { this.cyl(body, 0.3, bl, mat('#e0703a', { transparent: true, opacity: 0.85 }), 0, 0, 0); band(0.3, '#111111', 0.3); }
    else if (def.shape === 'inductor') { this.cyl(body, 0.42, bl, mat('#3f8f5a'), 0, 0, 0); [-0.25, 0, 0.25].forEach(t => band(t, '#2b6a41', 0.42)); }
    else {
      this.cyl(body, 0.32, bl, mat('#cfe8ff', { transparent: true, opacity: 0.45, roughness: 0.1 }), 0, 0, 0);
      this.cyl(body, 0.34, 0.3, METAL, 0, -bl / 2 + 0.15, 0);
      this.cyl(body, 0.34, 0.3, METAL, 0, bl / 2 - 0.15, 0);
    }
  }

  radial(g, def, pins, p) {
    const a = V(pins[0][0], 0, pins[0][1]), b = V(pins[1][0], 0, pins[1][1]);
    const mid = a.clone().lerp(b, 0.5), dir = b.clone().sub(a).normalize();
    const base = { led: 1.3, electrolytic: 0.6, buzzer: 0.5, speaker: 0.5, motor: 0.6, jack: 0.4, coin: 0.6 }[def.shape] ?? 1.1;
    for (const [pin, sign] of [[a, -1], [b, 1]]) {
      this.leg(g, pin.x, pin.z, 0.3);
      this.seg(g, pin.clone().setY(0.3), mid.clone().addScaledVector(dir, sign * 0.25).setY(base));
    }
    const body = new THREE.Group();     // local X runs from pin 0 to pin 1
    body.position.copy(mid).setY(base);
    body.rotation.y = -Math.atan2(dir.z, dir.x);
    g.add(body);
    switch (def.shape) {
      case 'led': {
        const c = safeColor(p.color, '#e53935');
        const m = mat(c, { transparent: true, opacity: 0.88, emissive: c, emissiveIntensity: 0.55, roughness: 0.2 });
        this.cyl(body, 0.62, 0.18, m, 0, 0.09, 0);
        this.cyl(body, 0.52, 0.8, m, 0, 0.5, 0);
        this.mesh(body, new THREE.SphereGeometry(0.52, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 0.9, 0);
        break;
      }
      case 'ceramic': case 'thermistor':
        this.mesh(body, new THREE.SphereGeometry(1, 24, 16), mat(def.shape === 'ceramic' ? '#d98a2b' : '#2e7d32'), 0, 0.5, 0).scale.set(0.6, 0.55, 0.2);
        break;
      case 'electrolytic':
        this.cyl(body, 0.95, 2.2, mat('#1c2a5a', { roughness: 0.35 }), 0, 1.1, 0);
        this.cyl(body, 0.85, 0.04, METAL, 0, 2.22, 0);
        this.box(body, 0.05, 2.1, 0.7, mat('#cfd3da'), 0.94, 1.1, 0);
        break;
      case 'crystal': this.box(body, 1.8, 1.3, 0.7, METAL, 0, 0.65, 0); break;
      case 'buzzer':
        this.cyl(body, 1.25, 1.2, DARK, 0, 0.6, 0);
        this.cyl(body, 0.25, 0.04, mat('#000000'), 0, 1.21, 0);
        break;
      case 'speaker':
        this.cyl(body, 1.6, 0.5, DARK, 0, 0.25, 0);
        this.cyl(body, 0.5, 0.25, mat('#3a3a3a'), 0, 0.55, 0, 1.3);
        break;
      case 'ldr':
        this.cyl(body, 0.65, 0.3, mat('#e9e2d0'), 0, 0.15, 0);
        this.cyl(body, 0.55, 0.04, mat('#c9753d'), 0, 0.31, 0);
        break;
      case 'mic':
        this.cyl(body, 0.75, 0.7, METAL, 0, 0.35, 0);
        this.cyl(body, 0.55, 0.04, DARK, 0, 0.71, 0);
        break;
      case 'motor':
        this.cyl(body, 1.3, 2.4, METAL, 0, 1.2, 0);
        this.cyl(body, 0.5, 0.25, mat('#f5f5f5'), 0, 2.5, 0);
        this.cyl(body, 0.12, 1, METAL, 0, 3.1, 0);
        break;
      case 'jack':
        this.box(body, 2, 1.6, 1.8, DARK, 0, 0.8, 0);
        this.cyl(body, 0.45, 0.1, mat('#000000'), 0, 0.9, 0.9).rotation.x = Math.PI / 2;
        break;
      case 'coin':
        this.cyl(body, 1.7, 0.2, DARK, 0, 0.1, 0);
        this.cyl(body, 1.55, 0.35, METAL, 0, 0.38, 0);
        break;
    }
  }

  // ---------- single-row parts ----------
  inline(g, def, pins, p) {
    const x0 = pins[0][0], x1 = pins[pins.length - 1][0], cx = (x0 + x1) / 2;
    g.position.set(cx, 0, pins[0][1]);
    const xs = pins.map(q => q[0] - cx);
    const legs = (top, m) => xs.forEach(x => this.leg(g, x, 0, top, m));
    switch (def.shape) {
      case 'to92': {
        legs(0.7);
        const geo = new THREE.CylinderGeometry(1.05, 1.05, 1.5, 24, 1, false, -Math.PI / 2, Math.PI);
        this.mesh(g, geo, DARK, 0, 1.45, 0.3).rotation.y = Math.PI;
        this.faceBox(g, 2.1, 1.5, 0.04, DARK, 4, this.label('#1c1c1e', p.label, '#bdbdbd'), 0, 1.45, 0.3);
        break;
      }
      case 'to220':
        legs(0.9);
        this.faceBox(g, 2.6, 2.3, 1.1, DARK, 4, this.label('#1c1c1e', p.label, '#bdbdbd'), 0, 2.05, 0);
        this.box(g, 2.6, 1.7, 0.3, METAL, 0, 4.05, -0.4);
        break;
      case 'pot':
        legs(0.4);
        this.box(g, 2.5, 1.3, 2.5, mat('#1e6fd0'), 0, 1.05, 0);
        this.cyl(g, 0.85, 0.25, mat('#e8e3d3'), 0, 1.82, 0);
        this.cyl(g, 0.3, 1.4, METAL, 0, 2.6, 0);
        break;
      case 'rgb': {
        legs(1.3);
        const m = mat('#ffffff', { transparent: true, opacity: 0.8, roughness: 0.15, emissive: '#ffffff', emissiveIntensity: 0.15 });
        this.cyl(g, 0.72, 0.18, m, 0, 1.39, 0);
        this.cyl(g, 0.62, 0.8, m, 0, 1.8, 0);
        this.mesh(g, new THREE.SphereGeometry(0.62, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m, 0, 2.2, 0);
        break;
      }
      case 'slide':
        legs(0.3);
        this.box(g, 3, 1, 1.2, METAL, 0, 0.8, 0);
        this.box(g, 0.7, 0.7, 0.6, DARK, -0.35, 1.6, 0);
        break;
      case 'ir':
        legs(0.8);
        this.box(g, 2.2, 2, 1.1, DARK, 0, 1.8, 0);
        this.mesh(g, new THREE.SphereGeometry(0.6, 20, 12), DARK, 0, 1.9, 0.5);
        break;
      case 'header':
        legs(3.2, GOLD);
        this.box(g, def.n, 1, 0.96, DARK, 0, 0.5, 0);
        break;
      default: this.module(g, def, p, legs);
    }
  }

  // Module on a vertical PCB, components facing +Z.
  module(g, def, p, legs) {
    const w = def.w || def.n + 0.2, h = def.h || 6, y = 1 + h / 2, pcb = mat(def.color || '#1565c0');
    legs(1.6, GOLD);
    this.box(g, def.n, 1, 0.96, DARK, 0, 0.5, 0);
    const front = (fw, fh, color, text, fx = 0, fy = y, fg = '#ffffff', depth = 0.06) =>
      this.faceBox(g, fw, fh, depth, mat(color), 4, this.label(color, text, fg), fx, fy, 0.15 + depth / 2);
    switch (def.extra) {
      case 'dht':
        this.box(g, w, h + 1.5, 0.3, pcb, 0, y + 0.75, 0);
        this.faceBox(g, w, h, 2.2, mat('#29b6f6'), 4, this.label('#29b6f6', p.label, '#ffffff', (c, W, H) => {
          c.fillStyle = 'rgba(0,0,0,.35)';
          for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) c.fillRect(W * (0.14 + i * 0.2), H * (0.08 + j * 0.1), W * 0.12, H * 0.05);
        }), 0, y + 1.5, 1.25);
        return;
      case 'hcsr04':
        this.box(g, w, h, 0.3, pcb, 0, y, 0);
        for (const x of [-4.6, 4.6]) {
          this.cyl(g, 3.1, 4.6, METAL, x, y, 2.45).rotation.x = Math.PI / 2;
          this.cyl(g, 2.7, 0.05, DARK, x, y, 4.76).rotation.x = Math.PI / 2;
        }
        front(4, 1.2, def.color, p.label, 0, y + h / 2 - 0.8);
        return;
      case 'pir':
        this.box(g, w, h, 0.3, pcb, 0, y, 0);
        this.box(g, 9, 9, 1.2, mat('#f5f5f5'), 0, y, 0.75);
        this.mesh(g, new THREE.SphereGeometry(4.4, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), mat('#fafafa', { roughness: 0.3 }), 0, y, 1.35).rotation.x = Math.PI / 2;
        return;
      case 'relay':
        this.box(g, w, h, 0.3, pcb, 0, y, 0);
        this.faceBox(g, 6, 7.5, 6, mat('#1e88e5'), 4, this.label('#1e88e5', p.label, '#ffffff'), 0, y + 1.5, 3.15);
        return;
      case 'oled':
        this.box(g, w, h, 0.3, pcb, 0, y, 0);
        front(w - 0.6, h * 0.55, '#050505', p.label, 0, y + 0.8, '#4fc3f7', 0.2);
        return;
      case 'lcd':
        this.box(g, w, h, 0.3, pcb, 0, y, 0);
        this.box(g, w - 2.5, h - 4, 0.9, DARK, 0, y, 0.6);
        front(w - 4.5, h - 6.5, '#9ccc65', p.label, 0, y, '#1b3a0f', 0.95);
        return;
      default:
        this.faceBox(g, w, h, 0.3, pcb, 4, this.label('#' + pcb.color.getHexString(), p.label), 0, y, 0);
        if (def.extra === 'shield') this.box(g, w - 1, h * 0.45, 0.6, METAL, 0, y + h * 0.2, 0.4);
    }
  }

  // ---------- double-row parts ----------
  dual(g, def, pins, p) {
    const n = def.n, xL = pins[0][0], xR = pins[n - 1][0], zB = pins[0][1], zT = pins[n][1];
    const cx = (xL + xR) / 2, half = (zB - zT) / 2, w = xR - xL + 0.9;
    g.position.set(cx, 0, (zB + zT) / 2);
    const local = pins.map(([x, z]) => [x - cx, z > zT ? half : -half]);
    const flat = () => local.forEach(([x, z]) => this.box(g, 0.28, 1.3, 0.08, METAL, x, 0.35, z));
    switch (def.shape) {
      case 'tact':
        local.forEach(([x, z]) => { this.leg(g, x, z, 0.5); this.seg(g, V(x, 0.5, z), V(Math.sign(x) * 1.1, 0.5, Math.sign(z) * 1.1)); });
        this.box(g, 2.6, 1.3, 2.6, mat('#2a2a2c'), 0, 0.95, 0);
        this.box(g, 2.7, 0.08, 2.7, METAL, 0, 1.62, 0);
        this.cyl(g, 0.8, 0.6, mat(safeColor(p.color, '#e53935')), 0, 1.95, 0);
        break;
      case 'dipsw':
        flat();
        this.box(g, w, 1.2, half * 2 - 0.3, mat('#c62828'), 0, 0.95, 0);
        local.slice(0, n).forEach(([x]) => this.box(g, 0.45, 0.3, 0.55, mat('#fafafa'), x, 1.65, -0.3));
        break;
      case 'seg7':
        flat();
        this.faceBox(g, w + 0.1, 3, half * 2 + 1.4, DARK, 2, (c, W, H) => {
          c.fillStyle = '#17171a'; c.fillRect(0, 0, W, H);
          c.strokeStyle = '#ff3b30'; c.lineWidth = W * 0.07; c.lineJoin = 'round'; c.shadowColor = '#ff3b30'; c.shadowBlur = W * 0.06;
          c.strokeRect(W * 0.3, H * 0.2, W * 0.4, H * 0.3); c.strokeRect(W * 0.3, H * 0.5, W * 0.4, H * 0.3);
          c.fillStyle = '#ff3b30'; c.beginPath(); c.arc(W * 0.84, H * 0.8, W * 0.04, 0, 7); c.fill();
        }, 0, 1.8, 0);
        break;
      case 'board': {
        const bw = xR - xL + 1.6, bd = half * 2 + 1.4, color = def.color || '#00838f';
        local.forEach(([x, z]) => this.leg(g, x, z, 1.5, GOLD));
        for (const z of [-half, half]) this.box(g, n, 1, 0.96, DARK, 0, 0.5, z);
        this.faceBox(g, bw, 0.3, bd, mat(color), 2, (c, W, H) => {
          c.fillStyle = color; c.fillRect(0, 0, W, H);
          c.fillStyle = '#d4af37';
          const u = W / bw;
          for (const [x, z] of local) { c.beginPath(); c.arc(W / 2 + x * u, H / 2 + z * u, u * 0.22, 0, 7); c.fill(); }
          c.fillStyle = '#ffffff'; c.font = `600 ${u * 0.8}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(p.label ?? ''), W / 2 - (def.shield ? 2 : 3.5) * u, H / 2);
        }, 0, 1.15, 0);
        if (def.usb) this.box(g, 2.2, 1, 2.8, METAL, -bw / 2 + 0.8, 1.8, 0);
        if (def.shield) this.box(g, 6, 0.9, 6, METAL, bw / 2 - 3.3, 1.75, 0);
        else this.box(g, 2.8, 0.5, 2.8, DARK, 1, 1.55, 0);
        break;
      }
      default:
        flat();
        this.faceBox(g, w, 1.3, half * 2 + 0.1, DARK, 2, this.label('#1c1c1e', p.label, '#cfcfcf', (c, W, H) => {
          c.fillStyle = '#3a3a3e';
          c.beginPath(); c.arc(0, H / 2, H * 0.14, -Math.PI / 2, Math.PI / 2); c.fill();
          c.beginPath(); c.arc(H * 0.2, H * 0.82, H * 0.05, 0, 7); c.fill();
        }), 0, 1.0, 0);
    }
  }
}
