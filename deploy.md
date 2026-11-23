# 部署說明

ECHO 由兩部分組成：

- **前端**：GitHub Pages，push 到 `main` 後由 GitHub Actions 自動打包、部署（`.github/workflows/deploy.yml`）
- **後端**：Supabase（資料庫、權限、即時同步、匿名登入）

> ⚠️ 這個 repo 是公開的：**不要**把管理密碼、`.env.local`、資料庫備份寫進任何檔案。
> publishable key 本來就會出現在網頁裡，可以公開；安全性由資料庫的 RLS 保證。
> **絕對不要**使用 `secret` / `service_role` key。

## 目前的設定值

| 項目                 | 值                                                        |
| -------------------- | --------------------------------------------------------- |
| 正式網址             | `https://echo.tnlhc.org`                                  |
| 會友端               | `https://echo.tnlhc.org/`                                 |
| 管理端               | `https://echo.tnlhc.org/admin`（會友端沒有連結，只能直接輸入） |
| 固定 QR 入口         | `https://echo.tnlhc.org/now`                              |
| GitHub repo          | `https://github.com/lgtits/ECHO`                          |
| 綁網域前的網址       | `https://lgtits.github.io/ECHO/`（現在會自動轉到正式網址） |
| Supabase Project URL | `https://ngnourgutcsbqhfozhrv.supabase.co`                |
| Supabase 後台        | `https://supabase.com/dashboard/project/ngnourgutcsbqhfozhrv` |
| 共用管理帳號 Email   | `admin@echo.local`                                        |
| DNS 管理             | `tnlhc.org` 由 `ns1.dyna-ns.net` 管理（教會同工負責）     |
| 同一個 GitHub 帳號的其他網站 | `events.tnlhc.org`（也指向 `lgtits.github.io`，互不影響） |

---

## 1. Supabase

完整步驟見 [`supabase/README.md`](supabase/README.md)。

### 1.1 URL 與 key 在哪裡

| 要找的值        | 位置                                                          |
| --------------- | ------------------------------------------------------------- |
| Project URL     | Project Settings → **Data API**：`https://ngnourgutcsbqhfozhrv.supabase.co` |
| Publishable key | Project Settings → **API Keys**（`sb_publishable_` 開頭）     |

**URL 只填網域**，不要加 `/rest/v1/`。

### 1.2 Authentication 設定

| 位置                | 設定                                                                     |
| ------------------- | ------------------------------------------------------------------------ |
| Sign In / Providers | **Allow anonymous sign-ins：開啟**                                       |
| Sign In / Providers | Allow new users to sign up：**保持開啟**（關掉會連匿名登入一起擋掉）     |
| Rate Limits         | 匿名登入上限調到 **1000 / 小時**（預設每 IP 30 次，教會 Wi-Fi 共用 IP） |
| URL Configuration   | 見 §4 第 5 步                                                            |

**匿名登入**：會友不用註冊，Supabase 在背景給這支手機一個隨機身分編號（不含任何個資），用來做「每人只能附議一次」與「60 秒最多 5 則」的限制。

### 1.3 建立資料表

`supabase/migrations/` 裡的檔案依檔名順序，**每個檔案只跑一次**：SQL Editor 開新 query → 貼上全部內容 → Run。

| 檔案                                      | 內容                               | 狀態    |
| ----------------------------------------- | ---------------------------------- | ------- |
| `20261116000000_init.sql`                 | 資料表、權限、即時同步、自動結束   | ✅ 完成 |
| `20261116010000_staff_delete_posts.sql`   | 管理者可以刪除會友留言（spec D15） |         |
| `20261122000000_reply_author_name.sql`    | 回覆可填回應者名稱，預設「牧者」（spec D18） |         |
| `20261122010000_soft_delete.sql`          | 刪除改為封存，資料保留（spec D20；必須在 `staff_delete_posts` 之後執行） |         |
| `20261123000000_member_comments.sql`      | 會友接續留言（spec US10、D21；必須在 `soft_delete` 之後執行） |         |
| `20261123010000_staff_member_comments.sql` | 管理者在會友留言板的留言存成一般接續留言（spec AC10.9） |         |
| `20261123020000_reply_edit_history.sql`   | 回覆的編輯記錄（spec AC6.6、D22） |         |

之後新增的 migration 也照這個方式執行，並在上表記錄。

