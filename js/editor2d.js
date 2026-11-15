// 2D SVG editor: placing, selecting, moving and deleting parts on the board.
import { bounds, boardSVG, holeExists, holeName, stripRect, footprint, pinsValid, takenHoles, key } from './board.js';
import { getDef } from './catalog.js';
import { partSVG } from './draw2d.js';

const TWO_PIN = new Set(['wire', 'axial', 'radial']);

export class Editor2D {
  // app: { board, tool, selected, addPart(type, pins), removePart(id), select(id), commit(), status(text), setTool(tool) }
  constructor(svg, app) {
    this.svg = svg;
    this.app = app;
    svg.innerHTML = '<g></g><g></g><g></g><g></g>';
    [this.lBoard, this.lHl, this.lParts, this.lOver] = svg.children;
    this.vb = { x: 0, y: 0, w: 10, h: 10 };
    this.hover = null;    // hole under the cursor
    this.pending = null;  // first hole of a two-pin part being placed
    this.drag = null;

    svg.addEventListener('pointerdown', e => this.onDown(e));
    svg.addEventListener('pointermove', e => this.onMove(e));
    svg.addEventListener('pointerup', e => this.onUp(e));
    svg.addEventListener('pointercancel', e => this.onUp(e));
    svg.addEventListener('pointerleave', () => { this.hover = null; this.renderOverlay(); });
    svg.addEventListener('wheel', e => this.onWheel(e), { passive: false });
    svg.addEventListener('contextmenu', e => e.preventDefault());
  }

  get board() { return this.app.board; }

  fit() {
    const b = bounds(this.board), m = 1;
    this.vb = { x: b.x0 - m, y: b.y0 - m, w: b.x1 - b.x0 + m * 2, h: b.y1 - b.y0 + m * 2 };
    this.applyView();
  }

  applyView() {
    const v = this.vb;
    this.svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  }

  zoom(factor, cx = this.vb.x + this.vb.w / 2, cy = this.vb.y + this.vb.h / 2) {
    const v = this.vb, w = Math.max(6, Math.min(v.w * factor, 400)), f = w / v.w;
    this.vb = { x: cx - (cx - v.x) * f, y: cy - (cy - v.y) * f, w, h: v.h * f };
    this.applyView();
  }

