/**
 * Annotator — Canvas tabanlı fotoğraf üzerine çizim aracı.
 *
 * Araçlar : ok (arrow), dikdörtgen (rect), çember (circle), serbest kalem (pen)
 * Özellikler: renk paleti, kalınlık kaydırıcısı, geri al (Ctrl+Z), temizle,
 *             dokunmatik ekran desteği, yüksek DPI canvas
 *
 * Kullanım:
 *   const ann = new Annotator();
 *   await ann.open(containerEl, imageUrl);
 *   const blob = await ann.exportBlob();
 *   ann.destroy();
 */
export class Annotator {
  constructor() {
    this.tool      = 'arrow';
    this.color     = '#ff0000';
    this.lineWidth = 3;
    this.shapes    = [];
    this._undo     = [];   // undo stack — her entry shapes[]'in snapshot'ı
    this._drawing  = false;
    this._sx = 0; this._sy = 0;   // drag başlangıcı
    this._live = null;             // pen için aktif şekil
    this.canvas = null;
    this.ctx    = null;
    this.img    = null;
    this._keyH  = null;
  }

  // ── Public API ────────────────────────────────────────────────────────────

  async open(containerEl, imageUrl) {
    this.shapes = [];
    this._undo  = [];

    this.img = await this._loadImg(imageUrl);

    containerEl.innerHTML = this._html();
    this.canvas = containerEl.querySelector('#ann-canvas');
    this.ctx    = this.canvas.getContext('2d');

    // Gerçek piksel boyutu — yüksek DPI'da net görüntü
    this.canvas.width  = this.img.naturalWidth  || this.img.width;
    this.canvas.height = this.img.naturalHeight || this.img.height;

    this._bind(containerEl);
    this._render();
  }

  async exportBlob() {
    return new Promise(res => this.canvas.toBlob(res, 'image/jpeg', 0.95));
  }

  /**
   * Export the annotated image with a defect-ID badge burned into a copy.
   * The live canvas is NOT modified — inspector can continue annotating.
   * @param {string|null} label  e.g. "#14" or "#14 #15". Null = no stamp.
   */
  async exportBlobWithLabel(label) {
    if (!label) return this.exportBlob();

    const tmp  = document.createElement('canvas');
    tmp.width  = this.canvas.width;
    tmp.height = this.canvas.height;
    const tctx = tmp.getContext('2d');

    // Copy annotated canvas onto tmp
    tctx.drawImage(this.canvas, 0, 0);

    // Badge geometry — scale with image width
    const fontSize = Math.max(18, Math.round(tmp.width * 0.028));
    tctx.font = `bold ${fontSize}px monospace`;
    const pad = Math.round(fontSize * 0.45);
    const tw  = tctx.measureText(label).width;
    const bw  = tw + pad * 2;
    const bh  = fontSize + pad * 2;
    const bx  = pad;
    const by  = pad;

    // Dark background
    tctx.fillStyle = 'rgba(0,0,0,0.72)';
    tctx.fillRect(bx, by, bw, bh);

    // White label text
    tctx.fillStyle = '#ffffff';
    tctx.fillText(label, bx + pad, by + pad + fontSize * 0.82);

    return new Promise(res => tmp.toBlob(res, 'image/jpeg', 0.95));
  }

  destroy() {
    if (this._keyH) document.removeEventListener('keydown', this._keyH);
  }

  // ── HTML ──────────────────────────────────────────────────────────────────

