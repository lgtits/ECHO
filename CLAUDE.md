# ECHO — 主日講道 QA 留言板

Vue 3 + Quasar + Pinia + Supabase，部署於 GitHub Pages。

## 開發流程（Spec-Driven Development）

- 原則：`specs/constitution.md`
- 目前功能：`specs/001-sermon-qa/`（spec → ux → plan → tasks）
- 畫面與互動以 `ux.md` 為準；會友端與管理端共用 `PostCard`（`mode` 切換）。
- 開始任何工作前先讀對應的 spec / plan / tasks；完成任務後在 `tasks.md` 打勾。
- 實作與規格衝突時，先提出並更新 spec，再改程式碼。
- 權限一律以 Supabase RLS 實作，並附 pgTAP 測試；元件不得直接呼叫 supabase，須經 `src/services/`。
- UI 文字使用繁體中文（台灣用語）。
