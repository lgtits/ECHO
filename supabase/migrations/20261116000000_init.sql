-- ECHO 初始 schema（plan §3、§4、§5；tasks T010–T013、T019）
-- 權限一律在這裡以 RLS + 欄位權限 + trigger 強制（憲章「安全靠資料庫，不靠前端」）。
-- 自訂錯誤一律 raise 'echo:<code>'，前端在 services/supabase/errors.ts 轉成 ServiceError。

-- ── 列舉與資料表 ────────────────────────────────────────

create type public.session_status as enum ('draft', 'open', 'closed');

-- 管理者：只有一種身分（spec D12）。目前只建一個共用帳號（spec D14）。
create table public.staff_members (
  user_id      uuid primary key references auth.users on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- 6 碼場次碼：排除 0/O/1/I/L（plan §7.1）
create function public.gen_session_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  chars constant text := '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  result text;
begin
  loop
    result := '';
    for i in 1..6 loop
      result := result || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where code = result);
  end loop;
  return result;
end;
$$;

create table public.sessions (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique default public.gen_session_code()
                  check (code ~ '^[2-9A-HJKMNP-Z]{6}$'),
  title         text not null check (char_length(title) between 1 and 100),
  speaker       text,
  scripture     text,
  sermon_date   date not null,
  status        public.session_status not null default 'draft',
  auto_close_at timestamptz,
  created_by    uuid default auth.uid() references public.staff_members (user_id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index sessions_status_date_idx on public.sessions (status, sermon_date desc, created_at desc);

create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions on delete cascade,
  author_id      uuid references auth.users on delete set null, -- trigger 強制 = auth.uid()；前端讀不到
  nickname       text check (char_length(nickname) <= 20),
  body           text not null check (char_length(body) between 1 and 500),
  upvote_count   int not null default 0,  -- trigger 維護
  reply_count    int not null default 0,  -- trigger 維護（>0 即「已回應」）
  is_hidden      boolean not null default false,
  hidden_by      uuid references public.staff_members (user_id) on delete set null,
  hidden_by_name text,                    -- 快照，管理端顯示「由 OO 隱藏」
  hidden_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index posts_session_created_idx on public.posts (session_id, created_at desc);
create index posts_author_created_idx on public.posts (author_id, created_at desc);

create table public.upvotes (
  post_id    uuid not null references public.posts on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id) -- 每人每則一次（AC3.2）
);
create index upvotes_user_idx on public.upvotes (user_id);

create table public.replies (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts on delete cascade,
  session_id  uuid not null references public.sessions on delete cascade, -- 冗餘：供 Realtime 以場次過濾
  author_id   uuid references public.staff_members (user_id) on delete set null,
  author_name text not null,
  body        text not null check (char_length(body) between 1 and 2000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index replies_post_idx on public.replies (post_id, created_at);
create index replies_session_idx on public.replies (session_id);

-- ── 輔助函式（plan §3.1）─────────────────────────────────

create function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.staff_members where user_id = auth.uid());
$$;

/** 開放中且未到自動結束時間：到時間的那一秒就停止寫入，不必等排程（plan §3.1） */
create function public.session_is_writable(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = sid
      and s.status = 'open'
      and (s.auto_close_at is null or now() < s.auto_close_at)
  );
$$;

/** 會友看得到這則留言：未隱藏，且場次不是草稿；管理者全部看得到 */
create function public.post_is_visible(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_staff() or exists (
    select 1 from public.posts p
    join public.sessions s on s.id = p.session_id
    where p.id = pid and not p.is_hidden and s.status <> 'draft'
  );
$$;

/** 可以附議：留言對會友可見，且場次可寫入（AC3.1） */
create function public.can_upvote(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    join public.sessions s on s.id = p.session_id
    where p.id = pid and not p.is_hidden and public.session_is_writable(s.id)
  );
$$;

-- ── Triggers（plan §3.2）─────────────────────────────────

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 場次：重新開放時清除自動結束時間（AC5.9）
create function public.sessions_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'closed' and new.status = 'open' then
    new.auto_close_at := null;
  end if;
  return new;
end;
$$;

create trigger sessions_touch before update on public.sessions
  for each row execute function public.touch_updated_at();
create trigger sessions_before_update before update on public.sessions
  for each row execute function public.sessions_before_update();

-- 留言：作者、可寫入、頻率限制（AC2.1–2.3）
create function public.posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.author_id := auth.uid();
  if new.author_id is null then
    raise exception 'echo:forbidden';
  end if;

  new.body := btrim(new.body);
  new.nickname := nullif(btrim(new.nickname), '');
  new.upvote_count := 0;
  new.reply_count := 0;
  new.is_hidden := false;
  new.hidden_by := null;
  new.hidden_by_name := null;
  new.hidden_at := null;
  new.created_at := now();

  if not public.session_is_writable(new.session_id) then
    raise exception 'echo:session_closed';
  end if;

  if (
    select count(*) from public.posts
    where author_id = new.author_id and created_at > now() - interval '60 seconds'
  ) >= 5 then
    raise exception 'echo:rate_limited';
  end if;

  return new;
end;
$$;

create trigger posts_before_insert before insert on public.posts
  for each row execute function public.posts_before_insert();

-- 留言：隱藏時記錄是誰、什麼時候（AC7.2）。欄位權限只開放 is_hidden，其他欄位前端改不了。
create function public.posts_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_hidden is distinct from old.is_hidden then
    if new.is_hidden then
      new.hidden_by := auth.uid();
      new.hidden_by_name := (select display_name from public.staff_members where user_id = auth.uid());
      new.hidden_at := now();
    else
      new.hidden_by := null;
      new.hidden_by_name := null;
      new.hidden_at := null;
    end if;
  end if;
  return new;
end;
$$;

create trigger posts_before_update before update on public.posts
  for each row execute function public.posts_before_update();

-- 留言被隱藏或刪除：廣播 post_id（plan §5）。
-- postgres_changes 會套用 RLS，會友收不到「變成看不到」的那筆事件，所以另外廣播。
create function public.posts_broadcast_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform realtime.send(jsonb_build_object('post_id', old.id), 'post_removed', 'session:' || old.session_id, false);
    return old;
  end if;
  if new.is_hidden and not old.is_hidden then
    perform realtime.send(jsonb_build_object('post_id', new.id), 'post_removed', 'session:' || new.session_id, false);
  end if;
  return new;
end;
$$;

create trigger posts_broadcast_removed after update or delete on public.posts
  for each row execute function public.posts_broadcast_removed();

-- 附議數
create function public.upvotes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set upvote_count = upvote_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts set upvote_count = greatest(upvote_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger upvotes_after_change after insert or delete on public.upvotes
  for each row execute function public.upvotes_after_change();

-- 回覆：作者、顯示名稱快照、場次（Q4）
create function public.replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  name text;
begin
  select display_name into name from public.staff_members where user_id = auth.uid();
  if name is null then
    raise exception 'echo:forbidden';
  end if;
  new.author_id := auth.uid();
  new.author_name := name;
  new.body := btrim(new.body);
  new.session_id := (select session_id from public.posts where id = new.post_id);
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;

create trigger replies_before_insert before insert on public.replies
  for each row execute function public.replies_before_insert();

create function public.replies_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.body := btrim(new.body);
  new.updated_at := now();
  return new;
end;
$$;

create trigger replies_before_update before update on public.replies
  for each row execute function public.replies_before_update();

-- 回覆數
create function public.replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
    return new;
  end if;
  update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
  return old;
end;
$$;

create trigger replies_after_change after insert or delete on public.replies
  for each row execute function public.replies_after_change();

-- ── RPC ──────────────────────────────────────────────────

/** 附議／取消附議。security invoker：RLS 照常套用，另外給清楚的錯誤碼（AC3.1、3.2） */
create function public.set_upvote(p_post uuid, p_on boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'echo:forbidden';
  end if;
  if not public.can_upvote(p_post) then
    raise exception 'echo:session_closed';
  end if;
  if p_on then
    insert into public.upvotes (post_id, user_id) values (p_post, auth.uid())
      on conflict do nothing;
  else
    delete from public.upvotes where post_id = p_post and user_id = auth.uid();
  end if;
end;
$$;

/** 場次列表的留言數與待回應數（AC5.5、AC8.4）。security invoker：會友只算得到看得見的留言 */
create function public.session_counts(ids uuid[])
returns table (session_id uuid, post_count int, pending_count int)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.session_id,
         count(*)::int,
         (count(*) filter (where p.reply_count = 0))::int
  from public.posts p
  where p.session_id = any (ids) and not p.is_hidden
  group by p.session_id;
$$;

revoke execute on function public.set_upvote(uuid, boolean) from public, anon;
grant execute on function public.set_upvote(uuid, boolean) to authenticated;

-- ── 欄位層級權限（plan §3.2）─────────────────────────────

revoke all on public.staff_members from anon, authenticated;
grant select on public.staff_members to authenticated;

revoke all on public.posts from anon, authenticated;
-- author_id 不給任何前端角色讀（spec D11、NFR-03）
grant select (id, session_id, nickname, body, upvote_count, reply_count,
              is_hidden, hidden_by, hidden_by_name, hidden_at, created_at)
  on public.posts to anon, authenticated;
-- id 由前端產生，送出後直接用它讀回自己的留言（不需要 RETURNING author_id）
grant insert (id, session_id, nickname, body) on public.posts to authenticated;
grant update (is_hidden) on public.posts to authenticated;

revoke all on public.upvotes from anon, authenticated;
grant select, insert, delete on public.upvotes to authenticated;

revoke all on public.replies from anon, authenticated;
grant select on public.replies to anon, authenticated;
grant insert (post_id, body) on public.replies to authenticated;
grant update (body) on public.replies to authenticated;
grant delete on public.replies to authenticated;

revoke all on public.sessions from anon, authenticated;
grant select on public.sessions to anon, authenticated;
grant insert (title, speaker, scripture, sermon_date, status, auto_close_at) on public.sessions to authenticated;
grant update (title, speaker, scripture, sermon_date, status, auto_close_at) on public.sessions to authenticated;
grant delete on public.sessions to authenticated;

-- ── RLS（plan §4 權限矩陣）───────────────────────────────

alter table public.staff_members enable row level security;
alter table public.sessions enable row level security;
alter table public.posts enable row level security;
alter table public.upvotes enable row level security;
alter table public.replies enable row level security;

create policy staff_select on public.staff_members
  for select to authenticated using ((select public.is_staff()));

create policy sessions_select on public.sessions
  for select to anon, authenticated
  using (status <> 'draft' or (select public.is_staff()));
create policy sessions_insert on public.sessions
  for insert to authenticated with check ((select public.is_staff()));
create policy sessions_update on public.sessions
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy sessions_delete on public.sessions
  for delete to authenticated using ((select public.is_staff()));

create policy posts_select on public.posts
  for select to anon, authenticated
  using (
    (select public.is_staff())
    or (not is_hidden and exists (
      select 1 from public.sessions s where s.id = session_id and s.status <> 'draft'
    ))
  );
create policy posts_insert on public.posts
  for insert to authenticated
  with check (author_id = auth.uid() and public.session_is_writable(session_id));
create policy posts_update on public.posts
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
-- posts 沒有 delete policy：任何人都不能直接刪除，只隨場次一起刪（spec D9）

create policy upvotes_select on public.upvotes
  for select to authenticated using (user_id = auth.uid());
create policy upvotes_insert on public.upvotes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_upvote(post_id));
create policy upvotes_delete on public.upvotes
  for delete to authenticated
  using (user_id = auth.uid() and public.can_upvote(post_id));

create policy replies_select on public.replies
  for select to anon, authenticated using (public.post_is_visible(post_id));
create policy replies_insert on public.replies
  for insert to authenticated with check ((select public.is_staff()));
create policy replies_update on public.replies
  for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
create policy replies_delete on public.replies
  for delete to authenticated using ((select public.is_staff()));

-- ── Realtime（plan §5）───────────────────────────────────

alter publication supabase_realtime add table public.sessions, public.posts, public.replies;

-- ── 自動結束（AC5.9；plan §3.1.1）────────────────────────

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'echo-auto-close',
  '* * * * *',
  $$update public.sessions set status = 'closed' where status = 'open' and auto_close_at <= now()$$
);
