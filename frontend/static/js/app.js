import { register, start, navigate } from './router.js';
import { dashboardPage }       from './pages/dashboard.js';
import { inspectionsPage }     from './pages/inspections.js';
import { inspectionFormPage }  from './pages/inspection-form.js';
import { inspectionDetailPage } from './pages/inspection-detail.js';
import { settingsPage }        from './pages/settings.js';
import { session }             from './session.js';

// ── Routes ─────────────────────────────────────────────────
register('/', dashboardPage);
register('/inspections', inspectionsPage);
register('/inspections/new', () => inspectionFormPage(null));
register('/inspections/:id/edit', ({ id }) => inspectionFormPage(Number(id)));
register('/inspections/:id', ({ id }) => inspectionDetailPage(Number(id)));
register('/settings', settingsPage);

// ── Active nav highlighting ─────────────────────────────────
function updateNav() {
  const hash = location.hash.slice(1) || '/';
  document.querySelectorAll('.nav-link').forEach((link) => {
    const route = link.dataset.route;
    let active = false;
    if (route === 'dashboard')    active = hash === '/' || hash === '';
    if (route === 'inspections')  active = hash.startsWith('/inspections');
    if (route === 'settings')     active = hash.startsWith('/settings');
    link.classList.toggle('active', active);
  });
}
window.addEventListener('hashchange', updateNav);
updateNav();

// ── Global Toast ────────────────────────────────────────────
window.toast = function (msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('hiding');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    // Fallback
    setTimeout(() => el.remove(), 400);
  }, 3000);
};

// ── Global Modal ────────────────────────────────────────────
window.modal = {
  _onClose: null,
  open(html, { wide = false, onClose = null } = {}) {
    const overlay   = document.getElementById('modal-overlay');
    const container = document.getElementById('modal-container');
    container.className = 'modal-container' + (wide ? ' modal-camera' : '');
    container.innerHTML = html;
    overlay.classList.remove('hidden');
    this._onClose = onClose;

    // Close on overlay click
    overlay.onclick = (e) => {
      if (e.target === overlay) this.close();
    };
    // Close on Escape
    this._escHandler = (e) => { if (e.key === 'Escape') this.close(); };
    window.addEventListener('keydown', this._escHandler);
  },
  close() {
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.add('hidden');
    overlay.onclick = null;
    if (this._escHandler) {
      window.removeEventListener('keydown', this._escHandler);
      this._escHandler = null;
    }
    if (this._onClose) {
      this._onClose();
      this._onClose = null;
    }
  },
};

// ── Global navigate helper (pages can call window.navigate) ─
window.navigate = navigate;

// ── Açık muayene göstergesi ─────────────────────────────────
async function refreshOpenBadge() {
  try {
    const { api } = await import('./api.js');
    const list = await api.inspections.list({ status: 'open' });
    const el   = document.getElementById('open-insp-indicator');
    const txt  = document.getElementById('open-insp-text');
    if (!el || !txt) return;
    if (list.length === 0) {
      el.classList.add('hidden');
    } else {
      txt.textContent = `${list.length} Açık Muayene`;
      el.classList.remove('hidden');
    }
  } catch { /* sessizce geç */ }
}
window.addEventListener('hashchange', refreshOpenBadge);
refreshOpenBadge();

// ── Tablet Mode ─────────────────────────────────────────────
function applyTabletMode(enabled) {
  document.body.classList.toggle('tablet-mode', enabled);
  if (!enabled) document.body.classList.remove('sidebar-expanded');
  const btn  = document.getElementById('tablet-toggle-btn');
  if (!btn) return;
  btn.querySelector('.tablet-toggle-icon').textContent = enabled ? '🖥' : '📱';
  btn.querySelector('.tablet-toggle-label').textContent = enabled ? 'Masaüstü Modu' : 'Tablet Modu';
}

