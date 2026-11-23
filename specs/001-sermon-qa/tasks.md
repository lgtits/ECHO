# 任務清單：主日講道 QA 留言板

- **對應**：[spec.md](./spec.md)、[plan.md](./plan.md)
- 標記：`[ ]` 未開始、`[~]` 進行中、`[x]` 完成；`👤` 表示需要你本人操作（帳號、後台設定）。
- 每個 Phase 結束都是一個檢查點：驗收通過才進入下一階段。
- **開發順序：UI 先行**（spec D8、plan §6.1）。Phase 1 以假資料做完所有畫面；Phase 2 建資料庫與權限；Phase 3 把 services 換成 Supabase 實作。

## Phase 0 — 專案基礎

- [x] **T001** `git init`、`.gitignore`、`.editorconfig`（GitHub repo 延後到 T004）
- [x] **T002** 以 Quasar CLI 建立專案（Vite、TypeScript、Pinia、ESLint + Prettier、Vitest）
- [x] **T003** 設定 history 路由；以 `BASE_PATH` 設定 `publicPath`；注入 `QCLI_SUPABASE_*`、`QCLI_SITE_URL` 環境變數；首頁顯示 placeholder（plan §7）
- [x] **T008** 設計 token（草地色票、字級、Quasar 品牌色）與 `MemberLayout` / `AdminLayout` 空殼（ux.md §1.3, §7）
- [ ] **T004** GitHub Actions `deploy.yml`：push main → build → 複製 `404.html` → GitHub Pages；實測直接開深層網址（`/s/TEST01`）可正常顯示。可先部署 Phase 1 的 UI 原型供手機走查 `👤`（建立 repo、開啟 Pages）
- [ ] **T009** 綁定教會子網域（DNS CNAME、GitHub 網域驗證、Enforce HTTPS、Supabase URL 設定），在 GitHub Pages 驗收通過後、正式使用前進行 `👤`（plan §7.2）

**檢查點 0**：本機可啟動，兩種版型可切換。

## Phase 1 — UI 原型（假資料，不接後端）

> 所有畫面與互動都在這個階段做完；資料來自 `services/mock/`（plan §6.1）。

**基礎**

- [x] **T100** `types/models.ts` 領域模型；`services/types.ts` 服務介面；`services/mock/` 記憶體假資料（多場次、多則留言與回覆、模擬延遲）；`services/index.ts` 依 `QCLI_DATA_SOURCE` 選實作
- [x] **T101** mock 即時事件：`subscribeSession` 以計時器模擬新留言、附議變動、斷線與重連（AC4.1–4.3 的畫面行為）
- [x] **T102** mock 身分：會友匿名 uid、管理者假登入、「重設示範資料」
- [x] **T021** `utils/sortFilter.ts` + Vitest（AC3.3, AC6.1）
- [x] **T103** `utils/time.ts` 相對時間 / `HH:mm` / `M/D HH:mm` + Vitest（ux.md §6.7）

**會友端（US1–US4、US8、US9）**

