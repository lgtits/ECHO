# 技術規劃：主日講道 QA 留言板

- **對應規格**：[spec.md](./spec.md)
- **狀態**：草稿（待確認）

## 1. 技術選型

| 層         | 選擇                                             | 理由                                                                              |
| ---------- | ------------------------------------------------ | --------------------------------------------------------------------------------- |
| 前端框架   | Vue 3 (`<script setup>` + TypeScript)            | 指定                                                                              |
| UI         | Quasar 2（Quasar CLI + Vite）                    | 指定；行動版元件完整                                                              |
| 狀態管理   | Pinia                                            | Quasar 官方整合                                                                   |
| 路由       | vue-router **history 模式**                      | 網址乾淨、QR code 較短；GitHub Pages 以 `404.html` 承接 SPA 路由（見 §7）         |
| 後端       | Supabase（Postgres + Auth + Realtime）           | 指定；無需自建伺服器                                                              |
| 會友身分   | Supabase **Anonymous Sign-in**                   | 每個裝置取得真正的 `auth.uid()`，RLS 才能強制「每人附議一次」「只能刪自己的留言」 |
| 管理者身分 | Supabase Email + Password（一個共用帳號）        | 畫面只輸入密碼，Email 固定（`QCLI_ADMIN_EMAIL`）；帳號由後台建立（spec D14）      |
| QR code    | `qrcode` npm 套件                                | 純前端產生，可輸出 PNG                                                            |
| 測試       | Vitest（前端）、pgTAP（RLS，`supabase test db`） | 憲章要求                                                                          |
| 部署       | GitHub Actions → GitHub Pages                    | 指定                                                                              |

> 前端的 Supabase publishable (anon) key 會公開在網頁中，這是正常的；安全性完全依賴 RLS（見憲章）。

## 2. 架構

```
 會友手機 ──掃 QR──▶  GitHub Pages (Quasar SPA)
                       │  supabase-js
                       ▼
                 Supabase
                 ├─ Auth：匿名（會友）/ Email（管理者，單一身分）
                 ├─ Postgres：tables + RLS + triggers
                 └─ Realtime：postgres_changes + broadcast
```

## 3. 資料模型

```sql
-- 列舉
create type session_status as enum ('draft', 'open', 'closed');

-- 管理者（牧者、同工權限相同，spec D12）
create table staff_members (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text not null,            -- 例：王牧師
  created_at   timestamptz not null default now()
);

-- 場次
create table sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique default gen_session_code(), -- 6 碼，排除 0O1IL
  title       text not null check (char_length(title) between 1 and 100),
  speaker     text,
  scripture   text,
  sermon_date date not null,
  status      session_status not null default 'draft',
  auto_close_at timestamptz,             -- 自動結束時間，可為空（AC5.9）
  created_by  uuid references staff_members(user_id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 留言
create table posts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions on delete cascade,
  author_id    uuid references auth.users on delete set null,  -- trigger 強制 = auth.uid()
  nickname     text check (char_length(nickname) <= 20),
  body         text not null check (char_length(body) between 1 and 500),
  upvote_count int  not null default 0,   -- trigger 維護
  reply_count  int  not null default 0,   -- trigger 維護：未封存的牧者回覆數（>0 即「已回應」）
  comment_count int not null default 0,   -- trigger 維護：未封存、未隱藏的會友接續留言數（spec US10）
  is_hidden    boolean not null default false,
  hidden_by    uuid references staff_members(user_id),
  hidden_by_name text,                   -- 快照，管理端顯示「由 OO 隱藏」
  hidden_at    timestamptz,
  created_at   timestamptz not null default now()
);
create index on posts (session_id, created_at desc);

-- 附議
create table upvotes (
  post_id    uuid not null references posts on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)           -- 保證每人每則一次 (AC3.2)
);

-- 管理者回覆＋會友接續留言（spec US10、D21：同一張表，以 author_kind 區分）
create table replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts on delete cascade,
  session_id  uuid not null references sessions on delete cascade, -- 冗餘欄位：供 Realtime 以 session 過濾
  author_kind text not null default 'staff' check (author_kind in ('staff', 'member')),
  author_id   uuid references staff_members(user_id) on delete set null, -- 只有牧者回覆有值
  member_id   uuid references auth.users on delete set null, -- 只有接續留言有值；前端讀不到（D11），只供頻率限制
  author_name text not null,               -- 回應者名稱（預設「牧者」）或會友暱稱（預設「匿名」），1–20 字
  body        text not null check (char_length(body) between 1 and 2000), -- 接續留言另限 500 字
  is_hidden   boolean not null default false, -- 只有接續留言可以隱藏
  hidden_by   uuid references staff_members(user_id) on delete set null,
  hidden_at   timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
```

