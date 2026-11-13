-- リアクション集計用（Supabase の SQL Editor に貼って1回実行する）
-- 誰がどれを押したかは公開しない。ブラウザごとの合言葉（secret）のハッシュだけを保存する。

create table if not exists public.reactions (
  item        text not null,
  emoji       text not null,
  client_hash text not null,
  created_at  timestamptz not null default now(),
  primary key (item, emoji, client_hash)
);

-- テーブルへの直接アクセスは禁止（下の関数だけを通す）
alter table public.reactions enable row level security;
revoke all on public.reactions from anon, authenticated;

-- 記事ごと・反応ごとの件数
create or replace function public.reaction_counts(items text[])
returns table (item text, emoji text, n bigint)
language sql security definer set search_path = public as $$
  select r.item, r.emoji, count(*) from public.reactions r
  where r.item = any(items) group by r.item, r.emoji;
$$;

-- 自分が押した反応
create or replace function public.my_reactions(items text[], secret text)
returns table (item text, emoji text)
language sql security definer set search_path = public as $$
  select r.item, r.emoji from public.reactions r
  where r.item = any(items) and r.client_hash = md5(secret);
$$;

-- 押す／取り消す（押した状態になったら true を返す）
create or replace function public.toggle_reaction(p_item text, p_emoji text, secret text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if p_emoji not in ('kininaru','shock','wakuwaku','ureshii','sabishii','aseru') then
    raise exception 'unknown reaction';
  end if;
  if length(secret) < 16 or length(p_item) > 120 then
    raise exception 'bad request';
  end if;
  delete from public.reactions where item = p_item and emoji = p_emoji and client_hash = md5(secret);
  if found then return false; end if;
  insert into public.reactions (item, emoji, client_hash) values (p_item, p_emoji, md5(secret));
  return true;
end;
$$;

grant execute on function public.reaction_counts(text[]) to anon;
grant execute on function public.my_reactions(text[], text) to anon;
grant execute on function public.toggle_reaction(text, text, text) to anon;
