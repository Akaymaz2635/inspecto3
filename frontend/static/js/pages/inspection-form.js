import { api } from '../api.js';

export async function inspectionFormPage(id) {
  const root = document.getElementById('page-root');
  root.innerHTML = '<div class="loading">Yükleniyor...</div>';

  const isEdit = id !== null;
  const [projects, inspection] = await Promise.all([
    api.projects.list(),
    isEdit ? api.inspections.get(id) : Promise.resolve(null),
  ]);

  if (isEdit && !inspection) {
    root.innerHTML = '<div class="empty text-danger">Muayene bulunamadı.</div>';
    return;
  }

  const v = inspection || {};
  const title = isEdit ? `Muayene Düzenle #${id}` : 'Yeni Muayene';

  const projectOptions = projects.map((p) =>
    `<option value="${p.id}" ${v.project_id == p.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');

  const statusOptions = ['open', 'completed', 'rejected'].map((s) => {
    const labels = { open: 'Açık', completed: 'Tamamlandı', rejected: 'Reddedildi' };
    return `<option value="${s}" ${v.status === s ? 'selected' : ''}>${labels[s]}</option>`;
  }).join('');

  root.innerHTML = `
    <a href="${isEdit ? `#/inspections/${id}` : '#/inspections'}" class="back-link">&#8592; Geri</a>

    <div class="page-header">
      <h1>${title}</h1>
    </div>

    <div class="card">
      <form id="insp-form" novalidate>
        <div class="form-grid">
          <div class="form-group">
            <label for="project_id">Proje</label>
            <select class="form-select" id="project_id" name="project_id">
              <option value="">— Seçiniz —</option>
              ${projectOptions}
            </select>
          </div>

          <div class="form-group">
            <label for="part_number">Parça Numarası</label>
            <input type="text" class="form-input" id="part_number" name="part_number"
              value="${v.part_number || ''}" placeholder="ÖRN: PN-12345" />
          </div>

          <div class="form-group">
            <label for="serial_number">Seri Numarası</label>
            <input type="text" class="form-input" id="serial_number" name="serial_number"
              value="${v.serial_number || ''}" placeholder="ÖRN: SN-00987" />
          </div>

          <div class="form-group">
            <label for="operation_number">Operasyon Numarası</label>
            <input type="text" class="form-input" id="operation_number" name="operation_number"
              value="${v.operation_number || ''}" placeholder="ÖRN: OP-010" />
          </div>

          <div class="form-group">
            <label for="inspector">Muayeneci</label>
            <input type="text" class="form-input" id="inspector" name="inspector"
              value="${v.inspector || ''}" placeholder="Ad Soyad" />
          </div>

          <div class="form-group">
            <label for="status">Durum</label>
            <select class="form-select" id="status" name="status">
              ${statusOptions}
            </select>
          </div>

          <div class="form-group-full form-group">
            <label for="notes">Notlar</label>
            <textarea class="form-textarea" id="notes" name="notes" rows="4"
              placeholder="Muayene ile ilgili notlar...">${v.notes || ''}</textarea>
          </div>
        </div>

        <div class="form-actions">
          <a href="${isEdit ? `#/inspections/${id}` : '#/inspections'}" class="btn btn-ghost">İptal</a>
          <button type="submit" class="btn btn-primary" id="submit-btn">
            ${isEdit ? 'Kaydet' : 'Oluştur'}
          </button>
        </div>
      </form>
    </div>
  `;

  const form = root.querySelector('#insp-form');
  const submitBtn = root.querySelector('#submit-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submitBtn.disabled = true;
    submitBtn.textContent = 'Kaydediliyor...';

    const fd = new FormData(form);
    const data = {
      project_id:       fd.get('project_id')       ? Number(fd.get('project_id')) : null,
      part_number:      fd.get('part_number')       || null,
      serial_number:    fd.get('serial_number')     || null,
      operation_number: fd.get('operation_number')  || null,
      inspector:        fd.get('inspector')          || null,
      status:           fd.get('status')             || 'open',
      notes:            fd.get('notes')              || null,
    };

    try {
      if (isEdit) {
        await api.inspections.update(id, data);
        window.toast('Muayene güncellendi.', 'success');
        window.navigate(`/inspections/${id}`);
      } else {
        const created = await api.inspections.create(data);
        window.toast('Muayene oluşturuldu.', 'success');
        window.navigate(`/inspections/${created.id}`);
      }
    } catch (err) {
      window.toast('Hata: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = isEdit ? 'Kaydet' : 'Oluştur';
    }
  });
}
