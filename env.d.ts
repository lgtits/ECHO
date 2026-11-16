/**
 * 前端可讀取的環境變數（必須以 QCLI_ 開頭，Quasar 才會注入到 import.meta.env）。
 * 說明見 specs/001-sermon-qa/plan.md §7。
 *
 * https://quasar.dev/quasar-cli-vite/handling-import-meta-env#type-inference
 */
interface ImportMetaEnv {
  /** Supabase 專案 URL，例：https://xxxx.supabase.co */
  readonly QCLI_SUPABASE_URL: string;
  /** Supabase publishable（公開）金鑰；安全性由 RLS 保證 */
  readonly QCLI_SUPABASE_PUBLISHABLE_KEY: string;
  /** 正式網址，QR code 與分享連結一律使用它（不含結尾斜線） */
  readonly QCLI_SITE_URL?: string;
  /** 資料來源：supabase（預設，真實資料）或 mock（假資料，plan §6.1） */
  readonly QCLI_DATA_SOURCE?: 'mock' | 'supabase';
  /** 共用管理帳號的 Email，預設 admin@echo.local（spec D14；supabase/README.md） */
  readonly QCLI_ADMIN_EMAIL?: string;
}