  point(e) {
    const m = this.svg.getScreenCTM();
    return m ? new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  holeAt(p) {
    const c = Math.round(p.x), y = Math.round(p.y);
    return holeExists(this.board, c, y) ? [c, y] : null;
  }

  renderBoard() {
    this.lBoard.innerHTML = boardSVG(this.board);
    this.renderParts();
  }

  renderParts() {
    const order = { dual: 0, inline: 1, axial: 2, radial: 3, wire: 4 };
    const parts = [...this.board.parts].sort((a, b) => order[getDef(a.type).kind] - order[getDef(b.type).kind]);
    this.lParts.innerHTML = parts.map(part => {
      const def = getDef(part.type);
      return `<g class="part" data-id="${part.id}">${partSVG(def, part.pins, part.props)}</g>`;
    }).join('');
    this.renderOverlay();
  }

  // Pins a placement tool would create at the current hover position.
  ghostPins(def) {
    if (TWO_PIN.has(def.kind)) return this.pending && this.hover ? [this.pending, this.hover] : null;
    return this.hover ? footprint(def, this.hover[0], this.hover[1]) : null;
  }

  renderOverlay() {
    const { tool, selected } = this.app;
    let hl = '', s = '';
    if (this.hover) {
      const r = stripRect(this.board, ...this.hover);
      hl = `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx=".3" fill="rgba(79,195,247,.28)"/>`;
    }
    this.lHl.innerHTML = hl;

    const def = getDef(tool);
    if (def) {
      const pins = this.ghostPins(def);
      if (pins) {
        const ok = pinsValid(this.board, pins, takenHoles(this.board));
        s += `<g opacity=".65" pointer-events="none">${partSVG(def, pins, {})}</g>`;
        s += pins.map(([c, y]) => `<circle cx="${c}" cy="${y}" r=".3" fill="none" stroke="${ok ? '#4caf50' : '#f44336'}" stroke-width=".1"/>`).join('');
      }
      if (this.pending) s += `<circle cx="${this.pending[0]}" cy="${this.pending[1]}" r=".34" fill="none" stroke="#4fc3f7" stroke-width=".12"/>`;
    }

    const part = this.board.parts.find(q => q.id === selected);
    if (part) {
      const xs = part.pins.map(q => q[0]), ys = part.pins.map(q => q[1]), pad = 0.8;
      const x = Math.min(...xs) - pad, y = Math.min(...ys) - pad;
      s += `<rect x="${x}" y="${y}" width="${Math.max(...xs) + pad - x}" height="${Math.max(...ys) + pad - y}" rx=".3" fill="none" stroke="#4fc3f7" stroke-width=".08" stroke-dasharray=".3 .2" pointer-events="none"/>`;
      if (TWO_PIN.has(getDef(part.type).kind)) {
        s += part.pins.map(([c, py], i) => `<circle class="handle" data-handle="${i}" cx="${c}" cy="${py}" r=".36" fill="#4fc3f7" stroke="#fff" stroke-width=".08"/>`).join('');
      }
    }
    this.lOver.innerHTML = s;
    this.svg.dataset.mode = def ? 'place' : tool;
  }

  startPan(e) {
    this.drag = { type: 'pan', x: e.clientX, y: e.clientY };
    this.svg.setPointerCapture(e.pointerId);
  }

  onDown(e) {
    const { app } = this;
    if (e.button !== 0) return this.startPan(e);
    const p = this.point(e), hole = this.holeAt(p), def = getDef(app.tool);
    this.svg.setPointerCapture(e.pointerId);

    if (def) {
      if (TWO_PIN.has(def.kind)) {
        if (!hole || takenHoles(this.board).has(key(...hole))) return;
        if (this.pending && key(...this.pending) !== key(...hole)) return this.placeTwoPin(def, hole);
        this.pending = hole;
        this.drag = { type: 'draw' };
      } else if (hole) {
        const pins = footprint(def, hole[0], hole[1]);
        if (pinsValid(this.board, pins, takenHoles(this.board))) app.addPart(def.type, pins);
      }
      return this.renderOverlay();
    }

    const handle = e.target.closest?.('[data-handle]');
    const partEl = e.target.closest?.('[data-id]');
    if (app.tool === 'erase') {
      if (partEl) app.removePart(partEl.dataset.id);
      else this.startPan(e);
      return;
    }
    if (handle) {
      this.drag = { type: 'pin', index: +handle.dataset.handle, changed: false };
    } else if (partEl) {
      app.select(partEl.dataset.id);
      const part = this.board.parts.find(q => q.id === partEl.dataset.id);
      this.drag = { type: 'move', from: [Math.round(p.x), Math.round(p.y)], origin: part.pins.map(q => [...q]), changed: false };
    } else {
      app.select(null);
      this.startPan(e);
    }
  }

  placeTwoPin(def, hole) {
    const pins = [this.pending, hole];
    this.pending = null;
    this.drag = null;
    if (pinsValid(this.board, pins, takenHoles(this.board))) this.app.addPart(def.type, pins);
    else this.renderOverlay();
  }

  onMove(e) {
    const p = this.point(e), d = this.drag;
    if (d?.type === 'pan') {
      const scale = 1 / (this.svg.getScreenCTM()?.a || 1);
      this.vb.x -= (e.clientX - d.x) * scale;
      this.vb.y -= (e.clientY - d.y) * scale;
      d.x = e.clientX; d.y = e.clientY;
      return this.applyView();
    }
    const hole = this.holeAt(p);
    const changed = (hole && key(...hole)) !== (this.hover && key(...this.hover));
    this.hover = hole;
    this.app.status(hole ? holeName(...hole) : '');

    const part = this.board.parts.find(q => q.id === this.app.selected);
    if (part && d?.type === 'move') {
      const dual = getDef(part.type).kind === 'dual';
      const dc = Math.round(p.x) - d.from[0], dy = dual ? 0 : Math.round(p.y) - d.from[1];
      const pins = d.origin.map(([c, y]) => [c + dc, y + dy]);
      if (pinsValid(this.board, pins, takenHoles(this.board, part.id)) && String(pins) !== String(part.pins)) {
        part.pins = pins;
        d.changed = true;
        return this.renderParts();
      }
    } else if (part && d?.type === 'pin' && hole) {
      const pins = part.pins.map(q => [...q]);
      pins[d.index] = hole;
      if (pinsValid(this.board, pins, takenHoles(this.board, part.id)) && String(pins) !== String(part.pins)) {
        part.pins = pins;
        d.changed = true;
        return this.renderParts();
      }
    }
    if (changed) this.renderOverlay();
  }

  onUp(e) {
    const d = this.drag;
    this.drag = null;
    if (this.svg.hasPointerCapture(e.pointerId)) this.svg.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (d.type === 'draw') {
      // Dragging from one hole to another places the part; a plain click waits for a second click.
      const hole = this.holeAt(this.point(e)), def = getDef(this.app.tool);
      if (def && this.pending && hole && key(...hole) !== key(...this.pending)) this.placeTwoPin(def, hole);
    } else if (d.changed) this.app.commit();
  }

  onWheel(e) {
    e.preventDefault();
    const p = this.point(e);
    this.zoom(e.deltaY > 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }

  cancel() {
    const had = !!this.pending;
    this.pending = null;
    this.drag = null;
    this.renderOverlay();
    return had;
  }
}
