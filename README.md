# ECHO — 主日講道 QA 留言板

會友掃描場次 QR code 就能留言、提問、附議；牧者登入後回應，並可在講台放大單則留言投影。每場次的 Q&A 永久保留。

- 技術：Vue 3 + Quasar（app-vite）+ Pinia + Supabase，部署於 GitHub Pages
- 規格（Spec-Driven Development）：
  - 原則 `specs/constitution.md`
  - 功能 `specs/001-sermon-qa/`：`spec.md` → `ux.md` → `plan.md` → `tasks.md`

## 開發

需要 Node 22.12 以上。

```bash
npm install
cp .env.example .env.local   # 填入 Supabase URL / publishable key
npm run dev                  # http://localhost:9000
```

| 指令                | 用途                                               |
| ------------------- | -------------------------------------------------- |
| `npm run dev`       | 開發伺服器                                         |
| `npm run build`     | 產生 `dist/spa`（含 history mode 用的 `404.html`） |
| `npm test`          | 單元測試（Vitest）                                 |
| `npm run typecheck` | 型別檢查                                           |
| `npm run lint`      | Prettier + ESLint 自動修正                         |

## UI 原型（假資料模式）

目前是 UI 先行階段（spec D8），不需要 Supabase 就能完整操作：`npm run dev` 後打開 http://localhost:9000 即可。

- 會友端：首頁 `/`、示範場次 `/s/K7PM2X`、放大 `/s/K7PM2X/stage`、固定入口 `/now`
- 管理端：`/admin`，**任何 Email 與密碼都能登入**
  - Email 含 `member` → 「此帳號沒有管理權限」
  - 密碼 `wrong` → 「帳號或密碼錯誤」
  - 其餘 → 以「王牧師」登入（管理帳號只有一種身分，spec D12）
- 同一台電腦開兩個分頁（一個會友、一個管理端），操作會即時同步
- 管理端右上角帳號選單的「示範工具」可以：
  - 開關模擬會友活動
  - 模擬斷線
  - 重設示範資料
- 假資料存在瀏覽器 localStorage

## 環境變數

前端用的變數須以 `QCLI_` 開頭，詳見 `plan.md` §7。

| 變數                            | 說明                                          |
| ------------------------------- | --------------------------------------------- |
| `QCLI_SUPABASE_URL`             | Supabase 專案 URL                             |
| `QCLI_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key                      |
| `QCLI_SITE_URL`                 | 正式網址；QR code 一律用它產生                |
| `BASE_PATH`                     | 網站路徑：github.io 為 `echo`，自訂網域為 `/` |

在 Windows Git Bash 打包 github.io 版本時，請寫 `BASE_PATH=echo npm run build`，不要寫 `/echo/`，因為 Git Bash 會把它改成 Windows 路徑。