> **為什麼接續留言和回覆共用一張表？**（2026-11-23）兩者顯示位置、即時同步、封存方式都一樣，共用可以沿用 `replies` 的 Realtime 訂閱與 `archive_reply`。差別（誰能寫、算不算已回應、能不能隱藏）由 `author_kind` 決定，全部在 trigger 與 RLS 強制。會友作者另存 `member_id`，而不是放進前端讀得到的 `author_id`，避免洩漏匿名身分。

> **為什麼計數用欄位而不是即時 count？** 會友端排序「最多附議」需要直接 `order by upvote_count`，且 Realtime 可直接推送 posts 的 UPDATE。由 trigger 維護可避免前端偽造。

### 3.1 輔助函式（`security definer`, `stable`）

- `is_staff()`：`auth.uid()` 存在於 `staff_members`。
- `gen_session_code()`：產生不重複 6 碼。
- `session_is_writable(session_id)`：`status = 'open'` 且（`auto_close_at` 為空或 `now() < auto_close_at`）。發文、附議的檢查都用它，所以**到時間的那一秒就停止寫入**，不必等排程。

匿名使用者永遠不會在 `staff_members` 中，因此自然無法取得管理權限。

### 3.1.1 自動結束（AC5.9）

- 用 Supabase 內建的 **pg_cron** 擴充，每分鐘執行一次：
  `update sessions set status = 'closed' where status = 'open' and auto_close_at <= now();`
- 狀態改變會經由 Realtime 推送到所有開著的畫面（見 §5），會友端立即切換成唯讀。
- 寫入權限由 `session_is_writable()` 即時判斷，排程只負責讓 `status` 欄位跟上，所以最多一分鐘的延遲不影響正確性。
- 重新開放場次時，trigger 會清除 `auto_close_at`，避免一開放就馬上又被關掉。

### 3.2 Triggers

| Trigger                   | 時機                | 作用                                                                                                        |
| ------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `posts_before_insert`     | BEFORE INSERT       | 強制 `author_id = auth.uid()`；檢查 `session_is_writable()`；頻率限制（同一人 60 秒內 ≥ 5 則則拒絕，AC2.3） |
| `posts_before_update`     | BEFORE UPDATE       | 只允許變更 `is_hidden`；自動填 `hidden_by / hidden_at`                                                      |
| `upvotes_after_change`    | AFTER INSERT/DELETE | 更新 `posts.upvote_count`                                                                                   |
| `replies_before_insert`   | BEFORE INSERT       | 管理者：`author_kind = staff`、填 `author_id`，名稱空白時填「牧者」（spec D18）。會友：`author_kind = member`、填 `member_id`，名稱空白時填「匿名」，檢查留言可見且場次可寫入、60 秒內 ≥ 5 則拒絕（spec US10） |
| `replies_before_update`   | BEFORE UPDATE       | 接續留言不能改內容；只有接續留言能隱藏，自動填 `hidden_by / hidden_at`                                       |
| `replies_after_change`    | AFTER INSERT/DELETE/UPDATE OF deleted_at, is_hidden | 重新計算 `posts.reply_count`（牧者回覆）與 `comment_count`（未隱藏的接續留言）；封存、還原、隱藏都會更新，因此一定會產生 posts 的 UPDATE 事件 |
| `posts_broadcast_removed` | AFTER UPDATE/DELETE | 留言被隱藏或封存（刪除）時，以 `realtime.send` 廣播 `{post_id}` 到 `session:<id>`（見 §5）                  |
| `sessions_broadcast_removed` | AFTER UPDATE OF deleted_at | 場次被封存（刪除）時廣播 `session_removed` 到 `session:<id>`，開著的畫面顯示「找不到此場次」（spec D20） |
| `touch_updated_at`        | BEFORE UPDATE       | sessions / replies 的 `updated_at`                                                                          |
| `sessions_before_update`  | BEFORE UPDATE       | 狀態從 `closed` 改回 `open` 時清除 `auto_close_at`                                                          |