- [x] **T022** `stores/board.ts`：載入、排序、篩選、樂觀更新附議、合併即時事件
- [x] **T023** `IndexPage`（M1）：輸入場次碼（AC1.5）、進行中與過去的場次、載入更多（AC8.4）
- [x] **T024** `BoardPage`（M2）：場次資訊、標題收合、狀態處理（AC1.1–1.3）、M4 所有特殊狀態（骨架、空狀態、斷線、已結束、自動結束倒數）
- [x] **T024a** `/now` 固定入口：導向最新開放中的場次，沒有時回首頁並提示（AC1.7）
- [x] **T025** `PostComposer`（M3）：手機底部面板 / 平板對話框 / 電腦直接展開、暱稱記憶、草稿暫存、錯誤訊息（AC2.1–2.3）
- [x] **T026** `PostCard`（member 模式，預留 admin 模式）：附議、已回應、回覆收合、所有狀態（AC3.1, 6.4；ux.md §5）。2026-11-02 依 D9 拿掉會友刪除；2026-11-03 依 D11 拿掉「我的留言」
- [x] **T029** 即時更新不跳動：`NewPostsPill`、熱門排序不即時重排、斷線提示（ux.md §6）
- [x] **T039** 共用 `StageView` / `StageCard`：小卡、不顯示暱稱、上一則/下一則、鍵盤、全螢幕、即時更新（AC9.1–9.5；ux.md A7）
- [x] **T109** `MemberHeader` 會友端頁首：白底固定、「‹ ECHO」回首頁、右側「投影」、捲動後顯示場次標題（ux.md §1.3，2026-11-03）
- [x] **T110** 只有一種管理身分（拿掉牧者／同工區分）；會友端頁首「QR code」開全螢幕 QR（spec D12、AC5.12，2026-11-04）
- [x] **T039a** 會友端放大：留言列「放大」、頁首「投影」、`/s/:code/stage` 唯讀小卡，過去場次也可用（AC9.6, 9.7）

**管理端（US5–US7、US9）**

- [x] **T030** `stores/auth.ts`、`LoginPage`（A1）、路由守衛（AC5.1）
- [x] **T031** `AdminLayout`、`SessionListPage`（A2）；≥1280px 時場次列表改為左側欄（AC5.5, 5.10；ux.md §2.1）
- [x] **T032** `SessionEditPage`（A3）：建立/編輯、預設值（下一個主日、上一場講員）、「建立並開放」與「存草稿」、建立後顯示 QR（AC5.2, 5.11）
- [x] **T033** 場次狀態切換、自動結束時間設定、刪除場次（輸入標題確認）（AC5.3, 5.6, 5.9）
- [x] **T034** `QrShareDialog`（A6）：以 `SITE_URL` 產生 QR（qrcode 套件，等級 M）、複製連結、下載 PNG 1024px / SVG、全螢幕投影 QR、固定 `/now` QR（AC5.4；plan §7.1）
- [x] **T035** `SessionManagePage`（A4）：電腦雙欄 / 手機單欄、預設「待回應＋最多附議」、分頁計數（AC6.1）
- [x] **T036** `ReplyEditor`（A5）：新增/編輯/刪除回覆、`Ctrl+Enter`（AC6.2, 6.3, 6.5）
- [x] **T037** `PostCard` admin 模式：隱藏/取消隱藏、5 秒復原（AC7.1–7.3）
- [x] **T038** 會友頁的管理者提示列、「以會友身分預覽」（AC5.7, 5.8）
- [x] **T039b** 管理端 `admin/StagePage`：共用 StageView，加「文字回覆」（AC9.4）

**驗收**

- [~] **T104** RWD 走查：360、390、768、1024、1366、1920 寬度下，所有畫面以假資料完整操作（AC1.6, AC5.10；ux.md §2.1）
- [ ] **T105** 設計確認：對照設計稿與 ux.md 逐頁走查，需要調整的回寫 ux.md `👤`

**檢查點 1**：以假資料完整走一次（自動化走查已通過，見下方紀錄；待你在手機與電腦上實際走查）「建立場次 → 投影 QR → 會友留言、附議、放大 → 牧者在講台模式逐題檢視並文字回覆 → 隱藏一則 → 結束場次 → 過去場次唯讀」，畫面經你確認。

> **Phase 1 走查紀錄（2026-11-02）**：以 headless Edge 對打包後的網站執行。
>
> - 截圖寬度：390、768、1024、1366、1440（360、1920 尚未截圖）。
> - 互動流程 22 項全部通過：建立場次 → QR、Ctrl+Enter 回覆、隱藏與復原、講台鍵盤切換、會友留言與附議、頻率限制、結束場次後唯讀、`/now`、新留言提示不跳動、排序已變動提示、隱藏即時消失、斷線提示。
> - 主控台沒有錯誤。

## Phase 2 — 資料庫與權限（FR-001~005, 008, 009, 011, 012）