(function initTabletMode() {
  const saved = localStorage.getItem('tabletMode');
  // Auto-detect touch device on first visit; Surface Pro in tablet mode reports maxTouchPoints > 0
  const autoTouch = navigator.maxTouchPoints > 0;
  const enabled = saved !== null ? saved === '1' : autoTouch;
  applyTabletMode(enabled);
})();

document.getElementById('tablet-toggle-btn').addEventListener('click', () => {
  const enabled = document.body.classList.toggle('tablet-mode');
  localStorage.setItem('tabletMode', enabled ? '1' : '0');
  applyTabletMode(enabled);
});

// Sidebar expand / collapse (tablet mode)
document.getElementById('sidebar-hamburger').addEventListener('click', () => {
  document.body.classList.toggle('sidebar-expanded');
});

document.getElementById('sidebar-overlay').addEventListener('click', () => {
  document.body.classList.remove('sidebar-expanded');
});

// Close expanded sidebar when navigating
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', () => {
    document.body.classList.remove('sidebar-expanded');
  });
});

// ── Session / Sicil No ──────────────────────────────────────
function renderSessionBadge() {
  const existing = document.getElementById('session-badge');
  if (existing) existing.remove();

  const sicil = session.get();
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  const badge = document.createElement('div');
  badge.id = 'session-badge';
  badge.className = 'session-badge';
  badge.innerHTML = `
    <span class="session-icon">👤</span>
    <span class="session-name">${sicil || '—'}</span>
    <button class="session-change-btn" title="Sicil değiştir">↩</button>
  `;
  footer.insertBefore(badge, footer.firstChild);

  badge.querySelector('.session-change-btn').addEventListener('click', () => {
    openLoginModal(true);
  });
}

function openLoginModal(allowClose = false) {
  const overlay   = document.getElementById('modal-overlay');
  const container = document.getElementById('modal-container');

  container.className = 'modal-container';
  container.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">Oturum Aç</h3>
    </div>
    <div class="modal-body">
      <p class="text-secondary" style="margin-bottom:16px;">
        Devam etmek için sicil numaranızı girin.
        Bu bilgi, girdiğiniz tüm kararlarda otomatik kullanılacaktır.
      </p>
      <div class="form-group">
        <label>Sicil No *</label>
        <input type="text" id="login-sicil" class="form-input"
               placeholder="ör. 12345" autocomplete="off"
               value="${session.get() || ''}" />
      </div>
      <p id="login-error" class="text-danger" style="display:none;margin-top:6px;font-size:13px;"></p>
    </div>
    <div class="modal-footer">
      ${allowClose ? '<button class="btn btn-secondary" id="login-cancel">İptal</button>' : ''}
      <button class="btn btn-primary" id="login-submit">Giriş</button>
    </div>
  `;
  overlay.classList.remove('hidden');

  const input  = container.querySelector('#login-sicil');
  const errEl  = container.querySelector('#login-error');
  const submit = container.querySelector('#login-submit');
  const cancel = container.querySelector('#login-cancel');

  input.focus();

  const doLogin = () => {
    const val = input.value.trim();
    if (!val) {
      errEl.textContent = 'Sicil no boş bırakılamaz.';
      errEl.style.display = 'block';
      input.focus();
      return;
    }
    session.set(val);
    overlay.classList.add('hidden');
    overlay.onclick = null;
    renderSessionBadge();
  };

  submit.addEventListener('click', doLogin);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });

  if (allowClose && cancel) {
    cancel.addEventListener('click', () => {
      overlay.classList.add('hidden');
      overlay.onclick = null;
    });
    overlay.onclick = (e) => { if (e.target === overlay) { overlay.classList.add('hidden'); overlay.onclick = null; } };
  } else {
    // Bloke edici modal — Escape veya overlay tıklaması kapatamaz
    overlay.onclick = null;
  }
}

// Uygulama açılışında sicil kontrolü
if (!session.get()) {
  openLoginModal(false);
} else {
  renderSessionBadge();
}

// ── Start router ────────────────────────────────────────────
start();
