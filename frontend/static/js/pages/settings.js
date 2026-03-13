import { api } from '../api.js';

export async function settingsPage() {
  const root = document.getElementById('page-root');
  root.innerHTML = '<div class="loading">Yükleniyor...</div>';

  let activeTab = 'projects';

  async function render() {
    root.innerHTML = `
      <div class="page-header">
        <h1>Ayarlar</h1>
      </div>

      <div class="tabs">
        <button class="tab-btn ${activeTab === 'projects' ? 'active' : ''}" data-tab="projects">
          Motor Projeleri
        </button>
        <button class="tab-btn ${activeTab === 'defect-types' ? 'active' : ''}" data-tab="defect-types">
          Hata Tipleri
        </button>
      </div>

      <div id="tab-content">
        <div class="loading">Yükleniyor...</div>
      </div>
    `;

    root.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        activeTab = btn.dataset.tab;
        await render();
      });
    });

    const tabContent = root.querySelector('#tab-content');
    if (activeTab === 'projects') {
      await renderProjectsTab(tabContent);
    } else {
      await renderDefectTypesTab(tabContent);
    }
  }

  await render();
}

// ── Projects Tab ─────────────────────────────────────────────
async function renderProjectsTab(container) {
  const projects = await api.projects.list();

  const rows = projects.map((p) => `
    <tr>
      <td class="col-id">#${p.id}</td>
      <td>${p.name}</td>
      <td>${p.customer || '—'}</td>
      <td class="text-secondary">${p.description || '—'}</td>
      <td class="col-actions">
        <button class="btn btn-ghost btn-xs edit-project-btn" data-id="${p.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs delete-project-btn" data-id="${p.id}">Sil</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Projeler (${projects.length})</span>
        <button class="btn btn-primary btn-sm" id="add-project-btn">+ Proje Ekle</button>
      </div>
      <div class="table-wrapper">
        ${
          projects.length === 0
            ? '<div class="empty">Proje bulunamadı.</div>'
            : `<table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Ad</th>
                    <th>Müşteri</th>
                    <th>Açıklama</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
        }
      </div>
    </div>
  `;

  container.querySelector('#add-project-btn').addEventListener('click', () => {
    openProjectModal(null, () => renderProjectsTab(container));
  });

  container.querySelectorAll('.edit-project-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const proj = projects.find((p) => p.id === id);
      openProjectModal(proj, () => renderProjectsTab(container));
    });
  });

  container.querySelectorAll('.delete-project-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!confirm(`Proje #${id} silinsin mi?`)) return;
      try {
        await api.projects.delete(id);
        window.toast('Proje silindi.', 'success');
        await renderProjectsTab(container);
      } catch (err) {
        window.toast('Silme hatası: ' + err.message, 'error');
      }
    });
  });
}