另以**欄位層級權限**限制會友可寫入的欄位：

```sql
revoke insert, update on posts from anon, authenticated;
grant insert (session_id, nickname, body) on posts to authenticated;   -- B-10 分類日後再以 migration 加 kind 欄位
grant update (is_hidden) on posts to authenticated;   -- 再由 RLS 限定只有 staff

-- 匿名作者代碼不給任何前端角色讀（spec D11、NFR-03），只供 trigger 做頻率限制
revoke select on posts from anon, authenticated;
grant select (id, session_id, nickname, body, upvote_count, reply_count,
              is_hidden, hidden_by, hidden_at, created_at) on posts to anon, authenticated;
```

因此 `services/supabase/` 查詢 posts 時必須明確列出欄位，不能用 `select('*')`。

實作補充（2026-11-16，`supabase/migrations/20261116000000_init.sql`）：

- 留言 `id` 由前端產生（另開放 `insert (id)`），送出後用 id 讀回，不依賴 `RETURNING`，避免碰到 `author_id` 欄位權限。
- 附議走 RPC `set_upvote(post_id, on)`（security invoker，RLS 照常套用），以便回傳清楚的錯誤碼。
- 場次列表的留言數／待回應數走 RPC `session_counts(ids)`（security invoker，會友只算得到看得見的留言）。
- 自訂錯誤一律 `raise exception 'echo:<code>'`，前端在 `services/supabase/errors.ts` 轉成 `ServiceError`。

## 4. 權限矩陣（RLS）

會友 = `authenticated` 且不在 `staff_members`；未登入的 `anon` 角色權限同會友唯讀。

| 資料表        | 動作                     | 會友                                              | 管理者                                       |
| ------------- | ------------------------ | ------------------------------------------------- | -------------------------------------------- |
| sessions      | SELECT                   | `status in (open, closed)`，且未封存              | 未封存的全部                                 |
|               | INSERT / UPDATE          | ✗                                                 | ✓（封存的不能改）                            |
|               | 刪除（`archive_session`） | ✗                                                 | ✓ 封存（spec D20）；沒有 DELETE 權限         |
| posts         | SELECT                   | 未隱藏、未封存，且所屬場次非草稿、未封存（不含 `author_id`） | 未封存，且所屬場次未封存（不含 `author_id`） |
|               | INSERT                   | 場次可寫入（`session_is_writable`，trigger 檢查） | ✓                                            |
|               | UPDATE (`is_hidden`)     | ✗                                                 | ✓                                            |
|               | 刪除（`archive_post`）   | ✗（spec D9）                                      | ✓ 封存（spec D15、D20）；沒有 DELETE 權限    |
| upvotes       | SELECT                   | 只看自己的（判斷已附議）                          | 只看自己的                                   |
|               | INSERT / DELETE          | 自己的，且留言可見、場次可寫入                    | 同左                                         |
| replies       | SELECT                   | 未封存、未隱藏，且所屬留言可見時（不含 `member_id`） | 未封存，且所屬留言可見時（不含 `member_id`） |
|               | INSERT                   | 接續留言：留言可見且場次可寫入（spec US10）       | ✓（存成牧者回覆）                            |
|               | UPDATE                   | ✗                                                 | 牧者回覆可改 `body`；接續留言只能改 `is_hidden`（封存的不能改） |
|               | 刪除（`archive_reply`）  | ✗                                                 | ✓ 封存（spec D20）；沒有 DELETE 權限         |
| staff_members | SELECT                   | ✗                                                 | 全部                                         |

> 2026-11-04 起只有一種管理身分（spec D12），不再區分牧者、同工，也不需要 `is_pastor()`。

每一格都要有 pgTAP 測試（`supabase/tests/rls_*.test.sql`）。

## 5. 即時同步設計

每個場次頁面訂閱一個 channel：`session:<session_id>`。