  _html() {
    const tools = [
      { id: 'arrow',  icon: '↗',  tip: 'Ok (A)'           },
      { id: 'rect',   icon: '▭',  tip: 'Dikdörtgen (R)'   },
      { id: 'circle', icon: '◯',  tip: 'Çember (C)'       },
      { id: 'pen',    icon: '✏',  tip: 'Serbest Kalem (P)'},
    ];
    const colors = [
      '#ff0000', '#ff6600', '#ffdd00',
      '#00cc44', '#0088ff', '#cc00ff',
      '#ffffff', '#000000',
    ];
    return `
      <div class="ann-toolbar">
        <div class="ann-group">
          ${tools.map(t => `
            <button class="ann-tool ${t.id === 'arrow' ? 'active' : ''}"
                    data-tool="${t.id}" title="${t.tip}">${t.icon}</button>
          `).join('')}
        </div>
        <div class="ann-divider"></div>
        <div class="ann-group ann-colors">
          ${colors.map(c => `
            <button class="ann-color ${c === '#ff0000' ? 'active' : ''}"
                    data-color="${c}" title="${c}"
                    style="background:${c}"></button>
          `).join('')}
        </div>
        <div class="ann-divider ann-row-break"></div>
        <div class="ann-group ann-lw-group">
          <span class="ann-label">Kalınlık</span>
          <input type="range" id="ann-lw" min="1" max="14" value="3" />
          <span id="ann-lw-val" class="ann-label">3px</span>
        </div>
        <div class="ann-divider"></div>
        <div class="ann-group">
          <button class="ann-action" id="ann-undo-btn"  title="Geri Al (Ctrl+Z)">↩ Geri Al</button>
          <button class="ann-action danger" id="ann-clear-btn" title="Tümünü Temizle">🗑 Temizle</button>
        </div>
      </div>
      <div class="ann-canvas-wrap">
        <canvas id="ann-canvas"></canvas>
      </div>
    `;
  }

  // ── Olay bağlamaları ──────────────────────────────────────────────────────

