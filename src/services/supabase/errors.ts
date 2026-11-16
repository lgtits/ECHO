// Supabase / Postgres 錯誤 → ServiceError（T107；文案見 utils/errors.ts、ux.md §8）

import { ServiceError, type ServiceErrorCode } from '../types';

const CUSTOM = /echo:(\w+)/;

const KNOWN: ServiceErrorCode[] = [
  'rate_limited',
  'session_closed',
  'not_found',
  'forbidden',
  'invalid_credentials',
  'not_staff',
  'invalid_input',
  'network',
];

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

export function toServiceError(e: unknown): ServiceError {
  if (e instanceof ServiceError) return e;
  const err = (e ?? {}) as ErrorLike;
  const msg = err.message ?? '';

  // DB trigger / RPC 的自訂錯誤：raise exception 'echo:<code>'
  const m = CUSTOM.exec(msg);
  if (m && KNOWN.includes(m[1] as ServiceErrorCode)) {
    return new ServiceError(m[1] as ServiceErrorCode, msg);
  }

  switch (err.code) {
    case '42501': // RLS 或欄位權限拒絕
      return new ServiceError('forbidden', msg);
    case '23514': // check constraint（長度等）
    case '22001':
    case '22P02':
    case '23502':
      return new ServiceError('invalid_input', msg);
    case 'PGRST116': // .single() 找不到
    case '23503': // 外鍵：對象已被刪除
      return new ServiceError('not_found', msg);
  }

  if (/fetch|network|Load failed/i.test(msg) || err.name === 'AuthRetryableFetchError') {
    return new ServiceError('network', msg);
  }
  return new ServiceError('unknown', msg);
}

/**
 * supabase-js 回傳 { data, error }：有 error 就丟出 ServiceError。
 * 可能查無資料（maybeSingle）時請明確寫 check<Row | null>(...)。
 */
export function check<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw toServiceError(res.error);
  return res.data as T;
}