- [ ] **T005** 建立 Supabase 專案；啟用 Anonymous Sign-ins、關閉公開註冊；提供 URL 與 publishable key `👤`
- [ ] **T006** 安裝 Supabase CLI、`supabase init`、`supabase link`（本機可先 `supabase start`，不必等 T005）
- [x] **T010** Migration：enums、`staff_members`、`sessions`、`posts`、`upvotes`、`replies`、索引
- [x] **T011** Migration：`is_staff()`、`gen_session_code()`、`session_is_writable()`
- [x] **T012** Migration：所有 triggers（plan §3.2）與欄位層級權限
- [x] **T013** Migration：RLS policies（plan §4 權限矩陣）
- [~] **T014** pgTAP 測試：權限矩陣每一格（含任何人都不能直接 DELETE posts、前端角色都讀不到 `posts.author_id`）+ 頻率限制 + 計數正確性（`supabase/tests/rls.test.sql` 已寫，待 `supabase test db` 實跑）
- [~] **T019** Migration：啟用 pg_cron，每分鐘自動結束到期場次；pgTAP 測試到期後無法發文（AC5.9；plan §3.1.1）
- [ ] **T016** `supabase gen types` → `src/types/database.ts`
- [ ] **T017** 建立共用管理帳號並寫入 `staff_members`，步驟見 `supabase/README.md` §4（spec D14）`👤`
- [ ] **T018** GitHub Actions `db-test.yml`：CI 執行 `supabase test db`
- [ ] **T108** GitHub Actions `keepalive.yml`：每日排程呼叫一次 Supabase API，避免免費專案閒置暫停（spec §7.1 P-02）

**檢查點 2**：所有 pgTAP 測試通過；以匿名身分無法讀到草稿與隱藏留言。

## Phase 3 — 串接後端

- [~] **T007** 建立 Supabase client（放在 `services/supabase/index.ts`，元件碰不到）；連線健康檢查尚未做
- [x] **T020** `services/supabase/`：sessions、posts（含附議）、replies，實作 `services/types.ts` 同一組介面；DB 型別 ↔ 領域模型轉換 + Vitest
- [x] **T106** 身分串接：會友 Anonymous Sign-in（AC1.4）、管理者只輸入密碼登入共用帳號與 `staff_members` 角色（AC5.1、D14）
- [ ] **T015** 技術驗證：Realtime `postgres_changes` + `realtime.send` 廣播隱藏事件（雙瀏覽器實測）
- [~] **T027** `services/supabase/realtime.ts`：實作 `subscribeSession`，新增/更新/移除/重連（AC4.1–4.3；plan §5）
- [x] **T107** 錯誤對應：頻率限制、場次已結束、權限不足等 DB 錯誤轉成 ux.md §8 文案
- [ ] **T028** 手機版實機驗收（iOS Safari、Android Chrome、LINE 內建瀏覽器）

