import { getClient } from './client';
import type { ReportJob, ReportType } from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

export const reportsApi = {
  requestReport: (data: {
    reportType: ReportType;
    outputFormat: 'pdf' | 'csv' | 'json';
    parameters?: Record<string, unknown>;
  }): Promise<AxiosResponse<ReportJob>> =>
    getClient().post('/api/reports/jobs', data),

  listJobs: (params?: {
    page?: number;
    size?: number;
    status?: string;
  }): Promise<AxiosResponse<ReportJob[]>> =>
    getClient().get('/api/reports/jobs', { params }),

  getJob: (jobId: string): Promise<AxiosResponse<ReportJob>> =>
    getClient().get(`/api/reports/jobs/${jobId}`),

  getDownloadUrl: (jobId: string): Promise<AxiosResponse<{ url: string; expiresAt: string }>> =>
    getClient().get(`/api/reports/jobs/${jobId}/download`),
};
