import { api }        from '../api.js';
import { Camera }     from '../camera.js';
import { Annotator }  from '../annotator.js';
import { session }    from '../session.js';

// ── Disposition helpers ───────────────────────────────────────────────────────
const DECISION_META = {
  USE_AS_IS:     { label: 'Kabul (Spec)',           cls: 'disp-accepted'      },
  KABUL_RESIM:   { label: 'Kabul (Resim)',          cls: 'disp-accepted'      },
  CONFORMS:      { label: 'Uygun (Inspector)',      cls: 'disp-conforms'      },
  REWORK:          { label: 'Rework',                              cls: 'disp-rework'        },
  RE_INSPECT:      { label: 'Yeniden İnceleme',                   cls: 'disp-re-inspect'    },
  CTP_RE_INSPECT:  { label: 'CTP — Sonraki Op. Yeniden İnceleme', cls: 'disp-mrb-ctp'       },
  MRB_SUBMITTED:   { label: 'MRB Gönderildi',                     cls: 'disp-mrb-submitted' },
  MRB_CTP:       { label: 'CTP — MRB (Devam)',     cls: 'disp-mrb-ctp'       },
  MRB_ACCEPTED:  { label: 'MRB Kabul',             cls: 'disp-mrb-accepted'  },
  MRB_REJECTED:  { label: 'MRB Ret',               cls: 'disp-mrb-rejected'  },
  VOID:          { label: 'Void',                   cls: 'disp-void'          },
  REPAIR:        { label: 'Repair',                 cls: 'disp-repair'        },
  SCRAP:         { label: 'Scrap',                  cls: 'disp-scrap'         },
};

const NEUTRALIZED = new Set(['USE_AS_IS', 'KABUL_RESIM', 'CONFORMS', 'MRB_ACCEPTED', 'MRB_REJECTED', 'VOID', 'REPAIR', 'SCRAP']);

// CTP_MRB is an initial decision: part continues but MRB closure still required
const FULL_DECISIONS = ['USE_AS_IS','KABUL_RESIM','REWORK','RE_INSPECT','CTP_RE_INSPECT','MRB_SUBMITTED','MRB_CTP','VOID','REPAIR','SCRAP'];

function allowedNextDecisions(currentDecision) {
  if (!currentDecision)                       return FULL_DECISIONS;
  if (currentDecision === 'REWORK')           return ['RE_INSPECT', 'CTP_RE_INSPECT'];
  if (currentDecision === 'RE_INSPECT')       return ['CONFORMS', ...FULL_DECISIONS];
  if (currentDecision === 'CTP_RE_INSPECT')   return ['CONFORMS', ...FULL_DECISIONS];
  if (currentDecision === 'MRB_SUBMITTED')    return ['MRB_CTP', 'MRB_ACCEPTED', 'MRB_REJECTED'];
  if (currentDecision === 'MRB_CTP')          return ['MRB_ACCEPTED', 'MRB_REJECTED'];
  return [];
}

// ── Pre/Post rework ölçüm karşılaştırma tablosu ───────────────────────────
const MEASURE_FIELDS = [
  ['depth',  'Derinlik', 'mm'],
  ['width',  'Genişlik', 'mm'],
  ['length', 'Uzunluk',  'mm'],
  ['radius', 'Yarıçap',  'mm'],
  ['angle',  'Açı',      '°' ],
  ['color',  'Renk',     ''  ],
];

function renderMeasurementComparison(defect) {
  const reworkDisp = [...(defect.dispositions || [])]
    .reverse()
    .find(d => d.decision === 'REWORK' && d.measurements_snapshot);
  if (!reworkDisp) return '';

  let pre;
  try { pre = JSON.parse(reworkDisp.measurements_snapshot); } catch { return ''; }

  const rows = MEASURE_FIELDS.map(([key, label, unit]) => {
    const preVal  = pre[key];
    const postVal = defect[key];
    if (preVal == null && postVal == null) return '';

    const fmt = (v) => v == null ? '—'
      : unit === 'mm' ? Number(v).toFixed(2) + ' mm'
      : unit === '°'  ? v + '°'
      : String(v);

    let diffHtml = '';
    if (unit === 'mm' && preVal != null && postVal != null) {
      const d = postVal - preVal;
      const cls = d < 0 ? 'diff-down' : d > 0 ? 'diff-up' : 'diff-none';
      diffHtml = `<span class="${cls}">${d < 0 ? '▼' : d > 0 ? '▲' : '='} ${Math.abs(d).toFixed(2)} mm</span>`;
    } else if (preVal !== postVal) {
      diffHtml = '<span class="diff-changed">Değişti</span>';
    } else {
      diffHtml = '<span class="diff-none">—</span>';
    }

    return `<tr><td>${label}</td><td>${fmt(preVal)}</td><td>${fmt(postVal)}</td><td>${diffHtml}</td></tr>`;
  }).filter(Boolean).join('');

  if (!rows) return '';
  return `
    <div class="rework-comparison">
      <div class="rework-comparison-title">📊 Pre / Post Rework Ölçüm Karşılaştırması</div>
      <table class="comparison-table">
        <thead><tr><th>Ölçüm</th><th>Pre-Rework</th><th>Post-Rework</th><th>Fark</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function dispositionBadge(disp) {
  if (!disp) return '<span class="disp-badge disp-pending">Bekliyor</span>';
  const m = DECISION_META[disp.decision] || { label: disp.decision, cls: '' };
  return `<span class="disp-badge ${m.cls}" title="${disp.note}">${m.label}</span>`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function statusBadge(status) {
  const map    = { open: 'badge-open', completed: 'badge-completed', rejected: 'badge-rejected' };
  const labels = { open: 'Açık', completed: 'Tamamlandı', rejected: 'Reddedildi' };
  return `<span class="badge ${map[status] || ''}">${labels[status] || status}</span>`;
}
function fmt(v)         { return (v === null || v === undefined) ? '—' : String(v); }
function fmtMM(v)       { return (v === null || v === undefined) ? '—' : Number(v).toFixed(2) + ' mm'; }
function fmtDate(s)     { try { return new Date(s).toLocaleString('tr-TR'); } catch { return s || '—'; } }

// Defect checkboxes — many-to-many selection
function defectCheckboxes(defects, selectedIds = []) {
  if (!defects.length) return '<p class="text-secondary" style="font-size:13px;">Henüz hata kaydı yok.</p>';
  const sel = new Set(selectedIds.map(Number));
  return `<div class="defect-checklist">
    ${defects.map(d => `
      <label class="defect-check-item">
        <input type="checkbox" name="defect_ids" value="${d.id}"
               ${sel.has(d.id) ? 'checked' : ''} />
        <span>#${d.id} · ${d.defect_type_name || 'Hata'}</span>
      </label>`).join('')}
  </div>`;
}

// Collect checked defect IDs from a container element by id
function getCheckedDefectIds(containerId) {
  return Array.from(
    document.querySelectorAll(`#${containerId} input[name="defect_ids"]:checked`)
  ).map(el => Number(el.value));
}

