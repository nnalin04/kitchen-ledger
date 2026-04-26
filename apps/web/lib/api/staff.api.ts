import { apiClient } from './client';

export const staffApi = {
  employees: {
    list: (params?: unknown) => apiClient.get('/api/v1/staff/employees', { params }).then(r => r.data),
    getById: (id: string) => apiClient.get(`/api/v1/staff/employees/${id}`).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/staff/employees', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/staff/employees/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api/v1/staff/employees/${id}`).then(r => r.data),
  },
  schedule: {
    getWeekly: (weekStart: string) => apiClient.get('/api/v1/staff/schedule', { params: { weekStart } }).then(r => r.data),
    publish: (data: unknown) => apiClient.post('/api/v1/staff/schedule/publish', data).then(r => r.data),
    createShift: (data: unknown) => apiClient.post('/api/v1/staff/shifts', data).then(r => r.data),
    updateShift: (id: string, data: unknown) => apiClient.patch(`/api/v1/staff/shifts/${id}`, data).then(r => r.data),
    cancelShift: (id: string) => apiClient.delete(`/api/v1/staff/shifts/${id}`).then(r => r.data),
  },
  shifts: {
    listByEmployee: (employeeId: string, from?: string, to?: string) =>
      apiClient.get(`/api/v1/staff/employees/${employeeId}/shifts`, { params: { from, to } }).then(r => r.data),
  },
  attendance: {
    list: (params?: unknown) => apiClient.get('/api/v1/staff/attendance', { params }).then(r => r.data),
    listByEmployee: (employeeId: string, params?: unknown) =>
      apiClient.get(`/api/v1/staff/employees/${employeeId}/attendance`, { params }).then(r => r.data),
    listByWeek: (weekStart: string) =>
      apiClient.get('/api/v1/staff/attendance/week', { params: { weekStart } }).then(r => r.data),
    approve: (weekStart: string) =>
      apiClient.post('/api/v1/staff/attendance/approve', { weekStart }).then(r => r.data),
    getReport: (params?: unknown) => apiClient.get('/api/v1/staff/attendance/report', { params }).then(r => r.data),
    edit: (id: string, data: unknown) => apiClient.patch(`/api/v1/staff/attendance/${id}`, data).then(r => r.data),
  },
  certifications: {
    list: (employeeId?: string) =>
      apiClient.get('/api/v1/staff/certifications', { params: employeeId ? { employeeId } : undefined }).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/staff/certifications', data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api/v1/staff/certifications/${id}`).then(r => r.data),
  },
  tasks: {
    list: (params?: unknown) => apiClient.get('/api/v1/staff/tasks', { params }).then(r => r.data),
    getChecklist: (date: string) => apiClient.get(`/api/v1/staff/tasks/checklist/${date}`).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/staff/tasks', data).then(r => r.data),
    complete: (id: string, data: unknown) => apiClient.post(`/api/v1/staff/tasks/${id}/complete`, data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/staff/tasks/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api/v1/staff/tasks/${id}`).then(r => r.data),
  },
  tipPools: {
    list: (params?: unknown) => apiClient.get('/api/v1/staff/tips', { params }).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/staff/tips', data).then(r => r.data),
    getPayouts: (id: string) => apiClient.get(`/api/v1/staff/tips/${id}/payouts`).then(r => r.data),
    calculate: (id: string) => apiClient.post(`/api/v1/staff/tips/${id}/calculate`).then(r => r.data),
    distribute: (id: string) => apiClient.post(`/api/v1/staff/tips/${id}/distribute`).then(r => r.data),
  },
  // keep old tips alias for backward compat
  tips: {
    list: () => apiClient.get('/api/v1/staff/tips').then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/staff/tips', data).then(r => r.data),
    calculate: (id: string) => apiClient.post(`/api/v1/staff/tips/${id}/calculate`).then(r => r.data),
    distribute: (id: string) => apiClient.post(`/api/v1/staff/tips/${id}/distribute`).then(r => r.data),
    getPayouts: (id: string) => apiClient.get(`/api/v1/staff/tips/${id}/payouts`).then(r => r.data),
  },
};
