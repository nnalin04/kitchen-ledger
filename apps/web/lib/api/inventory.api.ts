import { apiClient } from './client';

export const inventoryApi = {
  items: {
    list: (params?: { page?: number; size?: number; search?: string; abcCategory?: string; lowStockOnly?: boolean }) =>
      apiClient.get('/api/v1/inventory/items', { params }).then(r => r.data),
    get: (id: string) => apiClient.get(`/api/v1/inventory/items/${id}`).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/inventory/items', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/inventory/items/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api/v1/inventory/items/${id}`).then(r => r.data),
  },
  suppliers: {
    list: () => apiClient.get('/api/v1/inventory/suppliers').then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/inventory/suppliers', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/inventory/suppliers/${id}`, data).then(r => r.data),
    delete: (id: string) => apiClient.delete(`/api/v1/inventory/suppliers/${id}`).then(r => r.data),
  },
  purchaseOrders: {
    list: (params?: { status?: string }) =>
      apiClient.get('/api/v1/inventory/purchase-orders', { params }).then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/inventory/purchase-orders', data).then(r => r.data),
    getSuggestions: () => apiClient.get('/api/v1/inventory/purchase-orders/suggestions').then(r => r.data),
    send: (id: string, via: string) =>
      apiClient.post(`/api/v1/inventory/purchase-orders/${id}/send`, { via }).then(r => r.data),
  },
  receipts: {
    list: () => apiClient.get('/api/v1/inventory/receipts').then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/inventory/receipts', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/inventory/receipts/${id}`, data).then(r => r.data),
    confirm: (id: string) => apiClient.post(`/api/v1/inventory/receipts/${id}/confirm`).then(r => r.data),
  },
  counts: {
    list: () => apiClient.get('/api/v1/inventory/counts').then(r => r.data),
    start: (data: unknown) => apiClient.post('/api/v1/inventory/counts', data).then(r => r.data),
    updateItem: (countId: string, itemId: string, countedQty: number) =>
      apiClient
        .patch(`/api/v1/inventory/counts/${countId}/items/${itemId}`, { counted_quantity: countedQty })
        .then(r => r.data),
    complete: (id: string) => apiClient.post(`/api/v1/inventory/counts/${id}/complete`).then(r => r.data),
    verify: (id: string) => apiClient.post(`/api/v1/inventory/counts/${id}/verify`).then(r => r.data),
  },
  waste: {
    list: (params?: { startDate?: string; endDate?: string }) =>
      apiClient.get('/api/v1/inventory/waste', { params }).then(r => r.data),
    log: (data: unknown) => apiClient.post('/api/v1/inventory/waste', data).then(r => r.data),
    getReport: (params?: unknown) =>
      apiClient.get('/api/v1/inventory/waste/report', { params } as object).then(r => r.data),
  },
  recipes: {
    list: () => apiClient.get('/api/v1/inventory/recipes').then(r => r.data),
    create: (data: unknown) => apiClient.post('/api/v1/inventory/recipes', data).then(r => r.data),
    update: (id: string, data: unknown) => apiClient.patch(`/api/v1/inventory/recipes/${id}`, data).then(r => r.data),
    calculateCost: (id: string) =>
      apiClient.post(`/api/v1/inventory/recipes/${id}/calculate-cost`).then(r => r.data),
    getMenuEngineering: () => apiClient.get('/api/v1/inventory/menu-engineering').then(r => r.data),
  },
  alerts: {
    get: () => apiClient.get('/api/v1/inventory/alerts').then(r => r.data),
  },
};