// ── Ana sayfa ────────────────────────────────────────────────────────────────
export async function inspectionDetailPage(id) {
  const root = document.getElementById('page-root');
  root.innerHTML = '<div class="loading">Yükleniyor...</div>';
  await render(id, root);
}

async function render(id, root) {
  const [detail, defectTypes, allPhotos] = await Promise.all([
    api.inspections.get(id),
    api.defectTypes.list(),
    api.photos.list({ inspection_id: id }),
  ]);

  if (!detail) {
    root.innerHTML = '<div class="empty text-danger">Muayene bulunamadı.</div>';
    return;
  }

  const dtMap = Object.fromEntries(defectTypes.map(d => [d.id, d]));

  // Many-to-many grouping: a photo can appear in multiple defect buckets
  const photoByDefect = {};
  for (const p of allPhotos) {
    if (!p.defect_ids || p.defect_ids.length === 0) {
      (photoByDefect['general'] ??= []).push(p);
    } else {
      for (const did of p.defect_ids) {
        (photoByDefect[did] ??= []).push(p);
      }
    }
  }
  const generalPhotos = photoByDefect['general'] || [];

  // ── Hata satırları ──────────────────────────────────────────
  const defectRows = detail.defects.map((d) => {
    const dPhotos  = photoByDefect[d.id] || [];
    const decision = d.active_disposition?.decision || null;
    const isNeutralized = NEUTRALIZED.has(decision);

    const thumbs = dPhotos.slice(0, 4).map(p =>
      `<div class="thumb-wrap">
         <img class="thumb" src="${api.photos.fileUrl(p.id)}" title="Fotoğraf #${p.id}"
              onclick="window.open('${api.photos.fileUrl(p.id)}','_blank')" />
         <div class="thumb-btns">
           <button class="thumb-ann-btn" data-pid="${p.id}"
                   data-defects='${JSON.stringify(p.defect_ids || [])}' title="Düzenle">✏</button>
           <button class="thumb-del-btn" data-pid="${p.id}" title="Sil">✕</button>
         </div>
       </div>`
    ).join('');
    const more = dPhotos.length > 4
      ? `<span class="thumb-more">+${dPhotos.length - 4}</span>` : '';

    // Action buttons based on disposition state
    let dispActions = '';
    if (decision === 'RE_INSPECT') {
      dispActions = `
        <button class="btn btn-ghost btn-xs disp-btn" data-id="${d.id}" title="Karar ver">⚖ Karar</button>
        <button class="btn btn-primary btn-xs rework-child-btn" data-id="${d.id}"
                title="Yeniden işleme sonucu yeni hata ekle">+ Yeniden İşleme Hatası</button>`;
    } else if (!isNeutralized) {
      const label = decision === 'REWORK' ? '↩ Yeniden İncele' : '⚖ Karar';
      dispActions = `<button class="btn btn-ghost btn-xs disp-btn" data-id="${d.id}"
              title="Disposition gir / güncelle">${label}</button>`;
      // CTP_RE_INSPECT aktifken de "Yeniden İşleme Hatası" eklenebilir
      if (decision === 'CTP_RE_INSPECT') {
        dispActions += ` <button class="btn btn-primary btn-xs rework-child-btn" data-id="${d.id}"
                title="Sonraki operasyonda tespit edilen yeni hata ekle">+ CTP Hatası</button>`;
      }
    }

    // Sub-row for lineage info
    const subParts = [];
    if (d.origin_defect_id) {
      subParts.push(`<span class="origin-label">↳ Yeniden işleme sonucu (Hata #${d.origin_defect_id})</span>`);
    }
    if (d.child_defect_ids?.length > 0) {
      const ids = d.child_defect_ids.map(cid => `#${cid}`).join(', ');
      subParts.push(`<span class="child-label">⚠ Yeniden işleme: ${d.child_defect_ids.length} yeni hata (${ids})</span>`);
    }
    const comparison = renderMeasurementComparison(d);
    const subContent = [
      subParts.length ? subParts.join(' &nbsp;·&nbsp; ') : '',
      comparison,
    ].filter(Boolean).join('');
    const subRow = subContent
      ? `<tr class="defect-sub-row"><td colspan="11">${subContent}</td></tr>`
      : '';

    return `<tr>
      <td class="col-id">#${d.id}</td>
      <td>${d.defect_type_name || dtMap[d.defect_type_id]?.name || '—'}</td>
      <td>${fmtMM(d.depth)}</td>
      <td>${fmtMM(d.width)}</td>
      <td>${fmtMM(d.length)}</td>
      <td>${fmtMM(d.radius)}</td>
      <td>${d.angle != null ? d.angle + '°' : '—'}</td>
      <td>${d.color || '—'}</td>
      <td class="thumb-cell">${thumbs}${more}
        <button class="btn btn-ghost btn-xs add-photo-to-defect"
                data-defect-id="${d.id}"
                title="Bu hataya fotoğraf ekle">+📷</button>
      </td>
      <td>
        ${dispositionBadge(d.active_disposition)}
        ${d.active_disposition ? `<button class="btn btn-ghost btn-xs disp-undo-btn" data-disp-id="${d.active_disposition.id}" title="Bu kararı geri al ve yeniden gir">✕ Düzelt</button>` : ''}
        ${dispActions}
      </td>
      <td class="col-actions">
        <button class="btn btn-ghost btn-xs edit-defect-btn"   data-id="${d.id}">Düzenle</button>
        <button class="btn btn-danger btn-xs delete-defect-btn" data-id="${d.id}">Sil</button>
      </td>
    </tr>${subRow}`;
  }).join('');

  // ── Genel fotoğraf kartları ──────────────────────────────────
  function photoCard(p) {
    const defectBadges = (p.defect_ids || []).map(did =>
      `<span class="badge-defect">#${did}</span>`
    ).join('');
    return `<div class="photo-card">
      <img src="${api.photos.fileUrl(p.id)}" alt="Fotoğraf #${p.id}"
           loading="lazy"
           onclick="window.open('${api.photos.fileUrl(p.id)}','_blank')" />
      <div class="photo-info">
        <div>${defectBadges}</div>
        <span class="photo-info-date">${fmtDate(p.created_at).split(' ')[0]}</span>
        <div class="photo-actions">
          <button class="photo-annotate-btn" data-id="${p.id}"
                  data-defects='${JSON.stringify(p.defect_ids || [])}' title="Fotoğrafı Düzenle">✏</button>
          <button class="photo-delete-btn"   data-id="${p.id}" title="Sil">✕</button>
        </div>
      </div>
    </div>`;
  }

  // ── HTML ─────────────────────────────────────────────────────
  root.innerHTML = `
    <a href="#/inspections" class="back-link">← Muayeneler</a>

    <div class="page-header">
      <h1>Muayene #${id} ${statusBadge(detail.status)}</h1>
      <div class="page-header-actions">
        <select class="status-select" id="status-quick-change">
          <option value="open"      ${detail.status==='open'      ?'selected':''}>Açık</option>
          <option value="completed" ${detail.status==='completed' ?'selected':''}>Tamamlandı</option>
          <option value="rejected"  ${detail.status==='rejected'  ?'selected':''}>Reddedildi</option>
        </select>
        <div class="dropdown" id="report-dropdown">
          <button class="btn btn-ghost btn-sm" id="report-dropdown-btn">Rapor ▾</button>
          <div class="dropdown-menu" id="report-dropdown-menu">
            <button class="dropdown-item" id="report-portrait-btn">A4 Dikey (Özet + Hatalar)</button>
            <button class="dropdown-item" id="report-landscape-btn">A4 Yatay (Hata başına sayfa)</button>
          </div>
        </div>
        <a href="#/inspections/${id}/edit" class="btn btn-ghost btn-sm">Düzenle</a>
        <button class="btn btn-danger btn-sm" id="delete-insp-btn">Sil</button>
      </div>
    </div>

    <!-- Bilgi kartı -->
    <div class="card">
      <div class="card-header"><span class="card-title">Muayene Bilgileri</span></div>
      <div class="info-grid">
        ${[
          ['Proje',           detail.project_name],
          ['Parça Numarası',  detail.part_number],
          ['Seri Numarası',   detail.serial_number],
          ['Operasyon No',    detail.operation_number],
          ['Muayeneci',       detail.inspector],
          ['Tarih',           detail.date],
          ['Oluşturulma',     fmtDate(detail.created_at)],
        ].map(([l, v]) => `
          <div class="info-item">
            <span class="info-label">${l}</span>
            <span class="info-value">${fmt(v)}</span>
          </div>`).join('')}
        ${detail.notes ? `
          <div class="info-item" style="grid-column:1/-1">
            <span class="info-label">Notlar</span>
            <span class="info-value">${detail.notes}</span>
          </div>` : ''}
      </div>
    </div>

    <!-- Hata kayıtları -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">Hata Kayıtları (${detail.defects.length})</span>
        <button class="btn btn-primary btn-sm" id="add-defect-btn">+ Hata Ekle</button>
      </div>
      <div class="table-wrapper">
        ${detail.defects.length === 0
          ? '<div class="empty">Kayıtlı hata bulunmuyor.</div>'
          : `<table class="data-table">
              <thead><tr>
                <th>ID</th><th>Hata Tipi</th><th>Derinlik</th><th>Genişlik</th>
                <th>Uzunluk</th><th>Yarıçap</th><th>Açı</th><th>Renk</th>
                <th>Fotoğraflar</th><th>Karar</th><th></th>
              </tr></thead>
              <tbody>${defectRows}</tbody>
            </table>`}
      </div>
    </div>

    <!-- Genel fotoğraflar -->
    <div class="card">
      <div class="card-header">
        <span class="card-title">
          Genel Fotoğraflar (${generalPhotos.length})
          <span class="text-secondary" style="font-size:12px;font-weight:400;">
            — Belirli bir hatayla ilişkilendirilmemiş
          </span>
        </span>
        <div class="d-flex gap-10 align-center">
          <button class="btn btn-primary btn-sm" id="open-camera-btn">📷 Kamera</button>
          <label class="btn btn-ghost btn-sm" for="photo-upload-input">📁 Dosya Yükle</label>
          <input type="file" id="photo-upload-input" class="file-input-hidden" accept="image/*" multiple />
        </div>
      </div>
      ${generalPhotos.length === 0
        ? '<div class="empty">Genel fotoğraf bulunmuyor.</div>'
        : `<div class="photo-grid">${generalPhotos.map(photoCard).join('')}</div>`}
    </div>
  `;

  // ── Event listeners ───────────────────────────────────────────

  // Rapor dropdown
  const reportDropBtn  = root.querySelector('#report-dropdown-btn');
  const reportDropMenu = root.querySelector('#report-dropdown-menu');
  reportDropBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    reportDropMenu.classList.toggle('open');
  });
  document.addEventListener('click', () => reportDropMenu.classList.remove('open'), { once: false });
  root.querySelector('#report-portrait-btn').addEventListener('click', () => {
    window.open(`/report?id=${id}&type=portrait`, '_blank');
  });
  root.querySelector('#report-landscape-btn').addEventListener('click', () => {
    window.open(`/report?id=${id}&type=landscape`, '_blank');
  });

  // Durum değiştir
  root.querySelector('#status-quick-change').addEventListener('change', async (e) => {
    try {
      await api.inspections.update(id, { status: e.target.value });
      window.toast('Durum güncellendi.', 'success');
      await render(id, root);
    } catch (err) { window.toast('Hata: ' + err.message, 'error'); }
  });

  // Muayene sil
  root.querySelector('#delete-insp-btn').addEventListener('click', async () => {
    if (!confirm(`Muayene #${id} silinecek. Emin misiniz?`)) return;
    try {
      await api.inspections.delete(id);
      window.toast('Muayene silindi.', 'success');
      window.navigate('/inspections');
    } catch (err) { window.toast('Silme hatası: ' + err.message, 'error'); }
  });

  // Hata ekle
  root.querySelector('#add-defect-btn').addEventListener('click', () => {
    openDefectModal(id, null, defectTypes, () => render(id, root));
  });

  // Hata düzenle / sil
  root.querySelectorAll('.edit-defect-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const defect = detail.defects.find(d => d.id === Number(btn.dataset.id));
      openDefectModal(id, defect, defectTypes, () => render(id, root));
    })
  );
  root.querySelectorAll('.delete-defect-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const did = Number(btn.dataset.id);
      if (!confirm(`Hata #${did} silinecek. Emin misiniz?`)) return;
      try {
        await api.defects.delete(did);
        window.toast('Hata silindi.', 'success');
        await render(id, root);
      } catch (err) { window.toast('Silme hatası: ' + err.message, 'error'); }
    })
  );

  // Disposition düzelt (son kararı sil, yeniden gir)
  root.querySelectorAll('.disp-undo-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const dispId = Number(btn.dataset.dispId);
      if (!confirm('Bu karar geri alınacak ve yeniden girilebilecek. Emin misiniz?')) return;
      try {
        await api.dispositions.delete(dispId);
        window.toast('Karar geri alındı.', 'success');
        await render(id, root);
      } catch (err) { window.toast('Hata: ' + err.message, 'error'); }
    })
  );

  // Disposition
  root.querySelectorAll('.disp-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const defect = detail.defects.find(d => d.id === Number(btn.dataset.id));
      if (defect.active_disposition?.decision === 'REWORK') {
        // 2-adımlı akış: önce post-rework ölçüm güncelleme, sonra RE_INSPECT kararı
        openDefectModal(id, defect, defectTypes, async () => {
          const updated = await api.defects.get(defect.id);
          openDispositionModal(updated, () => render(id, root));
        }, null, true);
      } else {
        openDispositionModal(defect, () => render(id, root));
      }
    })
  );

  // Yeniden işleme sonucu yeni hata ekle
  root.querySelectorAll('.rework-child-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const originId = Number(btn.dataset.id);
      openDefectModal(id, null, defectTypes, () => render(id, root), originId);
    })
  );

  // Hataya fotoğraf ekle (+📷 butonları)
  root.querySelectorAll('.add-photo-to-defect').forEach(btn =>
    btn.addEventListener('click', () => {
      const defectId = Number(btn.dataset.defectId);
      openPhotoSourceModal(defectId, id, detail.defects, () => render(id, root));
    })
  );

  // Hata thumb'u — düzenle
  root.querySelectorAll('.thumb-ann-btn').forEach(btn =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = Number(btn.dataset.pid);
      const preselectedDefectIds = JSON.parse(btn.dataset.defects || '[]');
      openAnnotatorModal(pid, id, preselectedDefectIds, detail.defects, () => render(id, root));
    })
  );

  // Hata thumb'u — sil
  root.querySelectorAll('.thumb-del-btn').forEach(btn =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pid = Number(btn.dataset.pid);
      if (!confirm('Fotoğraf silinsin mi?')) return;
      try {
        await api.photos.delete(pid);
        window.toast('Fotoğraf silindi.', 'success');
        await render(id, root);
      } catch (err) { window.toast('Silme hatası: ' + err.message, 'error'); }
    })
  );

  // Genel dosya yükleme — hata seç modal açılır
  root.querySelector('#photo-upload-input').addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = '';
    openUploadModal(id, [], detail.defects, () => render(id, root), files);
  });

  // Kamera
  root.querySelector('#open-camera-btn').addEventListener('click', () => {
    openCameraModal(id, detail.defects, () => render(id, root));
  });

  // Fotoğraf düzenle (annotator)
  root.querySelectorAll('.photo-annotate-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      const pid = Number(btn.dataset.id);
      const preselectedDefectIds = JSON.parse(btn.dataset.defects || '[]');
      openAnnotatorModal(pid, id, preselectedDefectIds, detail.defects, () => render(id, root));
    })
  );

  // Fotoğraf sil
  root.querySelectorAll('.photo-delete-btn').forEach(btn =>
    btn.addEventListener('click', async () => {
      const pid = Number(btn.dataset.id);
      if (!confirm('Fotoğraf silinsin mi?')) return;
      try {
        await api.photos.delete(pid);
        window.toast('Fotoğraf silindi.', 'success');
        await render(id, root);
      } catch (err) { window.toast('Silme hatası: ' + err.message, 'error'); }
    })
  );
}