再跑一次會出現 `type "session_status" already exists`，代表第一次已經成功（SQL Editor 整段是同一個交易，失敗會全部復原）。檢查方式：

```sql
select '資料表' as 項目, count(*)::text as 結果 from information_schema.tables
  where table_schema = 'public' and table_name in ('staff_members','sessions','posts','upvotes','replies')
union all
select '權限規則', count(*)::text from pg_policies where schemaname = 'public'
union all
select '函式', count(*)::text from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname in ('is_staff','gen_session_code','session_is_writable','post_is_visible','can_upvote','set_upvote','session_counts')
union all
select '即時同步資料表', count(*)::text from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename in ('sessions','posts','replies')
union all
select '自動結束排程', count(*)::text from cron.job where jobname = 'echo-auto-close';
```

正確結果：資料表 5、權限規則 16（只跑 init 時是 15）、函式 7、即時同步資料表 3、自動結束排程 1。

### 1.4 共用管理帳號（已完成，spec D14）

管理端只輸入密碼。程式會在輸入的密碼前面**自動加上 `echo-`**（Supabase 密碼至少 6 碼），再登入 `admin@echo.local`。

- 帳號在 Supabase 的實際密碼 = `echo-` + 管理密碼
- 管理密碼本身只口頭告知同工，不寫進任何檔案

**換管理密碼**（不要刪掉帳號重建，重建會讓管理名單失效）：

```sql
update auth.users
set encrypted_password = extensions.crypt('echo-新密碼', extensions.gen_salt('bf'))
where email = 'admin@echo.local';
```

**加入管理名單**（帳號重建過、或登入顯示「管理帳號尚未設定完成」時；可重複執行）：

```sql
insert into public.staff_members (user_id, display_name)
select id, '牧者' from auth.users where email = 'admin@echo.local'
on conflict (user_id) do nothing;
```

**改回覆顯示名稱**（只影響之後的新回覆）：

```sql
update public.staff_members set display_name = '新名稱'
where user_id = (select id from auth.users where email = 'admin@echo.local');
```

---

## 2. 本機開發

`.env.local`（不會進版控）：

```
QCLI_SUPABASE_URL=https://ngnourgutcsbqhfozhrv.supabase.co
QCLI_SUPABASE_PUBLISHABLE_KEY=sb_publishable_…（見 Supabase → API Keys）
QCLI_SITE_URL=http://localhost:9002
QCLI_DATA_SOURCE=supabase
BASE_PATH=/
```

- 改完 env 要重新 `npm run dev`
- 本機和正式網站用**同一個資料庫**：本機測試建立的場次，會友在正式網站也看得到。測試完記得刪除測試場次
- 本機產生的 QR code 會指向 `localhost`，**不要拿去印**；正式 QR 請從 `https://echo.tnlhc.org/admin` 下載
- 只想看假資料：`QCLI_DATA_SOURCE=mock`

---

## 3. GitHub Pages

### 3.1 一次性設定

1. `https://github.com/lgtits/ECHO` → **Settings → General**：repo 必須是 **Public**
2. **Settings → Pages**：Build and deployment 的 Source 選 **GitHub Actions**
3. **Settings → Secrets and variables → Actions → Variables 分頁 → New repository variable**：

   | Name                       | Value                                       |
   | -------------------------- | ------------------------------------------- |
   | `SUPABASE_URL`             | `https://ngnourgutcsbqhfozhrv.supabase.co`  |
   | `SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…`（與 `.env.local` 相同）  |
   | `BASE_PATH`                | `/`                                         |
   | `SITE_URL`                 | `https://echo.tnlhc.org`                    |

   注意：
   - 要放在 **Variables**，不是 Secrets（部署腳本讀不到 Secrets）
   - 要放在 **Repository variables**，不是 Settings → Environments → github-pages 裡（打包步驟讀不到）
   - 名稱**不要**加 `QCLI_` 前綴，部署腳本會自動對應
   - `ADMIN_EMAIL` 不用設（預設就是 `admin@echo.local`）

### 3.2 部署

