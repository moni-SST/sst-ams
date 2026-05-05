import axios from 'axios';

const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL || '') + '/api',
  timeout: 30000
});

// Attach token on every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authAPI = {
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  changePassword: (data) => api.put('/auth/change-password', data),
  changeUsername: (data) => api.put('/auth/change-username', data)
};

// Projects
export const projectsAPI = {
  getAll: (params) => api.get('/projects', { params }),
  getById: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
  delete: (id) => api.delete(`/projects/${id}`),
  exportExcel: (id) => api.get(`/projects/${id}/export/excel`, { responseType: 'blob' }),
  exportPDF:   (id) => api.get(`/projects/${id}/export/pdf`,   { responseType: 'blob' })
};

// Stages
export const stagesAPI = {
  getAll: (projectId) => api.get(`/stages/${projectId}`),
  update: (projectId, stageNumber, data) =>
    api.patch(`/stages/${projectId}/stage/${stageNumber}`, data)
};

// Documents
export const documentsAPI = {
  getAll: (projectId, params) => api.get(`/documents/${projectId}`, { params }),
  upload: (projectId, formData) => api.post(`/documents/${projectId}`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  download: (id) => api.get(`/documents/download/${id}`, { responseType: 'blob' }),
  delete: (id) => api.delete(`/documents/${id}`)
};

// Payments
export const paymentsAPI = {
  getAll: (projectId) => api.get(`/payments/${projectId}`),
  getSummary: (projectId) => api.get(`/payments/${projectId}/summary`),
  create: (projectId, data) => api.post(`/payments/${projectId}`, data),
  update: (id, data) => api.put(`/payments/${id}`, data)
};

// Users
export const usersAPI = {
  getAll: () => api.get('/users'),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  getPerformance: () => api.get('/users/performance')
};

// Analytics
export const analyticsAPI = {
  getDashboard: () => api.get('/analytics/dashboard'),
  getProjects: () => api.get('/analytics/projects'),
  getPayments: () => api.get('/analytics/payments'),
  exportExcel: () => api.get('/analytics/export/excel', { responseType: 'blob' }),
  exportPDF: () => api.get('/analytics/export/pdf', { responseType: 'blob' })
};

// Audit Logs
export const auditAPI = {
  getAll:   (params) => api.get('/audit-logs', { params }),
  clearAll: ()       => api.delete('/audit-logs/clear'),
};

// Notifications
export const notificationsAPI = {
  getAll: () => api.get('/notifications'),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all')
};

// Calendar Notes
export const notesAPI = {
  getByMonth: (month) => api.get('/notes', { params: { month } }),
  getByDate:  (date)  => api.get(`/notes/date/${date}`),
  create: (data)      => api.post('/notes', data),
  update: (id, data)  => api.put(`/notes/${id}`, data),
  remove: (id)        => api.delete(`/notes/${id}`),
};

// Note Comments (private — only visible inside the meeting page)
export const noteCommentsAPI = {
  getByDate: (date)     => api.get(`/notes/comments/${date}`),
  create:    (date, d)  => api.post(`/notes/comments/${date}`, d),
  update:    (id, d)    => api.put(`/notes/comments/${id}`, d),
  remove:    (id)       => api.delete(`/notes/comments/${id}`),
};

// Note File Attachments
export const noteFilesAPI = {
  getByDate:  (date)     => api.get(`/notes/files/${date}`),
  upload:     (date, fd) => api.post(`/notes/files/${date}`, fd, { headers: { 'Content-Type': 'multipart/form-data' } }),
  download:   (id)       => api.get(`/notes/files/download/${id}`, { responseType: 'blob' }),
  remove:     (id)       => api.delete(`/notes/files/${id}`),
};

// Email Import
export const emailImportAPI = {
  fetch:  (data) => api.post('/email-import/fetch', data, { timeout: 30000 }),
  import: (data) => api.post('/email-import/import', data),
};

export default api;