// ── Fotoğraf yükleme modal'ı (dosya seçimi veya önceden seçilmiş dosyalar) ──
function openUploadModal(inspectionId, preselectedDefectIds, defects, onDone, preFiles = null) {
  window.modal.open(`
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">📁 Fotoğraf Yükle</span>
        <button class="modal-close" id="upl-close">&times;</button>
      </div>

      <div class="form-group" style="margin-bottom:16px;" id="upl-defect-group">
        <label>Hangi hatalarla ilişkilendir?</label>
        ${defectCheckboxes(defects, preselectedDefectIds)}
      </div>

      <div class="form-group" id="upl-file-group" ${preFiles ? 'style="display:none"' : ''}>
        <label>Fotoğraf Seç</label>
        <input type="file" id="upl-file-input" class="form-input"
               accept="image/*" multiple />
      </div>

      <div id="upl-preview" class="upl-preview"></div>

      <div class="form-actions" style="margin-top:16px;">
        <button class="btn btn-ghost"   id="upl-cancel">İptal</button>
        <button class="btn btn-primary" id="upl-submit" ${preFiles ? '' : 'disabled'}>
          Yükle
        </button>
      </div>
    </div>
  `);

  let filesToUpload = preFiles || [];

  // Önceden seçilmiş dosyalar varsa önizleme göster
  if (preFiles) renderPreview(preFiles);

  document.getElementById('upl-close').addEventListener('click', () => window.modal.close());
  document.getElementById('upl-cancel').addEventListener('click', () => window.modal.close());

  document.getElementById('upl-file-input')?.addEventListener('change', (e) => {
    filesToUpload = Array.from(e.target.files);
    document.getElementById('upl-submit').disabled = filesToUpload.length === 0;
    renderPreview(filesToUpload);
  });

  document.getElementById('upl-submit').addEventListener('click', async () => {
    if (!filesToUpload.length) return;
    const defect_ids = getCheckedDefectIds('upl-defect-group');
    const btn = document.getElementById('upl-submit');
    btn.disabled = true;
    btn.textContent = 'Yükleniyor...';
    try {
      for (const file of filesToUpload) {
        await api.photos.upload(inspectionId, file, defect_ids);
      }
      window.toast(`${filesToUpload.length} fotoğraf yüklendi.`, 'success');
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Yükleme hatası: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Yükle';
    }
  });

  function renderPreview(files) {
    const el = document.getElementById('upl-preview');
    el.innerHTML = files.map(f =>
      `<div class="upl-thumb-item">
        <img src="${URL.createObjectURL(f)}" class="upl-thumb" />
        <span class="text-secondary" style="font-size:11px;">${f.name}</span>
       </div>`
    ).join('');
  }
}

