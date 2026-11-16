# Supabase 設定（tasks T005、T010–T019、T017）

第一次上線照下面做一次即可。所有權限都在 `migrations/` 以 RLS 實作（憲章）。

> ⚠️ 這個 repo 是公開的（spec P-06）：**不要**把管理密碼、`.env.local`、資料庫備份寫進任何檔案。

## 1. 建立專案

1. 到 <https://supabase.com> 建立免費專案（地區建議 Tokyo / Singapore）。
2. **Project Settings → API**：複製 Project URL 與 publishable key，填進：
   - 本機：`.env.local` 的 `QCLI_SUPABASE_URL`、`QCLI_SUPABASE_PUBLISHABLE_KEY`
   - GitHub：repo **Settings → Secrets and variables → Actions → Variables** 新增 `SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`

## 2. Authentication 設定

| 位置                               | 設定                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Sign In / Providers                | **Allow anonymous sign-ins：開啟**（會友免登入，AC1.4）                                                    |
| Sign In / Providers                | Allow new users to sign up：**保持開啟**（關掉會連匿名登入一起擋掉）。自己註冊的帳號不在管理名單裡，沒有任何管理權限 |
| Sign In / Providers → Email        | Confirm email：開啟                                                                                        |
| Rate Limits                        | **Anonymous sign-ins 調高到 1000 / 小時**。預設每個 IP 每小時 30 次，教會 Wi-Fi 共用同一個 IP 會不夠用      |
| URL Configuration                  | Site URL 設為正式網址（`QCLI_SITE_URL`）                                                                   |

## 3. 建立資料表與權限

**SQL Editor** → 貼上 `migrations/20261116000000_init.sql` 全部內容 → Run。

（或用 CLI：`npx supabase link --project-ref <ref>` 後 `npx supabase db push`）

## 4. 建立共用管理帳號（spec D14）

管理端只輸入密碼，背後是一個固定 Email 的帳號。

1. **Authentication → Users → Add user → Create new user**
   - Email：`admin@echo.local`（要換的話，同時設定 `QCLI_ADMIN_EMAIL` 與 GitHub Variable `ADMIN_EMAIL`）
   - Password：**`echo-` 加上管理密碼**。例如管理密碼是 `abcde`，這裡就填 `echo-abcde`。
     （Supabase 密碼至少 6 碼，所以程式登入時會自動在前面加 `echo-`。）
   - 勾選 **Auto Confirm User**
2. **SQL Editor** 執行（顯示名稱就是回覆上顯示的名字，可自行修改）：

   ```sql
   insert into public.staff_members (user_id, display_name)
   select id, '牧者' from auth.users where email = 'admin@echo.local';
   ```

### 換密碼

Authentication → Users → 該帳號 → Reset password / Update user，一樣填 `echo-` 加上新密碼。

### 改回覆顯示名稱

```sql
update public.staff_members set display_name = '王牧師'
where user_id = (select id from auth.users where email = 'admin@echo.local');
```

之後的新回覆會用新名稱；舊回覆保留當時的名稱（快照，spec Q4）。

## 5. 測試（pgTAP）

需要 Docker：

```bash
npx supabase init      # 只在第一次，產生 config.toml
npx supabase start
npx supabase test db   # 執行 tests/*.test.sql
```
