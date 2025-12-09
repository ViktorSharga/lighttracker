// api.ts - API client for LightTracker backend
import type {
  ScheduleResponse,
  DatesResponse,
  ScheduleByDateResponse,
  HistoryResponse,
  StatisticsResponse,
  StatusResponse,
  FetchResponse,
} from './types';

const BASE_URL = '';  // Uses Vite proxy

async function fetchJSON<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

export const api = {
  // Schedule endpoints
  getSchedule: () =>
    fetchJSON<ScheduleResponse>('/api/schedule'),

  getScheduleByDate: (dateKey: string) =>
    fetchJSON<ScheduleByDateResponse>(`/api/schedule/${dateKey}`),

  // Dates endpoint
  getDates: () =>
    fetchJSON<DatesResponse>('/api/dates'),

  // History endpoint
  getHistory: (dateKey: string) =>
    fetchJSON<HistoryResponse>(`/api/history/${dateKey}`),

  // Statistics endpoint
  getStatistics: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const query = params.toString();
    return fetchJSON<StatisticsResponse>(`/api/statistics${query ? `?${query}` : ''}`);
  },

  // Status endpoint
  getStatus: () =>
    fetchJSON<StatusResponse>('/api/status'),

  // Force fetch endpoint
  forceFetch: async (): Promise<FetchResponse> => {
    const response = await fetch(`${BASE_URL}/api/fetch`, { method: 'POST' });
    if (!response.ok) {
      if (response.status === 409) {
        throw new Error('Fetch already in progress');
      }
      throw new Error(`API error: ${response.status}`);
    }
    return response.json();
  },
};

export default api;
