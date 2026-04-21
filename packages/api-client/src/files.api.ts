import { getClient } from './client';
import type { FileUpload } from '@kitchenledger/types';
import type { AxiosResponse } from 'axios';

export const filesApi = {
  upload: (
    formData: FormData,
    context?: string,
    referenceId?: string,
  ): Promise<AxiosResponse<FileUpload>> =>
    getClient().post('/api/files/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      params: { context, referenceId },
    }),

  presign: (data: {
    filename: string;
    mimeType: string;
    context?: string;
  }): Promise<AxiosResponse<{ uploadUrl: string; fileId: string; storagePath: string }>> =>
    getClient().post('/api/files/presign', data),

  confirm: (fileId: string): Promise<AxiosResponse<FileUpload>> =>
    getClient().post(`/api/files/${fileId}/confirm`),

  get: (fileId: string): Promise<AxiosResponse<FileUpload>> =>
    getClient().get(`/api/files/${fileId}`),

  delete: (fileId: string): Promise<AxiosResponse<void>> =>
    getClient().delete(`/api/files/${fileId}`),

  getByReference: (referenceId: string): Promise<AxiosResponse<FileUpload[]>> =>
    getClient().get('/api/files', { params: { referenceId } }),
};