| 事件                   | 機制                                                              | 前端處理                           |
| ---------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| 場次狀態（含自動結束） | `postgres_changes` UPDATE on `sessions` filter `id=eq.<id>`       | 切換開放／唯讀、更新「留言開放至」 |
| 新留言                 | `postgres_changes` INSERT on `posts` filter `session_id=eq.<id>`  | 插入列表                           |
| 附議數 / 回覆數變化    | `postgres_changes` UPDATE on `posts`                              | 更新該筆                           |
| 新回覆 / 修改回覆／接續留言 | `postgres_changes` on `replies` filter `session_id=eq.<id>`  | 更新回覆                           |
| 接續留言被隱藏／刪除   | `posts.comment_count` 變動 → posts 的 UPDATE                      | 重新讀取該則留言                   |
| 留言被隱藏 / 刪除      | **Broadcast**（DB trigger `realtime.send`）payload 只含 `post_id` | 從列表移除                         |
| 斷線重連               | channel `SUBSCRIBED` 狀態回復時                                   | 重新抓取完整列表 (AC4.3)           |

> **為什麼隱藏要用 Broadcast？** `postgres_changes` 會套用 RLS：留言被隱藏後，新的 row 會友已無權讀取，因此**會友收不到這筆 UPDATE 事件**，畫面上會殘留。用 trigger 廣播一個不含內容的 `post_id` 即可解決，也不洩漏資料。（任務 T015 會先做技術驗證。）

## 6. 前端結構

```
src/
├─ boot/supabase.ts          # 建立 client；會友頁進入時 ensureAnonymousSession()
├─ services/                 # 唯一可以呼叫 supabase 的地方
│  ├─ types.ts               # 服務介面（SessionsService、PostsService…），mock 與 supabase 共用
│  ├─ index.ts               # 依環境選擇實作（§6.1）
│  ├─ mock/                  # 假資料實作：記憶體資料、模擬延遲、模擬即時事件
│  └─ supabase/              # Phase 3 串接時加入：sessions、posts、replies、realtime
├─ stores/
│  ├─ auth.ts                # 目前身分、是否 staff、角色
│  ├─ board.ts               # 單一場次的留言、排序、篩選、即時合併
│  └─ adminSessions.ts
├─ composables/useBoardRealtime.ts
├─ utils/                    # 排序、篩選、時間格式（純函式，Vitest）
├─ types/models.ts           # 前端領域模型（手寫，憲章）
├─ types/database.ts         # supabase gen types 產出（Phase 2）
├─ css/                      # 設計 token（色彩、字級，見 ux.md §7）
├─ components/
│  ├─ PostCard.vue           # mode="member" | "admin"，兩端共用（ux.md §5）
│  ├─ PostComposer.vue       # M3 底部面板
│  ├─ ReplyEditor.vue        # A5
│  ├─ QrShareDialog.vue      # A6（含全螢幕投影 QR）
│  └─ NewPostsPill.vue       # 「↑ N 則新留言」
├─ layouts/  MemberLayout.vue, AdminLayout.vue（頂端細條）
└─ pages/
   ├─ IndexPage.vue                 #  /                  輸入場次碼
   ├─ BoardPage.vue                 #  /s/:code           會友留言板（開放中／過去場次共用）
   ├─ NowRedirect.vue               #  /now               固定 QR 入口（AC1.7）
   ├─ admin/LoginPage.vue           #  /admin/login
   ├─ admin/SessionListPage.vue     #  /admin
   ├─ admin/SessionEditPage.vue     #  /admin/sessions/new | /:id/edit
   ├─ admin/SessionManagePage.vue   #  /admin/sessions/:id  (留言管理 / QR)
   ├─ admin/StagePage.vue           #  /admin/sessions/:id/stage?post=<id>  講台模式（可回覆）
   └─ StagePage.vue                 #  /s/:code/stage?post=<id>  會友端放大（唯讀，AC9.6）
                                    #  兩者共用 components/StageView.vue + StageCard.vue
supabase/
├─ migrations/               # 所有 schema 變更皆以 migration 管理
├─ tests/                    # pgTAP
└─ seed.sql
.github/workflows/
├─ deploy.yml                # build → GitHub Pages
└─ db-test.yml               # supabase start + supabase test db
```

