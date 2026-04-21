import useSWR from 'swr';
import { apiClient } from '@/lib/api/client';

const fetcher = (url: string) => apiClient.get(url).then(r => r.data.data);

export function useFinanceDashboard() {
  return useSWR('/api/finance/dashboard', fetcher, { refreshInterval: 60_000 });
}
