-- 刪除＝封存（spec D20；migration 20261122010000_soft_delete.sql）。
-- 封存後 App 內所有人都看不到，但資料保留在資料庫；只有管理者能封存；可以在資料庫還原。
-- 執行：npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

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

-- 會友留兩則
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into public.posts (id, session_id, body) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '第一則'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c1', '第二則');

-- 管理者回覆第一則
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.replies (id, post_id, body) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '謝謝提問');

-- ── 會友不能封存 ─────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select throws_ok(
  $$select public.archive_post('00000000-0000-0000-0000-0000000000d2')$$,
  'P0001', 'echo:forbidden', '會友不能刪除（封存）留言'
);
select throws_ok(
  $$select public.archive_reply('00000000-0000-0000-0000-0000000000e1')$$,
  'P0001', 'echo:forbidden', '會友不能刪除（封存）回覆'
);
select throws_ok(
  $$select public.archive_session('00000000-0000-0000-0000-0000000000c1')$$,
  'P0001', 'echo:forbidden', '會友不能刪除（封存）場次'
);

-- ── 封存回覆 ────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select throws_ok(
  $$delete from public.replies where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '42501', null, '管理者不能直接刪除回覆'
);
select lives_ok(
  $$select public.archive_reply('00000000-0000-0000-0000-0000000000e1')$$,
  '管理者可以刪除（封存）回覆（AC7.5）'
);
select is(
  (select count(*)::int from public.replies), 0,
  '管理者也看不到封存的回覆'
);
select is(
  (select reply_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  '封存回覆後回覆數減一，留言回到「待回應」'
);
update public.replies set body = '改內容' where id = '00000000-0000-0000-0000-0000000000e1';
select throws_ok(
  $$select public.archive_reply('00000000-0000-0000-0000-0000000000e1')$$,
  'P0001', 'echo:not_found', '已封存的回覆不能再封存一次'
);

-- ── 封存留言 ────────────────────────────────────────────
select lives_ok(
  $$select public.archive_post('00000000-0000-0000-0000-0000000000d2')$$,
  '管理者可以刪除（封存）留言（AC7.4）'
);
select is(
  (select count(*)::int from public.posts where id = '00000000-0000-0000-0000-0000000000d2'), 0,
  '管理者也看不到封存的留言'
);
select is(
  (select post_count from public.session_counts(array['00000000-0000-0000-0000-0000000000c1'::uuid])),
  1,
  '場次留言數不含封存的留言'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$select public.set_upvote('00000000-0000-0000-0000-0000000000d2', true)$$,
  'P0001', 'echo:session_closed', '不能附議封存的留言'
);

-- ── 封存場次 ────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
select lives_ok(
  $$select public.archive_session('00000000-0000-0000-0000-0000000000c1')$$,
  '管理者可以刪除（封存）場次（AC5.6）'
);
select is(
  (select count(*)::int from public.sessions), 0,
  '管理者也看不到封存的場次'
);
select is(
  (select count(*)::int from public.posts), 0,
  '封存場次後，它的留言也都看不到'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c1', 'x')$$,
  'P0001', 'echo:session_closed', '封存的場次不能再留言'
);

-- ── 資料都還在，可以在資料庫還原 ─────────────────────────
reset role;

select results_eq(
  $$select (select count(*)::int from public.sessions),
           (select count(*)::int from public.posts),
           (select count(*)::int from public.replies)$$,
  $$values (1, 2, 1)$$,
  '場次、留言、回覆的資料都還在資料庫'
);
select is(
  (select body from public.replies where id = '00000000-0000-0000-0000-0000000000e1'), '謝謝提問',
  '封存的回覆不能再被修改'
);

update public.replies set deleted_at = null, deleted_by = null
  where id = '00000000-0000-0000-0000-0000000000e1';
select is(
  (select reply_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 1,
  '在資料庫把 deleted_at 清空即還原，回覆數加回來（deploy.md §6）'
);

select * from finish();
rollback;