function openProjectModal(existing, onDone) {
  const isEdit = existing !== null && existing !== undefined;
  const v = existing || {};
  const title = isEdit ? `Proje Düzenle #${v.id}` : 'Yeni Proje';

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <form id="project-form" novalidate>
        <div class="form-grid">
          <div class="form-group form-group-full">
            <label>Proje Adı *</label>
            <input type="text" class="form-input" name="name"
              value="${v.name || ''}" placeholder="Proje adı..." required />
          </div>
          <div class="form-group">
            <label>Müşteri</label>
            <input type="text" class="form-input" name="customer"
              value="${v.customer || ''}" placeholder="Müşteri adı..." />
          </div>
          <div class="form-group form-group-full">
            <label>Açıklama</label>
            <textarea class="form-textarea" name="description" rows="3"
              placeholder="Proje açıklaması...">${v.description || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel-btn">İptal</button>
          <button type="submit" class="btn btn-primary" id="proj-submit-btn">
            ${isEdit ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </form>
    </div>
  `;

  window.modal.open(html);
  document.getElementById('modal-close-btn').addEventListener('click', () => window.modal.close());
  document.getElementById('modal-cancel-btn').addEventListener('click', () => window.modal.close());

  document.getElementById('project-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('proj-submit-btn');
    submitBtn.disabled = true;
    const fd = new FormData(e.target);
    const data = {
      name:        fd.get('name') || '',
      customer:    fd.get('customer') || null,
      description: fd.get('description') || null,
    };
    if (!data.name.trim()) {
      window.toast('Proje adı zorunludur.', 'error');
      submitBtn.disabled = false;
      return;
    }
    try {
      if (isEdit) {
        await api.projects.update(v.id, data);
        window.toast('Proje güncellendi.', 'success');
      } else {
        await api.projects.create(data);
        window.toast('Proje oluşturuldu.', 'success');
      }
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Hata: ' + err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}

// ── Defect Types Tab ──────────────────────────────────────────
async function renderDefectTypesTab(container) {
  const defectTypes = await api.defectTypes.list();

  const rows = defectTypes.map((dt) => `
    <tr>
      <td class="col-id">#${dt.id}</td>
      <td>${dt.name}</td>
      <td class="text-secondary">${dt.description || '—'}</td>
      <td class="col-actions">
        <button class="btn btn-ghost btn-xs edit-dt-btn" data-id="${dt.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs delete-dt-btn" data-id="${dt.id}">Sil</button>
      </td>
    </tr>
  `).join('');

  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <span class="card-title">Hata Tipleri (${defectTypes.length})</span>
        <button class="btn btn-primary btn-sm" id="add-dt-btn">+ Hata Tipi Ekle</button>
      </div>
      <div class="table-wrapper">
        ${
          defectTypes.length === 0
            ? '<div class="empty">Hata tipi bulunamadı.</div>'
            : `<table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Ad</th>
                    <th>Açıklama</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${rows}</tbody>
              </table>`
        }
      </div>
    </div>
  `;

  container.querySelector('#add-dt-btn').addEventListener('click', () => {
    openDefectTypeModal(null, () => renderDefectTypesTab(container));
  });

  container.querySelectorAll('.edit-dt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const dt = defectTypes.find((d) => d.id === id);
      openDefectTypeModal(dt, () => renderDefectTypesTab(container));
    });
  });

  container.querySelectorAll('.delete-dt-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      if (!confirm(`Hata tipi #${id} silinsin mi?`)) return;
      try {
        await api.defectTypes.delete(id);
        window.toast('Hata tipi silindi.', 'success');
        await renderDefectTypesTab(container);
      } catch (err) {
        window.toast('Silme hatası: ' + err.message, 'error');
      }
    });
  });
}

function openDefectTypeModal(existing, onDone) {
  const isEdit = existing !== null && existing !== undefined;
  const v = existing || {};
  const title = isEdit ? `Hata Tipi Düzenle #${v.id}` : 'Yeni Hata Tipi';

  const html = `
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">${title}</span>
        <button class="modal-close" id="modal-close-btn">&times;</button>
      </div>
      <form id="dt-form" novalidate>
        <div class="form-grid">
          <div class="form-group form-group-full">
            <label>Hata Tipi Adı *</label>
            <input type="text" class="form-input" name="name"
              value="${v.name || ''}" placeholder="Hata tipi adı..." required />
          </div>
          <div class="form-group form-group-full">
            <label>Açıklama</label>
            <textarea class="form-textarea" name="description" rows="3"
              placeholder="Hata tipi açıklaması...">${v.description || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="modal-cancel-btn">İptal</button>
          <button type="submit" class="btn btn-primary" id="dt-submit-btn">
            ${isEdit ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </form>
    </div>
  `;

  window.modal.open(html);
  document.getElementById('modal-close-btn').addEventListener('click', () => window.modal.close());
  document.getElementById('modal-cancel-btn').addEventListener('click', () => window.modal.close());

  document.getElementById('dt-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = document.getElementById('dt-submit-btn');
    submitBtn.disabled = true;
    const fd = new FormData(e.target);
    const data = {
      name:        fd.get('name') || '',
      description: fd.get('description') || null,
    };
    if (!data.name.trim()) {
      window.toast('Hata tipi adı zorunludur.', 'error');
      submitBtn.disabled = false;
      return;
    }
    try {
      if (isEdit) {
        await api.defectTypes.update(v.id, data);
        window.toast('Hata tipi güncellendi.', 'success');
      } else {
        await api.defectTypes.create(data);
        window.toast('Hata tipi oluşturuldu.', 'success');
      }
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Hata: ' + err.message, 'error');
      submitBtn.disabled = false;
    }
  });
}
