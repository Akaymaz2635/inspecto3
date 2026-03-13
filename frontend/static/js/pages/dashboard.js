import { api } from '../api.js';

function statusBadge(status) {
  const map = { open: 'badge-open', completed: 'badge-completed', rejected: 'badge-rejected' };
  const labels = { open: 'Açık', completed: 'Tamamlandı', rejected: 'Reddedildi' };
  return `<span class="badge ${map[status] || ''}">${labels[status] || status}</span>`;
}

function formatDate(str) {
  if (!str) return '—';
  try {
    return new Date(str).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return str; }
}

export async function dashboardPage() {
  const root = document.getElementById('page-root');
  root.innerHTML = '<div class="loading">Yükleniyor...</div>';

  const [inspections, projects] = await Promise.all([
    api.inspections.list(),
    api.projects.list(),
  ]);

  const total     = inspections.length;
  const open      = inspections.filter((i) => i.status === 'open').length;
  const completed = inspections.filter((i) => i.status === 'completed').length;
  const rejected  = inspections.filter((i) => i.status === 'rejected').length;

  const recent = [...inspections].slice(0, 5);

  // Build project lookup
  const projMap = {};
  for (const p of projects) projMap[p.id] = p.name;

  const recentRows = recent.map((insp) => `
    <tr>
      <td class="col-id">#${insp.id}</td>
      <td>${insp.part_number || '—'}</td>
      <td>${insp.serial_number || '—'}</td>
      <td>${projMap[insp.project_id] || '—'}</td>
      <td>${insp.inspector || '—'}</td>
      <td>${statusBadge(insp.status)}</td>
      <td>${formatDate(insp.created_at)}</td>
      <td>
        <a href="#/inspections/${insp.id}" class="btn btn-ghost btn-xs">Aç →</a>
      </td>
    </tr>
  `).join('');

  root.innerHTML = `
    <div class="page-header">
      <h1>Dashboard</h1>
      <div class="page-header-actions">
        <a href="#/inspections/new" class="btn btn-primary">+ Yeni Muayene</a>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-number">${total}</div>
        <div class="stat-label">Toplam Muayene</div>
      </div>
      <div class="stat-card accent-blue">
        <div class="stat-number">${open}</div>
        <div class="stat-label">Açık</div>
      </div>
      <div class="stat-card accent-green">
        <div class="stat-number">${completed}</div>
        <div class="stat-label">Tamamlandı</div>
      </div>
      <div class="stat-card accent-red">
        <div class="stat-number">${rejected}</div>
        <div class="stat-label">Reddedildi</div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Son Muayeneler</span>
        <a href="#/inspections" class="btn btn-ghost btn-sm">Tümünü Gör</a>
      </div>
      <div class="table-wrapper">
        ${
          recent.length === 0
            ? '<div class="empty">Henüz muayene kaydı bulunmuyor.</div>'
            : `<table class="data-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Parça No</th>
                    <th>Seri No</th>
                    <th>Proje</th>
                    <th>Muayeneci</th>
                    <th>Durum</th>
                    <th>Tarih</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>${recentRows}</tbody>
              </table>`
        }
      </div>
    </div>

    <div class="card">
      <div class="card-header">
        <span class="card-title">Projeler (${projects.length})</span>
        <a href="#/settings" class="btn btn-ghost btn-sm">Yönet</a>
      </div>
      <div class="table-wrapper">
        ${
          projects.length === 0
            ? '<div class="empty">Proje bulunamadı.</div>'
            : `<table class="data-table">
                <thead>
                  <tr><th>ID</th><th>Ad</th><th>Müşteri</th><th>Açıklama</th></tr>
                </thead>
                <tbody>
                  ${projects.map((p) => `
                    <tr>
                      <td class="col-id">#${p.id}</td>
                      <td>${p.name}</td>
                      <td>${p.customer || '—'}</td>
                      <td class="text-secondary">${p.description || '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
        }
      </div>
    </div>
  `;
}
