// 依 QCLI_DATA_SOURCE 選擇實作（plan §6.1）：預設 supabase（真實資料），mock 只供本機示範。

import { mockServices } from './mock';
import { createSupabaseServices } from './supabase';
import type { Services } from './types';

function pick(): Services {
  const source = import.meta.env.QCLI_DATA_SOURCE || 'supabase';
  if (source === 'mock') return mockServices;

  const url = import.meta.env.QCLI_SUPABASE_URL;
  const key = import.meta.env.QCLI_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      '[ECHO] 缺少 QCLI_SUPABASE_URL 或 QCLI_SUPABASE_PUBLISHABLE_KEY（見 .env.example）；' +
        '只想看假資料請設定 QCLI_DATA_SOURCE=mock。',
    );
  }
  return createSupabaseServices(url, key);
}

export const services: Services = pick();
export { ServiceError } from './types';
export type { ServiceErrorCode } from './types';