// ── Fotoğraf kaynak seçici (defect satırındaki +📷 butonu) ───────────────────
function openPhotoSourceModal(defectId, inspectionId, defects, onDone) {
  window.modal.open(`
    <div class="modal-card" style="max-width:340px;">
      <div class="modal-header">
        <span class="modal-title">📷 Fotoğraf Ekle — Hata #${defectId}</span>
        <button class="modal-close" id="src-close">&times;</button>
      </div>
      <p class="text-secondary" style="font-size:13px;margin:12px 0 20px;">
        Fotoğraf kaynağını seçin:
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <button class="btn btn-primary" id="src-camera">
          📷 &nbsp;Kamera ile Çek
        </button>
        <button class="btn btn-ghost" id="src-file">
          📁 &nbsp;Dosya Yükle
        </button>
      </div>
    </div>
  `);

  document.getElementById('src-close').addEventListener('click', () => window.modal.close());

  document.getElementById('src-camera').addEventListener('click', () => {
    window.modal.close();
    // Small delay so the previous modal fully tears down before opening the next
    setTimeout(() => openCameraModal(inspectionId, defects, onDone, [defectId]), 80);
  });

  document.getElementById('src-file').addEventListener('click', () => {
    window.modal.close();
    setTimeout(() => openUploadModal(inspectionId, [defectId], defects, onDone), 80);
  });
}

