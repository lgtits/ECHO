-- 刪除改為封存（soft delete；spec D20、AC5.6、AC7.4、AC7.5；plan §3、§4）。
-- 管理端按「刪除」只填 deleted_at / deleted_by，資料保留在資料庫；App 內所有人（含管理者）都看不到。
-- 還原：在 Supabase Table Editor 把 deleted_at 清空（deploy.md §6）。
-- 前端角色不再有任何 DELETE 權限，一律經由 archive_* RPC。附議（upvotes）不在此列：取消附議仍是真的刪除。

-- ── 欄位 ────────────────────────────────────────────────

alter table public.sessions
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.staff_members (user_id) on delete set null;
alter table public.posts
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.staff_members (user_id) on delete set null;
alter table public.replies
  add column deleted_at timestamptz,
  add column deleted_by uuid references public.staff_members (user_id) on delete set null;

-- ── 拿掉直接刪除 ─────────────────────────────────────────

revoke delete on public.sessions, public.posts, public.replies from anon, authenticated;
drop policy if exists sessions_delete on public.sessions;
drop policy if exists posts_delete on public.posts;
drop policy if exists replies_delete on public.replies;

-- ── 可見性：封存的資料對所有人都看不到 ─────────────────────

create or replace function public.session_is_writable(sid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = sid
      and s.deleted_at is null
      and s.status = 'open'
      and (s.auto_close_at is null or now() < s.auto_close_at)
  );
$$;

/** 留言與所屬場次都沒有封存；會友另外要未隱藏、場次不是草稿 */
create or replace function public.post_is_visible(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    join public.sessions s on s.id = p.session_id
    where p.id = pid
      and p.deleted_at is null
      and s.deleted_at is null
      and (public.is_staff() or (not p.is_hidden and s.status <> 'draft'))
  );
$$;

create or replace function public.can_upvote(pid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.posts p
    join public.sessions s on s.id = p.session_id
    where p.id = pid and p.deleted_at is null and not p.is_hidden
      and public.session_is_writable(s.id)
  );
$$;

drop policy sessions_select on public.sessions;
create policy sessions_select on public.sessions
  for select to anon, authenticated
  using (deleted_at is null and (status <> 'draft' or (select public.is_staff())));

drop policy posts_select on public.posts;
create policy posts_select on public.posts
  for select to anon, authenticated
  using (public.post_is_visible(id));

drop policy replies_select on public.replies;
create policy replies_select on public.replies
  for select to anon, authenticated
  using (deleted_at is null and public.post_is_visible(post_id));

-- 封存的資料不能再被修改（例如隱藏、編輯回覆）
drop policy sessions_update on public.sessions;
create policy sessions_update on public.sessions
  for update to authenticated
  using ((select public.is_staff()) and deleted_at is null)
  with check ((select public.is_staff()));
drop policy posts_update on public.posts;
create policy posts_update on public.posts
  for update to authenticated
  using ((select public.is_staff()) and deleted_at is null)
  with check ((select public.is_staff()));
drop policy replies_update on public.replies;
create policy replies_update on public.replies
  for update to authenticated
  using ((select public.is_staff()) and deleted_at is null)
  with check ((select public.is_staff()));

-- ── 回覆數：封存／還原回覆時跟著加減（「待回應」計數用 reply_count）──

create or replace function public.replies_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.deleted_at is null then
      update public.posts set reply_count = reply_count + 1 where id = new.post_id;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.deleted_at is null then
      update public.posts set reply_count = greatest(reply_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  -- UPDATE of deleted_at：封存減一、還原加一
  if old.deleted_at is null and new.deleted_at is not null then
    update public.posts set reply_count = greatest(reply_count - 1, 0) where id = new.post_id;
  elsif old.deleted_at is not null and new.deleted_at is null then
    update public.posts set reply_count = reply_count + 1 where id = new.post_id;
  end if;
  return new;
end;
$$;

drop trigger replies_after_change on public.replies;
create trigger replies_after_change after insert or delete or update of deleted_at on public.replies
  for each row execute function public.replies_after_change();

-- ── Realtime：封存後 RLS 讓所有人都讀不到那一列，postgres_changes 送不出去，所以另外廣播 ──

create or replace function public.posts_broadcast_removed()
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
  if (new.is_hidden and not old.is_hidden)
     or (new.deleted_at is not null and old.deleted_at is null) then
    perform realtime.send(jsonb_build_object('post_id', new.id), 'post_removed', 'session:' || new.session_id, false);
  end if;
  return new;
end;
$$;

create function public.sessions_broadcast_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    perform realtime.send(jsonb_build_object('session_id', new.id), 'session_removed', 'session:' || new.id, false);
  end if;
  return new;
end;
$$;

create trigger sessions_broadcast_removed after update of deleted_at on public.sessions
  for each row execute function public.sessions_broadcast_removed();
-- 回覆封存：posts.reply_count 的 UPDATE 會通知前端重新讀取這則留言，不必另外廣播。

-- ── 封存 RPC（管理端「刪除」按鈕）────────────────────────

create function public.archive_session(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'echo:forbidden';
  end if;
  update public.sessions set deleted_at = now(), deleted_by = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then
    raise exception 'echo:not_found';
  end if;
end;
$$;

create function public.archive_post(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'echo:forbidden';
  end if;
  update public.posts set deleted_at = now(), deleted_by = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then
    raise exception 'echo:not_found';
  end if;
end;
$$;

create function public.archive_reply(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'echo:forbidden';
  end if;
  update public.replies set deleted_at = now(), deleted_by = auth.uid()
    where id = p_id and deleted_at is null;
  if not found then
    raise exception 'echo:not_found';
  end if;
end;
$$;

revoke execute on function public.archive_session(uuid) from public, anon;
revoke execute on function public.archive_post(uuid) from public, anon;
revoke execute on function public.archive_reply(uuid) from public, anon;
grant execute on function public.archive_session(uuid) to authenticated;
grant execute on function public.archive_post(uuid) to authenticated;
grant execute on function public.archive_reply(uuid) to authenticated;

-- 自動結束排程不必處理封存的場次
select cron.unschedule('echo-auto-close');
select cron.schedule(
  'echo-auto-close',
  '* * * * *',
  $$update public.sessions set status = 'closed'
    where status = 'open' and auto_close_at <= now() and deleted_at is null$$
);
