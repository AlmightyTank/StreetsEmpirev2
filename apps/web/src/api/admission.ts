import type { AdmissionStatusDto } from '@streets/shared';
import { api } from './client.js';

export const admissionApi = {
  status: () => api.get<AdmissionStatusDto>('/admission/status'),
  join: () => api.post<AdmissionStatusDto>('/admission/join', {}),
  renew: () => api.post<AdmissionStatusDto>('/admission/renew', {}),
  leave: () => api.post<{ ok: true }>('/admission/leave', {}),
};
