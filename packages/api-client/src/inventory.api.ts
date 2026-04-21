import { getClient } from './client';
import type {
  InventoryItem,
  Supplier,
  PurchaseOrder,
  StockReceipt,
  WasteLog,
  Recipe,
  InventoryCount,
  InventoryAlerts,
} from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

// TODO: Extend with full typed request/response shapes when types package covers all DTOs

export const inventoryApi = {
  // ─── Items ─────────────────────────────────────────────────────────────────

  items: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<InventoryItem[]>> =>
      getClient().get('/api/inventory/items', { params }),

    get: (id: string): Promise<AxiosResponse<InventoryItem>> =>
      getClient().get(`/api/inventory/items/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<InventoryItem>> =>
      getClient().post('/api/inventory/items', data),

    update: (
      id: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<InventoryItem>> =>
      getClient().patch(`/api/inventory/items/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/inventory/items/${id}`),

    byBarcode: (barcode: string): Promise<AxiosResponse<InventoryItem>> =>
      getClient().get('/api/inventory/items/barcode', { params: { barcode } }),

    import: (formData: FormData): Promise<AxiosResponse<{ imported: number; errors: unknown[] }>> =>
      getClient().post('/api/inventory/items/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),

    setOpeningStock: (
      id: string,
      data: { quantity: number; unit: string; costPerUnit?: number },
    ): Promise<AxiosResponse<InventoryItem>> =>
      getClient().post(`/api/inventory/items/${id}/opening-stock`, data),
  },

  // ─── Categories ────────────────────────────────────────────────────────────

  categories: {
    list: (): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/inventory/categories'),

    create: (data: { name: string; description?: string }): Promise<AxiosResponse<unknown>> =>
      getClient().post('/api/inventory/categories', data),

    update: (
      id: string,
      data: { name?: string; description?: string },
    ): Promise<AxiosResponse<unknown>> =>
      getClient().patch(`/api/inventory/categories/${id}`, data),
  },

  // ─── Suppliers ─────────────────────────────────────────────────────────────

  suppliers: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Supplier[]>> =>
      getClient().get('/api/inventory/suppliers', { params }),

    get: (id: string): Promise<AxiosResponse<Supplier>> =>
      getClient().get(`/api/inventory/suppliers/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Supplier>> =>
      getClient().post('/api/inventory/suppliers', data),

    update: (
      id: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<Supplier>> =>
      getClient().patch(`/api/inventory/suppliers/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/inventory/suppliers/${id}`),

    getItems: (id: string): Promise<AxiosResponse<InventoryItem[]>> =>
      getClient().get(`/api/inventory/suppliers/${id}/items`),
  },

  // ─── Item-Supplier links ───────────────────────────────────────────────────

  itemSuppliers: {
    add: (
      itemId: string,
      data: { supplierId: string; unitPrice: number; supplierSku?: string },
    ): Promise<AxiosResponse<unknown>> =>
      getClient().post(`/api/inventory/items/${itemId}/suppliers`, data),

    update: (
      itemId: string,
      supplierId: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<unknown>> =>
      getClient().patch(`/api/inventory/items/${itemId}/suppliers/${supplierId}`, data),

    remove: (itemId: string, supplierId: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/inventory/items/${itemId}/suppliers/${supplierId}`),
  },

  // ─── Purchase Orders ───────────────────────────────────────────────────────

  purchaseOrders: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<PurchaseOrder[]>> =>
      getClient().get('/api/inventory/purchase-orders', { params }),

    get: (id: string): Promise<AxiosResponse<PurchaseOrder>> =>
      getClient().get(`/api/inventory/purchase-orders/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<PurchaseOrder>> =>
      getClient().post('/api/inventory/purchase-orders', data),

    update: (
      id: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<PurchaseOrder>> =>
      getClient().patch(`/api/inventory/purchase-orders/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/inventory/purchase-orders/${id}`),

    send: (
      id: string,
      data: { via: string; message?: string },
    ): Promise<AxiosResponse<PurchaseOrder>> =>
      getClient().post(`/api/inventory/purchase-orders/${id}/send`, data),

    getSuggestions: (): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/inventory/purchase-orders/suggestions'),
  },

  // ─── Stock Receipts ────────────────────────────────────────────────────────

  receipts: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<StockReceipt[]>> =>
      getClient().get('/api/inventory/receipts', { params }),

    get: (id: string): Promise<AxiosResponse<StockReceipt>> =>
      getClient().get(`/api/inventory/receipts/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<StockReceipt>> =>
      getClient().post('/api/inventory/receipts', data),

    update: (
      id: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<StockReceipt>> =>
      getClient().patch(`/api/inventory/receipts/${id}`, data),

    confirm: (id: string): Promise<AxiosResponse<StockReceipt>> =>
      getClient().post(`/api/inventory/receipts/${id}/confirm`),
  },

  // ─── Waste Logs ────────────────────────────────────────────────────────────

  waste: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<WasteLog[]>> =>
      getClient().get('/api/inventory/waste', { params }),

    log: (data: Record<string, unknown>): Promise<AxiosResponse<WasteLog>> =>
      getClient().post('/api/inventory/waste', data),

    getReport: (params?: {
      from: string;
      to: string;
    }): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/inventory/waste/report', { params }),
  },

  // ─── Inventory Counts ──────────────────────────────────────────────────────

  counts: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<InventoryCount[]>> =>
      getClient().get('/api/inventory/counts', { params }),

    get: (id: string): Promise<AxiosResponse<InventoryCount>> =>
      getClient().get(`/api/inventory/counts/${id}`),

    start: (data: { countType: string; countDate: string }): Promise<AxiosResponse<InventoryCount>> =>
      getClient().post('/api/inventory/counts', data),

    updateItem: (
      countId: string,
      itemId: string,
      data: { countedQuantity: number; notes?: string },
    ): Promise<AxiosResponse<unknown>> =>
      getClient().patch(`/api/inventory/counts/${countId}/items/${itemId}`, data),

    complete: (id: string): Promise<AxiosResponse<InventoryCount>> =>
      getClient().post(`/api/inventory/counts/${id}/complete`),

    verify: (id: string): Promise<AxiosResponse<InventoryCount>> =>
      getClient().post(`/api/inventory/counts/${id}/verify`),

    getVarianceReport: (id: string): Promise<AxiosResponse<unknown>> =>
      getClient().get(`/api/inventory/counts/${id}/variance-report`),
  },

  // ─── Transfers ─────────────────────────────────────────────────────────────

  transfers: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/inventory/transfers', { params }),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().post('/api/inventory/transfers', data),
  },

  // ─── Movements ─────────────────────────────────────────────────────────────

  movements: {
    getForItem: (
      itemId: string,
      params?: Record<string, unknown>,
    ): Promise<AxiosResponse<unknown[]>> =>
      getClient().get(`/api/inventory/items/${itemId}/movements`, { params }),

    getAll: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/inventory/movements', { params }),
  },

  // ─── Alerts ────────────────────────────────────────────────────────────────

  alerts: {
    get: (): Promise<AxiosResponse<InventoryAlerts>> =>
      getClient().get('/api/inventory/alerts'),
  },

  // ─── Recipes ───────────────────────────────────────────────────────────────

  recipes: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Recipe[]>> =>
      getClient().get('/api/inventory/recipes', { params }),

    get: (id: string): Promise<AxiosResponse<Recipe>> =>
      getClient().get(`/api/inventory/recipes/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Recipe>> =>
      getClient().post('/api/inventory/recipes', data),

    update: (
      id: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<Recipe>> =>
      getClient().patch(`/api/inventory/recipes/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/inventory/recipes/${id}`),

    calculateCost: (id: string): Promise<AxiosResponse<{ totalCost: number; foodCostPercent: number }>> =>
      getClient().get(`/api/inventory/recipes/${id}/cost`),

    getMenuEngineering: (params?: {
      from?: string;
      to?: string;
    }): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/inventory/recipes/menu-engineering', { params }),
  },

  // ─── Sync (mobile offline) ─────────────────────────────────────────────────

  sync: {
    pull: (params?: { since?: string }): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/inventory/sync/pull', { params }),
  },
};