- push 到 `main` 就會自動部署；也可以到 **Actions → Deploy to GitHub Pages → Run workflow** 手動重跑
- 流程：`npm ci` → `npm test` → `npm run typecheck` → `npm run build`（同時產生 history 模式用的 `404.html`）→ 部署
- 測試或型別檢查失敗就**不會**部署
- **改了 Variables 之後一定要重新部署**，變數是打包時寫進網站的
- 確認這次部署用了哪些值：Actions → 該次執行 → build → 展開任一步驟，最上方 `env:` 應該是：

  ```
  BASE_PATH: /
  QCLI_SITE_URL: https://echo.tnlhc.org
  QCLI_DATA_SOURCE: supabase
  QCLI_SUPABASE_URL: https://ngnourgutcsbqhfozhrv.supabase.co
  QCLI_SUPABASE_PUBLISHABLE_KEY: sb_publishable_…
  ```

---

## 4. 自訂網域 `echo.tnlhc.org`

| 步驟 | 位置                                                  | 做什麼                                                                                                       | 狀態    |
| ---- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------- |
| 1    | `tnlhc.org` 的 DNS（`ns1.dyna-ns.net`，同工設定）     | `CNAME`：名稱 `echo`，值 `lgtits.github.io`                                                                  | ✅ 完成 |
| 2    | `lgtits/ECHO` → Settings → Pages → Custom domain      | 填 `echo.tnlhc.org` → Save，等 DNS check successful                                                          | ✅ 完成 |
| 3    | 同上                                                  | 勾選 **Enforce HTTPS**（憑證還沒發好時勾不了，最多等 24 小時再回來勾）                                       |         |
| 4    | Settings → Secrets and variables → Actions → Variables | `BASE_PATH` = `/`、`SITE_URL` = `https://echo.tnlhc.org`，然後 **Run workflow** 重新部署                     |         |
| 5    | Supabase → Authentication → **URL Configuration**     | Site URL：`https://echo.tnlhc.org`；Redirect URLs 加入下面三筆                                                |         |
| 6    | GitHub 頭像 → Settings → **Pages** → Add a domain（建議） | 驗證 `echo.tnlhc.org`，防止別人搶用子網域，見 §4.1                                                          |         |
| 7    | 手機                                                  | 驗收，見 §5                                                                                                  |         |

第 5 步的 Redirect URLs（全部保留）：

```
https://echo.tnlhc.org/**
https://lgtits.github.io/ECHO/**
http://localhost:9002/**
```

注意：

- `BASE_PATH` 必須和網址一致：綁了 `echo.tnlhc.org` 就是 `/`。設錯會整頁空白（主控台顯示 `/ECHO/assets/…` 的 MIME 類型錯誤）
- **不要**用 DNS 的「網址轉址 / URL forwarding」，只用 CNAME
- 用 GitHub Actions 部署，**不需要**在 repo 放 `CNAME` 檔案
- `events.tnlhc.org` 也指向 `lgtits.github.io`：GitHub 依各 repo 設定的 Custom domain 分流，互不影響。**一個網域只能綁一個 repo**，不要在 events 的 repo 填 `echo.tnlhc.org`
- 換網域後，會友瀏覽器裡的匿名身分（綁定網域）會重新建立，資料本身不受影響

### 4.1 驗證網域（建議）

1. GitHub 右上角頭像 → **Settings**（個人設定，不是 repo 設定）→ **Pages** → **Add a domain**
2. 填 `echo.tnlhc.org`（`events.tnlhc.org` 也可以一起驗證）
3. GitHub 會給一筆 TXT 記錄：名稱是 `_github-pages-challenge-lgtits.echo`，值是一串亂碼
4. 把這筆 TXT 傳給管 DNS 的同工新增，加好後回 GitHub 按 **Verify**

> 不建議直接驗證整個 `tnlhc.org`：驗證後，其他 GitHub 帳號就不能用任何 `*.tnlhc.org` 子網域，教會其他同工日後要架站會被擋住。

檢查 DNS 是否生效（Windows 命令列）：

```
nslookup -type=CNAME echo.tnlhc.org 8.8.8.8
nslookup -type=TXT _github-pages-challenge-lgtits.echo.tnlhc.org 8.8.8.8
```

---

## 5. 上線前驗收（用手機）