// ── Kamera modal'ı ───────────────────────────────────────────────────────────
function openCameraModal(inspectionId, defects, onDone, preselectedIds = []) {
  let capturedBlob = null;
  const cam = new Camera();

  window.modal.open(`
    <div class="modal-card modal-camera">
      <div class="modal-header">
        <span class="modal-title">📷 Fotoğraf Çek</span>
        <button class="modal-close" id="cam-close">&times;</button>
      </div>
      <div id="camera-container"></div>

      <div id="cam-review" class="cam-review hidden">
        <img id="cam-review-img" style="width:100%;border-radius:8px;margin-top:12px;" />
        <div class="form-group" style="margin-top:12px;" id="cam-defect-group">
          <label>Hangi hatalarla ilişkilendir?</label>
          ${defectCheckboxes(defects, preselectedIds)}
        </div>
      </div>

      <div class="form-actions" style="margin-top:14px;">
        <button class="btn btn-ghost"   id="cam-cancel">Kapat</button>
        <button class="btn btn-ghost"   id="cam-retake"  style="display:none">↺ Tekrar Çek</button>
        <button class="btn btn-primary" id="cam-save"    style="display:none">💾 Kaydet</button>
      </div>
    </div>
  `, {
    wide: true,
    onClose: () => cam.close(),
  });

  cam.open(document.getElementById('camera-container'));

  cam.on('photo', (blob) => {
    capturedBlob = blob;
    const url = URL.createObjectURL(blob);
    document.getElementById('cam-review-img').src = url;
    document.getElementById('cam-review').classList.remove('hidden');
    document.getElementById('cam-retake').style.display = '';
    document.getElementById('cam-save').style.display   = '';
    document.getElementById('cam-cancel').style.display = 'none';
  });

  document.getElementById('cam-close').addEventListener('click', () => window.modal.close());
  document.getElementById('cam-cancel').addEventListener('click', () => window.modal.close());

  document.getElementById('cam-retake').addEventListener('click', () => {
    capturedBlob = null;
    document.getElementById('cam-review').classList.add('hidden');
    document.getElementById('cam-retake').style.display = 'none';
    document.getElementById('cam-save').style.display   = 'none';
    document.getElementById('cam-cancel').style.display = '';
  });

  document.getElementById('cam-save').addEventListener('click', async () => {
    if (!capturedBlob) return;
    const defect_ids = getCheckedDefectIds('cam-defect-group');
    // Sunucuya YÜKLEME YOK — blob doğrudan annotator'a gidiyor
    // Annotator'da "Kaydet" denince tek seferinde yüklenecek
    window.modal.close();
    await new Promise(r => setTimeout(r, 80));
    await openAnnotatorFromBlob(
      capturedBlob,
      inspectionId,
      defect_ids,
      defects,
      onDone
    );
  });
}

