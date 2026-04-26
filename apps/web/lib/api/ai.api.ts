import { apiClient } from './client';

export const aiApi = {
  ocr: {
    submitNotebook: (formData: FormData) =>
      apiClient
        .post('/api/ai/ocr/notebook', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(r => r.data),

    getJob: (jobId: string) =>
      apiClient.get(`/api/ai/ocr/notebook/${jobId}`).then(r => r.data),

    commitJob: (jobId: string, data: unknown) =>
      apiClient
        .post(`/api/ai/ocr/notebook/${jobId}/commit`, data)
        .then(r => r.data),

    submitReceipt: (formData: FormData) =>
      apiClient
        .post('/api/ai/ocr/receipt', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(r => r.data),
  },

  voice: {
    transcribe: (formData: FormData) =>
      apiClient
        .post('/api/ai/voice/transcribe', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        .then(r => r.data),

    getJob: (jobId: string) =>
      apiClient.get(`/api/ai/voice/${jobId}`).then(r => r.data),
  },

  query: {
    ask: (query: string) =>
      apiClient.post('/api/ai/query', { query }).then(r => r.data),
  },

  forecast: {
    demand: (data: { item_ids: string[]; horizon_days: number }) =>
      apiClient.post('/api/ai/forecast/demand', data).then(r => r.data),

    anomaly: (data: { metric: string; window_days: number }) =>
      apiClient.post('/api/ai/anomaly/detect', data).then(r => r.data),
  },
};
