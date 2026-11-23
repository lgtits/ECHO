-- 會友接續留言（spec US10、D21；plan §3、§3.2、§4、§5）。
-- 與牧者回覆共用 replies 表，以 author_kind 區分：
--   staff  = 管理者回覆：算「已回應」，可以編輯，不能隱藏
--   member = 會友接續留言：不算已回應，不能編輯，管理者可以隱藏
-- 會友作者存在 member_id（前端讀不到，spec D11），author_id 仍只放管理者。

-- ── 欄位 ────────────────────────────────────────────────

alter table public.replies
  add column author_kind text not null default 'staff'
    constraint replies_author_kind_check check (author_kind in ('staff', 'member')),
  add column member_id uuid references auth.users on delete set null,
  add column is_hidden boolean not null default false,
  add column hidden_by uuid references public.staff_members (user_id) on delete set null,
  add column hidden_at timestamptz,
  -- 接續留言與留言相同，最多 500 字（AC10.1）；牧者回覆維持 2000 字
  add constraint replies_member_body_length
    check (author_kind = 'staff' or char_length(body) <= 500);

create index replies_member_created_idx on public.replies (member_id, created_at)
  where member_id is not null;

-- 未封存、未隱藏的接續留言數。reply_count 改為只算牧者回覆（「已回應」不變，AC10.3）。
-- 既有的 replies 都是牧者回覆，reply_count 不必重算。
alter table public.posts add column comment_count int not null default 0;

-- ── 輔助函式 ─────────────────────────────────────────────

/** 可以接續留言：條件與附議相同（留言對會友可見、未封存，且場次可寫入；AC10.1、AC10.4） */
create function public.can_comment(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_upvote(pid);
$$;

-- ── Triggers ────────────────────────────────────────────

-- 留言：新留言的計數一律從 0 開始（加上 comment_count）
create or replace function public.posts_before_insert()
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
  new.comment_count := 0;
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

-- 回覆／接續留言：身分決定種類。管理者一律是牧者回覆（AC10.9）。
create or replace function public.replies_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'echo:forbidden';
  end if;

  new.body := btrim(new.body);
  new.session_id := (select session_id from public.posts where id = new.post_id);
  new.is_hidden := false;
  new.hidden_by := null;
  new.hidden_at := null;
  new.created_at := now();
  new.updated_at := now();

  if public.is_staff() then
    new.author_kind := 'staff';
    new.author_id := auth.uid();
    new.member_id := null;
    new.author_name := coalesce(nullif(btrim(new.author_name), ''), '牧者');
    return new;
  end if;

  new.author_kind := 'member';
  new.author_id := null;
  new.member_id := auth.uid();
  new.author_name := coalesce(nullif(btrim(new.author_name), ''), '匿名');

  if not public.can_comment(new.post_id) then
    raise exception 'echo:session_closed';
  end if;

  -- 頻率限制與留言分開計算（AC10.6）
  if (
    select count(*) from public.replies
    where member_id = new.member_id and created_at > now() - interval '60 seconds'
  ) >= 5 then
    raise exception 'echo:rate_limited';
  end if;

  return new;
end;
$$;

-- 接續留言不能改內容（AC10.5、AC10.7）；只有接續留言能隱藏，並記錄是誰、什麼時候
create or replace function public.replies_before_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.body is distinct from old.body then
    if old.author_kind = 'member' then
      raise exception 'echo:forbidden';
    end if;
    new.body := btrim(new.body);
  end if;

  if new.is_hidden is distinct from old.is_hidden then
    if old.author_kind <> 'member' then
      raise exception 'echo:forbidden';
    end if;
    if new.is_hidden then
      new.hidden_by := auth.uid();
      new.hidden_at := now();
    else
      new.hidden_by := null;
      new.hidden_at := null;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

-- 計數：每次直接重算，封存／還原／隱藏都不會算錯。
-- 一定會 UPDATE posts，所以會友端也會收到 posts 的 UPDATE 事件；接續留言被隱藏後
-- 會友已讀不到那一列（收不到 replies 的事件），靠這個事件重新讀取（plan §5）。
create or replace function public.replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  pid uuid;
begin
  if tg_op = 'DELETE' then
    pid := old.post_id;
  else
    pid := new.post_id;
  end if;

  update public.posts p set
    reply_count = (
      select count(*) from public.replies r
      where r.post_id = pid and r.author_kind = 'staff' and r.deleted_at is null
    ),
    comment_count = (
      select count(*) from public.replies r
      where r.post_id = pid and r.author_kind = 'member' and r.deleted_at is null and not r.is_hidden
    )
  where p.id = pid;

  return null;
end;
$$;

drop trigger replies_after_change on public.replies;
create trigger replies_after_change
  after insert or delete or update of deleted_at, is_hidden on public.replies
  for each row execute function public.replies_after_change();

-- ── 欄位層級權限 ─────────────────────────────────────────

-- member_id 不給任何前端角色讀（spec D11、AC10.8），只供 trigger 做頻率限制
revoke select on public.replies from anon, authenticated;
grant select (id, post_id, session_id, author_kind, author_id, author_name, body,
              is_hidden, hidden_by, hidden_at, created_at, updated_at, deleted_at, deleted_by)
  on public.replies to anon, authenticated;
-- id 與留言相同，可由前端（及 pgTAP 測試）指定；author_kind 不開放，由 trigger 決定
grant insert (id, post_id, body, author_name) on public.replies to authenticated;
-- 再由 RLS 限定只有管理者，trigger 限定接續留言只能改 is_hidden
grant update (body, is_hidden) on public.replies to authenticated;

grant select (comment_count) on public.posts to anon, authenticated;

-- ── RLS ─────────────────────────────────────────────────

drop policy replies_select on public.replies;
create policy replies_select on public.replies
  for select to anon, authenticated
  using (
    deleted_at is null
    and (not is_hidden or (select public.is_staff()))
    and public.post_is_visible(post_id)
  );

drop policy replies_insert on public.replies;
create policy replies_insert on public.replies
  for insert to authenticated
  with check (
    (author_kind = 'staff' and author_id = auth.uid() and (select public.is_staff()))
    or (author_kind = 'member' and member_id = auth.uid() and public.can_comment(post_id))
  );
-- replies_update 維持只有管理者、未封存（20261122010000_soft_delete.sql）