- [ ] `https://echo.tnlhc.org/` 顯示會友首頁，網址列有鎖頭（HTTPS）
- [ ] `https://lgtits.github.io/ECHO/` 自動轉到 `https://echo.tnlhc.org/`
- [ ] `https://echo.tnlhc.org/admin` 用管理密碼登入，建立一個測試場次（「建立並開放」）
- [ ] 後台「分享 QR」下載 PNG，用另一支手機掃描，網址是 `https://echo.tnlhc.org/s/場次碼`
- [ ] 直接打開 `https://echo.tnlhc.org/s/場次碼`（深層網址）正常顯示，不是 GitHub 404
- [ ] 會友手機留言、附議；後台不用重新整理就看到
- [ ] 後台回覆、隱藏一則；會友手機跟著更新
- [ ] iPhone 撰寫留言時，鍵盤彈出後「取消／送出」與暱稱列都看得到
- [ ] `https://echo.tnlhc.org/now` 導向剛剛開放的場次
- [ ] 結束場次後，會友端變成唯讀
- [ ] 刪除測試場次
- [ ] 下載固定 QR（`/now`）用於週報、海報，印一次可以一直用

---

## 6. 日常維護

- **免費專案閒置一週會暫停**：每週主日都會使用通常不會觸發。若暫停，到 Supabase 後台按 **Restore** 即可（tasks T108 的每日自動 ping 尚未做）
- **沒有自動備份**：免費方案不備份資料庫（spec §7.1 P-01）。需要保存時，到 Supabase → Table Editor 把 `sessions`、`posts`、`replies` 各自 Export to CSV（後台不提供匯出，spec D16）
- **換管理密碼**：見 §1.4，換完口頭告知同工
- **還原被刪除的資料**（spec D20）：管理端的「刪除」只是封存，資料都還在。到 Supabase → Table Editor：
  1. 打開 `sessions`、`posts` 或 `replies`，用 Filter 篩選 `deleted_at` **is not null**，找到要還原的那一列（可依 `deleted_at` 時間、標題或內容判斷）。
  2. 把 `deleted_at` 和 `deleted_by` 都改成 `NULL`，存檔。畫面重新整理後就會出現；還原回覆時回覆數會自動加回去。
  3. 還原留言或回覆時，所屬的場次（以及留言）也要是未封存的才看得到。
  - 真的要永久刪除：在 Table Editor 直接刪掉那一列（刪場次會連同它的留言、附議、回覆一起刪除）。

---

## 7. 疑難排解

| 現象                                                                    | 原因與處理                                                                                                                         |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 主控台：`缺少 QCLI_SUPABASE_URL 或 QCLI_SUPABASE_PUBLISHABLE_KEY`        | 打包時變數是空的：檢查 §3.1 的位置與名稱，改好後 **Run workflow** 重新部署，再 `Ctrl+Shift+R` 強制重新整理                         |
| 主控台：`未允許的 MIME 類型（「text/html」）…/ECHO/assets/…`             | 打包時 `BASE_PATH` 還是 `ECHO`：Variables 設 `BASE_PATH` = `/`，**重新部署**（build 步驟的 `env:` 應顯示 `BASE_PATH: /`）          |
| 登入顯示「密碼錯誤」                                                    | 帳號密碼不是 `echo-` + 輸入的密碼：用 §1.4 的 SQL 重設                                                                              |
| 登入顯示「管理帳號尚未設定完成」                                        | 密碼正確，但帳號不在 `staff_members`（常見於刪掉帳號重建）：執行 §1.4「加入管理名單」                                               |
| 會友留言、附議失敗，或一直沒有身分                                      | 匿名登入沒開，或匿名登入次數上限太低：檢查 §1.2                                                                                     |
| 直接開深層網址出現 GitHub 404 頁面                                      | 部署沒有產生 `404.html`，或 `BASE_PATH` 與網址不符                                                                                 |
| QR code 掃出來是 `localhost` 或 `github.io`                             | QR 是從本機或舊網址的後台下載的，或 `SITE_URL` 沒設：確認 §3.1 後重新部署，從 `https://echo.tnlhc.org/admin` 重新下載             |
| GitHub Pages 顯示 `already taken`                                       | `echo.tnlhc.org` 已填在別的 repo（例如 events 的 repo）：先到那個 repo 清掉                                                         |
| 即時更新沒有出現                                                        | 確認 §1.3 檢查結果的「即時同步資料表」是 3                                                                                          |
| 網站打不開，Supabase 顯示 Paused                                        | 免費專案閒置一週被暫停：Supabase 後台按 **Restore**                                                                                 |