- 路由守衛：`/admin/**`（login 除外）需 `auth.isStaff`，否則導向 login。

### 6.1 UI 先行與資料來源切換（spec D8）

開發分兩段：先用假資料做完所有畫面（tasks Phase 1），再建資料庫並串接（Phase 2、3）。

```
元件 ──▶ stores ──▶ services/index.ts ──┬─▶ services/mock/      （Phase 1，預設）
                                         └─▶ services/supabase/  （Phase 3）
```

- **切換規則**：`QCLI_DATA_SOURCE=supabase | mock`，未設定時用 `supabase`（2026-11-16 起改用真實資料）。缺少 Supabase 設定時直接報錯，不會悄悄退回假資料。
- **介面**：`services/types.ts` 定義每個服務的方法與回傳的領域模型（`types/models.ts`）。mock 與 supabase 實作同一組介面，元件與 store 不知道背後是哪一個。
- **即時事件**：介面提供 `subscribeSession(sessionId, handlers)`，回傳取消訂閱函式。mock 版以計時器模擬新留言、附議變動、斷線重連，讓 ux.md §6 的「不跳動」行為在 Phase 1 就能驗收。
- **假身分**：mock 版的會友身分存在 `localStorage`（`echo.mock.uid`）；登入頁接受任何密碼，一律以示範管理帳號「王牧師」登入（畫面上有提示）。
- **假資料重設**：mock 資料存在 `localStorage`（`echo.mock.db`），重新整理後保留；管理端「⋯」選單在 mock 模式多一項「重設示範資料」。
- **mock 不做權限**：mock 只模擬畫面需要的行為（例如會友看不到隱藏留言），**真正的權限仍只以 RLS 實作**（憲章）。
- 會友的暱稱存在 `localStorage`（`echo.nickname`）。
- 匿名 session 由 supabase-js 自動存在 localStorage，同一瀏覽器再次進入即為同一身分 (AC1.4)。

## 7. 環境與部署

| 變數                            | 用途                                          | 例                                 | 存放                                           |
| ------------------------------- | --------------------------------------------- | ---------------------------------- | ---------------------------------------------- |
| `QCLI_SUPABASE_URL`             | Supabase 專案 URL                             | `https://xxxx.supabase.co`         | `.env.local`（本機）、GitHub Actions Variables |
| `QCLI_SUPABASE_PUBLISHABLE_KEY` | 公開金鑰                                      | `sb_publishable_…`                 | 同上                                           |
| `QCLI_SITE_URL`                 | **正式網址**，QR code 與分享連結一律用它      | `https://qa.[教會網域]`            | 同上                                           |
| `QCLI_DATA_SOURCE`              | 資料來源：`supabase`（預設）或 `mock`（§6.1） | `supabase`                         | 同上                                           |
| `QCLI_ADMIN_EMAIL`              | 共用管理帳號 Email（spec D14）                | `admin@echo.local`（預設）         | 同上                                           |
| `BASE_PATH`                     | 網站所在路徑（只在 build 時用）               | 自訂網域：`/`；github.io：`/echo/` | 同上                                           |

- 前端讀得到的變數必須以 `QCLI_` 開頭（Quasar app-vite 的規則），程式中以 `import.meta.env.QCLI_*` 取用，型別宣告在 `env.d.ts`。`BASE_PATH` 只給 `quasar.config.ts` 用，不進前端。
- `quasar.config` 以 `BASE_PATH` 設定 `build.publicPath` 與 router base；`vueRouterMode: 'history'`。`index.html` 的 favicon 以 `<%= publicPath %>` 引用。
  - `BASE_PATH` 可寫 `echo`、`/echo`、`/echo/`，設定檔會統一成 `/echo/`。
  - **Windows Git Bash 注意**：`BASE_PATH=/echo/` 會被 MSYS 轉成 `C:/Program Files/Git/echo/`。本機請寫 `BASE_PATH=echo`（或加 `MSYS_NO_PATHCONV=1`）；CI（Linux）不受影響。
