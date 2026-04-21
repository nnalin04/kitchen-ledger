import { getClient } from './client';
import type { AIJob, OCRResult, VoiceParseResult, NLQueryResult } from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

export const aiApi = {
  // ─── OCR ───────────────────────────────────────────────────────────────────

  ocr: {
    /** Submit a handwritten notebook image for OCR processing. Returns a job ID. */
    submitNotebook: (data: {
      fileId: string;
      hint?: string;
    }): Promise<AxiosResponse<AIJob>> =>
      getClient().post('/api/ai/ocr/notebook', data),

    /** Poll the status and result of an OCR job. */
    pollJob: (jobId: string): Promise<AxiosResponse<AIJob & { result?: OCRResult }>> =>
      getClient().get(`/api/ai/ocr/jobs/${jobId}`),

    /** Commit OCR results (apply matched items to inventory counts). */
    commitJob: (
      jobId: string,
      data: { countId: string; selectedItems: string[] },
    ): Promise<AxiosResponse<void>> =>
      getClient().post(`/api/ai/ocr/jobs/${jobId}/commit`, data),

    /** Submit a receipt image for OCR to auto-fill a stock receipt. */
    submitReceipt: (data: {
      fileId: string;
      purchaseOrderId?: string;
    }): Promise<AxiosResponse<AIJob>> =>
      getClient().post('/api/ai/ocr/receipt', data),
  },

  // ─── Voice ─────────────────────────────────────────────────────────────────

  voice: {
    /** Transcribe and parse a voice recording (waste log / count update). */
    transcribe: (formData: FormData): Promise<AxiosResponse<AIJob & { result?: VoiceParseResult }>> =>
      getClient().post('/api/ai/voice/transcribe', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
  },

  // ─── Natural Language Query ────────────────────────────────────────────────

  query: {
    /** Ask a natural-language question against restaurant data. */
    ask: (data: { question: string }): Promise<AxiosResponse<NLQueryResult>> =>
      getClient().post('/api/ai/query', data),
  },

  // ─── Forecasting ───────────────────────────────────────────────────────────

  forecast: {
    /** Get demand forecast for a specific inventory item. */
    getItemForecast: (
      itemId: string,
      params?: { days?: number },
    ): Promise<AxiosResponse<unknown>> =>
      getClient().get(`/api/ai/forecast/items/${itemId}`, { params }),

    /** Get anomaly detection results (price spikes, unusual waste, etc.). */
    getAnomalies: (params?: {
      from?: string;
      to?: string;
      type?: string;
    }): Promise<AxiosResponse<unknown[]>> =>
      getClient().get('/api/ai/forecast/anomalies', { params }),
  },
};