// ── Annotator — kamera blob'undan (henüz yüklenmemiş) ────────────────────────
// Kullanıcı "Kaydet" dediğinde TEK fotoğraf yüklenir.
async function openAnnotatorFromBlob(blob, inspectionId, defect_ids, defects, onDone) {
  const localUrl = URL.createObjectURL(blob);
  const ann = new Annotator();

  window.modal.open(`
    <div class="modal-card modal-annotator">
      <div class="modal-header">
        <span class="modal-title">✏ Fotoğrafı Düzenle</span>
        <button class="modal-close" id="ann-close">&times;</button>
      </div>
      <div id="ann-mount"></div>
      <div class="ann-footer">
        <div class="form-group" style="margin:0;min-width:220px;" id="ann-defect-group">
          <label style="font-size:12px;margin-bottom:4px;">Hata ile ilişkilendir</label>
          ${defectCheckboxes(defects, defect_ids)}
        </div>
        <div class="ann-footer-actions">
          <button class="btn btn-ghost btn-sm"   id="ann-cancel-btn">İptal (kaydetme)</button>
          <button class="btn btn-primary btn-sm" id="ann-save-btn">💾 Kaydet</button>
        </div>
      </div>
    </div>
  `, {
    wide: true,
    onClose: () => { ann.destroy(); URL.revokeObjectURL(localUrl); },
  });

  try {
    await ann.open(document.getElementById('ann-mount'), localUrl);
  } catch (err) {
    window.toast('Görüntü yüklenemedi: ' + err.message, 'error');
    window.modal.close();
    return;
  }

  document.getElementById('ann-close').addEventListener('click',      () => window.modal.close());
  document.getElementById('ann-cancel-btn').addEventListener('click', () => window.modal.close());

  document.getElementById('ann-save-btn').addEventListener('click', async () => {
    const btn        = document.getElementById('ann-save-btn');
    const checkedIds = getCheckedDefectIds('ann-defect-group');
    btn.disabled     = true;
    btn.textContent  = 'Kaydediliyor...';
    try {
      const label    = checkedIds.length ? checkedIds.map(id => `#${id}`).join(' ') : null;
      const exported = await ann.exportBlobWithLabel(label);
      const file     = new File([exported], `cam_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await api.photos.upload(inspectionId, file, checkedIds);
      window.toast('Fotoğraf kaydedildi.', 'success');
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Kayıt hatası: ' + err.message, 'error');
      btn.disabled    = false;
      btn.textContent = '💾 Kaydet';
    }
  });
}

// ── Annotator modal'ı — mevcut sunucu fotoğrafını düzenle ────────────────────
async function openAnnotatorModal(photoId, inspectionId, currentDefectIds, defects, onDone) {
  const imageUrl = api.photos.fileUrl(photoId);
  const ann = new Annotator();

  window.modal.open(`
    <div class="modal-card modal-annotator">
      <div class="modal-header">
        <span class="modal-title">✏ Fotoğraf Düzenle — #${photoId}</span>
        <button class="modal-close" id="ann-close">&times;</button>
      </div>
      <div id="ann-mount"></div>
      <div class="ann-footer">
        <div class="form-group" style="margin:0;min-width:220px;" id="ann-defect-group">
          <label style="font-size:12px;margin-bottom:4px;">Hata ile ilişkilendir</label>
          ${defectCheckboxes(defects, currentDefectIds)}
        </div>
        <div class="ann-footer-actions">
          <button class="btn btn-ghost btn-sm"   id="ann-cancel-btn">İptal</button>
          <button class="btn btn-primary btn-sm" id="ann-save-btn">💾 Kaydet</button>
        </div>
      </div>
    </div>
  `, { wide: true, onClose: () => ann.destroy() });

  try {
    await ann.open(document.getElementById('ann-mount'), imageUrl);
  } catch {
    window.toast('Fotoğraf yüklenemedi.', 'error');
    window.modal.close();
    return;
  }

  document.getElementById('ann-close').addEventListener('click',      () => window.modal.close());
  document.getElementById('ann-cancel-btn').addEventListener('click', () => window.modal.close());

  document.getElementById('ann-save-btn').addEventListener('click', async () => {
    const btn        = document.getElementById('ann-save-btn');
    const checkedIds = getCheckedDefectIds('ann-defect-group');
    btn.disabled     = true;
    btn.textContent  = 'Kaydediliyor...';
    try {
      // Stamp defect ID badge onto a copy; live canvas stays clean for reuse
      const label = checkedIds.length ? checkedIds.map(id => `#${id}`).join(' ') : null;
      const blob  = await ann.exportBlobWithLabel(label);
      const file  = new File([blob], `annotated_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await api.photos.upload(inspectionId, file, checkedIds);
      // Only delete original when editing an already-linked defect photo.
      // General photos (currentDefectIds empty) are kept so they can be
      // reused to annotate other defects without re-photographing.
      if (currentDefectIds.length > 0) {
        await api.photos.delete(photoId);
      }
      window.toast('Fotoğraf güncellendi.', 'success');
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Kayıt hatası: ' + err.message, 'error');
      btn.disabled    = false;
      btn.textContent = '💾 Kaydet';
    }
  });
}

// ── Disposition modal'ı ──────────────────────────────────────────────────────
function openDispositionModal(defect, onDone) {
  const active          = defect.active_disposition;
  const currentDecision = active?.decision || null;
  const today           = new Date().toISOString().split('T')[0];

  const ALL_OPTIONS = [
    { value: 'CONFORMS',      label: 'Uygun — Hata Giderildi (Inspector)' },
    { value: 'USE_AS_IS',     label: 'Kabul (Spec Dahilinde)' },
    { value: 'KABUL_RESIM',   label: 'Kabul (Resim Dahilinde)' },
    { value: 'REWORK',          label: 'Rework (Yeniden İşlem)' },
    { value: 'RE_INSPECT',      label: 'Yeniden İnceleme' },
    { value: 'CTP_RE_INSPECT',  label: 'CTP — Sonraki Operasyonda Yeniden İnceleme' },
    { value: 'MRB_SUBMITTED',   label: 'MRB — Gönderildi' },
    { value: 'MRB_CTP',       label: 'CTP — MRB (Continue to Process, bekleyen kapanış)' },
    { value: 'MRB_ACCEPTED',  label: 'MRB — Kabul (Concession)' },
    { value: 'MRB_REJECTED',  label: 'MRB — Ret' },
    { value: 'VOID',          label: 'Void (Geçersiz Sayma)' },
    { value: 'REPAIR',        label: 'Repair (Onarım Sonrası Uygun)' },
    { value: 'SCRAP',         label: 'Scrap (Hurda)' },
  ];
  const allowed = allowedNextDecisions(currentDecision);
  const decisionOptions = [
    { value: '', label: '— Karar Seçiniz —' },
    ...ALL_OPTIONS.filter(o => allowed.includes(o.value)),
  ];

  window.modal.open(`
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">⚖ Disposition — Hata #${defect.id}</span>
        <button class="modal-close" id="dp-close">&times;</button>
      </div>

      ${active ? `
        <div class="disp-history-box">
          <span class="disp-badge ${(DECISION_META[active.decision] || {}).cls || ''}">${active.decision}</span>
          <span class="disp-note-text">${active.note}</span>
        </div>` : ''}

      <form id="dp-form" novalidate>

        <!-- Karar -->
        <div class="form-group" style="margin-bottom:14px;">
          <label>Karar *</label>
          <select class="form-select" name="decision" id="dp-decision" required>
            ${decisionOptions.map(o => `<option value="${o.value}">${o.label}</option>`).join('')}
          </select>
        </div>

        <!-- Ortak alanlar: mühendis + sicil no + tarih -->
        <div class="form-grid" style="margin-bottom:14px;">
          <div class="form-group" id="dp-engineer-group">
            <label>Kararı Veren Mühendis</label>
            <input type="text" class="form-input" name="engineer"
                   placeholder="Mühendis adı soyadı" />
          </div>
          <div class="form-group">
            <label>Sicil No (Sisteme Giren Inspector) *</label>
            <input type="text" class="form-input" name="entered_by"
                   placeholder="Inspector sicil no"
                   value="${session.get() || ''}" />
          </div>
        </div>
        <div class="form-group" style="margin-bottom:14px;">
          <label>Karar Tarihi *</label>
          <input type="date" class="form-input" name="decided_at"
                 value="${today}" required />
        </div>

        <!-- USE_AS_IS alanları -->
        <div id="dp-fields-USE_AS_IS" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Spec / Doküman No</label>
            <input type="text" class="form-input" name="spec_ref" placeholder="ör. ENG-SPEC-4421" />
          </div>
        </div>

        <!-- KABUL_RESIM alanları -->
        <div id="dp-fields-KABUL_RESIM" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Resim / Çizim No</label>
            <input type="text" class="form-input" name="spec_ref" placeholder="ör. DRW-2026-0042" />
          </div>
        </div>

        <!-- CONFORMS alanları -->
        <div id="dp-fields-CONFORMS" class="dp-extra-fields" style="display:none;">
          <p class="text-secondary" style="font-size:12px;padding:4px 0;">
            Hata giderildi veya ölçüm sınır içinde. Inspector onayı yeterlidir, mühendis kararı gerekmez.
          </p>
        </div>

        <!-- REWORK alanları -->
        <div id="dp-fields-REWORK" class="dp-extra-fields" style="display:none;">
          <p class="text-secondary" style="font-size:12px;padding:4px 0;">
            Parça yeniden işleme gönderildi. İşlem sonrası yeniden inceleme yapılacak.
          </p>
        </div>

        <!-- RE_INSPECT alanları -->
        <div id="dp-fields-RE_INSPECT" class="dp-extra-fields" style="display:none;">
          <p class="text-secondary" style="font-size:12px;padding:4px 0;">
            Parça yeniden incelemeye alındı. Muayene sonucuna göre karar girilecek.
          </p>
        </div>

        <!-- CTP_RE_INSPECT alanları -->
        <div id="dp-fields-CTP_RE_INSPECT" class="dp-extra-fields" style="display:none;">
          <p class="text-secondary" style="font-size:12px;padding:4px 0;">
            Parça bir sonraki operasyona devam ediyor; o operasyonda yeniden inceleme zorunludur.
          </p>
          <div class="form-group" style="margin-bottom:14px;">
            <label>Sonraki Operasyon No <span style="color:#888;font-weight:400;">(opsiyonel)</span></label>
            <input type="text" class="form-input" name="ctp_ri_op" placeholder="ör. OP-020" />
          </div>
        </div>

        <!-- MRB_SUBMITTED alanları -->
        <div id="dp-fields-MRB_SUBMITTED" class="dp-extra-fields" style="display:none;">
          <p class="text-secondary" style="font-size:12px;padding:4px 0;">
            NCR MRB'ye iletildi.
          </p>
        </div>

        <!-- MRB_CTP alanları -->
        <div id="dp-fields-MRB_CTP" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>CTP Referans No (isteğe bağlı)</label>
            <input type="text" class="form-input" name="ctp_ref" placeholder="ör. CTP-2026-007" />
          </div>
        </div>

        <!-- MRB_ACCEPTED alanları -->
        <div id="dp-fields-MRB_ACCEPTED" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Concession / Case Record No</label>
            <input type="text" class="form-input" name="concession_no" placeholder="ör. MRB-2026-001" />
          </div>
        </div>

        <!-- MRB_REJECTED alanları -->
        <div id="dp-fields-MRB_REJECTED" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>NCR / Ret Referans No (isteğe bağlı)</label>
            <input type="text" class="form-input" name="mrb_reject_ref" placeholder="ör. NCR-2026-042" />
          </div>
        </div>

        <!-- VOID alanları -->
        <div id="dp-fields-VOID" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Geçersizlik Gerekçesi</label>
            <input type="text" class="form-input" name="void_reason" placeholder="Neden geçersiz?" />
          </div>
        </div>

        <!-- REPAIR alanları -->
        <div id="dp-fields-REPAIR" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Onarım Prosedür / Doküman No</label>
            <input type="text" class="form-input" name="repair_ref" placeholder="ör. REPAIR-PROC-123" />
          </div>
        </div>

        <!-- SCRAP alanları -->
        <div id="dp-fields-SCRAP" class="dp-extra-fields" style="display:none;">
          <div class="form-group" style="margin-bottom:14px;">
            <label>Hurda Gerekçesi</label>
            <input type="text" class="form-input" name="scrap_reason" placeholder="Hurda nedeni" />
          </div>
        </div>

        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="dp-cancel">İptal</button>
          <button type="submit" class="btn btn-primary" id="dp-submit">Kaydet</button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('dp-close').addEventListener('click',  () => window.modal.close());
  document.getElementById('dp-cancel').addEventListener('click', () => window.modal.close());

  // Karar seçilince ilgili alanları göster
  const decisionSel  = document.getElementById('dp-decision');
  const engineerGroup = document.getElementById('dp-engineer-group');
  function showFields(val) {
    document.querySelectorAll('.dp-extra-fields').forEach(el => el.style.display = 'none');
    if (val) {
      const el = document.getElementById(`dp-fields-${val}`);
      if (el) el.style.display = '';
    }
    // CONFORMS = inspector-only, mühendis alanı gizlenir
    if (engineerGroup) engineerGroup.style.display = (val === 'CONFORMS') ? 'none' : '';
  }
  decisionSel.addEventListener('change', () => showFields(decisionSel.value));

  document.getElementById('dp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn       = document.getElementById('dp-submit');
    const fd        = new FormData(e.target);
    const decision   = fd.get('decision');
    const entered_by = (fd.get('entered_by') || '').trim();
    const engineer   = (fd.get('engineer')   || '').trim();
    const decided_at = fd.get('decided_at');

    if (!decision)   { window.toast('Karar seçiniz.', 'error'); return; }
    if (!entered_by) { window.toast('Sicil no zorunludur.', 'error'); return; }

    const payload = { defect_id: defect.id, decision, entered_by, decided_at };
    if (engineer) payload.engineer = engineer;

    if (decision === 'USE_AS_IS' || decision === 'KABUL_RESIM') {
      const ref = (fd.get('spec_ref') || '').trim();
      if (ref) payload.spec_ref = ref;
    } else if (decision === 'CTP_RE_INSPECT') {
      const op = (fd.get('ctp_ri_op') || '').trim();
      if (op) payload.spec_ref = op;
    } else if (decision === 'MRB_CTP') {
      const ref = (fd.get('ctp_ref') || '').trim();
      if (ref) payload.spec_ref = ref;
    } else if (decision === 'MRB_ACCEPTED') {
      const ref = (fd.get('concession_no') || '').trim();
      if (ref) payload.concession_no = ref;
    } else if (decision === 'MRB_REJECTED') {
      const ref = (fd.get('mrb_reject_ref') || '').trim();
      if (ref) payload.concession_no = ref;
    } else if (decision === 'VOID') {
      const ref = (fd.get('void_reason') || '').trim();
      if (ref) payload.void_reason = ref;
    } else if (decision === 'REPAIR') {
      const ref = (fd.get('repair_ref') || '').trim();
      if (ref) payload.repair_ref = ref;
    } else if (decision === 'SCRAP') {
      const ref = (fd.get('scrap_reason') || '').trim();
      if (ref) payload.scrap_reason = ref;
    }

    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';
    try {
      await api.dispositions.create(payload);
      window.toast('Disposition kaydedildi.', 'success');
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Hata: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Kaydet';
    }
  });
}

// ── Hata modal'ı ─────────────────────────────────────────────────────────────
function openDefectModal(inspectionId, existingDefect, defectTypes, onDone, originDefectId = null, postRework = false) {
  const isEdit = !!existingDefect;
  const v      = existingDefect || {};

  window.modal.open(`
    <div class="modal-card">
      <div class="modal-header">
        <span class="modal-title">${isEdit ? `Hata Düzenle #${v.id}` : 'Yeni Hata Ekle'}</span>
        <button class="modal-close" id="df-close">&times;</button>
      </div>
      ${postRework ? `
        <div class="origin-banner" style="background:#fff3cd;color:#856404;border-left:4px solid #ffc107;padding:10px 14px;margin-bottom:12px;border-radius:4px;font-size:13px;">
          📐 <strong>Post-rework ölçümleri</strong> — Rework sonrası ölçüm değerlerini güncelleyin.
          Kaydettikten sonra RE_INSPECT karar formu otomatik açılacak.
        </div>` : ''}
      ${originDefectId ? `
        <div class="origin-banner">
          ↳ Yeniden işleme sonucu — Hata #${originDefectId} kaynaklı yeni hata
        </div>` : ''}
      <form id="defect-form" novalidate>
        <div class="form-grid">
          <div class="form-group form-group-full">
            <label>Hata Tipi *</label>
            <select class="form-select" name="defect_type_id" required>
              <option value="">— Seçiniz —</option>
              ${defectTypes.map(dt =>
                `<option value="${dt.id}" ${v.defect_type_id == dt.id ? 'selected' : ''}>${dt.name}</option>`
              ).join('')}
            </select>
          </div>
          ${[
            ['depth',  'Derinlik (mm)', '0.00'],
            ['width',  'Genişlik (mm)', '0.00'],
            ['length', 'Uzunluk (mm)',  '0.00'],
            ['radius', 'Yarıçap (mm)',  '0.00'],
            ['angle',  'Açı (°)',       '0.0' ],
          ].map(([name, label, ph]) => `
            <div class="form-group">
              <label>${label}</label>
              <input type="number" step="0.01" class="form-input" name="${name}"
                     value="${v[name] ?? ''}" placeholder="${ph}" />
            </div>`).join('')}
          <div class="form-group">
            <label>Renk</label>
            <input type="text" class="form-input" name="color"
                   value="${v.color || ''}" placeholder="Örn: Siyah" />
          </div>
          <div class="form-group form-group-full">
            <label>Notlar</label>
            <textarea class="form-textarea" name="notes" rows="3"
                      placeholder="Hata açıklaması...">${v.notes || ''}</textarea>
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-ghost" id="df-cancel">İptal</button>
          <button type="submit" class="btn btn-primary" id="df-submit">
            ${isEdit ? 'Kaydet' : 'Ekle'}
          </button>
        </div>
      </form>
    </div>
  `);

  document.getElementById('df-close').addEventListener('click',  () => window.modal.close());
  document.getElementById('df-cancel').addEventListener('click', () => window.modal.close());

  document.getElementById('defect-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('df-submit');
    btn.disabled = true;
    btn.textContent = 'Kaydediliyor...';

    const fd   = new FormData(e.target);
    const optF = (k) => fd.get(k) ? parseFloat(fd.get(k)) : null;
    const data = {
      inspection_id:  inspectionId,
      defect_type_id: Number(fd.get('defect_type_id')),
      depth:  optF('depth'),  width: optF('width'),
      length: optF('length'), radius: optF('radius'), angle: optF('angle'),
      color:  fd.get('color')  || null,
      notes:  fd.get('notes')  || null,
      ...(originDefectId ? { origin_defect_id: originDefectId } : {}),
    };

    if (!data.defect_type_id) {
      window.toast('Lütfen hata tipi seçiniz.', 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Kaydet' : 'Ekle';
      return;
    }

    try {
      if (isEdit) await api.defects.update(v.id, data);
      else        await api.defects.create(data);
      window.toast(isEdit ? 'Hata güncellendi.' : 'Hata eklendi.', 'success');
      window.modal.close();
      await onDone();
    } catch (err) {
      window.toast('Hata: ' + err.message, 'error');
      btn.disabled = false;
      btn.textContent = isEdit ? 'Kaydet' : 'Ekle';
    }
  });
}
