import type { SiteBannerResponseDto } from '@streets/shared';
import { api } from './client.js';

export const siteApi = {
  banner: () => api.get<SiteBannerResponseDto>('/site/banner'),
};