- [x] **T111** 會友端移除後台連結（首頁「管理者登入」）、管理端改為只輸入密碼；預設資料來源改為 supabase（spec D14，2026-11-16）
- [x] **T112** 共用撰寫面板 `ComposeSheet`：會友撰寫留言與管理者回覆（手機、平板、講台模式）外觀一致，高度跟著 `visualViewport`（ux.md M3、A5，2026-11-16）
- [~] **T113** 管理者刪除留言：migration `20261116010000_staff_delete_posts.sql`（posts DELETE policy）+ pgTAP、PostCard admin「刪除」留言、每則回覆可單獨「刪除」，都有確認對話框（AC7.4、7.5；spec D15）。待在 Supabase 執行 migration `👤`
- [x] **T114** 手機不顯示頁首「QR code」「放大」（會友端、管理端）；「以會友身分預覽」改為「前往會友留言板」；移除匯出選單項目（spec D16，2026-11-16）
- [x] **T115** 配色改為白底＋深抹茶強調色（取自 Astryx「Matcha」）：白色頁面與圓角卡片（留言、場次列表）、近黑文字、深抹茶只用於主要按鈕與已附議、亮綠只表示已回應／開放中；留言卡片與上方篩選列留 12px 空隙；固定淺色（`color-scheme: light`），不做深色模式（spec D4、ux.md §7，2026-11-16）
- [x] **T116** 會友端排序加入「最舊」；「最舊」下新留言直接加在最下方（不顯示「↑ N 則新留言」），自己送出的留言放最下方並捲過去（AC3.3、ux.md M3／§6.1，2026-11-16）
- [x] **T117** 自動結束時間可選日期：共用 `AutoClosePicker`（日期＋時間），用於場次表單與場次頁「設定結束時間」對話框；不能選已過的時間；非今天時顯示「11/15 12:00」（AC5.9、ux.md A3，2026-11-16）
- [x] **T118** 建立場次表單隱藏「先存成草稿」（`SHOW_DRAFT = false`），草稿功能本身保留（spec D17，2026-11-16）
- [~] **T119** 回應者名稱：回覆面板（ReplySheet、ReplyEditor）加「回應者」欄位，placeholder「未填寫預設為「牧者」」、留空即為「牧者」；migration `20261122000000_reply_author_name.sql`（可寫入 `author_name`，空白填「牧者」，最多 20 字）+ pgTAP（spec AC6.2、D18，2026-11-22）。待在 Supabase 執行 migration `👤`
- [x] **T120** 場次頁標題列：「設定自動結束」改為外框按鈕「設定結束時間／修改結束時間」；「結束留言」移到該對話框內（「立即結束留言」，需確認）；「編輯場次資訊」從「⋯」選單移到標題列（ux.md A3、A4，2026-11-22）
- [x] **T121** 分享連結預覽圖：由 `public/logo.png` 產生 `og-image.png`（深抹茶底＋白色標誌，1200×630），`index.html` 加 og / twitter meta，圖片網址由建置時的 `QCLI_SITE_URL` 組成；favicon、apple-touch-icon 由 logo.png 轉深色重新產生；頁首維持文字「ECHO」（ux.md U1，2026-11-22）
- [x] **T122** 會友端、管理端留言卡片拿掉「已回應」綠字（spec AC6.4、D19，2026-11-22）
- [x] **T123** 管理端留言列表預設排序改為「最新」（與會友端相同；spec AC6.1、ux.md A4，2026-11-22）
- [x] **T124** 附議按鈕拿掉「已附議」文字，只用顏色（實心深抹茶）表示；螢幕閱讀器仍由 `aria-pressed`、aria-label 說明（ux.md M2，2026-11-22）
- [x] **T125** 排序加入「最新回應」（會友端、管理端）：依最後一則回覆時間由新到舊，沒有回覆的排後面；有新回覆時不即時重排，顯示「排序已變動，點此更新」+ Vitest（spec AC3.3、AC6.1、ux.md §6.2，2026-11-22）
- ~~**T126** 頁首「ECHO」前加標誌（`BrandLogo`）~~ 試用後拿掉，所有頁首都不放標誌（ux.md U1，2026-11-22）
- [x] **T127** 場次管理頁標題前加麵包屑「場次列表 › 場次標題」，點「場次列表」回 `/admin`（ux.md A4，2026-11-22）
- [x] **T128** 會友端頁首改為「世界之光聖教會 | ECHO」（不放標誌），字型與字級、字距同 tnlhc-signup 頁首（ux.md §1.3、U1，2026-11-22）
- [x] **T129** 管理端場次列表與上方篩選列的分隔線留 12px 空隙（ux.md A2，2026-11-22）
- [x] **T130** 分享連結預覽圖改用 `public/logo_2.jpg`（正方形，`twitter:card` 改 summary），移除 `og-image.png`（ux.md U1，2026-11-22）
- [x] **T131** favicon（16／32／96／128、favicon.ico）與 apple-touch-icon 改由 `public/logo_2.jpg` 縮小產生（ux.md U1，2026-11-22）
- [x] **T132** 管理端頁首、側欄、登入頁加「世界之光聖教會」：`AdminBrand`（小字教會名稱在上、「ECHO 管理」在下）；教會名稱字型抽成 `--echo-font-brand`，會友端頁首共用（ux.md U1，2026-11-22）
- [x] **T133** 講台模式小卡附議數拿掉「人也想知道」，只顯示「↑ 12」（與留言列表相同；ux.md A7，2026-11-22）
- [x] **T134** 講台小卡：拿掉右上角「會友留言」與頁尾「已回應」，頁尾左邊改為留言者暱稱（未填顯示匿名）；場次名稱移到卡片外左上方（spec D2、ux.md A7，2026-11-22）
- [x] **T135** `AutoClosePicker` 欄位名稱「自動結束時間」改為「設定留言結束時間」（場次表單、「設定結束時間」對話框；ux.md A3，2026-11-22）
- [~] **T136** 刪除改為封存：migration `20261122010000_soft_delete.sql`（`deleted_at`／`deleted_by`、`archive_session`／`archive_post`／`archive_reply` RPC、RLS 排除封存、拿掉 DELETE 權限、回覆數與 Realtime 廣播）+ pgTAP `soft_delete.test.sql`、`rls.test.sql` 調整；services 改呼叫 RPC；確認訊息改為「資料會保留」；deploy.md 還原步驟（spec D20，2026-11-22）。待在 Supabase 執行 migration `👤`
- [x] **T137** 分享預覽：`og-image.jpg`（1200×630，由 logo_2.jpg 產生，`twitter:card` 改 summary_large_image）；`<title>`、`og:title`、`og:site_name` 改為「世界之光聖教會 | ECHO」；加 `og:url`、canonical、`og:locale`、`og:image:alt`、`<noscript>` H1（ux.md U1，2026-11-22）
- [x] **T138** 會友端 `PostCard` 附議按鈕移到留言內容正下方、回覆區塊之前，避免看起來像在附議牧者回應（ux.md §5，2026-11-22）
- [x] **T139** 拿掉管理端的草稿畫面：場次列表「草稿」篩選、側欄「草稿」分組、場次頁草稿提醒列、分享 QR 對話框的草稿提醒與「立即開放」；資料庫不動（spec D17、ux.md A2／A3，2026-11-22）
- [x] **T140** 場次列表拿掉 `max-width: 960px`，電腦版填滿側欄右邊的寬度（ux.md A2，2026-11-22）
- [x] **T141** 電腦版（≥ 1280px）頁首改為與手機相同、整頁寬：品牌＋帳號選單（管理者名稱 ▾ → 登出）；側欄移到頁首下方，頂端為滿寬主要按鈕「＋ 新增場次」（與手機同色），下面是場次清單；`--admin-top` 各尺寸皆 59px（ux.md §2.1，2026-11-22）
- [x] **T142** 新增／編輯場次表單：平板、電腦由右側滑出面板改為置中對話框（寬 520px，太高時內容捲動）；手機維持全螢幕（ux.md A3，2026-11-22）
- [x] **T143** 場次管理頁麵包屑改為標題上方一行小字「‹ 場次列表」；電腦版標題列高度改用 `--bar-h: 80px`（回覆面板位置跟著算）（ux.md A4，2026-11-22）
- [x] **T144** 回應者名稱改存 `localStorage`（原 `sessionStorage`），同一台裝置關掉瀏覽器後下次仍自動帶入上次填的名稱（spec AC6.2、ux.md A5，2026-11-22）
- [x] **T145** 場次表單「講員／主講人」改為必填、預設空白（不再帶入上一場的講員，仍保留過去講員的輸入提示）；未填顯示「請輸入講員／主講人」（spec AC5.2、ux.md A3，2026-11-22）
- [~] **T146** 會友接續留言（spec US10、D21；ux.md M5）：migration `20261123000000_member_comments.sql`（`replies.author_kind`／`member_id`／`is_hidden`、`posts.comment_count`、trigger、RLS、欄位權限）+ pgTAP `comments.test.sql`、`rls.test.sql` 調整；services（mock、supabase）`replies.comment`、`replies.setHidden`；`sortFilter` 只用牧者回覆判斷已回應與「最新回應」+ Vitest；`PostCard` 會友模式「留言」按鈕、接續留言樣式、管理模式隱藏／刪除；`CommentSheet`（2026-11-23）。待在 Supabase 執行 migration `👤`
- [x] **T147** 會友端附議、留言按鈕改為圖示＋數字（粗箭頭：未附議中空、已附議填滿／`chat_bubble_outline`，inline SVG）；留言按鈕在場次結束後停用但仍顯示則數（spec AC10.4、ux.md M2／M5，2026-11-23）
- [x] **T148** 附議、留言圖示按鈕拿掉外框與底色（已附議改為深抹茶色；圖示與數字垂直置中）；接續留言面板上方只顯示最近 2 則，較早的可展開；`ComposeSheet` 鍵盤彈出時上方區塊降為 30%（ux.md M2／M5／§5，2026-11-23）
- [x] **T149** 留言卡片的接續留言超過 3 則時只顯示最近 2 則，較早的收成「顯示其他 N 則留言」，展開後可「收合留言」；牧者回覆一律顯示（ux.md M2，2026-11-23）
- [x] **T150** 管理端留言卡片的附議數與「回覆」改為與會友端相同的圖示＋數字（中空箭頭、留言泡泡）；圖示抽成共用元件 `ActionIcon`（ux.md A4、§5，2026-11-23）
- [x] **T151** 排序加入「最多留言」（會友端、管理端；放在「最多附議」之後）：依底下牧者回覆＋接續留言則數，一樣多時較新的在前；數字變動時不即時重排 + Vitest（spec AC3.3、AC6.1、ux.md §6.2，2026-11-23）
- [~] **T152** iOS 撰寫面板捲動：上方區塊與輸入框 `overscroll-behavior: contain`、頂列底列 `touch-action: none`，避免捲動傳到後面頁面；接續留言面板展開較早的回應時收起鍵盤、上方區塊放大到 60%（ux.md M5，2026-11-23）。待 iPhone 實機確認 `👤`
- [~] **T153** 管理者在會友留言板的接續留言改為一般接續留言（不是牧者回覆），輸入框 placeholder 改為提示：migration `20261123010000_staff_member_comments.sql`（開放 `insert (author_kind)`）+ pgTAP；`CommentSheet` 拿掉「回應者」模式；services 指定 `author_kind = member`（spec AC10.9，2026-11-23）。待在 Supabase 執行 migration `👤`

**檢查點 3**：兩支手機同時進入同一場次，留言/附議即時互見；以真實資料重走檢查點 1 的完整流程。

## Phase 4 — 保存與匯出（US8）

- ~~**T040** `utils/export.ts`（Markdown / CSV）+ Vitest（AC8.3）~~ 取消（spec D16）
- ~~**T041** 匯出按鈕與下載~~ 取消（spec D16）
- [ ] **T042** 已結束場次唯讀狀態驗收（AC1.2, 8.2）

## Phase 5 — 上線前

- [ ] **T050** 無障礙與長者友善檢查（字級、對比、觸控區）
- [ ] **T051** 安全檢查：以匿名 key 直接呼叫 REST API 嘗試越權
- [ ] **T052** 使用說明（給管理者的操作手冊一頁）
- [ ] **T053** 主日試營運，收集回饋 → 更新 spec / backlog
- [ ] **T054** RWD 驗收（真實資料）：360、390、768、1024、1366、1440、1920 寬度下，會友端與管理端所有頁面（含講台模式、過去場次）皆可完整操作（AC1.6, AC5.10；ux.md §2.1）
