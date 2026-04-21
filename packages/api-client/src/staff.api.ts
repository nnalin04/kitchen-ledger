import { getClient } from './client';
import type {
  Employee,
  Shift,
  Task,
  TipPool,
  Attendance,
} from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

// TODO: Extend with full typed request/response shapes when types package covers all DTOs

export const staffApi = {
  // ─── Employees ─────────────────────────────────────────────────────────────

  employees: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Employee[]>> =>
      getClient().get('/api/staff/employees', { params }),

    get: (id: string): Promise<AxiosResponse<Employee>> =>
      getClient().get(`/api/staff/employees/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Employee>> =>
      getClient().post('/api/staff/employees', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Employee>> =>
      getClient().patch(`/api/staff/employees/${id}`, data),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/staff/employees/${id}`),
  },

  // ─── Shifts ────────────────────────────────────────────────────────────────

  shifts: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Shift[]>> =>
      getClient().get('/api/staff/shifts', { params }),

    get: (id: string): Promise<AxiosResponse<Shift>> =>
      getClient().get(`/api/staff/shifts/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Shift>> =>
      getClient().post('/api/staff/shifts', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Shift>> =>
      getClient().patch(`/api/staff/shifts/${id}`, data),

    cancel: (id: string, reason?: string): Promise<AxiosResponse<Shift>> =>
      getClient().post(`/api/staff/shifts/${id}/cancel`, { reason }),

    getSchedule: (params: { from: string; to: string }): Promise<AxiosResponse<Shift[]>> =>
      getClient().get('/api/staff/shifts/schedule', { params }),

    publishSchedule: (data: {
      weekStartDate: string;
      employeeIds?: string[];
    }): Promise<AxiosResponse<void>> =>
      getClient().post('/api/staff/shifts/publish', data),
  },

  // ─── Attendance ────────────────────────────────────────────────────────────

  attendance: {
    clockIn: (data: {
      employeeId: string;
      shiftId?: string;
      notes?: string;
    }): Promise<AxiosResponse<Attendance>> =>
      getClient().post('/api/staff/attendance/clock-in', data),

    clockOut: (data: {
      attendanceId: string;
      notes?: string;
    }): Promise<AxiosResponse<Attendance>> =>
      getClient().post('/api/staff/attendance/clock-out', data),

    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Attendance[]>> =>
      getClient().get('/api/staff/attendance', { params }),

    edit: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Attendance>> =>
      getClient().patch(`/api/staff/attendance/${id}`, data),

    getReport: (params?: {
      from?: string;
      to?: string;
      employeeId?: string;
    }): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/staff/attendance/report', { params }),
  },

  // ─── Tasks ─────────────────────────────────────────────────────────────────

  tasks: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<Task[]>> =>
      getClient().get('/api/staff/tasks', { params }),

    get: (id: string): Promise<AxiosResponse<Task>> =>
      getClient().get(`/api/staff/tasks/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<Task>> =>
      getClient().post('/api/staff/tasks', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<Task>> =>
      getClient().patch(`/api/staff/tasks/${id}`, data),

    complete: (id: string, data?: { notes?: string }): Promise<AxiosResponse<Task>> =>
      getClient().post(`/api/staff/tasks/${id}/complete`, data ?? {}),

    delete: (id: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/staff/tasks/${id}`),

    getDailyChecklist: (date?: string): Promise<AxiosResponse<Task[]>> =>
      getClient().get('/api/staff/tasks/daily-checklist', { params: { date } }),
  },

  // ─── Shift Feedback ────────────────────────────────────────────────────────

  shiftFeedback: {
    submit: (
      shiftId: string,
      data: { rating: number; comment?: string },
    ): Promise<AxiosResponse<unknown>> =>
      getClient().post(`/api/staff/shifts/${shiftId}/feedback`, data),

    get: (shiftId: string): Promise<AxiosResponse<unknown>> =>
      getClient().get(`/api/staff/shifts/${shiftId}/feedback`),

    getSummary: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().get('/api/staff/shifts/feedback/summary', { params }),
  },

  // ─── Tips ──────────────────────────────────────────────────────────────────

  tips: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<TipPool[]>> =>
      getClient().get('/api/staff/tip-pools', { params }),

    get: (id: string): Promise<AxiosResponse<TipPool>> =>
      getClient().get(`/api/staff/tip-pools/${id}`),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<TipPool>> =>
      getClient().post('/api/staff/tip-pools', data),

    calculate: (id: string): Promise<AxiosResponse<TipPool>> =>
      getClient().post(`/api/staff/tip-pools/${id}/calculate`),

    distribute: (id: string): Promise<AxiosResponse<TipPool>> =>
      getClient().post(`/api/staff/tip-pools/${id}/distribute`),

    getPayouts: (id: string): Promise<AxiosResponse<unknown[]>> =>
      getClient().get(`/api/staff/tip-pools/${id}/payouts`),
  },

  // ─── Goals ─────────────────────────────────────────────────────────────────

  goals: {
    list: (params?: Record<string, unknown>): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/staff/goals', { params }),

    create: (data: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().post('/api/staff/goals', data),

    update: (id: string, data: Record<string, unknown>): Promise<AxiosResponse<unknown>> =>
      getClient().patch(`/api/staff/goals/${id}`, data),
  },

  // ─── Certifications ────────────────────────────────────────────────────────

  certifications: {
    list: (employeeId: string): Promise<AxiosResponse<unknown[]>> =>
      getClient().get(`/api/staff/employees/${employeeId}/certifications`),

    add: (
      employeeId: string,
      data: Record<string, unknown>,
    ): Promise<AxiosResponse<unknown>> =>
      getClient().post(`/api/staff/employees/${employeeId}/certifications`, data),

    delete: (employeeId: string, certId: string): Promise<AxiosResponse<void>> =>
      getClient().delete(`/api/staff/employees/${employeeId}/certifications/${certId}`),
  },
};
