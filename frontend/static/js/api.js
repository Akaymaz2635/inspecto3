const BASE_URL = '';

async function request(method, path, body = null, isFormData = false) {
  const opts = {
    method,
    headers: {},
  };
  if (body !== null) {
    if (isFormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
  }
  const res = await fetch(BASE_URL + path, opts);
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.detail || `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  projects: {
    list: () => request('GET', '/api/projects'),
    get: (id) => request('GET', `/api/projects/${id}`),
    create: (data) => request('POST', '/api/projects', data),
    update: (id, data) => request('PUT', `/api/projects/${id}`, data),
    delete: (id) => request('DELETE', `/api/projects/${id}`),
  },

  defectTypes: {
    list: () => request('GET', '/api/defect-types'),
    get: (id) => request('GET', `/api/defect-types/${id}`),
    create: (data) => request('POST', '/api/defect-types', data),
    update: (id, data) => request('PUT', `/api/defect-types/${id}`, data),
    delete: (id) => request('DELETE', `/api/defect-types/${id}`),
  },

  inspections: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.status)     qs.set('status', params.status);
      if (params.project_id) qs.set('project_id', String(params.project_id));
      if (params.search)     qs.set('search', params.search);
      const query = qs.toString();
      return request('GET', `/api/inspections${query ? '?' + query : ''}`);
    },
    get: (id) => request('GET', `/api/inspections/${id}`),
    create: (data) => request('POST', '/api/inspections', data),
    update: (id, data) => request('PUT', `/api/inspections/${id}`, data),
    delete: (id) => request('DELETE', `/api/inspections/${id}`),
  },

  defects: {
    list: (inspection_id) => request('GET', `/api/defects?inspection_id=${inspection_id}`),
    get: (id) => request('GET', `/api/defects/${id}`),
    create: (data) => request('POST', '/api/defects', data),
    update: (id, data) => request('PATCH', `/api/defects/${id}`, data),
    delete: (id) => request('DELETE', `/api/defects/${id}`),
  },

  dispositions: {
    create: (data) => request('POST', '/api/dispositions', data),
    list:   (defect_id) => request('GET', `/api/dispositions?defect_id=${defect_id}`),
    delete: (id) => request('DELETE', `/api/dispositions/${id}`),
  },

  photos: {
    list: (params = {}) => {
      const qs = new URLSearchParams();
      if (params.inspection_id != null) qs.set('inspection_id', String(params.inspection_id));
      if (params.defect_id != null)     qs.set('defect_id', String(params.defect_id));
      return request('GET', `/api/photos?${qs.toString()}`);
    },
    get: (id) => request('GET', `/api/photos/${id}`),
    upload: (inspection_id, file, defect_ids = []) => {
      const fd = new FormData();
      fd.append('file', file, file.name || 'photo.jpg');
      const qs = new URLSearchParams({ inspection_id: String(inspection_id) });
      const ids = Array.isArray(defect_ids) ? defect_ids : (defect_ids ? [defect_ids] : []);
      ids.forEach(id => qs.append('defect_ids', String(id)));
      return request('POST', `/api/photos?${qs.toString()}`, fd, true);
    },
    setDefects: (id, defect_ids) => request('PUT', `/api/photos/${id}/defects`, defect_ids),
    fileUrl: (id) => `${BASE_URL}/api/photos/${id}/file`,
    delete:  (id) => request('DELETE', `/api/photos/${id}`),
  },
};
