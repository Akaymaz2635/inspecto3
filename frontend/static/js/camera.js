export class Camera {
  constructor() {
    this._stream = null;
    this._video = null;
    this._canvas = null;
    this._overlayCanvas = null;
    this._zoom = 1;
    this._overlay = 'crosshair'; // 'crosshair' | 'grid' | 'frame' | null
    this._facingMode = 'environment';
    this._listeners = {};
    this._container = null;
    this._animFrame = null;
  }

  on(event, cb) {
    this._listeners[event] = cb;
    return this;
  }

  _emit(event, data) {
    if (this._listeners[event]) this._listeners[event](data);
  }

  async open(containerEl) {
    this._container = containerEl;
    containerEl.innerHTML = this._buildHTML();

    this._video        = containerEl.querySelector('.cam-video');
    this._overlayCanvas = containerEl.querySelector('.cam-overlay');
    this._canvas       = document.createElement('canvas');

    const zoomSlider   = containerEl.querySelector('.cam-zoom');
    const captureBtn   = containerEl.querySelector('.btn-capture');
    const switchBtn    = containerEl.querySelector('.btn-switch');
    const toggleCross  = containerEl.querySelector('.toggle-cross');
    const toggleGrid   = containerEl.querySelector('.toggle-grid');
    const toggleFrame  = containerEl.querySelector('.toggle-frame');
    this._previewArea  = containerEl.querySelector('.cam-preview-area');

    zoomSlider.addEventListener('input', (e) => {
      this._zoom = parseFloat(e.target.value);
      this._applyZoom();
    });

    captureBtn.addEventListener('click', () => this._snap());

    switchBtn.addEventListener('click', async () => {
      this._facingMode = this._facingMode === 'environment' ? 'user' : 'environment';
      await this._startStream();
      this._emit('switch', this._facingMode);
    });

    toggleCross.addEventListener('click', () => {
      this._overlay = this._overlay === 'crosshair' ? null : 'crosshair';
      this._updateToggleButtons(containerEl);
    });
    toggleGrid.addEventListener('click', () => {
      this._overlay = this._overlay === 'grid' ? null : 'grid';
      this._updateToggleButtons(containerEl);
    });
    toggleFrame.addEventListener('click', () => {
      this._overlay = this._overlay === 'frame' ? null : 'frame';
      this._updateToggleButtons(containerEl);
    });

    // Keyboard support
    this._keyHandler = (e) => {
      if (e.code === 'Space' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        this._snap();
      }
    };
    window.addEventListener('keydown', this._keyHandler);

    await this._startStream();
    this._updateToggleButtons(containerEl);
    this._drawOverlay();
  }

  async _startStream() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
    }
    try {
      this._stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this._facingMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this._video.srcObject = this._stream;
      await this._video.play();
    } catch (err) {
      console.error('Camera error:', err);
      if (this._container) {
        const vf = this._container.querySelector('.cam-viewfinder');
        if (vf) {
          vf.innerHTML = `<div style="color:#f87171;padding:20px;text-align:center;">
            Kamera erişimi reddedildi veya mevcut değil.<br><small>${err.message}</small>
          </div>`;
        }
      }
    }
  }

  _applyZoom() {
    if (!this._video) return;
    const scale = this._zoom;
    this._video.style.transform = `scale(${scale})`;
    this._video.style.transformOrigin = 'center center';
  }

  _drawOverlay() {
    const draw = () => {
      this._animFrame = requestAnimationFrame(draw);
      const cvs = this._overlayCanvas;
      if (!cvs) return;
      const ctx = cvs.getContext('2d');
      const w = cvs.offsetWidth;
      const h = cvs.offsetHeight;
      if (cvs.width !== w) cvs.width = w;
      if (cvs.height !== h) cvs.height = h;
      ctx.clearRect(0, 0, w, h);
      if (!this._overlay) return;

      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;

      if (this._overlay === 'crosshair') {
        const cx = w / 2, cy = h / 2;
        const gap = 18, arm = 40;
        // Horizontal
        ctx.beginPath(); ctx.moveTo(cx - arm - gap, cy); ctx.lineTo(cx - gap, cy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + gap, cy); ctx.lineTo(cx + arm + gap, cy); ctx.stroke();
        // Vertical
        ctx.beginPath(); ctx.moveTo(cx, cy - arm - gap); ctx.lineTo(cx, cy - gap); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy + gap); ctx.lineTo(cx, cy + arm + gap); ctx.stroke();
        // Center dot
        ctx.fillStyle = 'rgba(74,144,217,0.9)';
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

      } else if (this._overlay === 'grid') {
        for (let i = 1; i <= 2; i++) {
          ctx.beginPath(); ctx.moveTo(w * i / 3, 0); ctx.lineTo(w * i / 3, h); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, h * i / 3); ctx.lineTo(w, h * i / 3); ctx.stroke();
        }

      } else if (this._overlay === 'frame') {
        const px = w * 0.1, py = h * 0.1, bw = w * 0.8, bh = h * 0.8;
        const cs = Math.min(bw, bh) * 0.18;
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = 'rgba(74,144,217,0.85)';
        // Corners
        const corners = [
          [px, py, 1, 1], [px + bw, py, -1, 1],
          [px, py + bh, 1, -1], [px + bw, py + bh, -1, -1],
        ];
        for (const [x, y, dx, dy] of corners) {
          ctx.beginPath();
          ctx.moveTo(x + dx * cs, y);
          ctx.lineTo(x, y);
          ctx.lineTo(x, y + dy * cs);
          ctx.stroke();
        }
      }
    };
    draw();
  }

  _updateToggleButtons(container) {
    container.querySelector('.toggle-cross').classList.toggle('active', this._overlay === 'crosshair');
    container.querySelector('.toggle-grid').classList.toggle('active', this._overlay === 'grid');
    container.querySelector('.toggle-frame').classList.toggle('active', this._overlay === 'frame');
  }

  _snap() {
    const video = this._video;
    if (!video || !video.videoWidth) return;

    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const zoom = this._zoom;

    // Crop center based on zoom
    const cropW = vw / zoom;
    const cropH = vh / zoom;
    const sx = (vw - cropW) / 2;
    const sy = (vh - cropH) / 2;

    this._canvas.width  = Math.round(cropW);
    this._canvas.height = Math.round(cropH);
    const ctx = this._canvas.getContext('2d');
    ctx.drawImage(video, sx, sy, cropW, cropH, 0, 0, cropW, cropH);

    this._canvas.toBlob((blob) => {
      if (!blob) return;
      blob.name = `snap_${Date.now()}.jpg`;
      // Show preview thumbnail
      const url = URL.createObjectURL(blob);
      if (this._previewArea) {
        this._previewArea.innerHTML = `<img src="${url}" alt="Önizleme" />`;
      }
      this._emit('photo', blob);
    }, 'image/jpeg', 0.92);
  }

  close() {
    if (this._animFrame) {
      cancelAnimationFrame(this._animFrame);
      this._animFrame = null;
    }
    if (this._keyHandler) {
      window.removeEventListener('keydown', this._keyHandler);
      this._keyHandler = null;
    }
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._video) {
      this._video.srcObject = null;
      this._video = null;
    }
    this._container = null;
  }

  _buildHTML() {
    return `
      <div class="cam-wrapper">
        <div class="cam-viewfinder">
          <video class="cam-video" playsinline muted autoplay></video>
          <canvas class="cam-overlay"></canvas>
        </div>
        <div class="cam-controls">
          <div class="cam-sliders">
            <label>Zoom</label>
            <input type="range" class="cam-zoom" min="1" max="4" step="0.1" value="1" />
          </div>
          <div class="cam-toggles">
            <button class="btn-toggle toggle-cross active" title="Artı nişangah">＋</button>
            <button class="btn-toggle toggle-grid" title="Izgara">⊞</button>
            <button class="btn-toggle toggle-frame" title="Çerçeve">⬜</button>
          </div>
          <button class="btn-capture" title="Fotoğraf çek (Space)"></button>
          <button class="btn btn-ghost btn-sm btn-switch" title="Kamerayı değiştir">&#x21C4;</button>
        </div>
        <div class="cam-preview-area"></div>
      </div>
    `;
  }
}
