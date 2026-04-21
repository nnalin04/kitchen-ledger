import { getClient } from './client';
import type {
  Account,
  Vendor,
  DailySalesReport,
  Expense,
  PLReport,
  FinanceDashboard,
} from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

// TODO: Extend with full typed request/response shapes when types package covers all DTOs

export const financeApi = {
  // ─── Chart of Accounts ─────────────────────────────────────────────────────

  accounts: {
    list: (): Promise<AxiosResponse<Account[]>> =>
      getClient().get('/api/finance/accounts'),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Account>> =>
      getClient().post('/api/finance/accounts', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Account>> =>
      getClient().patch(`/api/finance/accounts/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/finance/accounts/${id}`),
  },

  // ─── Vendors ───────────────────────────────────────────────────────────────

  vendors: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Vendor[]>> =>
      getClient().get('/api/finance/vendors', { params }),

    get: (id: string): Promise<AxiosResponse<Vendor>> =>
      getClient().get(`/api/finance/vendors/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Vendor>> =>
      getClient().post('/api/finance/vendors', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Vendor>> =>
      getClient().patch(`/api/finance/vendors/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/finance/vendors/${id}`),

    getBalance: (id: string): Promise<AxiosResponse<{ outstandingBalance: number }>> =>
      getClient().get(`/api/finance/vendors/${id}/balance`),
  },

  // ─── Daily Sales Reports ───────────────────────────────────────────────────

  dailyReports: {
    list: (params?: { from?: string; to?: string }): Promise<AxiosResponse<DailySalesReport[]>> =>
      getClient().get('/api/finance/daily-reports', { params }),

    get: (date: string): Promise<AxiosResponse<DailySalesReport>> =>
      getClient().get(`/api/finance/daily-reports/${date}`),

    save: (data: Record<string, unknown>): Promise<AxiosResponse<DailySalesReport>> =>
      getClient().post('/api/finance/daily-reports', data),

    reconcile: (
      date: string,
      data: { cashCountActual: number; notes?: string },
    ): Promise<AxiosResponse<DailySalesReport>> =>
      getClient().post(`/api/finance/daily-reports/${date}/reconcile`, data),

    getTrends: (params?: { from?: string; to?: string }): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/daily-reports/trends', { params }),
  },

  // ─── Expenses ──────────────────────────────────────────────────────────────

  expenses: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Expense[]>> =>
      getClient().get('/api/finance/expenses', { params }),

    get: (id: string): Promise<AxiosResponse<Expense>> =>
      getClient().get(`/api/finance/expenses/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Expense>> =>
      getClient().post('/api/finance/expenses', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Expense>> =>
      getClient().patch(`/api/finance/expenses/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/finance/expenses/${id}`),
  },

  // ─── Vendor Payments ───────────────────────────────────────────────────────

  vendorPayments: {
    record: (data: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().post('/api/finance/vendor-payments', data),

    getHistory: (vendorId: string, params?: Record<string, unknown>): Promise<AxiosResponse<unknown[]>> =>
      getClient().get(`/api/finance/vendor-payments`, { params: { vendorId, ...params } }),
  },

  // ─── Accounts Payable ──────────────────────────────────────────────────────

  ap: {
    getSummary: (): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/ap/summary'),

    getAgingDetail: (): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/ap/aging'),
  },

  // ─── UPI ───────────────────────────────────────────────────────────────────

  upi: {
    generateQr: (data: {
      amount: number;
      description?: string;
    }): Promise<AxiosResponse<{ qrDataUrl: string; upiUri: string }>> =>
      getClient().post('/api/finance/upi/qr', data),
  },

  // ─── Reports ───────────────────────────────────────────────────────────────

  reports: {
    getPL: (params: { from: string; to: string }): Promise<AxiosResponse<PLReport>> =>
      getClient().get('/api/finance/reports/pl', { params }),

    getExpenses: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/reports/expenses', { params }),

    getCashFlow: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/reports/cash-flow', { params }),

    getTax: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/finance/reports/tax', { params }),

    getDashboard: (): Promise<AxiosResponse<FinanceDashboard>> =>
      getClient().get('/api/finance/reports/dashboard'),
  },
};
