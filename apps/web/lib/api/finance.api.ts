import { apiClient } from './client';

export const financeApi = {
  getDashboard: () => apiClient.get('/api/v1/finance/dashboard').then(r => r.data),
  dailyReports: {
    get: (date: string) => apiClient.get(`/api/v1/finance/daily-sales-reports/date/${date}`).then(r => r.data),
    save: (date: string, data: unknown) =>
      apiClient.put(`/api/v1/finance/daily-sales-reports/date/${date}`, data).then(r => r.data),
    reconcile: (date: string, data: unknown) =>
      apiClient.post(`/api/v1/finance/daily-sales-reports/date/${date}/reconcile`, data).then(r => r.data),
    listTrends: () => apiClient.get('/api/v1/finance/daily-sales-reports/trends').then(r => r.data),
  },
  expenses: {
    list: (params?: unknown) =>
      apiClient.get('/api/v1/finance/expenses', { params }).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/finance/expenses', data).then(r => r.data),
    update: (id: string, data: unknown) =>
      apiClient.put(`/api/v1/finance/expenses/${id}`, data).then(r => r.data),
    delete: (id: string) =>
      apiClient.delete(`/api/v1/finance/expenses/${id}`).then(r => r.data),
  },
  vendors: {
    list: () => apiClient.get('/api/v1/finance/vendors').then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/finance/vendors', data).then(r => r.data),
    update: (id: string, data: unknown) =>
      apiClient.put(`/api/v1/finance/vendors/${id}`, data).then(r => r.data),
  },
  ap: {
    getSummary: () => apiClient.get('/api/v1/finance/ap/summary').then(r => r.data),
    getAgingDetail: () => apiClient.get('/api/v1/finance/ap/aging').then(r => r.data),
  },
  reports: {
    getPL: (params: { start: string; end: string; compare_start?: string; compare_end?: string }) =>
      apiClient.get('/api/v1/finance/reports/pl', { params }).then(r => r.data),
    getExpenseBreakdown: (params: { start: string; end: string }) =>
      apiClient.get('/api/v1/finance/reports/expenses', { params }).then(r => r.data),
    getCashFlow: () =>
      apiClient.get('/api/v1/finance/reports/cash-flow').then(r => r.data),
    getTax: (params: { start: string; end: string }) =>
      apiClient.get('/api/v1/finance/reports/tax', { params }).then(r => r.data),
  },
  upi: {
    generateQr: (data: { amount: number; description?: string; report_date?: string }) =>
      apiClient.post('/api/v1/finance/upi/generate-qr', data).then(r => r.data),
  },
};