- 網址組裝集中在 `src/utils/sessionUrl.ts`（`buildSessionUrl`、`buildNowUrl`），有單元測試。
- **GitHub Pages 的 history mode**：Pages 不支援伺服器端 rewrite，直接開 `/s/K7PM2X` 時會找不到檔案。做法是 build 後把 `index.html` 複製成 `404.html`，Pages 遇到未知路徑時會回傳這份內容，SPA 啟動後由 vue-router 依網址顯示正確頁面。
  - 副作用：第一次載入時 HTTP 狀態碼是 404（畫面正常）。對本專案沒影響（不需要 SEO），但 T004 要在 iOS Safari、Android Chrome、LINE 內建瀏覽器實測。
  - 自訂網域下作法完全相同。

### 7.1 QR code 怎麼產生

```
DB 產生場次碼 ──▶ 前端組網址 ──▶ qrcode 套件在瀏覽器畫出 QR ──▶ 顯示 / 下載 / 投影
 K7PM2X           SITE_URL + /s/K7PM2X
```

1. **場次碼**：建立場次時，資料庫函式 `gen_session_code()` 產生 6 碼（字元集 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`，排除 0/O/1/I/L 避免看錯），遇到重複就重抽。約 7 億種組合，不會用完。
2. **網址**：`${SITE_URL}/s/${code}`。**一律用 `SITE_URL`，不用 `window.location`**，這樣牧者不論是從 github.io、本機開發環境還是自訂網域打開後台，產生的 QR 都指向正式網域。
3. **畫 QR**：用 npm 套件 [`qrcode`](https://www.npmjs.com/package/qrcode) 在瀏覽器產生，不需要後端、不呼叫第三方 QR 服務（會友資料不外流、離線也能產生）。
   - 錯誤修正等級 `M`（可容忍約 15% 污損，適合印刷）；四周保留 4 格留白（掃描器需要）。
   - QR 裡**只有網址**，沒有任何會友或場次資料。
4. **輸出格式**：
   | 用途             | 格式       | 規格                                              |
   | ---------------- | ---------- | ------------------------------------------------- |
   | 投影、LINE、簡報 | PNG        | 1024×1024px，檔名 `echo-K7PM2X.png`               |
   | 週報、海報印刷   | SVG        | 向量，任意放大不糊                                |
   | 聚會開場投影     | 全螢幕頁面 | 白底黑碼，QR 約佔螢幕高度 55%，旁邊大字顯示場次碼 |
5. **固定 QR（AC1.7）**：內容是 `${SITE_URL}/now`，前端進入 `/now` 時查詢開放中的場次並導向 `/s/<code>`。印一次可以用很久。
6. **有效期**：場次 QR 永久有效。場次結束後掃碼會看到唯讀的過去場次；場次被刪除後顯示「找不到此場次」。

### 7.2 自訂網域（教會網域）

**建議用子網域**，例如 `qa.[教會網域]` 或 `echo.[教會網域]`，不影響教會主網站。

| 步驟 | 誰做              | 內容                                                                                                                                              |
| ---- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 👤 教會網域管理者 | DNS 新增一筆 `CNAME`：`qa` → `<GitHub 帳號>.github.io.`                                                                                           |
| 2    | 👤                | GitHub 帳號 Settings → Pages → **驗證網域**（加一筆 TXT 記錄），防止別人搶用這個子網域                                                            |
| 3    | 👤                | repo `echo` → Settings → Pages → Custom domain 填 `qa.[教會網域]`，等 DNS 檢查通過後勾選 **Enforce HTTPS**（憑證自動發放，最多約 24 小時）        |
| 4    | 我                | GitHub Actions Variables 改為 `SITE_URL=https://qa.[教會網域]`、`BASE_PATH=/`，重新部署                                                           |
| 5    | 👤                | Supabase → Authentication → URL Configuration：Site URL 改成自訂網域，Redirect URLs 同時保留 github.io 與自訂網域（轉換期間密碼重設信才不會失效） |
| 6    | 我                | 實測：自訂網域直接開深層網址、github.io 舊網址自動轉址、QR 下載內容為新網域                                                                       |

**注意事項**

