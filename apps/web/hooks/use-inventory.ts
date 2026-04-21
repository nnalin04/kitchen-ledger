import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

export function useInventoryAlerts() {
  return useSWR('/api/inventory/alerts', fetcher, { refreshInterval: 120_000 });
}
