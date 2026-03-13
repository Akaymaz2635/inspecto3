// ── Constants ─────────────────────────────────────────────────────────────────
const DECISION_LABELS = {
  USE_AS_IS:     'Kabul (Spec)',
  REWORK:        'Rework',
  MRB_SUBMITTED: 'MRB Gönderildi',
  MRB_CTP:       'MRB — CTP',
  MRB_ACCEPTED:  'MRB Kabul',
  VOID:          'Void',
  REPAIR:        'Repair',
  SCRAP:         'Scrap',
  PENDING:       'Bekliyor',
};

const STATUS_LABELS = {
  open:      'Açık',
  completed: 'Tamamlandı',
  rejected:  'Reddedildi',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function photoUrl(id) { return `/api/photos/${id}/file`; }
function fmtMM(v)     { return (v == null) ? '—' : Number(v).toFixed(2) + ' mm'; }
function fmtVal(v)    { return (v == null || v === '') ? '—' : String(v); }
function fmtDate(s)   {
  try { return new Date(s).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' }); }
  catch { return s || '—'; }
}
function decisionLabel(d) { return DECISION_LABELS[d] || d; }

// ── Pareto SVG ────────────────────────────────────────────────────────────────
function buildParetoSvg(byType) {
  const sorted = Object.entries(byType || {}).sort((a, b) => b[1] - a[1]);
  if (!sorted.length) return '<p style="color:#94a3b8;font-size:9pt;">Hata verisi yok.</p>';

  const total   = sorted.reduce((s, [, v]) => s + v, 0);
  const W = 480, H = 200;
  const PAD = { t: 16, r: 50, b: 42, l: 38 };
  const cW = W - PAD.l - PAD.r;
  const cH = H - PAD.t - PAD.b;
  const maxCount = sorted[0][1];
  const barW = cW / sorted.length;

  let bars = '', linePoints = '', xLabels = '', cumPct = 0;

  sorted.forEach(([name, count], i) => {
    const bh = (count / maxCount) * cH;
    const bx = PAD.l + i * barW;
    const by = PAD.t + cH - bh;
    bars += `<rect x="${(bx + 2).toFixed(1)}" y="${by.toFixed(1)}" width="${(barW - 4).toFixed(1)}" height="${bh.toFixed(1)}" fill="#3b82f6" opacity="0.75" rx="2"/>`;
    bars += `<text x="${(bx + barW / 2).toFixed(1)}" y="${(by - 4).toFixed(1)}" text-anchor="middle" font-size="9" fill="#475569">${count}</text>`;

    cumPct += (count / total) * 100;
    const ly = PAD.t + cH - (cumPct / 100) * cH;
    const lx = PAD.l + i * barW + barW / 2;
    linePoints += `${lx.toFixed(1)},${ly.toFixed(1)} `;

    const label = name.length > 12 ? name.substring(0, 11) + '…' : name;
    xLabels += `<text x="${(bx + barW / 2).toFixed(1)}" y="${(H - PAD.b + 14).toFixed(1)}" text-anchor="middle" font-size="8.5" fill="#64748b">${label}</text>`;

    // Y-axis tick (every other)
    if (i === 0) {
      [0, 25, 50, 75, 100].forEach(pct => {
        const ty = PAD.t + cH - (pct / 100) * cH;
        bars += `<line x1="${PAD.l - 3}" y1="${ty.toFixed(1)}" x2="${W - PAD.r}" y2="${ty.toFixed(1)}" stroke="#e2e8f0" stroke-width="0.7"/>`;
        bars += `<text x="${(W - PAD.r + 4).toFixed(1)}" y="${(ty + 3).toFixed(1)}" font-size="8" fill="#94a3b8">${pct}%</text>`;
      });
    }
  });

  return `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%;max-height:${H}px;">
      <rect x="${PAD.l}" y="${PAD.t}" width="${cW}" height="${cH}" fill="#f8fafc" rx="2"/>
      ${bars}
      <polyline points="${linePoints.trim()}" fill="none" stroke="#ef4444" stroke-width="2" stroke-linejoin="round"/>
      ${xLabels}
      <line x1="${PAD.l}" y1="${PAD.t}" x2="${PAD.l}" y2="${PAD.t + cH}" stroke="#cbd5e1" stroke-width="1"/>
      <line x1="${PAD.l}" y1="${PAD.t + cH}" x2="${W - PAD.r}" y2="${PAD.t + cH}" stroke="#cbd5e1" stroke-width="1"/>
    </svg>`;
}

// ── PORTRAIT REPORT ───────────────────────────────────────────────────────────
function renderPortrait(data) {
  const root = document.getElementById('report-root');
  root.classList.add('portrait');
  document.title = `Rapor — Muayene #${data.id}`;
  document.getElementById('toolbar-title').textContent = `Muayene #${data.id} — A4 Dikey Rapor`;

  const totalPages = 1 + data.defects.length;
  let pages = '';

  // ── Cover page ──────────────────────────────────────────────
  const s = data.summary;
  pages += `
    <div class="page">
      <div class="cover-header">
        <div>
          <div class="cover-title">Muayene Raporu</div>
          <div class="cover-sub">${fmtVal(data.project_name)} — Muayene #${data.id}</div>
        </div>
        <div class="cover-date">
          Tarih: ${fmtDate(data.created_at)}<br/>
          Durum: <strong>${STATUS_LABELS[data.status] || data.status}</strong>
        </div>
      </div>

      <table class="info-table">
        <tr><td>Proje</td><td>${fmtVal(data.project_name)}</td></tr>
        <tr><td>Müşteri</td><td>${fmtVal(data.customer)}</td></tr>
        <tr><td>Parça Numarası</td><td>${fmtVal(data.part_number)}</td></tr>
        <tr><td>Seri Numarası</td><td>${fmtVal(data.serial_number)}</td></tr>
        <tr><td>Muayeneci</td><td>${fmtVal(data.inspector)}</td></tr>
        <tr><td>Muayene Tarihi</td><td>${fmtDate(data.created_at)}</td></tr>
      </table>

      <div class="summary-boxes">
        <div class="summary-box">
          <div class="sb-val">${s.total}</div>
          <div class="sb-lbl">Toplam Hata</div>
        </div>
        <div class="summary-box sb-green">
          <div class="sb-val">${s.neutralized}</div>
          <div class="sb-lbl">Karara Bağlanan</div>
        </div>
        <div class="summary-box sb-orange">
          <div class="sb-val">${s.pending}</div>
          <div class="sb-lbl">Bekleyen</div>
        </div>
        <div class="summary-box sb-blue">
          <div class="sb-val">${data.defects.filter(d => d.photos.length > 0).length}</div>
          <div class="sb-lbl">Fotoğraflı Hata</div>
        </div>
      </div>

      <div class="section-title">Hata Tiplerine Göre Dağılım (Pareto)</div>
      <div class="pareto-wrap">
        ${buildParetoSvg(s.by_type)}
      </div>

      ${data.notes ? `
        <div class="section-title">Notlar</div>
        <div class="notes-box">${data.notes}</div>
      ` : ''}

      <div class="page-footer">
        <span>Muayene #${data.id} — ${fmtVal(data.part_number)} / ${fmtVal(data.serial_number)}</span>
        <span>Sayfa 1 / ${totalPages}</span>
      </div>
    </div>`;

  // ── Defect pages ─────────────────────────────────────────────
  data.defects.forEach((d, idx) => {
    const pageNum = idx + 2;
    const activeLabel = d.active_disposition ? decisionLabel(d.active_disposition.decision) : 'Bekliyor';

    const measurements = [
      ['Derinlik', fmtMM(d.depth)],
      ['Genişlik', fmtMM(d.width)],
      ['Uzunluk',  fmtMM(d.length)],
      ['Yarıçap',  fmtMM(d.radius)],
      ['Açı',      d.angle != null ? d.angle + '°' : '—'],
      ['Renk',     fmtVal(d.color)],
    ].filter(([, v]) => v !== '—');

    const mRowHtml = measurements.length
      ? measurements.map(([l, v]) => `
          <div class="mrow-item">
            <div class="mrow-lbl">${l}</div>
            <div class="mrow-val">${v}</div>
          </div>`).join('')
      : '<span style="font-size:9pt;color:#94a3b8;">Ölçüm girilmemiş.</span>';

    // Photos
    const photoHtml = d.photos.length === 0
      ? '<p style="font-size:9pt;color:#94a3b8;">Fotoğraf eklenmemiş.</p>'
      : `<div class="photos-grid ${d.photos.length === 1 ? 'single-photo' : ''}">
          ${d.photos.map((p, pi) => `
            <div>
              <img src="${photoUrl(p.id)}" loading="lazy" alt="Fotoğraf ${pi + 1}" />
              <div class="photo-caption">Fotoğraf ${pi + 1} / ${d.photos.length} — #${p.id}</div>
            </div>`).join('')}
        </div>`;

    // Disposition history
    const dispTableHtml = d.dispositions.length === 0
      ? '<p style="font-size:9pt;color:#94a3b8;">Disposition girilmemiş.</p>'
      : `<table class="disp-history-table">
          <thead>
            <tr>
              <th>Tarih</th><th>Karar</th><th>Giren</th><th>Not</th>
            </tr>
          </thead>
          <tbody>
            ${d.dispositions.map(dp => `
              <tr>
                <td>${fmtDate(dp.decided_at)}</td>
                <td>${decisionLabel(dp.decision)}</td>
                <td>${fmtVal(dp.entered_by)}</td>
                <td>${fmtVal(dp.note)}</td>
              </tr>`).join('')}
          </tbody>
        </table>`;

    pages += `
      <div class="page">
        <div class="defect-card">
          <div class="dc-header">
            <span class="dc-num">#${d.id}</span>
            <span class="dc-type">${fmtVal(d.defect_type_name)}</span>
            <span class="dc-disp">${activeLabel}</span>
          </div>

          <div class="section-title">Ölçümler</div>
          <div class="measurements-row">${mRowHtml}</div>

          ${d.notes ? `<div class="dc-notes">${d.notes}</div>` : ''}

          <div class="section-title">Fotoğraflar (${d.photos.length})</div>
          ${photoHtml}

          <div class="section-title">Disposition Geçmişi</div>
          ${dispTableHtml}
        </div>
        <div class="page-footer">
          <span>Muayene #${data.id} — Hata #${d.id} · ${fmtVal(d.defect_type_name)}</span>
          <span>Sayfa ${pageNum} / ${totalPages}</span>
        </div>
      </div>`;
  });

  root.innerHTML = pages;
}

// ── LANDSCAPE REPORT ──────────────────────────────────────────────────────────
function renderLandscape(data) {
  const root = document.getElementById('report-root');
  root.classList.add('landscape');
  document.title = `Rapor — Muayene #${data.id}`;
  document.getElementById('toolbar-title').textContent = `Muayene #${data.id} — A4 Yatay Rapor`;

  // Count total pages for footer
  let totalPages = 0;
  data.defects.forEach(d => {
    totalPages += Math.max(1, d.photos.length);
  });

  const headerMeta = [
    ['Parça', fmtVal(data.part_number)],
    ['Seri',  fmtVal(data.serial_number)],
    ['Müşteri', fmtVal(data.customer)],
    ['Muayeneci', fmtVal(data.inspector)],
    ['Tarih', fmtDate(data.created_at)],
  ].map(([l, v]) => `<span><strong>${l}:</strong> ${v}</span>`).join('');

  function lsHeader() {
    return `
      <div class="ls-header">
        <div class="ls-header-title">Muayene #${data.id}</div>
        <div class="ls-header-meta">${headerMeta}</div>
      </div>`;
  }

  let pages = '';
  let pageNum = 0;

  data.defects.forEach(d => {
    const activeLabel = d.active_disposition ? decisionLabel(d.active_disposition.decision) : 'Bekliyor';
    const photoCount  = d.photos.length;
    const defectPages = Math.max(1, photoCount);

    const measurements = [
      ['Derinlik', fmtMM(d.depth)],
      ['Genişlik', fmtMM(d.width)],
      ['Uzunluk',  fmtMM(d.length)],
      ['Yarıçap',  fmtMM(d.radius)],
      ['Açı',      d.angle != null ? d.angle + '°' : '—'],
      ['Renk',     fmtVal(d.color)],
    ];

    const mItemsHtml = measurements.map(([l, v]) => `
      <div class="ls-mitem">
        <div class="ml">${l}</div>
        <div class="mv">${v}</div>
      </div>`).join('');

    const dispBlock = d.active_disposition
      ? `<div class="ls-disp-decision">${decisionLabel(d.active_disposition.decision)}</div>
         <div class="ls-disp-note">${d.active_disposition.note || ''}</div>`
      : `<div class="ls-disp-decision ls-disp-pending">Bekliyor — Disposition girilmemiş</div>`;

    const defectBarHtml = `
      <div class="ls-defect-bar">
        <span class="ls-defect-id">#${d.id}</span>
        <span class="ls-defect-type">${fmtVal(d.defect_type_name)}</span>
        <span class="ls-disp-badge">${activeLabel}</span>
      </div>`;

    // ── First page: 58% photo + 42% info ──────────────────────
    pageNum++;
    const photo0 = d.photos[0] || null;
    const photoImgHtml = photo0
      ? `<img src="${photoUrl(photo0.id)}" loading="lazy" alt="Fotoğraf 1" />`
      : `<span class="ls-no-photo">Fotoğraf eklenmemiş</span>`;
    const stampHtml = photo0 && photoCount > 1
      ? `<div class="ls-photo-stamp">#${d.id} · 1/${photoCount}</div>` : '';

    pages += `
      <div class="page">
        ${lsHeader()}
        ${defectBarHtml}
        <div class="ls-content">
          <div class="ls-photo-pane">
            ${photoImgHtml}
            ${stampHtml}
          </div>
          <div class="ls-info-pane">
            <div>
              <div class="ls-section-label">Ölçümler</div>
              <div class="ls-measurements">${mItemsHtml}</div>
            </div>
            ${d.notes ? `<div class="ls-dc-notes">${d.notes}</div>` : ''}
            <div>
              <div class="ls-section-label">Disposition</div>
              <div class="ls-disp-block">${dispBlock}</div>
            </div>
            ${photoCount > 1 ? `<div class="ls-photo-count">${photoCount} fotoğraf eklendi — sonraki sayfalarda devam eder</div>` : ''}
          </div>
        </div>
        <div class="ls-page-footer">
          <span>Hata #${d.id} · ${fmtVal(d.defect_type_name)}</span>
          <span>${photo0 ? 'Fotoğraf 1 / ' + photoCount : 'Fotoğraf yok'}</span>
          <span>Sayfa ${pageNum} / ${totalPages}</span>
        </div>
      </div>`;

    // ── Continuation pages: 85% photo + 15% strip ─────────────
    for (let pi = 1; pi < photoCount; pi++) {
      pageNum++;
      const photo = d.photos[pi];
      pages += `
        <div class="page">
          ${lsHeader()}
          ${defectBarHtml}
          <div class="ls-content">
            <div class="ls-photo-pane-wide">
              <img src="${photoUrl(photo.id)}" loading="lazy" alt="Fotoğraf ${pi + 1}" />
              <div class="ls-photo-stamp">#${d.id} · ${pi + 1}/${photoCount}</div>
            </div>
            <div class="ls-info-strip">
              <div class="ls-is-id">#${d.id}</div>
              <div class="ls-is-type">${fmtVal(d.defect_type_name)}</div>
              <div class="ls-is-counter">
                <strong>${pi + 1}/${photoCount}</strong>
                <span>fotoğraf</span>
              </div>
            </div>
          </div>
          <div class="ls-page-footer">
            <span>Hata #${d.id} · ${fmtVal(d.defect_type_name)}</span>
            <span>Fotoğraf ${pi + 1} / ${photoCount}</span>
            <span>Sayfa ${pageNum} / ${totalPages}</span>
          </div>
        </div>`;
    }
  });

  // If no defects
  if (!data.defects.length) {
    pages = `
      <div class="page">
        ${lsHeader()}
        <div class="ls-content" style="align-items:center;justify-content:center;flex:1;">
          <p style="color:#94a3b8;font-size:12pt;">Bu muayenede henüz hata kaydı bulunmuyor.</p>
        </div>
      </div>`;
  }

  root.innerHTML = pages;
}

// ── Klasöre Kaydet ────────────────────────────────────────────────────────────
async function savePdfToFolder(id, type) {
  const btn = document.getElementById('btn-save-folder');

  // html2pdf mevcut değilse (CDN yüklenemedi) uyar
  if (typeof html2pdf === 'undefined') {
    alert('PDF kütüphanesi yüklenemedi.\nİnternet bağlantısını kontrol edip sayfayı yenileyin.');
    return;
  }

  // Dosya var mı kontrol et
  let info;
  try {
    const res = await fetch(`/api/inspections/${id}/pdf-path?type=${type}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    info = await res.json();
  } catch (err) {
    alert(`Kayıt yolu alınamadı: ${err.message}`);
    return;
  }

  if (info.exists) {
    const ok = confirm(
      `"${info.display_path}" zaten mevcut.\n\nÜzerine yazılsın mı?`
    );
    if (!ok) return;
  }

  btn.textContent = '⏳ Hazırlanıyor…';
  btn.disabled    = true;

  try {
    const orientation = type === 'landscape' ? 'landscape' : 'portrait';
    const element     = document.getElementById('report-root');

    const opt = {
      margin:     0,
      filename:   `muayene_${id}.pdf`,
      image:      { type: 'jpeg', quality: 0.92 },
      html2canvas: { scale: 2, useCORS: true, logging: false, scrollY: 0 },
      jsPDF:      { unit: 'mm', format: 'a4', orientation },
      pagebreak:  { mode: ['css', 'legacy'] },
    };

    const pdfBlob = await html2pdf().set(opt).from(element).outputPdf('blob');

    const saveRes = await fetch(`/api/inspections/${id}/save-pdf?type=${type}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/pdf' },
      body:    pdfBlob,
    });
    if (!saveRes.ok) {
      const detail = await saveRes.json().catch(() => ({}));
      throw new Error(detail.detail || `HTTP ${saveRes.status}`);
    }
    const result = await saveRes.json();
    alert(`PDF kaydedildi:\n${result.saved_path}`);
  } catch (err) {
    alert(`Kayıt başarısız: ${err.message}`);
  } finally {
    btn.textContent = '💾 Klasöre Kaydet';
    btn.disabled    = false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const params = new URLSearchParams(location.search);
  const id     = params.get('id');
  const type   = params.get('type') || 'portrait';
  const root   = document.getElementById('report-root');

  if (!id) {
    root.innerHTML = '<div class="error-screen">Hata: Muayene ID belirtilmedi (?id=X)</div>';
    return;
  }

  try {
    const res = await fetch(`/api/inspections/${id}/report-data`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    if (type === 'landscape') {
      renderLandscape(data);
    } else {
      renderPortrait(data);
    }

    // Klasöre kaydet butonu
    document.getElementById('btn-save-folder').addEventListener('click', () => {
      savePdfToFolder(id, type);
    });

    // Auto-print if requested
    if (params.get('print') === '1') {
      setTimeout(() => window.print(), 800);
    }
  } catch (err) {
    root.innerHTML = `<div class="error-screen">Rapor yüklenemedi: ${err.message}</div>`;
  }
}

main();