- 我們用 GitHub Actions 部署，自訂網域設定在 repo 的 Pages 設定裡，**不需要** `CNAME` 檔案。
- 設定自訂網域後，`<帳號>.github.io/echo/...` 會由 GitHub 自動轉址到新網域。
- **最好在第一次正式使用前就完成網域設定**，這樣印出去的 QR 從一開始就是教會網域。如果之後才換網域，已印的 QR 仍可透過轉址使用，但建議重新下載。
- 換網域後，會友瀏覽器裡的匿名身分（存在 localStorage，綁定網域）會重新建立；資料本身不受影響，但同一人的發文頻率限制會重新計算。

### 7.3 Supabase 後台設定

步驟見 `supabase/README.md`。重點：

- 啟用 Anonymous Sign-ins。「Allow new users to sign up」**要保持開啟**，關掉會連匿名登入一起擋掉；自己註冊的帳號不在 `staff_members`，沒有任何管理權限。
- Rate Limits 的匿名登入上限調高（預設每 IP 每小時 30 次，教會 Wi-Fi 共用 IP 會不夠）。
- 共用管理帳號：Supabase 密碼至少 6 碼，所以帳號實際密碼是 `echo-` 加上管理密碼，前端登入時自動補上前綴（spec D14）。
- Site URL 設為 `SITE_URL`。

## 8. 風險與對策

| 風險                                              | 影響                           | 對策                                                                                    |
| ------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------- |
| Supabase 免費方案 Realtime 同時連線上限（約 200） | 大型聚會即時更新失效           | 確認會友規模 (Q5)；超過時降級為 15 秒輪詢（升級方案列入 spec §7.1 P-03，不做）          |
| 免費專案沒有自動備份                              | 資料遺失，「永久保存」無法保證 | 每場次結束後匯出 Markdown / CSV；定期手動 `supabase db dump` 存在本機（spec §7.1 P-01） |
| 免費專案閒置一週會暫停                            | 主日當天無法使用               | 每週固定使用通常不會觸發；加 GitHub Actions 每日 ping（免費，spec §7.1 P-02）           |
| 匿名登入被濫用灌水                                | 留言板被洗版                   | Supabase 內建匿名登入 IP 頻率限制 + 本系統發文頻率限制；必要時做 B-03 Turnstile         |
| 本機無 Docker 無法跑 `supabase start`             | 無法本機跑 pgTAP               | RLS 測試改在 GitHub Actions 執行                                                        |
| 換網域時已印出的 QR 指向舊網址                    | 會友掃到舊網址                 | QR 一律由 `SITE_URL` 產生；正式使用前完成 §7.2；github.io 有自動轉址作為保險            |
| 教會 DNS 由外部廠商管理，設定延誤                 | 無法如期換網域                 | 先用 github.io 開發測試，網域設定與開發並行                                             |

> 方案限制數字以 Supabase 官方最新公告為準。

## 9. 規格覆蓋檢查

| FR     | 實作位置                                             | 驗證                |
| ------ | ---------------------------------------------------- | ------------------- |
| FR-001 | boot/supabase.ts 匿名登入                            | 手動 + e2e 手動腳本 |
| FR-002 | sessions RLS、BoardPage                              | pgTAP、手動         |
| FR-003 | posts trigger + 欄位權限、PostComposer               | pgTAP               |
| FR-004 | （已取消）前端角色沒有 posts DELETE 權限（spec D20） | pgTAP               |
| FR-005 | upvotes PK + policy + trigger                        | pgTAP               |
| FR-006 | utils/sortFilter.ts                                  | Vitest              |
| FR-007 | services/supabase/realtime.ts（mock 版先驗畫面行為） | 手動（雙瀏覽器）    |
| FR-008 | auth store、路由守衛、staff_members                  | pgTAP、手動         |
| FR-009 | sessions policy、admin 頁面                          | pgTAP、手動         |
| FR-010 | QrShareDialog.vue、utils/sessionUrl.ts               | 手動                |
| FR-011 | replies policy + trigger                             | pgTAP               |
| FR-012 | posts UPDATE policy + trigger                        | pgTAP               |
| FR-013 | utils/export.ts                                      | Vitest              |
| FR-014 | StageView.vue（篩選/排序沿用 utils/sortFilter.ts）   | 手動（平板實測）    |
| FR-016 | replies trigger + policy、CommentSheet、PostCard     | pgTAP（`comments.test.sql`）、Vitest |
