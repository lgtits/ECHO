-- 會友接續留言（spec US10、D21；migration 20261123000000_member_comments.sql）。
-- 會友可在開放中場次的留言底下接續留言；不算已回應；不能編輯或刪除；管理者可隱藏、刪除（封存）。
-- 執行：npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(27);

-- ── 測試資料 ────────────────────────────────────────────
-- a1 = 管理者；b1、b2 = 會友
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', null, 'authenticated', 'authenticated');
insert into public.staff_members (user_id, display_name)
  values ('00000000-0000-0000-0000-0000000000a1', '王牧師');
insert into public.sessions (id, code, title, sermon_date, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'AAAAA2', '開放中', '2026-11-22', 'open'),
  ('00000000-0000-0000-0000-0000000000c2', 'BBBBB2', '之後結束', '2026-11-15', 'open');

set local role authenticated;

-- b1 在兩個場次各留一則
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';
insert into public.posts (id, session_id, body) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '稱義和成聖的差別？'),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000c2', '上週的問題');

reset role;
update public.sessions set status = 'closed' where id = '00000000-0000-0000-0000-0000000000c2';
set local role authenticated;

-- ── anon ────────────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';
select throws_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', 'x')$$,
  '42501', null, 'anon 不能接續留言（要先建立匿名身分）'
);

-- ── 會友 b2 接續留言 ──────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select lives_ok(
  $$insert into public.replies (id, post_id, body, author_name)
    values ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000d1', '  我也想問  ', ' 以利亞 ')$$,
  '會友可以在開放中場次的留言底下接續留言（AC10.1）'
);
select results_eq(
  $$select author_kind, author_name, body, author_id from public.replies
    where id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('member'::text, '以利亞'::text, '我也想問'::text, null::uuid)$$,
  '存成接續留言：暱稱、內容去頭尾空白，author_id 為空'
);
select lives_ok(
  $$insert into public.replies (id, post_id, body)
    values ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000d1', '同感')$$,
  '暱稱可以不填'
);
select is(
  (select author_name from public.replies where id = '00000000-0000-0000-0000-0000000000e2'), '匿名',
  '沒填暱稱顯示「匿名」'
);
select results_eq(
  $$select reply_count, comment_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values (0, 2)$$,
  '接續留言不算回覆數，另計接續留言數（AC10.3）'
);
select is(
  (select pending_count from public.session_counts(array['00000000-0000-0000-0000-0000000000c1'::uuid])),
  1,
  '有接續留言的留言仍是「待回應」（AC10.3）'
);
select throws_ok(
  'select member_id from public.replies',
  '42501', null, '前端角色讀不到接續留言的作者代碼（AC10.8、D11）'
);
insert into public.replies (post_id, body, author_kind)
  values ('00000000-0000-0000-0000-0000000000d1', '冒充', 'staff');
select is(
  (select author_kind from public.replies where body = '冒充'), 'member',
  '會友指定 author_kind = staff 也只會存成接續留言，不能冒充牧者'
);
select throws_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', repeat('字', 501))$$,
  '23514', null, '接續留言超過 500 字被拒絕'
);
select throws_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d2', '太晚了')$$,
  'P0001', 'echo:session_closed', '已結束的場次不能接續留言（AC10.4）'
);

-- 會友不能編輯、刪除（AC10.5）
update public.replies set body = '偷改' where id = '00000000-0000-0000-0000-0000000000e1';
update public.replies set is_hidden = true where id = '00000000-0000-0000-0000-0000000000e1';
select results_eq(
  $$select body, is_hidden from public.replies where id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('我也想問'::text, false)$$,
  '會友不能編輯或隱藏接續留言（RLS 直接略過）'
);
select throws_ok(
  $$select public.archive_reply('00000000-0000-0000-0000-0000000000e1')$$,
  'P0001', 'echo:forbidden', '會友不能刪除接續留言'
);

-- 頻率限制：60 秒內第 6 則被拒絕（AC10.6）；前面已有 e1、e2、冒充 3 則
do $$
begin
  for i in 1..2 loop
    insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', '連續 ' || i);
  end loop;
end;
$$;
select throws_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', '第六則')$$,
  'P0001', 'echo:rate_limited', '60 秒內第 6 則接續留言被拒絕'
);

-- ── 管理者 a1 ────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select lives_ok(
  $$insert into public.replies (id, post_id, body)
    values ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000d1', '謝謝提問')$$,
  '管理者回覆同一則留言'
);
select results_eq(
  $$select author_kind, author_name from public.replies where id = '00000000-0000-0000-0000-0000000000f1'$$,
  $$values ('staff'::text, '牧者'::text)$$,
  '管理者寫的一律是牧者回覆（AC10.9）'
);
select results_eq(
  $$select reply_count, comment_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values (1, 5)$$,
  '牧者回覆後才算已回應'
);
select throws_ok(
  $$update public.replies set body = '改會友的話' where id = '00000000-0000-0000-0000-0000000000e1'$$,
  'P0001', 'echo:forbidden', '管理者不能編輯會友的接續留言（AC10.7）'
);
select throws_ok(
  $$update public.replies set is_hidden = true where id = '00000000-0000-0000-0000-0000000000f1'$$,
  'P0001', 'echo:forbidden', '牧者回覆不能隱藏'
);
select lives_ok(
  $$update public.replies set is_hidden = true where id = '00000000-0000-0000-0000-0000000000e1'$$,
  '管理者可以隱藏接續留言（AC10.7）'
);
select results_eq(
  $$select r.hidden_by, p.comment_count from public.replies r join public.posts p on p.id = r.post_id
    where r.id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values ('00000000-0000-0000-0000-0000000000a1'::uuid, 4)$$,
  '隱藏時記錄是誰隱藏，接續留言數減一'
);
select is(
  (select count(*)::int from public.replies where post_id = '00000000-0000-0000-0000-0000000000d1'), 6,
  '管理者仍看得到隱藏的接續留言'
);
select lives_ok(
  $$select public.archive_reply('00000000-0000-0000-0000-0000000000e2')$$,
  '管理者可以刪除（封存）接續留言（AC10.7）'
);
select is(
  (select comment_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 3,
  '封存後接續留言數減一'
);

-- ── 會友 b1 看隱藏後的結果 ───────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select is(
  (select count(*)::int from public.replies where post_id = '00000000-0000-0000-0000-0000000000d1'), 4,
  '會友看不到隱藏與封存的接續留言（1 則回覆＋3 則接續留言）'
);

-- 取消隱藏
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
update public.replies set is_hidden = false where id = '00000000-0000-0000-0000-0000000000e1';
select results_eq(
  $$select r.hidden_by, r.hidden_at, p.comment_count from public.replies r
    join public.posts p on p.id = r.post_id
    where r.id = '00000000-0000-0000-0000-0000000000e1'$$,
  $$values (null::uuid, null::timestamptz, 4)$$,
  '取消隱藏後清除紀錄，接續留言數加回來'
);

-- 管理者在會友留言板留言：指定 author_kind = member（AC10.9）
insert into public.replies (id, post_id, body, author_kind)
  values ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000d1', '會友頁上的留言', 'member');
select results_eq(
  $$select r.author_kind, r.author_id, r.author_name, p.reply_count, p.comment_count
    from public.replies r join public.posts p on p.id = r.post_id
    where r.id = '00000000-0000-0000-0000-0000000000e3'$$,
  $$values ('member'::text, null::uuid, '匿名'::text, 1, 5)$$,
  '管理者在會友留言板的留言是一般接續留言，不算回覆（AC10.9）'
);

select * from finish();
rollback;
