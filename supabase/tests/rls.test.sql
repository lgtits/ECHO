-- 權限矩陣（plan §4）、trigger（plan §3.2）、頻率限制、計數、管理者刪除留言（D15）。tasks T014、T019。
-- 執行：npx supabase test db

begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

-- ── 測試資料（以 postgres 建立，不受 RLS 限制）──────────────
-- a1 = 管理者；b1、b2 = 匿名會友
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@test.local', 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b1', null, 'authenticated', 'authenticated'),
  ('00000000-0000-0000-0000-0000000000b2', null, 'authenticated', 'authenticated');
insert into public.staff_members (user_id, display_name)
  values ('00000000-0000-0000-0000-0000000000a1', '王牧師');

insert into public.sessions (id, code, title, sermon_date, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'AAAAA2', '開放中', '2026-11-15', 'open'),
  ('00000000-0000-0000-0000-0000000000c2', 'BBBBB2', '已結束', '2026-11-08', 'closed'),
  ('00000000-0000-0000-0000-0000000000c3', 'CCCCC2', '草稿', '2026-11-22', 'draft');

-- ── 未登入（anon）────────────────────────────────────────
set local role anon;
set local request.jwt.claims to '{"role":"anon"}';

select results_eq(
  'select code from public.sessions order by code',
  $$values ('AAAAA2'), ('BBBBB2')$$,
  'anon 看得到開放中與已結束的場次，看不到草稿'
);
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c1', 'x')$$,
  '42501', null, 'anon 不能留言（要先建立匿名身分）'
);

-- ── 會友 b1 ──────────────────────────────────────────────
set local role authenticated;
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b1","role":"authenticated"}';

select lives_ok(
  $$insert into public.posts (id, session_id, nickname, body)
    values ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000c1', '  ', '  第一則  ')$$,
  '會友可以在開放中的場次留言'
);
select results_eq(
  $$select body, nickname from public.posts where id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values ('第一則'::text, null::text)$$,
  '內容去頭尾空白、空白暱稱存成 null'
);
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c2', 'x')$$,
  'P0001', 'echo:session_closed', '已結束的場次不能留言'
);
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c3', 'x')$$,
  'P0001', 'echo:session_closed', '草稿場次不能留言'
);
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c1', '')$$,
  '23514', null, '空白留言被拒絕'
);
select throws_ok(
  'select author_id from public.posts',
  '42501', null, '前端角色讀不到 posts.author_id（spec D11）'
);

-- 頻率限制：60 秒內第 6 則被拒絕（AC2.3）
do $$
begin
  for i in 1..4 loop
    insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c1', '連續 ' || i);
  end loop;
end;
$$;
select throws_ok(
  $$insert into public.posts (session_id, body) values ('00000000-0000-0000-0000-0000000000c1', '第六則')$$,
  'P0001', 'echo:rate_limited', '60 秒內第 6 則留言被拒絕'
);

select lives_ok(
  $$update public.posts set is_hidden = true where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '會友更新 is_hidden 不會報錯（RLS 直接略過）'
);
select throws_ok(
  $$update public.posts set body = '改內容' where id = '00000000-0000-0000-0000-0000000000d1'$$,
  '42501', null, '會友不能改留言內容'
);
select throws_ok(
  'delete from public.posts',
  '42501', null, '會友不能刪除留言（spec D9；前端角色已沒有 DELETE 權限，D20）'
);
select throws_ok(
  $$insert into public.sessions (title, sermon_date) values ('偷建場次', '2026-12-01')$$,
  '42501', null, '會友不能建立場次'
);
select is(
  (select count(*)::int from public.staff_members), 0,
  '會友讀不到管理者名單'
);
select throws_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', '偷回覆')$$,
  'P0001', 'echo:forbidden', '會友不能回覆'
);

-- 附議（AC3.1、3.2）
select lives_ok(
  $$select public.set_upvote('00000000-0000-0000-0000-0000000000d1', true)$$,
  'b1 附議'
);
select lives_ok(
  $$select public.set_upvote('00000000-0000-0000-0000-0000000000d1', true)$$,
  'b1 重複附議不會報錯'
);

