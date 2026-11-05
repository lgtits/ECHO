// 服務錯誤 → 畫面文案（ux.md §8）
import { ServiceError } from '@/services';

const MESSAGES: Record<string, string> = {
  rate_limited: '留言太頻繁，請稍後再試',
  session_closed: '本場次已結束，感謝你的回應',
  not_found: '找不到這筆資料，可能已被刪除',
  forbidden: '你沒有權限進行這個操作',
  invalid_credentials: '帳號或密碼錯誤',
  not_staff: '此帳號沒有管理權限',
  invalid_input: '內容格式不正確，請檢查後再試',
  network: '連線中斷，請確認網路後再試',
};

export function errorMessage(e: unknown): string {
  if (e instanceof ServiceError) return MESSAGES[e.code] ?? '發生錯誤，請稍後再試';
  return '發生錯誤，請稍後再試';
}
