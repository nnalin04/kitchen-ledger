import { apiClient } from './client';

export type ReportFormat = 'pdf' | 'csv' | 'xlsx';
export type ReportStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ReportJobRequest {
  report_type: string;
  parameters: Record<string, unknown>;
  output_format: ReportFormat;
}

export interface ReportJob {
  id: string;
  report_type: string;
  status: ReportStatus;
  output_format: ReportFormat;
  download_url?: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
}

export const reportApi = {
  jobs: {
    create: (data: ReportJobRequest) =>
      apiClient.post<{ data: ReportJob }>('/api/reports/jobs', data).then(r => r.data),

    get: (id: string) =>
      apiClient.get<{ data: ReportJob }>(`/api/reports/jobs/${id}`).then(r => r.data),

    download: (id: string) =>
      apiClient.get<{ data: { url: string } }>(`/api/reports/jobs/${id}/download`).then(r => r.data),
  },
};