set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';
do $$ begin perform public.set_upvote('00000000-0000-0000-0000-0000000000d1', true); end $$;
select is(
  (select upvote_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 2,
  '兩人附議，重複附議只算一次'
);
select is(
  (select count(*)::int from public.upvotes), 1,
  '會友只看得到自己的附議'
);
do $$ begin perform public.set_upvote('00000000-0000-0000-0000-0000000000d1', false); end $$;
select is(
  (select upvote_count from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 1,
  '取消附議後減一'
);

-- ── 管理者 a1 ────────────────────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}';

select is(
  (select count(*)::int from public.sessions), 3,
  '管理者看得到草稿'
);
select lives_ok(
  $$insert into public.replies (post_id, body) values ('00000000-0000-0000-0000-0000000000d1', '謝謝你的提問')$$,
  '管理者可以回覆'
);
select results_eq(
  $$select r.author_name, p.reply_count from public.replies r join public.posts p on p.id = r.post_id
    where r.post_id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values ('牧者'::text, 1)$$,
  '沒填回應者名稱時顯示「牧者」，回覆數加一（spec D18）'
);
select lives_ok(
  $$insert into public.replies (post_id, body, author_name)
    values ('00000000-0000-0000-0000-0000000000d1', '補充說明', '  李傳道 ')$$,
  '管理者可以填寫回應者名稱'
);
select is(
  (select author_name from public.replies where body = '補充說明'), '李傳道',
  '回應者名稱去頭尾空白後儲存（AC6.2）'
);
select throws_ok(
  $$insert into public.replies (post_id, body, author_name)
    values ('00000000-0000-0000-0000-0000000000d1', '太長', repeat('名', 21))$$,
  '23514', null,
  '回應者名稱超過 20 字會被拒絕'
);
update public.posts set is_hidden = true where id = '00000000-0000-0000-0000-0000000000d1';
select results_eq(
  $$select is_hidden, hidden_by_name from public.posts where id = '00000000-0000-0000-0000-0000000000d1'$$,
  $$values (true, '王牧師'::text)$$,
  '管理者可以隱藏留言，並記錄是誰隱藏（AC7.2）'
);
select throws_ok(
  $$delete from public.posts where body = '連續 1'$$,
  '42501', null, '管理者也不能直接刪除，一律改為封存（spec D20）'
);
select lives_ok(
  $$select public.archive_post((select id from public.posts where body = '連續 1'))$$,
  '管理者可以刪除（封存）留言（spec D15、D20）'
);
select is(
  (select count(*)::int from public.posts where body = '連續 1'), 0,
  '封存後就讀不到這則留言'
);

-- ── 會友 b2 看隱藏後的留言 ───────────────────────────────
set local request.jwt.claims to '{"sub":"00000000-0000-0000-0000-0000000000b2","role":"authenticated"}';

select is(
  (select count(*)::int from public.posts where id = '00000000-0000-0000-0000-0000000000d1'), 0,
  '會友看不到隱藏的留言'
);
select is(
  (select count(*)::int from public.replies), 0,
  '會友看不到隱藏留言的回覆'
);
select throws_ok(
  $$select public.set_upvote('00000000-0000-0000-0000-0000000000d1', true)$$,
  'P0001', 'echo:session_closed', '不能附議隱藏的留言'
);

-- ── 回到 postgres 檢查資料本身 ────────────────────────────
reset role;

select is(
  (select count(*)::int from public.posts where session_id = '00000000-0000-0000-0000-0000000000c1'), 5,
  '會友刪不掉留言；管理者刪除只是封存，5 則資料都還在（spec D20）'
);
select is(
  (select count(*)::int from public.posts
    where session_id = '00000000-0000-0000-0000-0000000000c1' and deleted_at is not null), 1,
  '其中 1 則標記為封存'
);
select is(
  (select author_id from public.posts where id = '00000000-0000-0000-0000-0000000000d1'),
  '00000000-0000-0000-0000-0000000000b1'::uuid,
  'author_id 由 trigger 填入目前身分'
);

update public.sessions set auto_close_at = now()
  where id = '00000000-0000-0000-0000-0000000000c1';
select ok(
  not public.session_is_writable('00000000-0000-0000-0000-0000000000c1'),
  '到了自動結束時間就不能寫入，不必等排程（AC5.9）'
);

update public.sessions set auto_close_at = now() + interval '1 hour'
  where id = '00000000-0000-0000-0000-0000000000c2';
update public.sessions set status = 'open'
  where id = '00000000-0000-0000-0000-0000000000c2';
select is(
  (select auto_close_at from public.sessions where id = '00000000-0000-0000-0000-0000000000c2'),
  null,
  '重新開放時清除自動結束時間'
);

select * from finish();
rollback;
