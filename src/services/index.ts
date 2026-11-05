// 依 QCLI_DATA_SOURCE 選擇實作（plan §6.1）。Phase 3 加入 supabase 實作。

import { mockServices } from './mock';
import type { Services } from './types';

function pick(): Services {
  const source = import.meta.env.QCLI_DATA_SOURCE ?? 'mock';
  if (source !== 'mock') {
    console.warn(`[ECHO] 資料來源「${source}」尚未實作（Phase 3），改用假資料。`);
  }
  return mockServices;
}

export const services: Services = pick();
export { ServiceError } from './types';
export type { ServiceErrorCode } from './types';