  _bind(root) {
    // Araç seçimi
    root.querySelectorAll('.ann-tool').forEach(btn =>
      btn.addEventListener('click', () => {
        this.tool = btn.dataset.tool;
        root.querySelectorAll('.ann-tool').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      })
    );

    // Renk seçimi
    root.querySelectorAll('.ann-color').forEach(btn =>
      btn.addEventListener('click', () => {
        this.color = btn.dataset.color;
        root.querySelectorAll('.ann-color').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      })
    );

    // Kalınlık
    const lw    = root.querySelector('#ann-lw');
    const lwVal = root.querySelector('#ann-lw-val');
    lw.addEventListener('input', () => {
      this.lineWidth = +lw.value;
      lwVal.textContent = lw.value + 'px';
    });

    // Geri al / temizle
    root.querySelector('#ann-undo-btn').addEventListener('click', () => this._doUndo());
    root.querySelector('#ann-clear-btn').addEventListener('click', () => {
      if (!this.shapes.length) return;
      if (!confirm('Tüm çizimler silinsin mi?')) return;
      this._snapshot();
      this.shapes = [];
      this._render();
    });

    // Klavye kısayolları
    this._keyH = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); this._doUndo(); }
      if (!e.ctrlKey && !e.metaKey && !e.altKey) {
        const map = { a: 'arrow', r: 'rect', c: 'circle', p: 'pen' };
        if (map[e.key]) {
          this.tool = map[e.key];
          root.querySelectorAll('.ann-tool').forEach(b =>
            b.classList.toggle('active', b.dataset.tool === this.tool));
        }
      }
    };
    document.addEventListener('keydown', this._keyH);

    // Canvas çizim olayları
    const cv = this.canvas;
    cv.addEventListener('mousedown',  e => this._start(e));
    cv.addEventListener('mousemove',  e => this._move(e));
    cv.addEventListener('mouseup',    e => this._end(e));
    cv.addEventListener('mouseleave', e => this._end(e));
    cv.addEventListener('touchstart', e => { e.preventDefault(); this._start(e.touches[0]); }, { passive: false });
    cv.addEventListener('touchmove',  e => { e.preventDefault(); this._move(e.touches[0]); }, { passive: false });
    cv.addEventListener('touchend',   e => { e.preventDefault(); this._end(e.changedTouches[0] || e); });
  }

  // ── Koordinat dönüşümü ────────────────────────────────────────────────────

  _pt(e) {
    const r  = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left)  * (this.canvas.width  / r.width),
      y: (e.clientY - r.top)   * (this.canvas.height / r.height),
    };
  }

  // ── Çizim olayları ────────────────────────────────────────────────────────

  _start(e) {
    const { x, y } = this._pt(e);
    this._drawing = true;
    this._sx = x;  this._sy = y;

    if (this.tool === 'pen') {
      this._snapshot();
      this._live = { type: 'pen', color: this.color, lw: this.lineWidth, pts: [{ x, y }] };
      this.shapes.push(this._live);
    }
  }

  _move(e) {
    if (!this._drawing) return;
    const { x, y } = this._pt(e);

    if (this.tool === 'pen') {
      this._live.pts.push({ x, y });
      this._render();
    } else {
      // Anlık önizleme
      this._render();
      this._drawShape(this.ctx, {
        type: this.tool, color: this.color, lw: this.lineWidth,
        x1: this._sx, y1: this._sy, x2: x, y2: y,
      });
    }
  }

  _end(e) {
    if (!this._drawing) return;
    this._drawing = false;

    if (this.tool !== 'pen') {
      let x2 = this._sx, y2 = this._sy;
      if (e.clientX !== undefined) { const c = this._pt(e); x2 = c.x; y2 = c.y; }
      if (Math.hypot(x2 - this._sx, y2 - this._sy) > 4) {
        this._snapshot();
        this.shapes.push({ type: this.tool, color: this.color, lw: this.lineWidth,
                           x1: this._sx, y1: this._sy, x2, y2 });
        this._render();
      }
    }
    this._live = null;
  }

  // ── Undo ──────────────────────────────────────────────────────────────────

  _snapshot() {
    this._undo.push(JSON.parse(JSON.stringify(this.shapes)));
    if (this._undo.length > 40) this._undo.shift();
  }

  _doUndo() {
    if (!this._undo.length) return;
    this.shapes = this._undo.pop();
    this._render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  _render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.img, 0, 0);
    for (const s of this.shapes) this._drawShape(ctx, s);
  }

  _drawShape(ctx, s) {
    ctx.save();
    ctx.strokeStyle = s.color;
    ctx.fillStyle   = s.color;
    ctx.lineWidth   = s.lw;
    ctx.lineCap     = 'round';
    ctx.lineJoin    = 'round';

    switch (s.type) {
      case 'arrow':  this._arrow(ctx, s.x1, s.y1, s.x2, s.y2, s.lw); break;
      case 'rect':   this._rect(ctx,  s.x1, s.y1, s.x2, s.y2);       break;
      case 'circle': this._circle(ctx, s.x1, s.y1, s.x2, s.y2);      break;
      case 'pen':    this._penPath(ctx, s.pts);                        break;
    }
    ctx.restore();
  }

  _arrow(ctx, x1, y1, x2, y2, lw) {
    const angle   = Math.atan2(y2 - y1, x2 - x1);
    const headLen = Math.max(lw * 4, 14);

    // Gövde çizgisi
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Ok başı (dolu üçgen)
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6),
               y2 - headLen * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6),
               y2 - headLen * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
  }

  _rect(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }

  _circle(ctx, x1, y1, x2, y2) {
    const rx = (x2 - x1) / 2, ry = (y2 - y1) / 2;
    ctx.beginPath();
    ctx.ellipse(x1 + rx, y1 + ry, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  _penPath(ctx, pts) {
    if (pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // ── Yardımcı ─────────────────────────────────────────────────────────────

  _loadImg(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload  = () => res(img);
      img.onerror = (e) => rej(new Error('Görüntü yüklenemedi: ' + url));
      // Blob URL'lerde query param desteklenmez
      img.src = url.startsWith('blob:')
        ? url
        : url + (url.includes('?') ? '&' : '?') + '_t=' + Date.now();
    });
  }
}
