-- 牧者回覆的編輯記錄（spec AC6.6、D22；migration 20261123020000_reply_edit_history.sql）。
-- 執行：npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

-- ── 測試資料 ────────────────────────────────────────────
-- a1 = 管理者；b1 = 會友
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', null, 'authenticated', 'authenticated');
insert into public.staff_members (user_id, display_name)
  values ('00000000-0000-0000-0000-0000000000a1', '王牧師');
insert into public.sessions (id, code, title, sermon_date, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'AAAAA2', '開放中', '2026-11-22', 'open');

set local role authenticated;

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into public.posts (id, session_id, body) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '稱義和成聖的差別？');

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.replies (id, post_id, body) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '第一版');

-- ── 管理者編輯 ───────────────────────────────────────────
select is(
  (select edited_at from public.replies where id = '00000000-0000-0000-0000-0000000000e1'), null,
  '沒編輯過的回覆 edited_at 為空'
);
select lives_ok(
  $$update public.replies set body = '第二版' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '管理者編輯回覆'
);
select isnt(
  (select edited_at from public.replies where id = '00000000-0000-0000-0000-0000000000e1'), null,
  '編輯後記下 edited_at（AC6.6）'
);
select results_eq(
  $$select body from public.reply_edits where reply_id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('第一版'::text)$$,
  '編輯前的內容存進編輯記錄'
);

update public.replies set body = '  第二版  ' where id = '00000000-0000-0000-0000-0000000000e1';
select is(
  (select count(*)::int from public.reply_edits where reply_id = '00000000-0000-0000-0000-0000000000e1'), 1,
  '內容沒變（只差頭尾空白）不算一次編輯'
);

update public.replies set body = '第三版' where id = '00000000-0000-0000-0000-0000000000e1';
select results_eq(
  $$select body from public.reply_edits
    where reply_id = '00000000-0000-0000-0000-0000000000e1' order by edited_at, body$$,
  $$values ('第一版'::text), ('第二版'::text)$$,
  '每次編輯都留下一筆'
);

-- ── 會友 ────────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.reply_edits), 2,
  '會友看得到公開回覆的編輯記錄（D22）'
);
select throws_ok(
  $$insert into public.reply_edits (reply_id, body) values ('00000000-0000-0000-0000-0000000000e1', '偽造')$$,
  '42501', null, '會友不能新增編輯記錄'
);
select throws_ok(
  'select edited_by from public.reply_edits',
  '42501', null, '前端角色讀不到 edited_by'
);

-- ── anon ────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select is(
  (select count(*)::int from public.reply_edits), 2,
  '未登入也看得到（跟著回覆的可見性）'
);

-- ── 留言被隱藏後，會友看不到它的回覆，也看不到編輯記錄 ────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
update public.posts set is_hidden = true where id = '00000000-0000-0000-0000-0000000000d1';
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select is(
  (select count(*)::int from public.reply_edits), 0,
  '留言被隱藏後，會友看不到它回覆的編輯記錄'
);

select * from finish();
rollback;
